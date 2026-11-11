import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  Search,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type {
  AgentItem,
  ChecklistRun,
  ChecklistTemplate,
  OnboardingBriefing,
  Page,
} from "@/types/api";

type TabKey = "all" | "onboarding" | "offboarding";

const runTypeLabels: Record<string, string> = {
  onboarding: "Arrivée",
  offboarding: "Départ",
};
const runTypeTones: Record<string, "info" | "warning"> = {
  onboarding: "info",
  offboarding: "warning",
};
const statusLabels: Record<string, string> = {
  in_progress: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};
const statusTones: Record<string, "info" | "success" | "neutral"> = {
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
};
const severityTones: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "warning",
  low: "info",
  info: "neutral",
};

export function OnboardingPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("agents.read");
  const canManage =
    hasPermission("agents.update") ||
    hasPermission("agents.onboarding") ||
    hasPermission("agents.offboarding");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"onboarding" | "offboarding">("onboarding");
  const [agentId, setAgentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailRunId, setDetailRunId] = useState<string | null>(
    searchParams.get("run"),
  );
  const [cancelTarget, setCancelTarget] = useState<ChecklistRun | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ["onboarding", "runs", tab, search, statusFilter],
    queryFn: () =>
      apiFetch<ChecklistRun[]>(
        `/onboarding/runs${buildQuery({
          type: tab === "all" ? undefined : tab,
          q: search,
          status: statusFilter || undefined,
        })}`,
      ),
    enabled: canRead,
  });
  const briefingQuery = useQuery({
    queryKey: ["onboarding", "briefing"],
    queryFn: () => apiFetch<OnboardingBriefing>("/onboarding/briefing"),
    enabled: canRead,
  });
  const templatesQuery = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => apiFetch<ChecklistTemplate[]>("/onboarding/templates"),
    enabled: canRead,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "onboarding"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100"),
    enabled: canRead,
  });
  const detailQuery = useQuery({
    queryKey: ["onboarding", "run", detailRunId],
    queryFn: () => apiFetch<ChecklistRun>(`/onboarding/runs/${detailRunId}`),
    enabled: canRead && Boolean(detailRunId),
  });

  const runs = runsQuery.data ?? [];
  const briefing = briefingQuery.data;
  const templates = templatesQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const detail = detailQuery.data;
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const detailAgent = detail
    ? agents.find((agent) => agent.id === detail.agent_id) ?? null
    : null;

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.type === createType),
    [templates, createType],
  );

  useEffect(() => {
    const requestedRun = searchParams.get("run");
    if (requestedRun) setDetailRunId(requestedRun);
    const requestedAgent = searchParams.get("agent");
    if (requestedAgent) {
      setAgentId(requestedAgent);
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!createOpen) return;
    if (filteredTemplates.length > 0 && !filteredTemplates.some((item) => item.id === templateId)) {
      setTemplateId(filteredTemplates[0].id);
    }
  }, [createOpen, filteredTemplates, templateId]);

  useEffect(() => {
    if (!selectedAgent) return;
    if (createType === "onboarding" && selectedAgent.arrival_date) {
      setDueDate(selectedAgent.arrival_date);
    } else if (createType === "offboarding" && selectedAgent.departure_date) {
      setDueDate(selectedAgent.departure_date);
    }
  }, [selectedAgent, createType]);

  const refreshAll = () => {
    void runsQuery.refetch();
    void briefingQuery.refetch();
  };

  const openCreate = (type: "onboarding" | "offboarding" = "onboarding") => {
    setCreateType(type);
    setAgentId("");
    setTemplateId("");
    setDueDate("");
    setNotes("");
    setCreateOpen(true);
  };

  const createRun = async () => {
    if (!agentId) {
      toast.error("Sélectionnez un agent.");
      return;
    }
    setCreating(true);
    try {
      const created = await apiFetch<ChecklistRun>("/onboarding/runs", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          type: createType,
          template_id: templateId || null,
          due_date: dueDate || null,
          notes: notes.trim() || null,
        }),
      });
      toast.success("Dossier créé.");
      setCreateOpen(false);
      setDetailRunId(created.id);
      refreshAll();
      void queryClient.invalidateQueries({ queryKey: ["onboarding", "run"] });
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.set("run", created.id);
        next.delete("agent");
        return next;
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (run: ChecklistRun, status: string) => {
    try {
      const updated = await apiFetch<ChecklistRun>(`/onboarding/runs/${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      queryClient.setQueryData(["onboarding", "run", run.id], updated);
      refreshAll();
      setCancelTarget(null);
      toast.success(status === "completed" ? "Dossier terminé." : "Dossier annulé.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mise à jour impossible.");
    }
  };

  const cancelRun = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await updateStatus(cancelTarget, "cancelled");
    } finally {
      setCancelling(false);
    }
  };

  const toggleItem = async (run: ChecklistRun, itemId: string, done: boolean) => {
    setBusyItem(itemId);
    try {
      const updated = await apiFetch<ChecklistRun>(
        `/onboarding/runs/${run.id}/items/${itemId}`,
        {
          method: "POST",
          body: JSON.stringify({ is_done: done }),
        },
      );
      queryClient.setQueryData(["onboarding", "run", run.id], updated);
      refreshAll();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mise à jour impossible.");
    } finally {
      setBusyItem(null);
    }
  };

  const closeDetail = (open: boolean) => {
    if (open) return;
    setDetailRunId(null);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete("run");
      return next;
    });
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les arrivées et départs."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Support & parc"
        title="Arrivées & départs"
        description="Dossiers d'intégration et de sortie, checklists, échéances et points d'attention."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => openCreate("onboarding")}>
              <Plus className="h-3.5 w-3.5" />
              Nouveau dossier
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Arrivées à venir</p>
          <p className="mt-1 text-2xl font-semibold text-info">
            {briefing?.counts.upcoming_arrivals ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Départs à venir</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {briefing?.counts.upcoming_departures ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Dossiers en cours</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {briefing?.counts.in_progress ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">En retard</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {briefing?.counts.overdue ?? 0}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Points d'attention</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Arrivées sans dossier, départs incomplets et checklists en retard.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {briefingQuery.isLoading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : (briefing?.items.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-success/20 bg-success/[0.04] px-3 py-2 text-[11px] text-success">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              Aucun point d'attention. Les dossiers sont à jour.
            </p>
          ) : (
            briefing?.items.slice(0, 8).map((alert, index) => (
              <div
                key={`${alert.title}-${index}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
                    <Badge tone={severityTones[alert.severity] ?? "neutral"}>
                      {alert.severity}
                    </Badge>
                    {alert.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-2">{alert.detail}</p>
                </div>
                {alert.link ? (
                  <Link
                    to={alert.link}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    Ouvrir
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Tabs
        items={[
          { key: "all", label: "Tous les dossiers", icon: ClipboardList },
          { key: "onboarding", label: "Arrivées", icon: UserPlus },
          { key: "offboarding", label: "Départs", icon: UserMinus },
        ]}
        value={tab}
        onChange={(value) => setTab(value as TabKey)}
      />

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un agent, un e-mail, un login…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-44"
            >
              <option value="">Tous les statuts</option>
              <option value="in_progress">En cours</option>
              <option value="completed">Terminé</option>
              <option value="cancelled">Annulé</option>
            </Select>
            {canManage ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => openCreate("offboarding")}>
                  <UserMinus className="h-3.5 w-3.5" />
                  Dossier de départ
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {runsQuery.isError ? (
            <ErrorState
              message={
                runsQuery.error instanceof Error
                  ? runsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void runsQuery.refetch()}
            />
          ) : runsQuery.isLoading ? (
            <div className="space-y-1 px-3 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Aucun dossier"
              description="Créez un dossier d'arrivée ou de départ pour suivre les étapes."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{run.agent_name}</p>
                      <p className="text-[10px] text-muted-2">
                        {run.agent_service || "Service non précisé"} · {run.template_name}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={runTypeTones[run.type] ?? "neutral"}>
                        {runTypeLabels[run.type] ?? run.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[run.status] ?? "neutral"}>
                        {statusLabels[run.status] ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {run.due_date ? formatDate(run.due_date) : "—"}
                      {run.is_overdue ? (
                        <Badge tone="danger" className="ml-1.5">
                          En retard
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              run.progress_percent >= 100 ? "bg-success" : "bg-primary",
                            )}
                            style={{ width: `${run.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-2">
                          {run.required_done}/{run.required_total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetailRunId(run.id)}>
                        Ouvrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau dossier d'arrivée ou de départ</DialogTitle>
            <DialogDescription>
              Le dossier reprend automatiquement le modèle de checklist sélectionné.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="onboarding-agent">Agent</Label>
              <Select
                id="onboarding-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="">Sélectionner un agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name}
                    {agent.service ? ` — ${agent.service.name}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="onboarding-type">Type</Label>
                <Select
                  id="onboarding-type"
                  value={createType}
                  onChange={(event) =>
                    setCreateType(event.target.value as "onboarding" | "offboarding")
                  }
                >
                  <option value="onboarding">Arrivée</option>
                  <option value="offboarding">Départ</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="onboarding-due">Échéance</Label>
                <Input
                  id="onboarding-due"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="onboarding-template">Modèle</Label>
              <Select
                id="onboarding-template"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {filteredTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="onboarding-notes">Notes</Label>
              <Textarea
                id="onboarding-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Contexte, matériel prévu, points particuliers…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button loading={creating} onClick={() => void createRun()}>
              Créer le dossier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailRunId)} onOpenChange={closeDetail}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {detail?.agent_name ?? "Dossier"}
              {detail ? (
                <Badge tone={runTypeTones[detail.type] ?? "neutral"}>
                  {runTypeLabels[detail.type] ?? detail.type}
                </Badge>
              ) : null}
              {detail ? (
                <Badge tone={statusTones[detail.status] ?? "neutral"}>
                  {statusLabels[detail.status] ?? detail.status}
                </Badge>
              ) : null}
              {detail?.is_overdue ? <Badge tone="danger">En retard</Badge> : null}
            </DialogTitle>
            <DialogDescription>
              {detail?.template_name ?? "Checklist"} · échéance{" "}
              {detail?.due_date ? formatDate(detail.due_date) : "non précisée"}
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isError ? (
            <ErrorState
              message={
                detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void detailQuery.refetch()}
            />
          ) : detailQuery.isLoading || !detail ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
            </div>
          ) : (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              <div className="grid gap-2 text-[11px] sm:grid-cols-2 xl:grid-cols-3">
                <p>
                  <span className="text-muted-2">Service : </span>
                  {detail.agent_service || "—"}
                </p>
                <p>
                  <span className="text-muted-2">E-mail : </span>
                  {detailAgent?.email_pro ?? "—"}
                </p>
                <p>
                  <span className="text-muted-2">Arrivée : </span>
                  {detailAgent?.arrival_date ? formatDate(detailAgent.arrival_date) : "—"}
                </p>
                <p>
                  <span className="text-muted-2">Départ : </span>
                  {detailAgent?.departure_date ? formatDate(detailAgent.departure_date) : "—"}
                </p>
                <p>
                  <span className="text-muted-2">Ouvert le : </span>
                  {detail.started_at ? formatDate(detail.started_at) : "—"}
                </p>
                <p>
                  <span className="text-muted-2">Progression : </span>
                  {detail.required_done}/{detail.required_total} · {detail.progress_percent}%
                </p>
              </div>

              {detail.notes ? (
                <div className="rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[11px] text-muted">
                  {detail.notes}
                </div>
              ) : null}

              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    detail.progress_percent >= 100 ? "bg-success" : "bg-primary",
                  )}
                  style={{ width: `${detail.progress_percent}%` }}
                />
              </div>

              <div className="space-y-1">
                {detail.items.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2",
                      item.is_done
                        ? "border-success/20 bg-success/[0.04]"
                        : "border-border-soft bg-background/40",
                    )}
                  >
                    <Checkbox
                      checked={item.is_done}
                      disabled={!canManage || busyItem === item.id}
                      onChange={(event) =>
                        void toggleItem(detail, item.id, event.target.checked)
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-xs",
                          item.is_done ? "text-muted line-through" : "text-foreground",
                        )}
                      >
                        {item.label}
                        {!item.is_required ? (
                          <span className="ml-1.5 text-[9px] text-muted-2">facultatif</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-2">
                        {item.done_at ? <span>Fait le {formatDate(item.done_at)}</span> : null}
                        {item.notes ? <span>{item.notes}</span> : null}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <p className="flex items-center gap-1.5 text-[10px] text-muted-2">
                <Clock className="h-3 w-3" />
                Dossier ouvert le {detail.started_at ? formatDate(detail.started_at) : "—"}
              </p>
            </div>
          )}

          <DialogFooter>
            {detail && canManage && detail.status === "in_progress" ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void updateStatus(detail, "completed")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Marquer terminé
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setCancelTarget(detail)}
                >
                  Annuler le dossier
                </Button>
              </>
            ) : null}
            {detail && canManage && detail.status === "completed" ? (
              <Button
                variant="secondary"
                onClick={() => void updateStatus(detail, "in_progress")}
              >
                Réouvrir
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => closeDetail(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={`Annuler le dossier de ${cancelTarget?.agent_name ?? ""} ?`}
        description="Le dossier sera conservé avec le statut Annulé. Les tâches déjà cochées restent visibles."
        confirmLabel="Annuler le dossier"
        tone="danger"
        loading={cancelling}
        onConfirm={() => void cancelRun()}
      />
    </div>
  );
}
