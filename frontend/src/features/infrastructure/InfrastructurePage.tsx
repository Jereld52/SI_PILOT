import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  Cable,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Radar,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  InfraDependencyDialog,
  InfraEquipmentDialog,
  MonitoringCheckDialog,
  MonitoringResultsDialog,
} from "@/features/infrastructure/InfrastructureDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  InfraDependencyItem,
  InfraEquipmentItem,
  LocationItem,
  MonitoringCheckItem,
  MonitoringResultItem,
  TicketUserRef,
} from "@/types/api";

type TabKey = "equipments" | "dependencies" | "checks";

const equipmentTypeLabels: Record<string, string> = {
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

const statusLabels: Record<string, string> = {
  active: "Actif",
  maintenance: "Maintenance",
  offline: "Hors ligne",
  retired: "Retiré",
};

const criticalityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const checkTypeLabels: Record<string, string> = {
  ping: "Ping",
  snmp: "SNMP",
  http: "HTTP",
  tcp: "TCP",
  agent: "Agent",
};

const dependencyTypeLabels: Record<string, string> = {
  network: "Réseau",
  power: "Alimentation",
  storage: "Stockage",
  authentication: "Authentification",
  application: "Applicatif",
  other: "Autre",
};

export function InfrastructurePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("infrastructure.create");
  const canUpdate = hasPermission("infrastructure.update");
  const canDelete = hasPermission("infrastructure.delete");
  const canAuthorize = hasPermission("infrastructure.monitoring.authorize");
  const canTopology = hasPermission("infrastructure.topology");

  const [tab, setTab] = useState<TabKey>("equipments");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<InfraEquipmentItem | null>(null);
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<MonitoringCheckItem | null>(null);
  const [resultsCheck, setResultsCheck] = useState<MonitoringCheckItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "equipment" | "dependency" | "check";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);

  const equipmentsQuery = useQuery({
    queryKey: ["infrastructure", "equipments", deferredSearch, typeFilter, statusFilter],
    queryFn: () =>
      apiFetch<InfraEquipmentItem[]>(
        `/infrastructure/equipments${buildQuery({
          q: deferredSearch,
          type: typeFilter,
          status: statusFilter,
        })}`,
      ),
  });
  const dependenciesQuery = useQuery({
    queryKey: ["infrastructure", "dependencies"],
    queryFn: () => apiFetch<InfraDependencyItem[]>("/infrastructure/dependencies"),
    enabled: tab === "dependencies",
  });
  const checksQuery = useQuery({
    queryKey: ["infrastructure", "checks"],
    queryFn: () => apiFetch<MonitoringCheckItem[]>("/infrastructure/checks"),
    enabled: tab === "checks",
  });
  const resultsQuery = useQuery({
    queryKey: ["infrastructure", "results", resultsCheck?.id],
    queryFn: () =>
      apiFetch<MonitoringResultItem[]>(`/infrastructure/checks/${resultsCheck?.id}/results`),
    enabled: Boolean(resultsCheck),
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    staleTime: 60_000,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    staleTime: 60_000,
  });

  const equipments = equipmentsQuery.data ?? [];
  const dependencies = dependenciesQuery.data ?? [];
  const checks = checksQuery.data ?? [];
  const results = resultsQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const criticalCount = equipments.filter((item) =>
    ["high", "critical"].includes(item.criticality),
  ).length;
  const degradedCount = equipments.filter((item) =>
    ["maintenance", "offline"].includes(item.status),
  ).length;
  const enabledChecks = checks.filter((item) => item.is_enabled).length;

  const refreshEquipments = () => {
    void equipmentsQuery.refetch();
    void dependenciesQuery.refetch();
    void checksQuery.refetch();
  };
  const refreshChecks = () => {
    void checksQuery.refetch();
    void resultsQuery.refetch();
  };

  const authorize = async (check: MonitoringCheckItem) => {
    setAuthorizingId(check.id);
    try {
      await apiFetch(`/infrastructure/checks/${check.id}/authorize`, { method: "POST" });
      toast.success("Contrôle autorisé. Il peut désormais être activé.");
      refreshChecks();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Autorisation impossible.");
    } finally {
      setAuthorizingId(null);
    }
  };

  const toggleCheck = async (check: MonitoringCheckItem) => {
    try {
      await apiFetch(`/infrastructure/checks/${check.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: !check.is_enabled }),
      });
      toast.success(check.is_enabled ? "Contrôle désactivé." : "Contrôle activé.");
      refreshChecks();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Modification impossible.");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path =
        deleteTarget.kind === "equipment"
          ? `/infrastructure/equipments/${deleteTarget.id}`
          : deleteTarget.kind === "dependency"
            ? `/infrastructure/dependencies/${deleteTarget.id}`
            : `/infrastructure/checks/${deleteTarget.id}`;
      await apiFetch(path, { method: "DELETE" });
      toast.success(
        deleteTarget.kind === "equipment"
          ? "Équipement retiré de l'inventaire actif."
          : "Élément supprimé.",
      );
      setDeleteTarget(null);
      refreshEquipments();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Server }[] = [
    { key: "equipments", label: "Équipements", icon: Server },
    { key: "dependencies", label: "Dépendances", icon: Cable },
    { key: "checks", label: "Supervision", icon: Radar },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Systèmes et réseau"
        title="Infrastructure"
        description="Serveurs, VM, équipements réseau, dépendances et supervision autorisée."
        actions={
          <>
            {canTopology ? (
              <Button variant="secondary" size="sm" onClick={() => navigate("/supervision")}>
                <Radar className="h-3.5 w-3.5" />
                Carte de supervision
              </Button>
            ) : null}
            {hasPermission("exports.run") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      window.open("/api/v1/exports/infrastructure?format=xlsx", "_blank")
                    }
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel détaillé (XLSX)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      window.open("/api/v1/exports/infrastructure?format=pdf", "_blank")
                    }
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Synthèse PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.open("/exports?dataset=infrastructure", "_self")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export sur mesure…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {tab === "equipments" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingEquipment(null);
                  setEquipmentDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel équipement
              </Button>
            ) : null}
            {tab === "dependencies" && canCreate && equipments.length >= 2 ? (
              <Button size="sm" onClick={() => setDependencyDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nouvelle dépendance
              </Button>
            ) : null}
            {tab === "checks" && canCreate && equipments.length > 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingCheck(null);
                  setCheckDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau contrôle
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Équipements</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(equipments.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Criticité élevée</p>
          <p className="mt-1 text-2xl font-semibold text-danger">{formatNumber(criticalCount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Maintenance / hors ligne</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{formatNumber(degradedCount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Contrôles actifs</p>
          <p className="mt-1 text-2xl font-semibold text-success">{formatNumber(enabledChecks)}</p>
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
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                tab === "equipments"
                  ? "Rechercher un équipement…"
                  : tab === "dependencies"
                    ? "Rechercher une dépendance…"
                    : "Rechercher un contrôle…"
              }
              className="pl-8"
              aria-label="Rechercher dans l'infrastructure"
            />
          </div>
          {tab === "equipments" ? (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
              <Select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="sm:w-48"
                aria-label="Filtrer par type"
              >
                <option value="">Tous les types</option>
                {Object.entries(equipmentTypeLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="sm:w-40"
                aria-label="Filtrer par statut"
              >
                <option value="">Tous les statuts</option>
                {Object.entries(statusLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {tab === "equipments" ? (
            equipmentsQuery.isError ? (
              <ErrorState
                message={
                  equipmentsQuery.error instanceof Error
                    ? equipmentsQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void equipmentsQuery.refetch()}
              />
            ) : equipmentsQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : equipments.length === 0 ? (
              <EmptyState
                icon={Server}
                title="Aucun équipement d'infrastructure"
                description="Recensez les serveurs, VM et équipements réseau pour cartographier les dépendances."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Équipement</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Adresse IP</TableHead>
                    <TableHead className="hidden xl:table-cell">Rôle</TableHead>
                    <TableHead className="hidden lg:table-cell">Site</TableHead>
                    <TableHead>Criticité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipments.map((equipment) => (
                    <TableRow key={equipment.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{equipment.name}</p>
                        <p className="text-[10px] text-muted-2">
                          {equipment.os_name ?? "—"}
                          {equipment.last_check_at
                            ? ` · ${formatDateTime(equipment.last_check_at)}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {equipmentTypeLabels[equipment.type] ?? equipment.type}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] text-muted lg:table-cell">
                        {equipment.ip_address ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {equipment.role ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {equipment.location?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge tone={criticalityTones[equipment.criticality] ?? "neutral"}>
                          {equipment.criticality}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            equipment.status === "active"
                              ? "success"
                              : equipment.status === "offline"
                                ? "danger"
                                : equipment.status === "retired"
                                  ? "neutral"
                                  : "warning"
                          }
                        >
                          {statusLabels[equipment.status] ?? equipment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${equipment.name}`}
                              onClick={() => {
                                setEditingEquipment(equipment);
                                setEquipmentDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete && equipment.status !== "retired" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Retirer ${equipment.name}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "equipment",
                                  id: equipment.id,
                                  label: equipment.name,
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

          {tab === "dependencies" ? (
            dependenciesQuery.isError ? (
              <ErrorState
                message={
                  dependenciesQuery.error instanceof Error
                    ? dependenciesQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void dependenciesQuery.refetch()}
              />
            ) : dependenciesQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : dependencies.length === 0 ? (
              <EmptyState
                icon={Cable}
                title="Aucune dépendance"
                description="Reliez les équipements entre eux pour visualiser les impacts d'une panne."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Dépend de</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Description</TableHead>
                    <TableHead className="w-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dependencies.map((dependency) => (
                    <TableRow key={dependency.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {dependency.source_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted">{dependency.target_name}</TableCell>
                      <TableCell className="text-xs text-muted">
                        {dependencyTypeLabels[dependency.dependency_type] ??
                          dependency.dependency_type}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {dependency.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Supprimer la dépendance ${dependency.source_name}`}
                            onClick={() =>
                              setDeleteTarget({
                                kind: "dependency",
                                id: dependency.id,
                                label: `${dependency.source_name} → ${dependency.target_name}`,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}

          {tab === "checks" ? (
            checksQuery.isError ? (
              <ErrorState
                message={
                  checksQuery.error instanceof Error
                    ? checksQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void checksQuery.refetch()}
              />
            ) : checksQuery.isLoading ? (
              <div className="space-y-1 px-2 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : checks.length === 0 ? (
              <EmptyState
                icon={Radar}
                title="Aucun contrôle de supervision"
                description="Préparez les contrôles ping, SNMP, HTTP ou TCP. Aucune sonde n'est lancée sans autorisation."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrôle</TableHead>
                    <TableHead>Équipement</TableHead>
                    <TableHead className="hidden lg:table-cell">Intervalle</TableHead>
                    <TableHead>Autorisation</TableHead>
                    <TableHead>Activation</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {checkTypeLabels[check.check_type] ?? check.check_type}
                      </TableCell>
                      <TableCell className="text-xs text-muted">{check.infra_name}</TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {check.interval_seconds} s
                      </TableCell>
                      <TableCell>
                        <Badge tone={check.authorized_at ? "success" : "warning"}>
                          {check.authorized_at ? "Autorisé" : "À autoriser"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => canUpdate && void toggleCheck(check)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            check.is_enabled
                              ? "border-success/25 bg-success/10 text-success"
                              : "border-border bg-surface-2 text-muted",
                          )}
                          aria-label={check.is_enabled ? "Désactiver le contrôle" : "Activer le contrôle"}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              check.is_enabled ? "bg-success" : "bg-muted-2",
                            )}
                          />
                          {check.is_enabled ? "Actif" : "Inactif"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!check.authorized_at && canAuthorize ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Autoriser le contrôle"
                              loading={authorizingId === check.id}
                              onClick={() => void authorize(check)}
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Voir les résultats"
                            onClick={() => setResultsCheck(check)}
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </Button>
                          {canUpdate ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifier le contrôle"
                              onClick={() => {
                                setEditingCheck(check);
                                setCheckDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Supprimer le contrôle"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "check",
                                  id: check.id,
                                  label: `${check.check_type} — ${check.infra_name}`,
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

      <InfraEquipmentDialog
        open={equipmentDialogOpen}
        onOpenChange={setEquipmentDialogOpen}
        equipment={editingEquipment}
        equipments={equipments}
        locations={locations}
        users={users}
        onSaved={refreshEquipments}
      />
      <InfraDependencyDialog
        open={dependencyDialogOpen}
        onOpenChange={setDependencyDialogOpen}
        equipments={equipments}
        onSaved={() => void dependenciesQuery.refetch()}
      />
      <MonitoringCheckDialog
        open={checkDialogOpen}
        onOpenChange={setCheckDialogOpen}
        check={editingCheck}
        equipments={equipments}
        onSaved={refreshChecks}
      />
      <MonitoringResultsDialog
        open={Boolean(resultsCheck)}
        onOpenChange={(open) => !open && setResultsCheck(null)}
        check={resultsCheck}
        results={results}
        canRecord={canUpdate}
        onSaved={() => {
          void resultsQuery.refetch();
          void equipmentsQuery.refetch();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={
          deleteTarget?.kind === "equipment"
            ? "Retirer cet équipement ?"
            : "Supprimer cet élément ?"
        }
        description={
          deleteTarget?.kind === "equipment"
            ? `« ${deleteTarget?.label ?? ""} » passera au statut « retiré ». Les dépendances et contrôles liés sont conservés.`
            : `« ${deleteTarget?.label ?? ""} » sera supprimé.`
        }
        confirmLabel={deleteTarget?.kind === "equipment" ? "Retirer" : "Supprimer"}
        tone="danger"
        loading={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
