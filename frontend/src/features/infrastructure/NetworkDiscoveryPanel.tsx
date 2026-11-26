import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Network, Plus, Radar, Search, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type {
  AssetCategoryItem,
  AssetItem,
  LocationItem,
  NetworkScanHost,
  NetworkScanResult,
} from "@/types/api";

interface NetworkDiscoveryPanelProps {
  canCreateInfra: boolean;
  canCreateAsset: boolean;
  onEquipmentAdded: () => void;
}

type Destination = "infrastructure" | "asset" | "both";

interface HostDraft {
  destination: Destination;
  name: string;
  ip: string;
  mac: string;
  locationId: string;
  notes: string;
  infraType: string;
  role: string;
  criticality: string;
  infraStatus: string;
  osName: string;
  osVersion: string;
  assetCategoryId: string;
  assetStatus: string;
  condition: string;
  brand: string;
  model: string;
  serialNumber: string;
  hostname: string;
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

const categoryCodeByType: Record<string, string> = {
  server: "server",
  vm: "vm",
  switch: "switch",
  router: "router",
  firewall: "firewall",
  nas: "nas",
  access_point: "access_point",
  ups: "ups",
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickCategory(categories: AssetCategoryItem[], suggestedType: string): string {
  const code = categoryCodeByType[suggestedType];
  return (
    categories.find((category) => category.code === code)?.id ??
    categories.find((category) => category.is_infrastructure)?.id ??
    categories[0]?.id ??
    ""
  );
}

function buildDiscoveryNote(target: NetworkScanHost, result: NetworkScanResult | null): string {
  const ports = target.open_ports.length > 0 ? target.open_ports.join(", ") : "aucun";
  return `Découvert par scan réseau${result ? ` ${result.cidr}` : ""}. Ports ouverts : ${ports}.`;
}

export function NetworkDiscoveryPanel({
  canCreateInfra,
  canCreateAsset,
  onEquipmentAdded,
}: NetworkDiscoveryPanelProps) {
  const [cidr, setCidr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<NetworkScanResult | null>(null);
  const [target, setTarget] = useState<NetworkScanHost | null>(null);
  const [draft, setDraft] = useState<HostDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const canAdd = canCreateInfra || canCreateAsset;

  const locationsQuery = useQuery({
    queryKey: ["locations", "network-discovery"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    enabled: Boolean(target),
    staleTime: 120_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ["asset-categories", "network-discovery"],
    queryFn: () => apiFetch<AssetCategoryItem[]>("/asset-categories"),
    enabled: Boolean(target) && canCreateAsset,
    staleTime: 300_000,
  });
  const locations = locationsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    if (!target || !canCreateAsset || categories.length === 0) return;
    setDraft((current) =>
      current && !current.assetCategoryId
        ? { ...current, assetCategoryId: pickCategory(categories, target.suggested_type) }
        : current,
    );
  }, [target, canCreateAsset, categories]);

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

  const openAdd = (host: NetworkScanHost) => {
    const destination: Destination = canCreateInfra ? "infrastructure" : "asset";
    setTarget(host);
    setFormError(null);
    setDraft({
      destination,
      name: host.hostname ?? host.suggested_name,
      ip: host.ip_address,
      mac: host.mac_address ?? "",
      locationId: "",
      notes: "",
      infraType: host.suggested_type,
      role: "",
      criticality: "medium",
      infraStatus: "active",
      osName: "",
      osVersion: "",
      assetCategoryId: pickCategory(categories, host.suggested_type),
      assetStatus: "in_service",
      condition: "good",
      brand: "",
      model: "",
      serialNumber: "",
      hostname: host.hostname ?? "",
    });
  };

  const updateDraft = (patch: Partial<HostDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const submitHost = async () => {
    if (!target || !draft) return;
    if (!draft.name.trim()) {
      setFormError("Le nom est obligatoire.");
      return;
    }
    const needsAsset = draft.destination === "asset" || draft.destination === "both";
    const needsInfra = draft.destination === "infrastructure" || draft.destination === "both";
    if (needsAsset && !draft.assetCategoryId) {
      setFormError("Sélectionnez une catégorie pour le parc informatique.");
      return;
    }
    if (needsInfra && !draft.infraType) {
      setFormError("Sélectionnez un type d'infrastructure.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const discoveryNote = buildDiscoveryNote(target, result);
    const notes = draft.notes.trim()
      ? `${draft.notes.trim()}\n${discoveryNote}`
      : discoveryNote;
    let assetId: string | null = null;
    try {
      if (needsAsset) {
        const asset = await apiFetch<AssetItem>("/assets", {
          method: "POST",
          body: JSON.stringify({
            name: draft.name.trim(),
            category_id: draft.assetCategoryId,
            brand: nullable(draft.brand),
            model: nullable(draft.model),
            serial_number: nullable(draft.serialNumber),
            mac_address: nullable(draft.mac),
            ip_address: nullable(draft.ip),
            hostname: nullable(draft.hostname),
            os_name: nullable(draft.osName),
            os_version: nullable(draft.osVersion),
            status: draft.assetStatus,
            condition: draft.condition,
            location_id: draft.locationId || null,
            comments: notes,
            external_data_json: JSON.stringify({
              discovery: {
                cidr: result?.cidr ?? null,
                open_ports: target.open_ports,
                mac_address: target.mac_address,
                detected_type: target.suggested_type,
              },
            }),
          }),
        });
        assetId = asset.id;
      }
      if (needsInfra) {
        await apiFetch("/infrastructure/equipments", {
          method: "POST",
          body: JSON.stringify({
            name: draft.name.trim(),
            type: draft.infraType,
            status: draft.infraStatus,
            criticality: draft.criticality,
            ip_address: nullable(draft.ip),
            mac_address: nullable(draft.mac),
            role: nullable(draft.role),
            location_id: draft.locationId || null,
            os_name: nullable(draft.osName),
            os_version: nullable(draft.osVersion),
            asset_id: assetId,
            config_notes: notes,
          }),
        });
      }
      const destinationLabel =
        draft.destination === "both"
          ? "ajouté au parc et à l'infrastructure, avec les deux fiches liées"
          : draft.destination === "asset"
            ? "ajouté au parc informatique"
            : "ajouté à l'infrastructure";
      toast.success(`${draft.name.trim()} ${destinationLabel}.`);
      setAdded((current) => new Set(current).add(target.ip_address));
      setTarget(null);
      setDraft(null);
      onEquipmentAdded();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Ajout impossible. Vérifiez les champs.",
      );
    } finally {
      setSaving(false);
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
              manuelle, modifiable et confirmée.
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
                    <TableHead className="w-32 text-right">Action</TableHead>
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
                          ) : canAdd ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAdd(host)}
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

      <Dialog
        open={Boolean(target && draft)}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setDraft(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ajouter et classer l'hôte</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.ip_address} · ${target.hostname ?? target.suggested_name} · MAC ${
                    target.mac_address ?? "inconnue"
                  }. Vérifiez les informations et choisissez la destination.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {formError ? (
                <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {formError}
                </p>
              ) : null}
              <div>
                <Label htmlFor="discovery-destination">Classer dans</Label>
                <Select
                  id="discovery-destination"
                  value={draft.destination}
                  onChange={(event) =>
                    updateDraft({ destination: event.target.value as Destination })
                  }
                >
                  {canCreateInfra ? (
                    <option value="infrastructure">Infrastructure</option>
                  ) : null}
                  {canCreateAsset ? <option value="asset">Parc informatique</option> : null}
                  {canCreateInfra && canCreateAsset ? (
                    <option value="both">Infrastructure + parc (fiches liées)</option>
                  ) : null}
                </Select>
                <p className="mt-1 text-[10px] leading-4 text-muted-2">
                  Le parc porte l'inventaire administratif (catégorie, achat, garantie,
                  affectation). L'infrastructure porte l'exploitation (type, IP, OS, supervision).
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="discovery-name">Nom *</Label>
                  <Input
                    id="discovery-name"
                    value={draft.name}
                    onChange={(event) => updateDraft({ name: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="discovery-location">Site</Label>
                  <Select
                    id="discovery-location"
                    value={draft.locationId}
                    onChange={(event) => updateDraft({ locationId: event.target.value })}
                  >
                    <option value="">Non renseigné</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="discovery-ip">Adresse IP</Label>
                  <Input
                    id="discovery-ip"
                    value={draft.ip}
                    onChange={(event) => updateDraft({ ip: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="discovery-mac">Adresse MAC</Label>
                  <Input
                    id="discovery-mac"
                    value={draft.mac}
                    onChange={(event) => updateDraft({ mac: event.target.value })}
                  />
                </div>
              </div>

              {draft.destination !== "asset" ? (
                <div className="rounded-lg border border-border-soft p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Network className="h-3.5 w-3.5 text-accent" />
                    Fiche Infrastructure
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="discovery-infra-type">Type / catégorie *</Label>
                      <Select
                        id="discovery-infra-type"
                        value={draft.infraType}
                        onChange={(event) => updateDraft({ infraType: event.target.value })}
                      >
                        {Object.entries(typeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="discovery-infra-status">Statut</Label>
                      <Select
                        id="discovery-infra-status"
                        value={draft.infraStatus}
                        onChange={(event) =>
                          updateDraft({ infraStatus: event.target.value })
                        }
                      >
                        <option value="active">Actif</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="offline">Hors ligne</option>
                        <option value="retired">Retiré</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="discovery-criticality">Criticité</Label>
                      <Select
                        id="discovery-criticality"
                        value={draft.criticality}
                        onChange={(event) =>
                          updateDraft({ criticality: event.target.value })
                        }
                      >
                        <option value="low">Faible</option>
                        <option value="medium">Moyenne</option>
                        <option value="high">Élevée</option>
                        <option value="critical">Critique</option>
                      </Select>
                    </div>
                    <div className="sm:col-span-3">
                      <Label htmlFor="discovery-role">Rôle</Label>
                      <Input
                        id="discovery-role"
                        value={draft.role}
                        onChange={(event) => updateDraft({ role: event.target.value })}
                        placeholder="Contrôleur de domaine, hyperviseur, cœur de réseau…"
                      />
                    </div>
                    <div>
                      <Label htmlFor="discovery-os">Système</Label>
                      <Input
                        id="discovery-os"
                        value={draft.osName}
                        onChange={(event) => updateDraft({ osName: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="discovery-os-version">Version</Label>
                      <Input
                        id="discovery-os-version"
                        value={draft.osVersion}
                        onChange={(event) => updateDraft({ osVersion: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {draft.destination !== "infrastructure" ? (
                <div className="rounded-lg border border-border-soft p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Server className="h-3.5 w-3.5 text-accent" />
                    Fiche Parc informatique
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="discovery-asset-category">Catégorie *</Label>
                      <Select
                        id="discovery-asset-category"
                        value={draft.assetCategoryId}
                        onChange={(event) =>
                          updateDraft({ assetCategoryId: event.target.value })
                        }
                        disabled={categoriesQuery.isLoading}
                      >
                        <option value="">Sélectionner</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="discovery-asset-status">Statut</Label>
                      <Select
                        id="discovery-asset-status"
                        value={draft.assetStatus}
                        onChange={(event) =>
                          updateDraft({ assetStatus: event.target.value })
                        }
                      >
                        <option value="in_service">En service</option>
                        <option value="in_stock">En stock</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="broken">En panne</option>
                        <option value="to_renew">À renouveler</option>
                        <option value="retired">Retiré</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="discovery-condition">État</Label>
                      <Select
                        id="discovery-condition"
                        value={draft.condition}
                        onChange={(event) => updateDraft({ condition: event.target.value })}
                      >
                        <option value="new">Neuf</option>
                        <option value="good">Bon</option>
                        <option value="fair">Correct</option>
                        <option value="poor">Mauvais</option>
                        <option value="out_of_service">Hors service</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="discovery-brand">Marque</Label>
                      <Input
                        id="discovery-brand"
                        value={draft.brand}
                        onChange={(event) => updateDraft({ brand: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="discovery-model">Modèle</Label>
                      <Input
                        id="discovery-model"
                        value={draft.model}
                        onChange={(event) => updateDraft({ model: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="discovery-serial">N° de série</Label>
                      <Input
                        id="discovery-serial"
                        value={draft.serialNumber}
                        onChange={(event) =>
                          updateDraft({ serialNumber: event.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label htmlFor="discovery-hostname">Nom machine</Label>
                      <Input
                        id="discovery-hostname"
                        value={draft.hostname}
                        onChange={(event) => updateDraft({ hostname: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <Label htmlFor="discovery-notes">Notes</Label>
                <Textarea
                  id="discovery-notes"
                  value={draft.notes}
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  rows={3}
                  placeholder="Informations complémentaires, localisation, usage…"
                />
                <p className="mt-1 text-[10px] text-muted-2">
                  Les informations du scan (sous-réseau, ports ouverts) seront ajoutées
                  automatiquement.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setTarget(null);
                setDraft(null);
                setFormError(null);
              }}
            >
              Annuler
            </Button>
            <Button loading={saving} onClick={() => void submitHost()}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter et classer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
