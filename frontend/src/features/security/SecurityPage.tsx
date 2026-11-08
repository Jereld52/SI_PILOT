import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  DatabaseBackup,
  FileCheck2,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  BackupDialog,
  CertificateDialog,
  IncidentDialog,
  SecurityActionDialog,
  SecurityAuditDialog,
  VulnerabilityDialog,
} from "@/features/security/SecurityDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  AssetItem,
  BackupCheckItem,
  CertificateItem,
  Page,
  SecurityActionItem,
  SecurityAuditItem,
  SecurityIncidentItem,
  SecurityOverview,
  TicketUserRef,
  VulnerabilityItem,
} from "@/types/api";

type TabKey = "incidents" | "actions" | "vulnerabilities" | "backups" | "certificates" | "audits";

const severityTones: Record<string, "info" | "warning" | "danger"> = {
  low: "info",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const statusLabels: Record<string, string> = {
  open: "Ouvert",
  investigating: "Investigation",
  contained: "Contenu",
  closed: "Clos",
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
  cancelled: "Annulée",
  mitigated: "Atténuée",
  resolved: "Résolue",
  accepted: "Acceptée",
  success: "Succès",
  partial: "Partiel",
  failed: "Échec",
  running: "En cours",
  active: "Actif",
  expiring: "Échéance proche",
  expired: "Expiré",
  revoked: "Révoqué",
  planned: "Planifié",
};

const statusTones: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  open: "danger",
  investigating: "warning",
  contained: "info",
  closed: "neutral",
  todo: "neutral",
  in_progress: "warning",
  blocked: "danger",
  done: "success",
  cancelled: "neutral",
  mitigated: "info",
  resolved: "success",
  accepted: "neutral",
  success: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  active: "success",
  expiring: "warning",
  expired: "danger",
  revoked: "neutral",
  planned: "info",
};

const priorityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function formatBytes(value: number | null): string {
  if (!value) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function SecurityPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("security.create");
  const canUpdate = hasPermission("security.update");
  const canDelete = hasPermission("security.delete");

  const [tab, setTab] = useState<TabKey>("incidents");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [severityFilter, setSeverityFilter] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
    const requested = searchParams.get("tab");
    const allowed: TabKey[] = [
      "incidents",
      "actions",
      "vulnerabilities",
      "backups",
      "certificates",
      "audits",
    ];
    if (requested && allowed.includes(requested as TabKey)) {
      setTab(requested as TabKey);
    }
  }, [searchParams]);

  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<SecurityIncidentItem | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<SecurityActionItem | null>(null);
  const [vulnerabilityDialogOpen, setVulnerabilityDialogOpen] = useState(false);
  const [editingVulnerability, setEditingVulnerability] = useState<VulnerabilityItem | null>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [editingBackup, setEditingBackup] = useState<BackupCheckItem | null>(null);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<CertificateItem | null>(null);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [editingAudit, setEditingAudit] = useState<SecurityAuditItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: TabKey;
    id: string;
    label: string;
    closeOnly?: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["security", "overview"],
    queryFn: () => apiFetch<SecurityOverview>("/security/overview"),
  });
  const incidentsQuery = useQuery({
    queryKey: ["security", "incidents", deferredSearch, severityFilter],
    queryFn: () =>
      apiFetch<SecurityIncidentItem[]>(
        `/security/incidents${buildQuery({
          q: deferredSearch,
          severity: tab === "incidents" ? severityFilter : undefined,
        })}`,
      ),
  });
  const actionsQuery = useQuery({
    queryKey: ["security", "actions", deferredSearch],
    queryFn: () => apiFetch<SecurityActionItem[]>(`/security/actions${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "actions",
  });
  const vulnerabilitiesQuery = useQuery({
    queryKey: ["security", "vulnerabilities", deferredSearch, severityFilter],
    queryFn: () =>
      apiFetch<VulnerabilityItem[]>(
        `/security/vulnerabilities${buildQuery({ q: deferredSearch, severity: severityFilter })}`,
      ),
    enabled: tab === "vulnerabilities",
  });
  const backupsQuery = useQuery({
    queryKey: ["security", "backups", deferredSearch],
    queryFn: () => apiFetch<BackupCheckItem[]>(`/security/backups${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "backups",
  });
  const certificatesQuery = useQuery({
    queryKey: ["security", "certificates", deferredSearch],
    queryFn: () =>
      apiFetch<CertificateItem[]>(`/security/certificates${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "certificates",
  });
  const auditsQuery = useQuery({
    queryKey: ["security", "audits", deferredSearch],
    queryFn: () => apiFetch<SecurityAuditItem[]>(`/security/audits${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "audits",
  });
  const assetsQuery = useQuery({
    queryKey: ["assets", "security-picker"],
    queryFn: () => apiFetch<Page<AssetItem>>("/assets?page=1&page_size=100"),
    enabled: tab === "actions" || tab === "vulnerabilities",
    staleTime: 60_000,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    staleTime: 60_000,
  });

  const overview = overviewQuery.data;
  const incidents = incidentsQuery.data ?? [];
  const actions = actionsQuery.data ?? [];
  const vulnerabilities = vulnerabilitiesQuery.data ?? [];
  const backups = backupsQuery.data ?? [];
  const certificates = certificatesQuery.data ?? [];
  const audits = auditsQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const users = usersQuery.data ?? [];

  const refreshIncidents = () => {
    void incidentsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshActions = () => {
    void actionsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshVulnerabilities = () => {
    void vulnerabilitiesQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshBackups = () => {
    void backupsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshCertificates = () => {
    void certificatesQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshAudits = () => void auditsQuery.refetch();

  const refreshFor = (kind: TabKey) => {
    if (kind === "incidents") refreshIncidents();
    else if (kind === "actions") refreshActions();
    else if (kind === "vulnerabilities") refreshVulnerabilities();
    else if (kind === "backups") refreshBackups();
    else if (kind === "certificates") refreshCertificates();
    else refreshAudits();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path =
        deleteTarget.kind === "incidents"
          ? `/security/incidents/${deleteTarget.id}`
          : deleteTarget.kind === "actions"
            ? `/security/actions/${deleteTarget.id}`
            : deleteTarget.kind === "vulnerabilities"
              ? `/security/vulnerabilities/${deleteTarget.id}`
              : deleteTarget.kind === "backups"
                ? `/security/backups/${deleteTarget.id}`
                : deleteTarget.kind === "certificates"
                  ? `/security/certificates/${deleteTarget.id}`
                  : `/security/audits/${deleteTarget.id}`;
      await apiFetch(path, { method: "DELETE" });
      toast.success(deleteTarget.closeOnly ? "Incident clos." : "Élément supprimé.");
      setDeleteTarget(null);
      refreshFor(deleteTarget.kind);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof ShieldCheck; count?: number }[] = [
    { key: "incidents", label: "Incidents", icon: ShieldAlert, count: overview?.open_incidents },
    { key: "actions", label: "Actions", icon: ShieldCheck, count: overview?.open_actions },
    {
      key: "vulnerabilities",
      label: "Vulnérabilités",
      icon: AlertTriangle,
      count: overview?.open_vulnerabilities,
    },
    { key: "backups", label: "Sauvegardes", icon: DatabaseBackup },
    { key: "certificates", label: "Certificats", icon: KeyRound, count: overview?.expiring_certificates },
    { key: "audits", label: "Audits", icon: FileCheck2 },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sécurité opérationnelle"
        title="Cybersécurité"
        description="Incidents, actions correctives, vulnérabilités, sauvegardes, certificats et audits."
        actions={
          <>
            {tab === "incidents" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingIncident(null);
                  setIncidentDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Déclarer un incident
              </Button>
            ) : null}
            {tab === "actions" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingAction(null);
                  setActionDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle action
              </Button>
            ) : null}
            {tab === "vulnerabilities" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingVulnerability(null);
                  setVulnerabilityDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle vulnérabilité
              </Button>
            ) : null}
            {tab === "backups" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingBackup(null);
                  setBackupDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau contrôle
              </Button>
            ) : null}
            {tab === "certificates" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingCertificate(null);
                  setCertificateDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau certificat
              </Button>
            ) : null}
            {tab === "audits" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingAudit(null);
                  setAuditDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel audit
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Incidents ouverts</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {formatNumber(overview?.open_incidents ?? 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            Dont {formatNumber(overview?.critical_incidents ?? 0)} critique(s)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Actions ouvertes</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(overview?.open_actions ?? 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            {formatNumber(overview?.overdue_actions ?? 0)} en retard
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Vulnérabilités ouvertes</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.open_vulnerabilities ?? 0)}
          </p>
          <p className="mt-1 text-[10px] text-danger">
            {formatNumber(overview?.critical_vulnerabilities ?? 0)} critique(s)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Dernière sauvegarde</p>
          <p className="mt-1 text-lg font-semibold">
            <Badge tone={statusTones[overview?.last_backup_status ?? ""] ?? "neutral"}>
              {statusLabels[overview?.last_backup_status ?? ""] ?? "Aucune"}
            </Badge>
          </p>
          <p className="mt-1 text-[10px] text-muted-2">{formatDateTime(overview?.last_backup_at)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setSearch("");
              setSeverityFilter("");
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === item.key
                ? "bg-primary text-brand-cream"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
            {item.count != null ? (
              <span className="rounded-full bg-black/20 px-1.5 text-[10px]">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher…"
              className="pl-8"
              aria-label="Rechercher dans la cybersécurité"
            />
          </div>
          {tab === "incidents" || tab === "vulnerabilities" ? (
            <div className="flex flex-1 justify-end">
              <Select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="sm:w-44"
                aria-label="Filtrer par gravité"
              >
                <option value="">Toutes gravités</option>
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {tab === "incidents" ? (
            incidentsQuery.isError ? (
              <ErrorState
                message={
                  incidentsQuery.error instanceof Error
                    ? incidentsQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void incidentsQuery.refetch()}
              />
            ) : incidentsQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : incidents.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="Aucun incident"
                description="Déclarez les incidents de sécurité pour suivre leur traitement et le retour d'expérience."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident</TableHead>
                    <TableHead>Gravité</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Détecté</TableHead>
                    <TableHead className="hidden xl:table-cell">Responsable</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{incident.title}</p>
                        <p className="font-mono text-[10px] text-muted-2">{incident.reference}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={severityTones[incident.severity] ?? "neutral"}>
                          {incident.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted">{incident.category}</TableCell>
                      <TableCell>
                        <Badge tone={statusTones[incident.status] ?? "neutral"}>
                          {statusLabels[incident.status] ?? incident.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDateTime(incident.detected_at)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {incident.owner
                          ? `${incident.owner.first_name} ${incident.owner.last_name}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${incident.reference}`}
                              onClick={() => {
                                setEditingIncident(incident);
                                setIncidentDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete && incident.status !== "closed" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Clore ${incident.reference}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "incidents",
                                  id: incident.id,
                                  label: incident.title,
                                  closeOnly: true,
                                })
                              }
                            >
                              <Archive className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "actions" ? (
            actionsQuery.isError ? (
              <ErrorState
                message={
                  actionsQuery.error instanceof Error ? actionsQuery.error.message : "Erreur inconnue."
                }
                onRetry={() => void actionsQuery.refetch()}
              />
            ) : actionsQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : actions.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Aucune action"
                description="Planifiez les actions correctives et préventives avec une échéance et un responsable."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                    <TableHead className="hidden xl:table-cell">Responsable</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Incident</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action) => (
                    <TableRow key={action.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {action.title}
                      </TableCell>
                      <TableCell>
                        <Badge tone={priorityTones[action.priority] ?? "neutral"}>
                          {action.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusTones[action.status] ?? "neutral"}>
                          {statusLabels[action.status] ?? action.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDate(action.due_date)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {action.owner ? `${action.owner.first_name} ${action.owner.last_name}` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted 2xl:table-cell">
                        {action.incident_reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${action.title}`}
                              onClick={() => {
                                setEditingAction(action);
                                setActionDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${action.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "actions",
                                  id: action.id,
                                  label: action.title,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "vulnerabilities" ? (
            vulnerabilitiesQuery.isError ? (
              <ErrorState
                message={
                  vulnerabilitiesQuery.error instanceof Error
                    ? vulnerabilitiesQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void vulnerabilitiesQuery.refetch()}
              />
            ) : vulnerabilitiesQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : vulnerabilities.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Aucune vulnérabilité"
                description="Recensez les vulnérabilités, leur score CVSS et les remédiations."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vulnérabilité</TableHead>
                    <TableHead>Gravité</TableHead>
                    <TableHead>CVSS</TableHead>
                    <TableHead className="hidden lg:table-cell">Équipement</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vulnerabilities.map((vulnerability) => (
                    <TableRow key={vulnerability.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{vulnerability.title}</p>
                        <p className="font-mono text-[10px] text-muted-2">
                          {vulnerability.cve_id ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={severityTones[vulnerability.severity] ?? "neutral"}>
                          {vulnerability.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {vulnerability.cvss_score ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {vulnerability.asset_label ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusTones[vulnerability.status] ?? "neutral"}>
                          {statusLabels[vulnerability.status] ?? vulnerability.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDate(vulnerability.due_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${vulnerability.title}`}
                              onClick={() => {
                                setEditingVulnerability(vulnerability);
                                setVulnerabilityDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${vulnerability.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "vulnerabilities",
                                  id: vulnerability.id,
                                  label: vulnerability.title,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "backups" ? (
            backupsQuery.isError ? (
              <ErrorState
                message={
                  backupsQuery.error instanceof Error ? backupsQuery.error.message : "Erreur inconnue."
                }
                onRetry={() => void backupsQuery.refetch()}
              />
            ) : backupsQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : backups.length === 0 ? (
              <EmptyState
                icon={DatabaseBackup}
                title="Aucun contrôle de sauvegarde"
                description="Enregistrez les exécutions et les tests de restauration."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Périmètre</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Résultat</TableHead>
                    <TableHead className="hidden lg:table-cell">Exécution</TableHead>
                    <TableHead className="hidden xl:table-cell">Taille</TableHead>
                    <TableHead>Restauration</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {backup.scope}
                      </TableCell>
                      <TableCell className="text-xs text-muted">{backup.backup_type ?? "—"}</TableCell>
                      <TableCell>
                        <Badge tone={statusTones[backup.status] ?? "neutral"}>
                          {statusLabels[backup.status] ?? backup.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDateTime(backup.run_at)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {formatBytes(backup.size_bytes)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            backup.restore_status === "success"
                              ? "success"
                              : backup.restore_status === "failed"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {backup.restore_status === "success"
                            ? "Testée OK"
                            : backup.restore_status === "failed"
                              ? "Échec"
                              : "Non testée"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${backup.scope}`}
                              onClick={() => {
                                setEditingBackup(backup);
                                setBackupDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${backup.scope}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "backups",
                                  id: backup.id,
                                  label: backup.scope,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "certificates" ? (
            certificatesQuery.isError ? (
              <ErrorState
                message={
                  certificatesQuery.error instanceof Error
                    ? certificatesQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void certificatesQuery.refetch()}
              />
            ) : certificatesQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : certificates.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="Aucun certificat"
                description="Suivez les certificats, leurs dates de validité et leur renouvellement."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificat</TableHead>
                    <TableHead>Émetteur</TableHead>
                    <TableHead>Validité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden xl:table-cell">Responsable</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((certificate) => (
                    <TableRow key={certificate.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {certificate.common_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted">{certificate.issuer ?? "—"}</TableCell>
                      <TableCell>
                        <p className="text-xs text-muted">{formatDate(certificate.valid_to)}</p>
                        {certificate.alert_level ? (
                          <Badge
                            tone={
                              certificate.alert_level === "critical" ||
                              certificate.alert_level === "expired"
                                ? "danger"
                                : certificate.alert_level === "warning"
                                  ? "warning"
                                  : "info"
                            }
                          >
                            {certificate.days_to_expiry != null
                              ? `${certificate.days_to_expiry} j`
                              : certificate.alert_level}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusTones[certificate.status] ?? "neutral"}>
                          {statusLabels[certificate.status] ?? certificate.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {certificate.owner
                          ? `${certificate.owner.first_name} ${certificate.owner.last_name}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${certificate.common_name}`}
                              onClick={() => {
                                setEditingCertificate(certificate);
                                setCertificateDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${certificate.common_name}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "certificates",
                                  id: certificate.id,
                                  label: certificate.common_name,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "audits" ? (
            auditsQuery.isError ? (
              <ErrorState
                message={
                  auditsQuery.error instanceof Error ? auditsQuery.error.message : "Erreur inconnue."
                }
                onRetry={() => void auditsQuery.refetch()}
              />
            ) : auditsQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : audits.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="Aucun audit"
                description="Planifiez les audits internes, externes et tests d'intrusion."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Planifié</TableHead>
                    <TableHead className="hidden xl:table-cell">Auditeur</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audits.map((audit) => (
                    <TableRow key={audit.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {audit.title}
                      </TableCell>
                      <TableCell className="text-xs text-muted">{audit.type ?? "—"}</TableCell>
                      <TableCell>
                        <Badge tone={statusTones[audit.status] ?? "neutral"}>
                          {statusLabels[audit.status] ?? audit.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDate(audit.planned_at)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {audit.auditor ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${audit.title}`}
                              onClick={() => {
                                setEditingAudit(audit);
                                setAuditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${audit.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "audits",
                                  id: audit.id,
                                  label: audit.title,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}
        </CardContent>
      </Card>

      <IncidentDialog
        open={incidentDialogOpen}
        onOpenChange={setIncidentDialogOpen}
        incident={editingIncident}
        users={users}
        onSaved={refreshIncidents}
      />
      <SecurityActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        action={editingAction}
        users={users}
        incidents={incidents}
        assets={assets}
        onSaved={refreshActions}
      />
      <VulnerabilityDialog
        open={vulnerabilityDialogOpen}
        onOpenChange={setVulnerabilityDialogOpen}
        vulnerability={editingVulnerability}
        assets={assets}
        onSaved={refreshVulnerabilities}
      />
      <BackupDialog
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
        backup={editingBackup}
        onSaved={refreshBackups}
      />
      <CertificateDialog
        open={certificateDialogOpen}
        onOpenChange={setCertificateDialogOpen}
        certificate={editingCertificate}
        users={users}
        onSaved={refreshCertificates}
      />
      <SecurityAuditDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        audit={editingAudit}
        onSaved={refreshAudits}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.closeOnly ? "Clore cet incident ?" : "Supprimer cet élément ?"}
        description={
          deleteTarget?.closeOnly
            ? `« ${deleteTarget?.label ?? ""} » passera au statut « clos ». L'historique est conservé.`
            : `« ${deleteTarget?.label ?? ""} » sera définitivement supprimé.`
        }
        confirmLabel={deleteTarget?.closeOnly ? "Clore" : "Supprimer"}
        tone="danger"
        loading={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
