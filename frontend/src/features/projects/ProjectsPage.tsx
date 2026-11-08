import { useQuery } from "@tanstack/react-query";
import { Archive, Eye, FolderKanban, Pencil, Plus, Search } from "lucide-react";
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
import { ProjectDialog } from "@/features/projects/ProjectDialogs";
import { ProjectDetailDialog } from "@/features/projects/ProjectDetailDialog";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatNumber, fullName } from "@/lib/utils";
import type { ProjectDetailItem, ProjectItem, TicketUserRef } from "@/types/api";

const statusLabels: Record<string, string> = {
  idea: "Idée",
  planned: "Planifié",
  in_progress: "En cours",
  on_hold: "En pause",
  done: "Terminé",
  cancelled: "Annulé",
};

const statusTones: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  idea: "neutral",
  planned: "info",
  in_progress: "warning",
  on_hold: "neutral",
  done: "success",
  cancelled: "neutral",
};

const priorityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export function ProjectsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("projects.create");
  const canEdit = hasPermission("projects.update");
  const canArchive = hasPermission("projects.delete");

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
  }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProjectItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects", deferredSearch, statusFilter, priorityFilter],
    queryFn: () =>
      apiFetch<ProjectItem[]>(
        `/projects${buildQuery({
          q: deferredSearch,
          status: statusFilter,
          priority: priorityFilter,
        })}`,
      ),
  });
  const detailQuery = useQuery({
    queryKey: ["projects", "detail", detailId],
    queryFn: () => apiFetch<ProjectDetailItem>(`/projects/${detailId}`),
    enabled: Boolean(detailId),
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    staleTime: 60_000,
  });

  const projects = projectsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const activeProjects = projects.filter((item) =>
    ["planned", "in_progress", "on_hold"].includes(item.status),
  );
  const lateProjects = activeProjects.filter(
    (item) => item.due_date && new Date(item.due_date) < new Date() && item.status !== "done",
  );
  const totalBudget = activeProjects.reduce(
    (sum, item) => sum + (item.planned_budget ?? 0),
    0,
  );

  const refresh = () => void projectsQuery.refetch();
  const refreshDetail = () => {
    void detailQuery.refetch();
    refresh();
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiFetch(`/projects/${archiveTarget.id}`, { method: "DELETE" });
      toast.success("Projet annulé. L'historique est conservé.");
      setArchiveTarget(null);
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Portefeuille"
        title="Projets informatiques"
        description="Jalons, tâches, risques, décisions et suivi budgétaire des projets."
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nouveau projet
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Projets actifs</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(activeProjects.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">En retard</p>
          <p className="mt-1 text-2xl font-semibold text-danger">{formatNumber(lateProjects.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Budget prévu</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatCurrency(totalBudget, 0)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un projet…"
              className="pl-8"
              aria-label="Rechercher un projet"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="sm:w-44"
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(statusLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="sm:w-40"
              aria-label="Filtrer par priorité"
            >
              <option value="">Toutes priorités</option>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
              <option value="critical">Critique</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {projectsQuery.isError ? (
            <ErrorState
              message={
                projectsQuery.error instanceof Error ? projectsQuery.error.message : "Erreur inconnue."
              }
              onRetry={() => void projectsQuery.refetch()}
            />
          ) : projectsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="Aucun projet"
              description="Créez un projet pour suivre jalons, tâches, risques et décisions."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Priorité</TableHead>
                  <TableHead className="hidden lg:table-cell">Responsable</TableHead>
                  <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                  <TableHead>Avancement</TableHead>
                  <TableHead className="hidden xl:table-cell">Budget</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{project.name}</p>
                      <p className="font-mono text-[10px] text-muted-2">{project.code}</p>
                      <p className="text-[10px] text-muted-2">
                        {project.task_count} tâche(s) · {project.risk_count} risque(s)
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[project.status] ?? "neutral"}>
                        {statusLabels[project.status] ?? project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={priorityTones[project.priority] ?? "neutral"}>
                        {project.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {project.owner ? fullName(project.owner.first_name, project.owner.last_name) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {formatDate(project.due_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              project.progress_percent >= 100 ? "bg-success" : "bg-info",
                            )}
                            style={{ width: `${project.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted">{project.progress_percent}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {project.planned_budget != null
                        ? formatCurrency(project.planned_budget, 0)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ouvrir ${project.name}`}
                          onClick={() => setDetailId(project.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${project.name}`}
                            onClick={() => {
                              setEditing(project);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canArchive && project.status !== "cancelled" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Annuler ${project.name}`}
                            onClick={() => setArchiveTarget(project)}
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
          )}
        </CardContent>
      </Card>

      <ProjectDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        users={users}
        onSaved={refresh}
      />
      <ProjectDetailDialog
        open={Boolean(detailId)}
        onOpenChange={(open) => !open && setDetailId(null)}
        project={detailQuery.data ?? null}
        users={users}
        onChanged={refreshDetail}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Annuler ce projet ?"
        description={`« ${archiveTarget?.name ?? ""} » passera au statut « annulé ». Les données sont conservées.`}
        confirmLabel="Annuler le projet"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
