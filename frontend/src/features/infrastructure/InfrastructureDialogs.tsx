import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type {
  AssetItem,
  InfraEquipmentItem,
  LocationItem,
  MonitoringCheckItem,
  MonitoringResultItem,
  Page,
  TicketUserRef,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

function useSubmit(onSaved: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<unknown>, message: string, close: () => void) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      onSaved();
      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, setError, submit };
}

// --- Équipement --------------------------------------------------------------

interface EquipmentDialogProps extends BaseDialogProps {
  equipment: InfraEquipmentItem | null;
  equipments: InfraEquipmentItem[];
  locations: LocationItem[];
  users: TicketUserRef[];
}

export function InfraEquipmentDialog({
  open,
  onOpenChange,
  equipment,
  equipments,
  locations,
  users,
  onSaved,
}: EquipmentDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("server");
  const [status, setStatus] = useState("active");
  const [criticality, setCriticality] = useState("medium");
  const [ip, setIp] = useState("");
  const [mac, setMac] = useState("");
  const [role, setRole] = useState("");
  const [locationId, setLocationId] = useState("");
  const [osName, setOsName] = useState("");
  const [osVersion, setOsVersion] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [parentId, setParentId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [assetOptions, setAssetOptions] = useState<AssetItem[]>([]);
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setName(equipment?.name ?? "");
    setType(equipment?.type ?? "server");
    setStatus(equipment?.status ?? "active");
    setCriticality(equipment?.criticality ?? "medium");
    setIp(equipment?.ip_address ?? "");
    setMac(equipment?.mac_address ?? "");
    setRole(equipment?.role ?? "");
    setLocationId(equipment?.location_id ?? "");
    setOsName(equipment?.os_name ?? "");
    setOsVersion(equipment?.os_version ?? "");
    setResponsibleId(equipment?.responsible_user_id ?? "");
    setParentId(equipment?.parent_id ?? "");
    setAssetId(equipment?.asset_id ?? "");
    setNotes(equipment?.config_notes ?? "");
    setError(null);
    apiFetch<Page<AssetItem>>("/assets?page=1&page_size=100")
      .then((page) => setAssetOptions(page.items))
      .catch(() => setAssetOptions([]));
  }, [open, equipment, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom de l'équipement est obligatoire.");
      return;
    }
    const payload = {
      name: name.trim(),
      type,
      status,
      criticality,
      ip_address: nullable(ip),
      mac_address: nullable(mac),
      role: nullable(role),
      location_id: locationId || null,
      os_name: nullable(osName),
      os_version: nullable(osVersion),
      responsible_user_id: responsibleId || null,
      parent_id: parentId || null,
      asset_id: assetId || null,
      config_notes: nullable(notes),
    };
    void submit(
      () =>
        equipment
          ? apiFetch(`/infrastructure/equipments/${equipment.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/infrastructure/equipments", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      equipment ? "Équipement mis à jour." : "Équipement créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {equipment ? "Modifier l'équipement" : "Nouvel équipement d'infrastructure"}
          </DialogTitle>
          <DialogDescription>
            Serveur, VM, réseau ou stockage. Le rattachement au parc est facultatif.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="infra-name">Nom</Label>
              <Input id="infra-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="infra-role">Rôle</Label>
              <Input
                id="infra-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Contrôleur de domaine, hyperviseur, cœur de réseau…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="infra-type">Type</Label>
              <Select id="infra-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="server">Serveur</option>
                <option value="vm">Machine virtuelle</option>
                <option value="switch">Switch</option>
                <option value="router">Routeur</option>
                <option value="firewall">Pare-feu</option>
                <option value="nas">NAS</option>
                <option value="access_point">Point d'accès</option>
                <option value="ups">Onduleur</option>
                <option value="other">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="infra-status">Statut</Label>
              <Select
                id="infra-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="active">Actif</option>
                <option value="maintenance">Maintenance</option>
                <option value="offline">Hors ligne</option>
                <option value="retired">Retiré</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="infra-criticality">Criticité</Label>
              <Select
                id="infra-criticality"
                value={criticality}
                onChange={(event) => setCriticality(event.target.value)}
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="infra-ip">Adresse IP</Label>
              <Input id="infra-ip" value={ip} onChange={(event) => setIp(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="infra-mac">Adresse MAC</Label>
              <Input id="infra-mac" value={mac} onChange={(event) => setMac(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="infra-os">Système</Label>
              <Input id="infra-os" value={osName} onChange={(event) => setOsName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="infra-os-version">Version</Label>
              <Input
                id="infra-os-version"
                value={osVersion}
                onChange={(event) => setOsVersion(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="infra-location">Site</Label>
              <Select
                id="infra-location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Non renseigné</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="infra-responsible">Responsable</Label>
              <Select
                id="infra-responsible"
                value={responsibleId}
                onChange={(event) => setResponsibleId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="infra-parent">Équipement parent</Label>
              <Select
                id="infra-parent"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Aucun</option>
                {equipments
                  .filter((item) => item.id !== equipment?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="infra-asset">Équipement du parc</Label>
              <Select
                id="infra-asset"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              >
                <option value="">Aucun lien</option>
                {assetOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_tag} — {asset.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="infra-notes">Configuration et notes</Label>
            <Textarea
              id="infra-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Dépendance --------------------------------------------------------------

interface DependencyDialogProps extends BaseDialogProps {
  equipments: InfraEquipmentItem[];
}

export function InfraDependencyDialog({
  open,
  onOpenChange,
  equipments,
  onSaved,
}: DependencyDialogProps) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [type, setType] = useState("network");
  const [description, setDescription] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setSourceId(equipments[0]?.id ?? "");
    setTargetId(equipments[1]?.id ?? "");
    setType("network");
    setDescription("");
    setError(null);
  }, [open, equipments, setError]);

  const doSubmit = () => {
    if (!sourceId || !targetId) {
      setError("Sélectionnez les deux équipements.");
      return;
    }
    if (sourceId === targetId) {
      setError("Les deux équipements doivent être différents.");
      return;
    }
    void submit(
      () =>
        apiFetch("/infrastructure/dependencies", {
          method: "POST",
          body: JSON.stringify({
            source_id: sourceId,
            target_id: targetId,
            dependency_type: type,
            description: nullable(description),
          }),
        }),
      "Dépendance créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle dépendance</DialogTitle>
          <DialogDescription>
            Indiquez quel équipement dépend d'un autre pour la cartographie et l'analyse d'impact.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="dependency-source">Équipement source</Label>
            <Select
              id="dependency-source"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {equipments.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dependency-target">Dépend de</Label>
            <Select
              id="dependency-target"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {equipments.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dependency-type">Type</Label>
            <Select id="dependency-type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="network">Réseau</option>
              <option value="power">Alimentation</option>
              <option value="storage">Stockage</option>
              <option value="authentication">Authentification</option>
              <option value="application">Applicatif</option>
              <option value="other">Autre</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="dependency-description">Description</Label>
            <Input
              id="dependency-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Supervision -------------------------------------------------------------

interface CheckDialogProps extends BaseDialogProps {
  check: MonitoringCheckItem | null;
  equipments: InfraEquipmentItem[];
}

export function MonitoringCheckDialog({
  open,
  onOpenChange,
  check,
  equipments,
  onSaved,
}: CheckDialogProps) {
  const [infraId, setInfraId] = useState("");
  const [checkType, setCheckType] = useState("ping");
  const [interval, setInterval] = useState("300");
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setInfraId(check?.infra_id ?? equipments[0]?.id ?? "");
    setCheckType(check?.check_type ?? "ping");
    setInterval(check ? String(check.interval_seconds) : "300");
    setEnabled(check?.is_enabled ?? false);
    setConfig(check?.config_json ?? "");
    setError(null);
  }, [open, check, equipments, setError]);

  const doSubmit = () => {
    if (!infraId) {
      setError("Sélectionnez un équipement.");
      return;
    }
    const payload = {
      infra_id: infraId,
      check_type: checkType,
      interval_seconds: Number(interval) || 300,
      is_enabled: enabled,
      config_json: nullable(config),
    };
    void submit(
      () =>
        check
          ? apiFetch(`/infrastructure/checks/${check.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                check_type: payload.check_type,
                interval_seconds: payload.interval_seconds,
                is_enabled: payload.is_enabled,
                config_json: payload.config_json,
              }),
            })
          : apiFetch("/infrastructure/checks", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      check ? "Contrôle mis à jour." : "Contrôle créé. Il doit être autorisé avant activation.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{check ? "Modifier le contrôle" : "Nouveau contrôle de supervision"}</DialogTitle>
          <DialogDescription>
            Aucune sonde active n'est lancée par l'application. L'autorisation est obligatoire avant
            activation, conformément à la politique de sécurité.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          {!check ? (
            <div>
              <Label htmlFor="check-infra">Équipement</Label>
              <Select
                id="check-infra"
                value={infraId}
                onChange={(event) => setInfraId(event.target.value)}
              >
                {equipments.map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>
                    {equipment.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="check-type">Type</Label>
              <Select
                id="check-type"
                value={checkType}
                onChange={(event) => setCheckType(event.target.value)}
              >
                <option value="ping">Ping</option>
                <option value="snmp">SNMP</option>
                <option value="http">HTTP</option>
                <option value="tcp">TCP</option>
                <option value="agent">Agent</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="check-interval">Intervalle (secondes)</Label>
              <Input
                id="check-interval"
                inputMode="numeric"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="check-config">Configuration</Label>
            <Textarea
              id="check-config"
              value={config}
              onChange={(event) => setConfig(event.target.value)}
              rows={3}
              placeholder='{"port": 443, "path": "/health"}'
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Activer le contrôle</p>
              <p className="text-[10px] text-muted-2">
                Un contrôle non autorisé ne peut pas être activé.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} label="Activer le contrôle" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Résultats ---------------------------------------------------------------

interface ResultsDialogProps extends BaseDialogProps {
  check: MonitoringCheckItem | null;
  results: MonitoringResultItem[];
  canRecord: boolean;
}

export function MonitoringResultsDialog({
  open,
  onOpenChange,
  check,
  results,
  canRecord,
  onSaved,
}: ResultsDialogProps) {
  const [status, setStatus] = useState("up");
  const [latency, setLatency] = useState("");
  const [message, setMessage] = useState("");
  const { loading, error, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setStatus("up");
    setLatency("");
    setMessage("");
  }, [open]);

  const doSubmit = () => {
    if (!check) return;
    void submit(
      () =>
        apiFetch(`/infrastructure/checks/${check.id}/results`, {
          method: "POST",
          body: JSON.stringify({
            status,
            latency_ms: latency ? Number(latency) : null,
            message: nullable(message),
          }),
        }),
      "Résultat enregistré.",
      () => undefined,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Résultats de supervision</DialogTitle>
          <DialogDescription>
            {check ? `${check.infra_name} · ${check.check_type.toUpperCase()}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          {canRecord ? (
            <div className="rounded-lg border border-border-soft p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">Enregistrer un résultat</p>
              <div className="grid gap-2 sm:grid-cols-[130px_120px_1fr_auto]">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="up">Disponible</option>
                  <option value="down">Indisponible</option>
                  <option value="unknown">Inconnu</option>
                </Select>
                <Input
                  inputMode="numeric"
                  value={latency}
                  onChange={(event) => setLatency(event.target.value)}
                  placeholder="Latence ms"
                />
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Message"
                />
                <Button size="sm" loading={loading} onClick={doSubmit}>
                  Ajouter
                </Button>
              </div>
            </div>
          ) : null}

          {results.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">Aucun résultat enregistré.</p>
          ) : (
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        result.status === "up"
                          ? "success"
                          : result.status === "down"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {result.status === "up"
                        ? "Disponible"
                        : result.status === "down"
                          ? "Indisponible"
                          : "Inconnu"}
                    </Badge>
                    <span className="text-muted">{result.message ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-2">
                    {result.latency_ms != null ? <span>{result.latency_ms} ms</span> : null}
                    <span>{formatDateTime(result.checked_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
