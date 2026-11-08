import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import type {
  AssetItem,
  BackupCheckItem,
  CertificateItem,
  SecurityActionItem,
  SecurityAuditItem,
  SecurityIncidentItem,
  TicketUserRef,
  VulnerabilityItem,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

// --- Incident ----------------------------------------------------------------

interface IncidentDialogProps extends BaseDialogProps {
  incident: SecurityIncidentItem | null;
  users: TicketUserRef[];
}

export function IncidentDialog({ open, onOpenChange, incident, users, onSaved }: IncidentDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [category, setCategory] = useState("phishing");
  const [detectedAt, setDetectedAt] = useState("");
  const [status, setStatus] = useState("open");
  const [ownerId, setOwnerId] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [corrective, setCorrective] = useState("");
  const [lessons, setLessons] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(incident?.title ?? "");
    setDescription(incident?.description ?? "");
    setSeverity(incident?.severity ?? "medium");
    setCategory(incident?.category ?? "phishing");
    setDetectedAt(toLocalInput(incident?.detected_at ?? null));
    setStatus(incident?.status ?? "open");
    setOwnerId(incident?.owner_user_id ?? "");
    setActionsTaken(incident?.actions_taken ?? "");
    setCorrective(incident?.corrective_measures ?? "");
    setLessons(incident?.lessons_learned ?? "");
    setError(null);
  }, [open, incident, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: nullable(description),
      severity,
      category,
      detected_at: toIso(detectedAt),
      status,
      owner_user_id: ownerId || null,
      actions_taken: nullable(actionsTaken),
      corrective_measures: nullable(corrective),
      lessons_learned: nullable(lessons),
    };
    void submit(
      () =>
        incident
          ? apiFetch(`/security/incidents/${incident.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/incidents", { method: "POST", body: JSON.stringify(payload) }),
      incident ? "Incident mis à jour." : "Incident déclaré.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{incident ? "Modifier l'incident" : "Déclarer un incident"}</DialogTitle>
          <DialogDescription>
            Qualification, mesures prises et retour d'expérience.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="incident-title">Titre</Label>
            <Input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="incident-severity">Gravité</Label>
              <Select
                id="incident-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="incident-category">Catégorie</Label>
              <Select
                id="incident-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="phishing">Hameçonnage</option>
                <option value="malware">Logiciel malveillant</option>
                <option value="intrusion">Intrusion</option>
                <option value="data_loss">Perte de données</option>
                <option value="account">Compromission de compte</option>
                <option value="other">Autre</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="incident-detected">Détecté le</Label>
              <Input
                id="incident-detected"
                type="datetime-local"
                value={detectedAt}
                onChange={(event) => setDetectedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="incident-status">Statut</Label>
              <Select
                id="incident-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="open">Ouvert</option>
                <option value="investigating">En investigation</option>
                <option value="contained">Contenu</option>
                <option value="closed">Clos</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="incident-owner">Responsable</Label>
              <Select
                id="incident-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="incident-description">Description</Label>
            <Textarea
              id="incident-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="incident-actions">Actions prises</Label>
            <Textarea
              id="incident-actions"
              value={actionsTaken}
              onChange={(event) => setActionsTaken(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="incident-corrective">Mesures correctives</Label>
            <Textarea
              id="incident-corrective"
              value={corrective}
              onChange={(event) => setCorrective(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="incident-lessons">Retour d'expérience</Label>
            <Textarea
              id="incident-lessons"
              value={lessons}
              onChange={(event) => setLessons(event.target.value)}
              rows={2}
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

// --- Action ------------------------------------------------------------------

interface ActionDialogProps extends BaseDialogProps {
  action: SecurityActionItem | null;
  users: TicketUserRef[];
  incidents: SecurityIncidentItem[];
  assets: AssetItem[];
}

export function SecurityActionDialog({
  open,
  onOpenChange,
  action,
  users,
  incidents,
  assets,
  onSaved,
}: ActionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("todo");
  const [incidentId, setIncidentId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [evidence, setEvidence] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(action?.title ?? "");
    setDescription(action?.description ?? "");
    setCategory(action?.category ?? "");
    setPriority(action?.priority ?? "medium");
    setDueDate(action?.due_date ?? "");
    setOwnerId(action?.owner_user_id ?? "");
    setStatus(action?.status ?? "todo");
    setIncidentId(action?.incident_id ?? "");
    setAssetId(action?.asset_id ?? "");
    setEvidence(action?.evidence ?? "");
    setError(null);
  }, [open, action, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: nullable(description),
      category: nullable(category),
      priority,
      due_date: dueDate || null,
      owner_user_id: ownerId || null,
      status,
      incident_id: incidentId || null,
      asset_id: assetId || null,
      evidence: nullable(evidence),
    };
    void submit(
      () =>
        action
          ? apiFetch(`/security/actions/${action.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/actions", { method: "POST", body: JSON.stringify(payload) }),
      action ? "Action mise à jour." : "Action créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{action ? "Modifier l'action" : "Nouvelle action de sécurité"}</DialogTitle>
          <DialogDescription>
            Action corrective ou préventive, avec échéance et preuve de réalisation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="action-title">Titre</Label>
            <Input id="action-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="action-priority">Priorité</Label>
              <Select
                id="action-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="action-status">Statut</Label>
              <Select
                id="action-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="blocked">Bloquée</option>
                <option value="done">Terminée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="action-due">Échéance</Label>
              <Input
                id="action-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="action-owner">Responsable</Label>
              <Select
                id="action-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
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
              <Label htmlFor="action-category">Catégorie</Label>
              <Input
                id="action-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Durcissement, sauvegarde, sensibilisation…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="action-incident">Incident lié</Label>
              <Select
                id="action-incident"
                value={incidentId}
                onChange={(event) => setIncidentId(event.target.value)}
              >
                <option value="">Aucun</option>
                {incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.reference} — {incident.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="action-asset">Équipement</Label>
              <Select
                id="action-asset"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              >
                <option value="">Aucun</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_tag} — {asset.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="action-description">Description</Label>
            <Textarea
              id="action-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="action-evidence">Preuve / commentaire</Label>
            <Textarea
              id="action-evidence"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              rows={2}
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

// --- Vulnérabilité -----------------------------------------------------------

interface VulnerabilityDialogProps extends BaseDialogProps {
  vulnerability: VulnerabilityItem | null;
  assets: AssetItem[];
}

export function VulnerabilityDialog({
  open,
  onOpenChange,
  vulnerability,
  assets,
  onSaved,
}: VulnerabilityDialogProps) {
  const [title, setTitle] = useState("");
  const [cve, setCve] = useState("");
  const [cvss, setCvss] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [assetId, setAssetId] = useState("");
  const [detectedAt, setDetectedAt] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("open");
  const [dueDate, setDueDate] = useState("");
  const [remediation, setRemediation] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(vulnerability?.title ?? "");
    setCve(vulnerability?.cve_id ?? "");
    setCvss(vulnerability?.cvss_score != null ? String(vulnerability.cvss_score) : "");
    setSeverity(vulnerability?.severity ?? "medium");
    setAssetId(vulnerability?.asset_id ?? "");
    setDetectedAt(vulnerability?.detected_at ?? "");
    setSource(vulnerability?.source ?? "");
    setStatus(vulnerability?.status ?? "open");
    setDueDate(vulnerability?.due_date ?? "");
    setRemediation(vulnerability?.remediation ?? "");
    setError(null);
  }, [open, vulnerability, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      cve_id: nullable(cve),
      cvss_score: cvss ? Number(cvss.replace(",", ".")) : null,
      severity,
      asset_id: assetId || null,
      detected_at: detectedAt || null,
      source: nullable(source),
      status,
      due_date: dueDate || null,
      remediation: nullable(remediation),
    };
    void submit(
      () =>
        vulnerability
          ? apiFetch(`/security/vulnerabilities/${vulnerability.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/vulnerabilities", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      vulnerability ? "Vulnérabilité mise à jour." : "Vulnérabilité enregistrée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {vulnerability ? "Modifier la vulnérabilité" : "Nouvelle vulnérabilité"}
          </DialogTitle>
          <DialogDescription>
            CVE, score CVSS, équipement concerné et remédiation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="vuln-title">Titre</Label>
            <Input id="vuln-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="vuln-cve">CVE</Label>
              <Input id="vuln-cve" value={cve} onChange={(event) => setCve(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="vuln-cvss">CVSS</Label>
              <Input
                id="vuln-cvss"
                inputMode="decimal"
                value={cvss}
                onChange={(event) => setCvss(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vuln-severity">Gravité</Label>
              <Select
                id="vuln-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="vuln-status">Statut</Label>
              <Select
                id="vuln-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="open">Ouverte</option>
                <option value="in_progress">En cours</option>
                <option value="mitigated">Atténuée</option>
                <option value="resolved">Résolue</option>
                <option value="accepted">Acceptée</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="vuln-asset">Équipement</Label>
              <Select
                id="vuln-asset"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              >
                <option value="">Aucun</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_tag} — {asset.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="vuln-detected">Détectée le</Label>
              <Input
                id="vuln-detected"
                type="date"
                value={detectedAt}
                onChange={(event) => setDetectedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vuln-due">Échéance</Label>
              <Input
                id="vuln-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="vuln-source">Source</Label>
            <Input
              id="vuln-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Scan, éditeur, CERT…"
            />
          </div>
          <div>
            <Label htmlFor="vuln-remediation">Remédiation</Label>
            <Textarea
              id="vuln-remediation"
              value={remediation}
              onChange={(event) => setRemediation(event.target.value)}
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

// --- Sauvegarde --------------------------------------------------------------

interface BackupDialogProps extends BaseDialogProps {
  backup: BackupCheckItem | null;
}

export function BackupDialog({ open, onOpenChange, backup, onSaved }: BackupDialogProps) {
  const [scope, setScope] = useState("");
  const [type, setType] = useState("full");
  const [runAt, setRunAt] = useState("");
  const [status, setStatus] = useState("success");
  const [size, setSize] = useState("");
  const [duration, setDuration] = useState("");
  const [restoreTested, setRestoreTested] = useState("");
  const [restoreStatus, setRestoreStatus] = useState("not_tested");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setScope(backup?.scope ?? "");
    setType(backup?.backup_type ?? "full");
    setRunAt(toLocalInput(backup?.run_at ?? null));
    setStatus(backup?.status ?? "success");
    setSize(backup?.size_bytes != null ? String(backup.size_bytes) : "");
    setDuration(backup?.duration_minutes != null ? String(backup.duration_minutes) : "");
    setRestoreTested(backup?.restore_tested_at ?? "");
    setRestoreStatus(backup?.restore_status ?? "not_tested");
    setNotes(backup?.notes ?? "");
    setError(null);
  }, [open, backup, setError]);

  const doSubmit = () => {
    if (!scope.trim()) {
      setError("Le périmètre est obligatoire.");
      return;
    }
    const payload = {
      scope: scope.trim(),
      backup_type: type,
      run_at: toIso(runAt),
      status,
      size_bytes: size ? Number(size) : null,
      duration_minutes: duration ? Number(duration) : null,
      restore_tested_at: restoreTested || null,
      restore_status: restoreStatus || null,
      notes: nullable(notes),
    };
    void submit(
      () =>
        backup
          ? apiFetch(`/security/backups/${backup.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/backups", { method: "POST", body: JSON.stringify(payload) }),
      backup ? "Sauvegarde mise à jour." : "Contrôle de sauvegarde enregistré.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {backup ? "Modifier le contrôle de sauvegarde" : "Nouveau contrôle de sauvegarde"}
          </DialogTitle>
          <DialogDescription>
            Exécution, résultat et test de restauration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="backup-scope">Périmètre</Label>
              <Input
                id="backup-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                placeholder="Serveurs, NAS, base de données…"
              />
            </div>
            <div>
              <Label htmlFor="backup-type">Type</Label>
              <Select id="backup-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="full">Complète</option>
                <option value="incremental">Incrémentale</option>
                <option value="differential">Différentielle</option>
                <option value="snapshot">Instantané</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="backup-status">Résultat</Label>
              <Select
                id="backup-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="success">Succès</option>
                <option value="partial">Partiel</option>
                <option value="failed">Échec</option>
                <option value="running">En cours</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="backup-run">Exécutée le</Label>
              <Input
                id="backup-run"
                type="datetime-local"
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="backup-size">Taille (octets)</Label>
              <Input
                id="backup-size"
                inputMode="numeric"
                value={size}
                onChange={(event) => setSize(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="backup-duration">Durée (min)</Label>
              <Input
                id="backup-duration"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="backup-restore-test">Restauration testée le</Label>
              <Input
                id="backup-restore-test"
                type="date"
                value={restoreTested}
                onChange={(event) => setRestoreTested(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="backup-restore-status">Résultat du test</Label>
              <Select
                id="backup-restore-status"
                value={restoreStatus}
                onChange={(event) => setRestoreStatus(event.target.value)}
              >
                <option value="not_tested">Non testée</option>
                <option value="success">Succès</option>
                <option value="failed">Échec</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="backup-notes">Notes</Label>
            <Textarea
              id="backup-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
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

// --- Certificat --------------------------------------------------------------

interface CertificateDialogProps extends BaseDialogProps {
  certificate: CertificateItem | null;
  users: TicketUserRef[];
}

export function CertificateDialog({
  open,
  onOpenChange,
  certificate,
  users,
  onSaved,
}: CertificateDialogProps) {
  const [commonName, setCommonName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("active");
  const [autoRenew, setAutoRenew] = useState(false);
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setCommonName(certificate?.common_name ?? "");
    setIssuer(certificate?.issuer ?? "");
    setValidFrom(certificate?.valid_from ?? "");
    setValidTo(certificate?.valid_to ?? "");
    setOwnerId(certificate?.owner_user_id ?? "");
    setStatus(certificate?.status ?? "active");
    setAutoRenew(certificate?.auto_renew ?? false);
    setNotes(certificate?.notes ?? "");
    setError(null);
  }, [open, certificate, setError]);

  const doSubmit = () => {
    if (!commonName.trim() || !validTo) {
      setError("Le nom commun et la date de fin sont obligatoires.");
      return;
    }
    const payload = {
      common_name: commonName.trim(),
      issuer: nullable(issuer),
      valid_from: validFrom || null,
      valid_to: validTo,
      owner_user_id: ownerId || null,
      status,
      auto_renew: autoRenew,
      notes: nullable(notes),
    };
    void submit(
      () =>
        certificate
          ? apiFetch(`/security/certificates/${certificate.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/certificates", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      certificate ? "Certificat mis à jour." : "Certificat enregistré.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{certificate ? "Modifier le certificat" : "Nouveau certificat"}</DialogTitle>
          <DialogDescription>
            Suivi des dates de validité, du renouvellement et du responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="certificate-name">Nom commun</Label>
            <Input
              id="certificate-name"
              value={commonName}
              onChange={(event) => setCommonName(event.target.value)}
              placeholder="*.pnfor.fr"
            />
          </div>
          <div>
            <Label htmlFor="certificate-issuer">Émetteur</Label>
            <Input
              id="certificate-issuer"
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="certificate-from">Valide du</Label>
              <Input
                id="certificate-from"
                type="date"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="certificate-to">Valide jusqu'au</Label>
              <Input
                id="certificate-to"
                type="date"
                value={validTo}
                onChange={(event) => setValidTo(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="certificate-owner">Responsable</Label>
              <Select
                id="certificate-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
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
              <Label htmlFor="certificate-status">Statut</Label>
              <Select
                id="certificate-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="active">Actif</option>
                <option value="expiring">Échéance proche</option>
                <option value="expired">Expiré</option>
                <option value="revoked">Révoqué</option>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">Renouvellement automatique</p>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} label="Renouvellement automatique" />
          </div>
          <div>
            <Label htmlFor="certificate-notes">Notes</Label>
            <Textarea
              id="certificate-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
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

// --- Audit -------------------------------------------------------------------

interface AuditDialogProps extends BaseDialogProps {
  audit: SecurityAuditItem | null;
}

export function SecurityAuditDialog({ open, onOpenChange, audit, onSaved }: AuditDialogProps) {
  const [title, setTitle] = useState("");
  const [auditor, setAuditor] = useState("");
  const [type, setType] = useState("interne");
  const [plannedAt, setPlannedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [status, setStatus] = useState("planned");
  const [findings, setFindings] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(audit?.title ?? "");
    setAuditor(audit?.auditor ?? "");
    setType(audit?.type ?? "interne");
    setPlannedAt(audit?.planned_at ?? "");
    setCompletedAt(audit?.completed_at ?? "");
    setStatus(audit?.status ?? "planned");
    setFindings(audit?.findings ?? "");
    setError(null);
  }, [open, audit, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      auditor: nullable(auditor),
      type,
      planned_at: plannedAt || null,
      completed_at: completedAt || null,
      status,
      findings: nullable(findings),
    };
    void submit(
      () =>
        audit
          ? apiFetch(`/security/audits/${audit.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/security/audits", { method: "POST", body: JSON.stringify(payload) }),
      audit ? "Audit mis à jour." : "Audit enregistré.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{audit ? "Modifier l'audit" : "Nouvel audit de sécurité"}</DialogTitle>
          <DialogDescription>
            Audit interne ou externe, planification et constats.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="audit-title">Titre</Label>
            <Input id="audit-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="audit-auditor">Auditeur</Label>
              <Input
                id="audit-auditor"
                value={auditor}
                onChange={(event) => setAuditor(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="audit-type">Type</Label>
              <Select id="audit-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="interne">Interne</option>
                <option value="externe">Externe</option>
                <option value="pentest">Test d'intrusion</option>
                <option value="conformite">Conformité</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="audit-status">Statut</Label>
              <Select
                id="audit-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="planned">Planifié</option>
                <option value="in_progress">En cours</option>
                <option value="done">Terminé</option>
                <option value="cancelled">Annulé</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="audit-planned">Planifié le</Label>
              <Input
                id="audit-planned"
                type="date"
                value={plannedAt}
                onChange={(event) => setPlannedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="audit-completed">Terminé le</Label>
              <Input
                id="audit-completed"
                type="date"
                value={completedAt}
                onChange={(event) => setCompletedAt(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="audit-findings">Constats</Label>
            <Textarea
              id="audit-findings"
              value={findings}
              onChange={(event) => setFindings(event.target.value)}
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
