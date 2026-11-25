from __future__ import annotations

import json
import os
import random
import socket
import subprocess
import time
from dataclasses import dataclass
from typing import Any

import httpx
from app.models.infrastructure import MonitoringCheck


@dataclass(frozen=True)
class CheckOutcome:
    status: str
    latency_ms: int | None
    message: str


def _config(check: MonitoringCheck) -> dict[str, Any]:
    if not check.config_json:
        return {}
    try:
        data = json.loads(check.config_json)
    except (json.JSONDecodeError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _host(check: MonitoringCheck, config: dict[str, Any]) -> str:
    return str(config.get("host") or (check.infra.ip_address if check.infra else "") or "").strip()


def _timeout(config: dict[str, Any], default: float = 2.0) -> float:
    try:
        value = float(config.get("timeout_seconds", default))
    except (TypeError, ValueError):
        value = default
    return min(max(value, 1.0), 30.0)


def _elapsed_ms(started: float) -> int:
    return max(int(round((time.perf_counter() - started) * 1000)), 0)


def _ping(host: str, timeout: float) -> CheckOutcome:
    if os.name == "nt":
        command = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), host]
    else:
        command = ["ping", "-c", "1", "-W", str(max(int(round(timeout)), 1)), host]
    started = time.perf_counter()
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout + 3,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return CheckOutcome("down", None, f"Ping impossible : {exc}")
    latency = _elapsed_ms(started)
    if result.returncode == 0:
        return CheckOutcome("up", latency, f"Ping OK ({latency} ms)")
    detail = (result.stderr or result.stdout or "").strip().splitlines()
    return CheckOutcome("down", latency, detail[0][:300] if detail else "Hôte injoignable")


def _tcp(host: str, config: dict[str, Any], timeout: float) -> CheckOutcome:
    try:
        port = int(config.get("port") or 443)
    except (TypeError, ValueError):
        return CheckOutcome("unknown", None, "Port TCP invalide dans la configuration.")
    started = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            latency = _elapsed_ms(started)
            return CheckOutcome("up", latency, f"Port TCP {port} accessible ({latency} ms)")
    except OSError as exc:
        return CheckOutcome("down", _elapsed_ms(started), f"Port TCP {port} injoignable : {exc}")


def _http(host: str, config: dict[str, Any], timeout: float) -> CheckOutcome:
    url = str(config.get("url") or "").strip()
    if not url:
        try:
            port = int(config.get("port") or 443)
        except (TypeError, ValueError):
            return CheckOutcome("unknown", None, "Port HTTP invalide dans la configuration.")
        scheme = str(config.get("scheme") or ("https" if port == 443 else "http"))
        path = str(config.get("path") or "/")
        if not path.startswith("/"):
            path = f"/{path}"
        url = f"{scheme}://{host}:{port}{path}"
    expected = config.get("expected_status")
    expected_codes: set[int] = set()
    if isinstance(expected, (list, tuple)):
        expected_codes = {int(code) for code in expected if str(code).isdigit()}
    elif expected is not None and str(expected).isdigit():
        expected_codes = {int(expected)}
    started = time.perf_counter()
    try:
        with httpx.Client(
            timeout=timeout,
            verify=bool(config.get("verify_tls", True)),
            follow_redirects=True,
        ) as client:
            response = client.get(url)
    except httpx.HTTPError as exc:
        return CheckOutcome("down", _elapsed_ms(started), f"HTTP injoignable : {exc}")
    latency = _elapsed_ms(started)
    if expected_codes:
        ok = response.status_code in expected_codes
    else:
        ok = 200 <= response.status_code < 400
    label = f"HTTP {response.status_code}"
    if ok:
        return CheckOutcome("up", latency, f"{label} ({latency} ms)")
    return CheckOutcome("down", latency, f"{label} — code inattendu")


def _ber_length(length: int) -> bytes:
    if length < 0x80:
        return bytes([length])
    encoded = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(encoded)]) + encoded


def _ber_tlv(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _ber_length(len(value)) + value


def _ber_integer(value: int) -> bytes:
    if value == 0:
        content = b"\x00"
    else:
        length = (value.bit_length() + 8) // 8
        content = value.to_bytes(length, "big", signed=True)
    return _ber_tlv(0x02, content)


def _encode_oid(oid: str) -> bytes:
    parts = [int(part) for part in oid.strip(".").split(".")]
    if len(parts) < 2:
        raise ValueError("OID invalide")
    values = [40 * parts[0] + parts[1], *parts[2:]]
    body = bytearray()
    for value in values:
        stack = [value & 0x7F]
        value >>= 7
        while value:
            stack.append((value & 0x7F) | 0x80)
            value >>= 7
        body.extend(reversed(stack))
    return bytes(body)


def _snmp(host: str, config: dict[str, Any], timeout: float) -> CheckOutcome:
    community = str(config.get("community") or "public")
    oid = str(config.get("oid") or "1.3.6.1.2.1.1.3.0")
    try:
        port = int(config.get("port") or 161)
        request_id = random.randint(1, 2**31 - 1)
        varbind = _ber_tlv(0x30, _ber_tlv(0x06, _encode_oid(oid)) + _ber_tlv(0x05, b""))
        varbind_list = _ber_tlv(0x30, varbind)
        pdu = _ber_tlv(
            0xA0,
            _ber_integer(request_id)
            + _ber_integer(0)
            + _ber_integer(0)
            + varbind_list,
        )
        packet = _ber_tlv(
            0x30,
            _ber_integer(1) + _ber_tlv(0x04, community.encode("utf-8")) + pdu,
        )
    except ValueError as exc:
        return CheckOutcome("unknown", None, f"Configuration SNMP invalide : {exc}")
    started = time.perf_counter()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(timeout)
            sock.sendto(packet, (host, port))
            data, _ = sock.recvfrom(4096)
    except OSError as exc:
        return CheckOutcome("down", _elapsed_ms(started), f"SNMP injoignable : {exc}")
    latency = _elapsed_ms(started)
    if data and data[0] == 0x30:
        return CheckOutcome("up", latency, f"Réponse SNMP reçue ({latency} ms)")
    return CheckOutcome("down", latency, "Réponse SNMP invalide")


def execute(check: MonitoringCheck) -> CheckOutcome:
    config = _config(check)
    host = _host(check, config)
    if not host:
        return CheckOutcome("unknown", None, "Aucune adresse IP ni hôte dans la configuration.")
    timeout = _timeout(config)
    check_type = check.check_type
    if check_type == "ping":
        return _ping(host, timeout)
    if check_type == "tcp":
        return _tcp(host, config, timeout)
    if check_type == "http":
        return _http(host, config, timeout)
    if check_type == "snmp":
        return _snmp(host, config, timeout)
    return CheckOutcome(
        "unknown",
        None,
        f"Type de contrôle « {check_type} » non pris en charge par le planificateur.",
    )
