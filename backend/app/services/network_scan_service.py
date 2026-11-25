from __future__ import annotations

import ipaddress
import os
import re
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ValidationAppError
from app.models.assets import Asset
from app.models.infrastructure import InfraEquipment
from app.schemas.infrastructure import NetworkScanHost, NetworkScanResult
from sqlalchemy import select
from sqlalchemy.orm import Session

PRIVATE_NETWORKS: tuple[ipaddress.IPv4Network, ...] = (
    ipaddress.IPv4Network("10.0.0.0/8"),
    ipaddress.IPv4Network("172.16.0.0/12"),
    ipaddress.IPv4Network("192.168.0.0/16"),
)
MAX_ADDRESSES = 1024
PROBE_PORTS = (22, 80, 135, 139, 443, 445, 3389, 5985, 8080, 9100)
PORT_TIMEOUT_SECONDS = 0.25
MAX_WORKERS = 96
MAX_PORTS_PER_HOST = 6

CIDR_PATTERN = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3}(?:/\d{1,2})?)\b")
MAC_PATTERN = re.compile(r"\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b")
IPV4_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


def extract_cidr(text: str | None) -> str | None:
    if not text:
        return None
    match = CIDR_PATTERN.search(text)
    return match.group(1) if match else None


def parse_network(value: str) -> ipaddress.IPv4Network:
    raw = (value or "").strip()
    match = CIDR_PATTERN.search(raw)
    if not match:
        raise ValidationAppError("Indiquez un sous-réseau privé, par exemple 192.168.1.0/24.")
    target = match.group(1)
    if "/" not in target:
        target = f"{target}/32"
    try:
        network = ipaddress.ip_network(target, strict=False)
    except ValueError as exc:
        raise ValidationAppError("Le sous-réseau demandé n'est pas valide.") from exc
    if network.version != 4:
        raise ValidationAppError("Seuls les sous-réseaux IPv4 sont pris en charge.")
    if not any(network.subnet_of(private) for private in PRIVATE_NETWORKS):
        raise ValidationAppError(
            "Le scan est limité aux adresses privées : 10.0.0.0/8, 172.16.0.0/12 ou 192.168.0.0/16."
        )
    if network.num_addresses > MAX_ADDRESSES:
        raise ValidationAppError(
            f"Le scan est limité à {MAX_ADDRESSES} adresses. Utilisez un sous-réseau "
            "plus petit, par exemple /24."
        )
    return network


def _target_addresses(network: ipaddress.IPv4Network) -> list[str]:
    if network.prefixlen == 32:
        return [str(network.network_address)]
    if network.prefixlen == 31:
        return [str(address) for address in network]
    return [str(address) for address in network.hosts()]


def _arp_table() -> dict[str, str]:
    """Lit la table ARP locale sans provoquer de trafic supplémentaire."""
    candidates = [["arp", "-a"]] if os.name == "nt" else [["ip", "neigh"], ["arp", "-an"]]
    for command in candidates:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        table: dict[str, str] = {}
        for line in result.stdout.splitlines():
            ips = IPV4_PATTERN.findall(line)
            macs = MAC_PATTERN.findall(line)
            if not ips or not macs:
                continue
            mac = macs[0].replace("-", ":").upper()
            if mac in {"FF:FF:FF:FF:FF:FF", "00:00:00:00:00:00"}:
                continue
            table[ips[0]] = mac
        if table:
            return table
    return {}


def _probe_ports(ip: str) -> list[int]:
    open_ports: list[int] = []
    for port in PROBE_PORTS:
        try:
            with socket.create_connection((ip, port), timeout=PORT_TIMEOUT_SECONDS):
                open_ports.append(port)
                if len(open_ports) >= MAX_PORTS_PER_HOST:
                    break
        except OSError:
            continue
    return open_ports


def _resolve_name(ip: str) -> str | None:
    try:
        hostname = socket.gethostbyaddr(ip)[0]
    except (OSError, socket.herror):
        return None
    return hostname.rstrip(".") or None


def _guess_type(hostname: str | None, ports: list[int]) -> str:
    name = (hostname or "").lower()
    if any(token in name for token in ("fw", "firewall", "pare-feu")):
        return "firewall"
    if any(token in name for token in ("switch", "sw-", "sw_")) or name.startswith("sw"):
        return "switch"
    if any(token in name for token in ("router", "routeur", "gateway", "gw-")):
        return "router"
    if any(token in name for token in ("wifi", "wlan", "access-point", "ap-", "ap_")):
        return "access_point"
    if "nas" in name or 2049 in ports:
        return "nas"
    if 9100 in ports:
        return "other"
    if any(port in ports for port in (135, 139, 445, 3389, 5985)):
        return "server"
    if 22 in ports:
        return "server"
    if 80 in ports or 443 in ports or 8080 in ports:
        return "other"
    return "other"


def _known_sources(
    db: Session,
) -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str]]]:
    by_ip: dict[str, tuple[str, str]] = {}
    by_mac: dict[str, tuple[str, str]] = {}
    for equipment in db.scalars(select(InfraEquipment)).all():
        label = (equipment.name or "").strip() or "Équipement"
        if equipment.ip_address:
            by_ip[equipment.ip_address] = ("infrastructure", label)
        if equipment.mac_address:
            by_mac[equipment.mac_address.upper().replace("-", ":")] = (
                "infrastructure",
                label,
            )
    assets = db.scalars(select(Asset).where(Asset.archived_at.is_(None))).all()
    for asset in assets:
        label = (asset.name or asset.hostname or asset.asset_tag or "Équipement").strip()
        if asset.ip_address:
            by_ip[asset.ip_address] = ("parc", label)
        if asset.mac_address:
            by_mac[asset.mac_address.upper().replace("-", ":")] = ("parc", label)
    return by_ip, by_mac


def scan(db: Session, value: str, *, actor: Any = None) -> NetworkScanResult:
    del actor  # le scan est en lecture seule, la permission est vérifiée par l'appelant
    network = parse_network(value)
    started = time.perf_counter()
    started_at = datetime.now(UTC)
    addresses = _target_addresses(network)
    arp = _arp_table()
    arp_in_range: dict[str, str] = {}
    for arp_ip, arp_mac in arp.items():
        try:
            address = ipaddress.ip_address(arp_ip)
        except ValueError:
            continue
        if address in network:
            arp_in_range[arp_ip] = arp_mac

    probed: dict[str, list[int]] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        probe_futures = {executor.submit(_probe_ports, ip): ip for ip in addresses}
        for probe_future in as_completed(probe_futures):
            ip = probe_futures[probe_future]
            try:
                ports = probe_future.result()
            except Exception:  # noqa: BLE001 - un poste ne doit pas interrompre le scan
                ports = []
            if ports or ip in arp_in_range:
                probed[ip] = ports

    names: dict[str, str | None] = {}
    if probed:
        dns_executor = ThreadPoolExecutor(max_workers=min(32, len(probed)))
        try:
            dns_futures = {dns_executor.submit(_resolve_name, ip): ip for ip in probed}
            for dns_future in as_completed(dns_futures, timeout=4):
                ip = dns_futures[dns_future]
                try:
                    names[ip] = dns_future.result()
                except Exception:  # noqa: BLE001
                    names[ip] = None
        except TimeoutError:
            pass
        finally:
            dns_executor.shutdown(wait=False, cancel_futures=True)

    by_ip, by_mac = _known_sources(db)
    hosts: list[NetworkScanHost] = []
    for ip, ports in probed.items():
        mac = arp_in_range.get(ip)
        hostname = names.get(ip)
        known = by_ip.get(ip) or (by_mac.get(mac) if mac else None)
        suggested_type = _guess_type(hostname, ports)
        hosts.append(
            NetworkScanHost(
                ip_address=ip,
                hostname=hostname,
                mac_address=mac,
                open_ports=ports,
                suggested_name=hostname or f"Équipement {ip}",
                suggested_type=suggested_type,  # type: ignore[arg-type]
                known_in=known[0] if known else None,
                known_label=known[1] if known else None,
            )
        )
    hosts.sort(key=lambda host: ipaddress.ip_address(host.ip_address))
    known_count = sum(1 for host in hosts if host.known_in)
    notes = [
        "Scan en lecture seule : aucune écriture en base et aucune modification réseau.",
        f"{len(addresses)} adresse(s) balayée(s), {len(hosts)} hôte(s) détecté(s) "
        f"dont {known_count} déjà connu(s).",
    ]
    if not hosts:
        notes.append(
            "Aucun hôte détecté. Vérifiez le sous-réseau, le VLAN ou les règles de pare-feu."
        )
    if probed and len(names) < len(probed):
        notes.append(
            "La résolution DNS inverse n'a pas abouti pour tous les hôtes : les noms "
            "peuvent être incomplets."
        )
    return NetworkScanResult(
        cidr=str(network),
        started_at=started_at,
        duration_seconds=round(time.perf_counter() - started, 1),
        scanned_addresses=len(addresses),
        hosts=hosts,
        new_hosts=len(hosts) - known_count,
        known_hosts=known_count,
        notes=notes,
    )
