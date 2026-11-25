import { AlertTriangle, Plus, Radar, Search, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { NetworkScanHost, NetworkScanResult } from "@/types/api";

interface NetworkDiscoveryPanelProps {
  canCreate: boolean;
  onEquipmentAdded: () => void;
}

const typeLabels: Record<string, string> = {
  server: "Serveur",
  vm: "Machine virtuelle",
  switch: "Switch",
  router: "Routeur",
  firewall: "Pare-feu",
  nas: "NAS",
  access_point: "Point d'accès",
  ups: "Onduleur",
  other: "Autre",
};

export function NetworkDiscoveryPanel({ canCreate, onEquipmentAdded }: NetworkDiscoveryPanelProps) {
  const [cidr, setCidr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<NetworkScanResult | null>(null);
  const [target, setTarget] = useState<NetworkScanHost | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const runScan = async () => {
    const value = cidr.trim();
    if (!value) {
      toast.error("Indiquez un sous-réseau, par exemple 192.168.1.0/24.");
      return;
    }
    setScanning(true);
    setTarget(null);
    setAdded(new Set());
    try {
      const data = await apiFetch<NetworkScanResult>("/infrastructure/network-scan", {
        method: "POST",
        body: JSON.stringify({ cidr: value }),
      });
      setResult(data);
      if (data.hosts.length === 0) {
        toast.warning("Aucun hôte détecté sur ce sous-réseau.");
      } else {
        toast.success(
          `${data.hosts.length} hôte(s) détecté(s), dont ${data.new_hosts} nouveau(x).`,
        );
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Scan réseau impossible.");
    } finally {
      setScanning(false);
    }
  };

  const addHost = async () => {
    if (!target) return;
    setAdding(true);
    try {
      await apiFetch("/infrastructure/equipments", {
        method: "POST",
        body: JSON.stringify({
          name: target.suggested_name,
          type: target.suggested_type,
          ip_address: target.ip_address,
          mac_address: target.mac_address || null,
          config_notes: `Découvert par scan réseau${result ? ` ${result.cidr}` : ""}. Ports ouverts : ${
            target.open_ports.join(", ") || "aucun"
          }.`,
          criticality: "medium",
          status: "active",
        }),
      });
      toast.success(`${target.suggested_name} ajouté à l'infrastructure.`);
      setAdded((current) => new Set(current).add(target.ip_address));
      setTarget(null);
      onEquipmentAdded();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Ajout impossible.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-sm">Découverte du réseau local</CardTitle>
            <CardDescription>
              Balayage en lecture seule des adresses privées. Les hôtes déjà présents dans
              l'infrastructure ou le parc sont signalés.
            </CardDescription>
          </div>
          <Badge tone="neutral">Aucune écriture automatique</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="network-cidr">Sous-réseau à scanner</Label>
              <Input
                id="network-cidr"
                value={cidr}
                onChange={(event) => setCidr(event.target.value)}
                placeholder="192.168.1.0/24"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !scanning) void runScan();
                }}
              />
              <p className="mt-1 text-[10px] text-muted-2">
                Adresses privées uniquement (10/8, 172.16/12, 192.168/16), 1024 adresses maximum.
              </p>
            </div>
            <Button loading={scanning} onClick={() => void runScan()}>
              <Search className="h-3.5 w-3.5" />
              Lancer le scan
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-4 text-info">
            <Radar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Le scan teste quelques ports courants (SSH, HTTP, SMB, RDP, WinRM) et lit la table
              ARP locale. Il ne modifie ni le réseau ni la base : l'ajout reste une action
              manuelle et confirmée.
            </p>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-sm">Résultat du scan</CardTitle>
              <CardDescription>
                {formatNumber(result.scanned_addresses)} adresse(s) ·{" "}
                {formatNumber(result.hosts.length)} hôte(s) ·{" "}
                {formatNumber(result.new_hosts)} nouveau(x) · {result.duration_seconds} s
              </CardDescription>
            </div>
            <Badge tone={result.new_hosts > 0 ? "warning" : "success"}>
              {result.cidr}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            {result.notes.map((note) => (
              <p
                key={note}
                className="mx-3 rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[10px] text-muted"
              >
                {note}
              </p>
            ))}
            {result.hosts.length === 0 ? (
              <EmptyState
                icon={Server}
                title="Aucun hôte détecté"
                description="Vérifiez le sous-réseau, le VLAN ou les règles de pare-feu."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adresse IP</TableHead>
                    <TableHead>Nom / MAC</TableHead>
                    <TableHead>Ports ouverts</TableHead>
                    <TableHead>Type pressenti</TableHead>
                    <TableHead>Rapprochement</TableHead>
                    <TableHead className="w-24 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.hosts.map((host) => {
                    const isAdded = added.has(host.ip_address);
                    return (
                      <TableRow key={host.ip_address}>
                        <TableCell className="font-mono text-[11px] text-foreground">
                          {host.ip_address}
                        </TableCell>
                        <TableCell>
                          <p className="text-[11px] font-medium text-foreground">
                            {host.hostname ?? host.suggested_name}
                          </p>
                          <p className="font-mono text-[10px] text-muted-2">
                            {host.mac_address ?? "MAC inconnue"}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted">
                          {host.open_ports.length > 0 ? host.open_ports.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted">
                          {typeLabels[host.suggested_type] ?? host.suggested_type}
                        </TableCell>
                        <TableCell>
                          {host.known_in ? (
                            <Badge tone="success">
                              {host.known_in === "infrastructure" ? "Infrastructure" : "Parc"}
                              {host.known_label ? ` · ${host.known_label}` : ""}
                            </Badge>
                          ) : (
                            <Badge tone="warning">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Nouveau
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {host.known_in || isAdded ? (
                            <span className="text-[10px] text-muted-2">
                              {isAdded ? "Ajouté" : "Déjà suivi"}
                            </span>
                          ) : canCreate ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setTarget(host)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Ajouter
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-2">Lecture seule</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Ajouter cet équipement ?"
        description={
          target
            ? `${target.suggested_name} (${target.ip_address}) sera ajouté à l'infrastructure avec le type « ${
                typeLabels[target.suggested_type] ?? target.suggested_type
              } ». Vous pourrez compléter sa fiche ensuite.`
            : ""
        }
        confirmLabel="Ajouter"
        loading={adding}
        onConfirm={() => void addHost()}
      />
    </div>
  );
}
