import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { MeetingPointDialog } from "@/features/communication/CommunicationDialogs";
import {
  pointStatusLabels,
  pointStatusTones,
  priorityLabels,
  priorityTones,
} from "@/features/communication/labels";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { MeetingItem, MeetingPointItem, TicketUserRef } from "@/types/api";

export function ManagerPointsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("manager_points.read");
  const canManage = hasPermission("manager_points.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingPointItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingPointItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const pointsQuery = useQuery({
    queryKey: ["communication", "points", mineOnly],
    queryFn: () =>
      apiFetch<MeetingPointItem[]>(`/communication/points${mineOnly ? "?mine=true" : ""}`),
    enabled: canRead,
  });
  const meetingsQuery = useQuery({
    queryKey: ["communication", "meetings"],
    queryFn: () => apiFetch<MeetingItem[]>("/communication/meetings"),
    enabled: canRead && canManage,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    enabled: canRead && canManage,
  });

  const points = pointsQuery.data ?? [];
  const meetings = meetingsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return points.filter((point) => {
      if (statusFilter && point.status !== statusFilter) return false;
      if (!needle) return true;
      return `${point.title} ${point.description ?? ""} ${point.notes ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [points, search, statusFilter]);

  const counts = {
    open: points.filter((point) => point.status === "open").length,
    in_progress: points.filter((point) => point.status === "in_progress").length,
    blocked: points.filter((point) => point.status === "blocked").length,
    done: points.filter((point) => point.status === "done").length,
  };

  const updateStatus = async (point: MeetingPointItem, status: string) => {
    try {
      await apiFetch(`/communication/points/${point.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      void pointsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mise à jour impossible.");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/communication/points/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Point supprimé.");
      setDeleteTarget(null);
      void pointsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Suppression impossible.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les points de suivi."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Ouverts</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{counts.open}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">En cours</p>
          <p className="mt-1 text-2xl font-semibold text-info">{counts.in_progress}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Bloqués</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{counts.blocked}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Traités</p>
          <p className="mt-1 text-2xl font-semibold text-success">{counts.done}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un point…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-40"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(pointStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[11px] text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={mineOnly}
                onChange={(event) => setMineOnly(event.target.checked)}
              />
              Mes points
            </label>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau point
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {pointsQuery.isError ? (
            <ErrorState
              message={
                pointsQuery.error instanceof Error
                  ? pointsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void pointsQuery.refetch()}
            />
          ) : pointsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Aucun point de suivi"
              description="Ajoutez les sujets à aborder avec votre responsable."
            />
          ) : (
            filtered.map((point) => {
              const overdue =
                point.due_date &&
                point.status !== "done" &&
                new Date(point.due_date).getTime() < Date.now();
              return (
                <article
                  key={point.id}
                  className="rounded-lg border border-border-soft bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
                        <Badge tone={priorityTones[point.priority] ?? "neutral"}>
                          {priorityLabels[point.priority] ?? point.priority}
                        </Badge>
                        {overdue ? <Badge tone="danger">En retard</Badge> : null}
                      </div>
                      {point.description ? (
                        <p className="mt-1 text-xs text-muted">{point.description}</p>
                      ) : null}
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-2">
                        {point.meeting_title ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {point.meeting_title}
                          </span>
                        ) : null}
                        {point.owner ? (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3 w-3" />
                            {point.owner.first_name} {point.owner.last_name}
                          </span>
                        ) : null}
                        {point.due_date ? <span>Échéance : {formatDate(point.due_date)}</span> : null}
                        {point.next_review_at ? (
                          <span>Revue : {formatDate(point.next_review_at)}</span>
                        ) : null}
                        {point.last_discussed_at ? (
                          <span>Dernier échange : {formatDate(point.last_discussed_at)}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={pointStatusTones[point.status] ?? "neutral"}>
                        {pointStatusLabels[point.status] ?? point.status}
                      </Badge>
                      {canManage ? (
                        <>
                          <Select
                            value={point.status}
                            onChange={(event) => void updateStatus(point, event.target.value)}
                            className="h-8 w-32 text-[11px]"
                            aria-label="Changer le statut"
                          >
                            {Object.entries(pointStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(point);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setDeleteTarget(point)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : point.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : null}
                    </div>
                  </div>
                  {point.notes ? (
                    <p className="mt-2 whitespace-pre-wrap border-t border-border-soft/60 pt-2 text-[11px] text-muted">
                      {point.notes}
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </CardContent>
      </Card>

      <MeetingPointDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        point={editing}
        meetings={meetings}
        users={users}
        onSaved={() => void pointsQuery.refetch()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Supprimer « ${deleteTarget?.title ?? ""} » ?`}
        description="Le point de suivi sera définitivement supprimé."
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteLoading}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
