import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
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
  CalendarActionDialog,
  CalendarEventDialog,
} from "@/features/calendar/CalendarDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDateTime, formatNumber, fullName } from "@/lib/utils";
import type {
  CalendarActionItem,
  CalendarEventItem,
  CalendarOverview,
  TicketUserRef,
} from "@/types/api";

type TabKey = "calendar" | "actions";

const eventTypeLabels: Record<string, string> = {
  maintenance: "Maintenance",
  intervention: "Intervention",
  deadline: "Échéance",
  renewal: "Renouvellement",
  audit: "Audit",
  project: "Projet",
  meeting: "Réunion",
  action: "Action",
  other: "Autre",
};

const eventTypeColors: Record<string, string> = {
  maintenance: "bg-info/20 text-info border-info/30",
  intervention: "bg-warning/20 text-warning border-warning/30",
  deadline: "bg-danger/20 text-danger border-danger/30",
  renewal: "bg-accent/20 text-accent border-accent/30",
  audit: "bg-brand-green/20 text-brand-green border-brand-green/30",
  project: "bg-primary/30 text-brand-cream border-primary/40",
  meeting: "bg-surface-2 text-foreground border-border",
  action: "bg-success/20 text-success border-success/30",
  other: "bg-surface-2 text-muted border-border",
};

const actionStatusLabels: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
  cancelled: "Annulée",
};

const priorityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export function CalendarPage() {
  const { hasPermission } = useAuth();
  const canCreateEvent = hasPermission("calendar.create");
  const canUpdateEvent = hasPermission("calendar.update");
  const canDeleteEvent = hasPermission("calendar.delete");
  const canCreateAction = hasPermission("actions.create");
  const canUpdateAction = hasPermission("actions.update");

  const [tab, setTab] = useState<TabKey>("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [actionStatus, setActionStatus] = useState("");
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CalendarActionItem | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<CalendarEventItem | null>(null);
  const [deleteActionTarget, setDeleteActionTarget] = useState<CalendarActionItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const eventsQuery = useQuery({
    queryKey: ["calendar", "events", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () =>
      apiFetch<CalendarEventItem[]>(
        `/calendar/events${buildQuery({
          start_from: rangeStart.toISOString(),
          start_to: rangeEnd.toISOString(),
        })}`,
      ),
  });
  const overviewQuery = useQuery({
    queryKey: ["calendar", "overview"],
    queryFn: () => apiFetch<CalendarOverview>("/calendar/overview"),
  });
  const actionsQuery = useQuery({
    queryKey: ["calendar", "actions", actionStatus],
    queryFn: () =>
      apiFetch<CalendarActionItem[]>(
        `/calendar/actions${buildQuery({ status: actionStatus })}`,
      ),
    enabled: tab === "actions",
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    staleTime: 60_000,
  });

  const events = eventsQuery.data ?? [];
  const actions = actionsQuery.data ?? [];
  const overview = overviewQuery.data;
  const users = usersQuery.data ?? [];

  const refreshEvents = () => {
    void eventsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshActions = () => {
    void actionsQuery.refetch();
    void overviewQuery.refetch();
  };

  const openCreateEvent = (date: Date | null) => {
    setEditingEvent(null);
    setDefaultDate(date);
    setEventDialogOpen(true);
  };

  const removeEvent = async () => {
    if (!deleteEventTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/calendar/events/${deleteEventTarget.id}`, { method: "DELETE" });
      toast.success("Événement supprimé.");
      setDeleteEventTarget(null);
      refreshEvents();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const removeAction = async () => {
    if (!deleteActionTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/calendar/actions/${deleteActionTarget.id}`, { method: "DELETE" });
      toast.success("Action supprimée.");
      setDeleteActionTarget(null);
      refreshActions();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const monthLabel = format(month, "MMMM yyyy", { locale: fr });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Échéances et planification"
        title="Calendrier et actions"
        description="Maintenances, interventions, échéances, réunions et actions à réaliser."
        actions={
          <>
            {tab === "calendar" && canCreateEvent ? (
              <Button size="sm" onClick={() => openCreateEvent(null)}>
                <Plus className="h-3.5 w-3.5" />
                Nouvel événement
              </Button>
            ) : null}
            {tab === "actions" && canCreateAction ? (
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
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Événements à venir (30 j)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.planned_events ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Actions ouvertes</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(overview?.open_actions ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Actions en retard</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {formatNumber(overview?.overdue_actions ?? 0)}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
        {[
          { key: "calendar" as const, label: "Calendrier", icon: CalendarDays },
          { key: "actions" as const, label: "Actions", icon: CheckSquare },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
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

      {tab === "calendar" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mois précédent"
                onClick={() => setMonth((value) => subMonths(value, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="min-w-[180px] text-center text-sm font-semibold capitalize text-foreground">
                {monthLabel}
              </p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mois suivant"
                onClick={() => setMonth((value) => addMonths(value, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>
                Aujourd'hui
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {eventsQuery.isError ? (
              <ErrorState
                message={
                  eventsQuery.error instanceof Error ? eventsQuery.error.message : "Erreur inconnue."
                }
                onRetry={() => void eventsQuery.refetch()}
              />
            ) : eventsQuery.isLoading ? (
              <Skeleton className="h-[520px] rounded-xl" />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border-soft">
                <div className="grid grid-cols-7 border-b border-border-soft bg-background-soft/60">
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                    <div
                      key={day}
                      className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-2"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const dayEvents = events.filter((item) =>
                      isSameDay(parseISO(item.start_at), day),
                    );
                    const inMonth = isSameMonth(day, month);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => canCreateEvent && openCreateEvent(day)}
                        className={cn(
                          "min-h-[96px] border-b border-r border-border-soft p-1.5 text-left align-top transition-colors hover:bg-surface-2/60",
                          !inMonth && "bg-background-soft/40 text-muted-2",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                              isToday ? "bg-primary text-brand-cream" : "text-muted",
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {dayEvents.length > 2 ? (
                            <span className="text-[9px] text-muted-2">+{dayEvents.length - 2}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 2).map((event) => (
                            <span
                              key={event.id}
                              role="button"
                              tabIndex={0}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                if (!canUpdateEvent) return;
                                setEditingEvent(event);
                                setDefaultDate(null);
                                setEventDialogOpen(true);
                              }}
                              onKeyDown={(keyEvent) => {
                                if (keyEvent.key === "Enter" && canUpdateEvent) {
                                  setEditingEvent(event);
                                  setDefaultDate(null);
                                  setEventDialogOpen(true);
                                }
                              }}
                              className={cn(
                                "block truncate rounded border px-1 py-0.5 text-[10px]",
                                eventTypeColors[event.event_type] ?? eventTypeColors.other,
                                event.status === "cancelled" && "line-through opacity-60",
                              )}
                              title={`${eventTypeLabels[event.event_type] ?? event.event_type} · ${event.title}`}
                            >
                              {format(parseISO(event.start_at), "HH:mm")} {event.title}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "actions" ? (
        <Card>
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-xs font-semibold text-foreground">Actions à réaliser</p>
            <div className="flex flex-1 justify-end">
              <Select
                value={actionStatus}
                onChange={(event) => setActionStatus(event.target.value)}
                className="sm:w-44"
                aria-label="Filtrer par statut"
              >
                <option value="">Tous les statuts</option>
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="blocked">Bloquées</option>
                <option value="done">Terminées</option>
                <option value="cancelled">Annulées</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {actionsQuery.isError ? (
              <ErrorState
                message={
                  actionsQuery.error instanceof Error
                    ? actionsQuery.error.message
                    : "Erreur inconnue."
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
                icon={CheckSquare}
                title="Aucune action"
                description="Créez des actions avec une échéance et un responsable."
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
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action) => (
                    <TableRow key={action.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{action.title}</p>
                        <p className="text-[10px] text-muted-2">{action.module ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={priorityTones[action.priority] ?? "neutral"}>
                          {action.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            action.status === "done"
                              ? "success"
                              : action.status === "blocked"
                                ? "danger"
                                : action.status === "in_progress"
                                  ? "warning"
                                  : "neutral"
                          }
                        >
                          {actionStatusLabels[action.status] ?? action.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {formatDateTime(action.due_date)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {action.owner
                          ? fullName(action.owner.first_name, action.owner.last_name)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdateAction ? (
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
                          {canUpdateAction ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${action.title}`}
                              onClick={() => setDeleteActionTarget(action)}
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
            )}
          </CardContent>
        </Card>
      ) : null}

      <CalendarEventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        event={editingEvent}
        defaultDate={defaultDate}
        users={users}
        canDelete={canDeleteEvent}
        onDelete={(event) => setDeleteEventTarget(event)}
        onSaved={refreshEvents}
      />
      <CalendarActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        action={editingAction}
        users={users}
        onSaved={refreshActions}
      />

      <ConfirmDialog
        open={Boolean(deleteEventTarget)}
        onOpenChange={(open) => !open && setDeleteEventTarget(null)}
        title="Supprimer cet événement ?"
        description={`« ${deleteEventTarget?.title ?? ""} » sera supprimé.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleting}
        onConfirm={() => void removeEvent()}
      />
      <ConfirmDialog
        open={Boolean(deleteActionTarget)}
        onOpenChange={(open) => !open && setDeleteActionTarget(null)}
        title="Supprimer cette action ?"
        description={`« ${deleteActionTarget?.title ?? ""} » sera supprimée.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleting}
        onConfirm={() => void removeAction()}
      />
    </div>
  );
}
