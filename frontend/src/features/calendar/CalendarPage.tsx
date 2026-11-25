import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  CalendarActionDialog,
  CalendarEventDialog,
} from "@/features/calendar/CalendarDialogs";
import { EquipmentReservationDialog } from "@/features/reservations/ReservationDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDateTime, formatNumber, fullName } from "@/lib/utils";
import type {
  AgentItem,
  CalendarActionItem,
  CalendarEventItem,
  CalendarMeetingItem,
  CalendarOverview,
  EquipmentReservationItem,
  Page,
  ReservableEquipmentItem,
  TicketUserRef,
} from "@/types/api";

type TabKey = "calendar" | "actions";
type CalendarView = "day" | "week" | "month" | "year";

interface CalendarDisplayItem {
  key: string;
  kind: "event" | "reservation" | "meeting";
  start: string;
  end: string | null;
  title: string;
  subtitle: string;
  tone: string;
  event?: CalendarEventItem;
  reservation?: EquipmentReservationItem;
  meeting?: CalendarMeetingItem;
}

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

const reservationTone = "bg-brand-green/20 text-brand-green border-brand-green/30";

const meetingTypeLabels: Record<string, string> = {
  team: "Réunion d'équipe",
  service: "Réunion de service",
  project: "Réunion de projet",
  manager_1on1: "Point avec la responsable",
  other: "Réunion",
};

const meetingTone = "bg-accent/15 text-accent border-accent/30";

const reservationStatusLabels: Record<string, string> = {
  confirmed: "Confirmée",
  cancelled: "Annulée",
  blocked: "Indisponible",
  checked_out: "Matériel sorti",
  returned: "Matériel retourné",
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

function timeLabel(item: CalendarDisplayItem): string {
  if (item.kind === "event" && item.event?.all_day) return "Journée";
  const start = format(parseISO(item.start), "HH:mm");
  if (item.end) {
    return `${start}–${format(parseISO(item.end), "HH:mm")}`;
  }
  return start;
}

function overlapsDay(item: CalendarDisplayItem, day: Date): boolean {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  const start = new Date(item.start).getTime();
  const end = item.end ? new Date(item.end).getTime() : start;
  return start <= dayEnd && end >= dayStart;
}

function itemStartDay(item: CalendarDisplayItem): Date {
  return startOfDay(parseISO(item.start));
}

function itemEndDay(item: CalendarDisplayItem): Date {
  return startOfDay(item.end ? parseISO(item.end) : parseISO(item.start));
}

function isMultiDay(item: CalendarDisplayItem): boolean {
  return itemEndDay(item).getTime() > itemStartDay(item).getTime();
}

interface WeekBar {
  item: CalendarDisplayItem;
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

function buildWeekBars(items: CalendarDisplayItem[], weekStartDate: Date): {
  bars: WeekBar[];
  lanes: number;
} {
  const weekStart = startOfDay(weekStartDate);
  const weekEnd = endOfDay(addDays(weekStart, 6));
  const bars = items
    .filter((item) => isMultiDay(item))
    .filter((item) => {
      const start = itemStartDay(item).getTime();
      const end = endOfDay(itemEndDay(item)).getTime();
      return start <= weekEnd.getTime() && end >= weekStart.getTime();
    })
    .map((item) => {
      const itemStart = itemStartDay(item);
      const itemEnd = itemEndDay(item);
      const startCol = Math.max(
        0,
        differenceInCalendarDays(itemStart, weekStart),
      );
      const endCol = Math.min(6, differenceInCalendarDays(itemEnd, weekStart));
      return {
        item,
        startCol,
        endCol: Math.max(startCol, endCol),
        lane: 0,
        continuesBefore: itemStart.getTime() < weekStart.getTime(),
        continuesAfter: itemEnd.getTime() > addDays(weekStart, 6).getTime(),
      };
    })
    .sort(
      (left, right) =>
        left.startCol - right.startCol ||
        right.endCol - right.startCol - (left.endCol - left.startCol),
    );

  const laneEnds: number[] = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((lastCol) => lastCol < bar.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bar.endCol);
    } else {
      laneEnds[lane] = bar.endCol;
    }
    bar.lane = lane;
  }
  return { bars, lanes: laneEnds.length };
}

const SPAN_BAR_HEIGHT = 18;
const MONTH_BAR_TOP = 30;
const WEEK_BAR_TOP = 50;

export function CalendarPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateEvent = hasPermission("calendar.create");
  const canUpdateEvent = hasPermission("calendar.update");
  const canDeleteEvent = hasPermission("calendar.delete");
  const canCreateAction = hasPermission("actions.create");
  const canUpdateAction = hasPermission("actions.update");
  const canReadReservations = hasPermission("reservations.read");
  const canCreateReservation = hasPermission("reservations.create");
  const canReadMeetings = hasPermission("meetings.read");

  const [tab, setTab] = useState<TabKey>("calendar");
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [actionStatus, setActionStatus] = useState("");
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CalendarActionItem | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<CalendarEventItem | null>(null);
  const [deleteActionTarget, setDeleteActionTarget] = useState<CalendarActionItem | null>(null);
  const [selectedReservation, setSelectedReservation] =
    useState<EquipmentReservationItem | null>(null);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservationDefaultDate, setReservationDefaultDate] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested === "calendar" || requested === "actions") {
      setTab(requested);
    }
    const date = searchParams.get("date");
    if (date) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
        setView("day");
      }
    }
  }, [searchParams]);

  const rangeStart =
    view === "day"
      ? startOfDay(currentDate)
      : view === "week"
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : view === "month"
          ? startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
          : startOfYear(currentDate);
  const rangeEnd =
    view === "day"
      ? endOfDay(currentDate)
      : view === "week"
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : view === "month"
          ? endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
          : endOfYear(currentDate);

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
  const reservationsQuery = useQuery({
    queryKey: ["calendar", "reservations", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () =>
      apiFetch<EquipmentReservationItem[]>(
        `/reservations${buildQuery({
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
        })}`,
      ),
    enabled: canReadReservations,
  });
  const meetingsQuery = useQuery({
    queryKey: ["calendar", "meetings", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () =>
      apiFetch<CalendarMeetingItem[]>(
        `/calendar/meetings${buildQuery({
          start_from: rangeStart.toISOString(),
          start_to: rangeEnd.toISOString(),
        })}`,
      ),
    enabled: canReadMeetings,
  });
  const upcomingReservationsQuery = useQuery({
    queryKey: ["calendar", "reservations", "upcoming"],
    queryFn: () =>
      apiFetch<EquipmentReservationItem[]>(
        `/reservations${buildQuery({
          start: new Date().toISOString(),
          end: addDays(new Date(), 30).toISOString(),
        })}`,
      ),
    enabled: canReadReservations,
    staleTime: 60_000,
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
  const reservationEquipmentsQuery = useQuery({
    queryKey: ["reservations", "calendar", "equipments"],
    queryFn: () => apiFetch<ReservableEquipmentItem[]>("/reservations/equipments"),
    enabled: canCreateReservation,
    staleTime: 60_000,
  });
  const reservationAgentsQuery = useQuery({
    queryKey: ["agents", "calendar", "reservations"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    enabled: canCreateReservation,
    staleTime: 60_000,
  });

  const events = eventsQuery.data ?? [];
  const reservations = reservationsQuery.data ?? [];
  const meetings = meetingsQuery.data ?? [];
  const upcomingReservations = upcomingReservationsQuery.data ?? [];
  const nextUpcomingReservation = [...upcomingReservations].sort((left, right) =>
    left.start_at.localeCompare(right.start_at),
  )[0];
  const actions = actionsQuery.data ?? [];
  const overview = overviewQuery.data;
  const users = usersQuery.data ?? [];
  const reservationEquipments = reservationEquipmentsQuery.data ?? [];
  const reservationAgents = reservationAgentsQuery.data?.items ?? [];

  const baseItems: CalendarDisplayItem[] = [
    ...events.map((event) => ({
      key: `event-${event.id}`,
      kind: "event" as const,
      start: event.start_at,
      end: event.end_at,
      title: event.title,
      subtitle: eventTypeLabels[event.event_type] ?? event.event_type,
      tone: eventTypeColors[event.event_type] ?? eventTypeColors.other,
      event,
    })),
    ...reservations.map((reservation) => ({
      key: `reservation-${reservation.id}`,
      kind: "reservation" as const,
      start: reservation.start_at,
      end: reservation.end_at,
      title:
        reservation.kind === "unavailability"
          ? `Indisponible — ${reservation.equipment.name}`
          : reservation.equipment.name,
      subtitle: [
        reservation.requester_name ?? reservation.requester_email ?? "Demandeur non précisé",
        reservation.purpose,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: reservationTone,
      reservation,
    })),
    ...meetings.map((meeting) => ({
      key: `meeting-${meeting.id}`,
      kind: "meeting" as const,
      start: meeting.start_at,
      end: meeting.end_at,
      title: meeting.title,
      subtitle: [
        meetingTypeLabels[meeting.meeting_type] ?? meeting.meeting_type,
        meeting.organizer_name,
        meeting.location,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: meetingTone,
      meeting,
    })),
  ].sort((left, right) => left.start.localeCompare(right.start));

  const globalQuery = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const displayItems = globalQuery
    ? baseItems.filter((item) =>
        `${item.title} ${item.subtitle}`.toLowerCase().includes(globalQuery),
      )
    : baseItems;
  const visibleActions = globalQuery
    ? actions.filter((action) =>
        `${action.title} ${action.description ?? ""}`.toLowerCase().includes(globalQuery),
      )
    : actions;

  const refreshEvents = () => {
    void eventsQuery.refetch();
    void reservationsQuery.refetch();
    void meetingsQuery.refetch();
    void upcomingReservationsQuery.refetch();
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

  const openCreateReservation = (date: Date | null) => {
    setReservationDefaultDate(date);
    setReservationDialogOpen(true);
  };

  const openItem = (item: CalendarDisplayItem) => {
    if (item.kind === "event" && item.event && canUpdateEvent) {
      setEditingEvent(item.event);
      setDefaultDate(null);
      setEventDialogOpen(true);
      return;
    }
    if (item.kind === "reservation" && item.reservation) {
      setSelectedReservation(item.reservation);
      return;
    }
    if (item.kind === "meeting" && item.meeting) {
      navigate(`/communication/reunions?meeting=${item.meeting.id}`);
    }
  };

  const move = (direction: -1 | 1) => {
    setCurrentDate((value) => {
      if (view === "day") return direction < 0 ? subDays(value, 1) : addDays(value, 1);
      if (view === "week") return direction < 0 ? subWeeks(value, 1) : addWeeks(value, 1);
      if (view === "month") return direction < 0 ? subMonths(value, 1) : addMonths(value, 1);
      return direction < 0 ? subYears(value, 1) : addYears(value, 1);
    });
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

  const viewLabel =
    view === "day"
      ? format(currentDate, "EEEE d MMMM yyyy", { locale: fr })
      : view === "week"
        ? `Semaine du ${format(
            startOfWeek(currentDate, { weekStartsOn: 1 }),
            "d MMMM yyyy",
            { locale: fr },
          )}`
        : view === "month"
          ? format(currentDate, "MMMM yyyy", { locale: fr })
          : format(currentDate, "yyyy");

  const monthDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const yearMonths = eachMonthOfInterval({
    start: startOfYear(currentDate),
    end: endOfYear(currentDate),
  });
  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  });

  const itemsForDay = (day: Date, includeMultiDay = false) =>
    displayItems.filter(
      (item) => overlapsDay(item, day) && (includeMultiDay || !isMultiDay(item)),
    );

  const renderItemButton = (item: CalendarDisplayItem, compact = false) => (
    <button
      key={item.key}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openItem(item);
      }}
      className={cn(
        "block w-full rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-80",
        item.tone,
        compact ? "text-[10px]" : "px-2 py-1 text-[11px]",
        item.kind === "event" && item.event?.status === "cancelled" && "line-through opacity-60",
      )}
      title={`${timeLabel(item)} · ${item.title} · ${item.subtitle}`}
    >
      <span className="flex items-center gap-1 truncate font-medium">
        {item.kind === "reservation" || item.kind === "meeting" ? (
          <CalendarClock className="h-2.5 w-2.5 shrink-0" />
        ) : null}
        <span className="truncate">
          {timeLabel(item)} {item.title}
        </span>
      </span>
      <span className="block truncate text-[9px] opacity-80">{item.subtitle}</span>
    </button>
  );

  const renderSpanBar = (bar: WeekBar) => (
    <button
      key={`span-${bar.item.key}-${bar.startCol}-${bar.lane}`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openItem(bar.item);
      }}
      className={cn(
        "pointer-events-auto z-10 mx-0.5 mb-0.5 flex h-4 min-w-0 items-center overflow-hidden border px-1.5 text-left text-[9px] font-medium transition-opacity hover:opacity-80",
        bar.item.tone,
        bar.continuesBefore && "rounded-l-none border-l-0 pl-1",
        bar.continuesAfter && "rounded-r-none border-r-0 pr-1",
        bar.item.kind === "event" &&
          bar.item.event?.status === "cancelled" &&
          "line-through opacity-60",
      )}
      style={{
        gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
        gridRow: bar.lane + 1,
      }}
      title={`${bar.item.title} · ${bar.item.subtitle}`}
    >
      <span className="truncate">
        {bar.continuesBefore ? "… " : ""}
        {bar.item.title}
        {bar.continuesAfter ? " …" : ""}
      </span>
    </button>
  );

  const renderSpanLayer = (top: number, bars: WeekBar[]) =>
    bars.length === 0 ? null : (
      <div
        className="pointer-events-none absolute inset-x-0 z-10 grid grid-cols-7"
        style={{ top }}
      >
        {bars.map(renderSpanBar)}
      </div>
    );

  const renderDayCell = (day: Date, inMonth: boolean, spanLanes = 0) => {
    const dayItems = itemsForDay(day);
    const isToday = isSameDay(day, new Date());
    return (
      <div
        key={day.toISOString()}
        role="button"
        tabIndex={0}
        onClick={() => canCreateEvent && openCreateEvent(day)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && canCreateEvent) {
            event.preventDefault();
            openCreateEvent(day);
          }
        }}
        className={cn(
          "border-b border-r border-border-soft p-1.5 text-left align-top transition-colors hover:bg-surface-2/60",
          !inMonth && "bg-background-soft/40 text-muted-2",
        )}
        style={{ minHeight: 110 + spanLanes * SPAN_BAR_HEIGHT }}
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
          {dayItems.length > 2 ? (
            <span className="text-[9px] text-muted-2">+{dayItems.length - 2}</span>
          ) : null}
        </div>
        {spanLanes > 0 ? (
          <div style={{ height: spanLanes * SPAN_BAR_HEIGHT }} aria-hidden="true" />
        ) : null}
        <div className="mt-1 space-y-1">
          {dayItems.slice(0, 2).map((item) => renderItemButton(item, true))}
        </div>
      </div>
    );
  };

  const renderMonth = () => {
    const weeks: Date[][] = [];
    for (let index = 0; index < monthDays.length; index += 7) {
      weeks.push(monthDays.slice(index, index + 7));
    }
    return (
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
        <div>
          {weeks.map((week) => {
            const { bars, lanes } = buildWeekBars(displayItems, week[0]);
            return (
              <div key={week[0].toISOString()} className="relative">
                <div className="grid grid-cols-7">
                  {week.map((day) =>
                    renderDayCell(day, isSameMonth(day, currentDate), lanes),
                  )}
                </div>
                {renderSpanLayer(MONTH_BAR_TOP, bars)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const { bars, lanes } = buildWeekBars(displayItems, weekDays[0]);
    return (
      <div className="overflow-x-auto">
        <div className="relative min-w-[980px]">
          <div className="grid grid-cols-7 rounded-lg border border-border-soft">
            {weekDays.map((day) => {
              const dayItems = itemsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className="border-r border-border-soft last:border-r-0"
                  style={{ minHeight: 420 + lanes * SPAN_BAR_HEIGHT }}
                >
                  <div
                    className={cn(
                      "border-b border-border-soft px-2 py-2",
                      isToday ? "bg-accent/[0.07]" : "bg-background-soft/40",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        isToday ? "text-accent" : "text-muted-2",
                      )}
                    >
                      {format(day, "EEE", { locale: fr })}
                    </p>
                    <p className="text-sm font-semibold text-foreground">{format(day, "d MMM", { locale: fr })}</p>
                  </div>
                  {lanes > 0 ? (
                    <div
                      style={{ height: lanes * SPAN_BAR_HEIGHT }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <div className="space-y-1 p-1.5">
                    {dayItems.length === 0 ? (
                      <p className="px-1 py-2 text-[10px] text-muted-2">Aucun élément</p>
                    ) : (
                      dayItems.map((item) => renderItemButton(item))
                    )}
                    {canCreateEvent ? (
                      <button
                        type="button"
                        onClick={() => openCreateEvent(day)}
                        className="w-full rounded border border-dashed border-border-soft px-1 py-1 text-[9px] text-muted-2 transition-colors hover:border-accent/40 hover:text-accent"
                      >
                        + Événement
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {renderSpanLayer(WEEK_BAR_TOP, bars)}
        </div>
      </div>
    );
  };

  const renderDay = () => {
    const dayItems = itemsForDay(currentDate, true);
    return (
      <div className="rounded-lg border border-border-soft">
        <div className="flex items-center justify-between border-b border-border-soft bg-background-soft/40 px-3 py-2">
          <p className="text-sm font-semibold capitalize text-foreground">
            {format(currentDate, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {canCreateReservation ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={reservationEquipments.length === 0}
                onClick={() => openCreateReservation(currentDate)}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Réserver
              </Button>
            ) : null}
            {canCreateEvent ? (
              <Button variant="secondary" size="sm" onClick={() => openCreateEvent(currentDate)}>
                <Plus className="h-3.5 w-3.5" />
                Événement
              </Button>
            ) : null}
          </div>
        </div>
        {dayItems.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Aucun élément ce jour"
            description="Les événements et réservations de matériel apparaîtront ici."
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-border-soft/60">
            {dayItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => openItem(item)}
                className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2/60"
              >
                <span className="w-24 shrink-0 text-[11px] font-semibold text-muted">
                  {timeLabel(item)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{item.title}</span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
                        item.tone,
                      )}
                    >
                      {item.kind === "reservation"
                        ? "Réservation"
                        : item.kind === "meeting"
                          ? "Réunion"
                          : "Événement"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">{item.subtitle}</span>
                  {item.reservation ? (
                    <span className="mt-1 block text-[10px] text-muted-2">
                      {item.reservation.equipment.name}
                      {item.reservation.requester_name
                        ? ` · ${item.reservation.requester_name}`
                        : ""}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderYear = () => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {yearMonths.map((monthDate) => {
        const monthStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
        const monthEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const monthCount = displayItems.filter(
          (item) =>
            new Date(item.start) >= startOfMonth(monthDate) &&
            new Date(item.start) <= endOfMonth(monthDate),
        ).length;
        return (
          <div key={monthDate.toISOString()} className="rounded-lg border border-border-soft p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold capitalize text-foreground">
                {format(monthDate, "MMMM", { locale: fr })}
              </p>
              <span className="text-[9px] text-muted-2">{monthCount} élément(s)</span>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
                <span key={`${day}-${index}`} className="text-[8px] uppercase text-muted-2">
                  {day}
                </span>
              ))}
              {days.map((day) => {
                const count = itemsForDay(day, true).length;
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setCurrentDate(day);
                      setView("day");
                    }}
                    className={cn(
                      "relative flex h-6 items-center justify-center rounded text-[9px] transition-colors hover:bg-surface-2",
                      !isSameMonth(day, monthDate) && "text-muted-2/50",
                      isToday && "bg-primary text-brand-cream",
                    )}
                    title={`${format(day, "d MMMM yyyy", { locale: fr })} · ${count} élément(s)`}
                  >
                    {format(day, "d")}
                    {count > 0 ? (
                      <span
                        className={cn(
                          "absolute bottom-0.5 h-1 w-1 rounded-full",
                          isToday ? "bg-brand-cream" : "bg-accent",
                        )}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Échéances et planification"
        title="Calendrier et actions"
        description="Vues jour, semaine, mois et année. Les réservations de matériel et les réunions apparaissent avec leur demandeur ou organisateur."
        actions={
          <>
            {tab === "calendar" && canCreateReservation ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={reservationEquipments.length === 0}
                onClick={() => openCreateReservation(null)}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Réserver du matériel
              </Button>
            ) : null}
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Événements à venir (30 j)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.planned_events ?? 0)}
          </p>
        </Card>
        {canReadReservations ? (
          <Card className="border-l-2 border-l-success/70 p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-2">
              Réservations à venir (30 j)
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {formatNumber(upcomingReservations.length)}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-2">
              {nextUpcomingReservation
                ? `Prochaine : ${nextUpcomingReservation.equipment.name} · ${formatDateTime(
                    nextUpcomingReservation.start_at,
                  )}`
                : "Aucune réservation planifiée"}
            </p>
          </Card>
        ) : null}
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

      <Tabs
        items={[
          { key: "calendar", label: "Calendrier", icon: CalendarDays },
          { key: "actions", label: "Actions", icon: CheckSquare },
        ]}
        value={tab}
        onChange={(value) => setTab(value as TabKey)}
      />

      {tab === "calendar" ? (
        <Card>
          <CardHeader className="flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Période précédente" onClick={() => move(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="min-w-[220px] text-center text-sm font-semibold capitalize text-foreground">
                {viewLabel}
              </p>
              <Button variant="ghost" size="icon" aria-label="Période suivante" onClick={() => move(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date())}>
                Aujourd'hui
              </Button>
            </div>
            <Tabs
              items={[
                { key: "day", label: "Jour" },
                { key: "week", label: "Semaine" },
                { key: "month", label: "Mois" },
                { key: "year", label: "Année" },
              ]}
              value={view}
              onChange={(value) => setView(value as CalendarView)}
            />
          </CardHeader>
          <CardContent>
            {eventsQuery.isError ||
            (canReadReservations && reservationsQuery.isError) ||
            (canReadMeetings && meetingsQuery.isError) ? (
              <ErrorState
                message={
                  (eventsQuery.error instanceof Error
                    ? eventsQuery.error.message
                    : null) ??
                  (reservationsQuery.error instanceof Error
                    ? reservationsQuery.error.message
                    : null) ??
                  (meetingsQuery.error instanceof Error
                    ? meetingsQuery.error.message
                    : "Erreur inconnue.")
                }
                onRetry={refreshEvents}
              />
            ) : eventsQuery.isLoading ||
              (canReadReservations && reservationsQuery.isLoading) ||
              (canReadMeetings && meetingsQuery.isLoading) ? (
              <Skeleton className="h-[520px] rounded-xl" />
            ) : view === "month" ? (
              renderMonth()
            ) : view === "week" ? (
              renderWeek()
            ) : view === "day" ? (
              renderDay()
            ) : (
              renderYear()
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
            ) : visibleActions.length === 0 ? (
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
                  {visibleActions.map((action) => (
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

      <EquipmentReservationDialog
        open={reservationDialogOpen}
        onOpenChange={setReservationDialogOpen}
        reservation={null}
        defaultEquipmentId={null}
        defaultDate={reservationDefaultDate}
        equipments={reservationEquipments}
        agents={reservationAgents}
        onSaved={refreshEvents}
      />
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

      <Dialog
        open={Boolean(selectedReservation)}
        onOpenChange={(open) => !open && setSelectedReservation(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedReservation?.equipment.name ?? "Réservation"}</DialogTitle>
            <DialogDescription>{selectedReservation?.purpose ?? ""}</DialogDescription>
          </DialogHeader>
          {selectedReservation ? (
            <div className="space-y-2 rounded-lg border border-border-soft bg-background/40 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-2">Demandeur</span>
                <span className="text-right text-foreground">
                  {selectedReservation.requester_name ??
                    selectedReservation.requester_email ??
                    "Non précisé"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-2">Créneau</span>
                <span className="text-right text-foreground">
                  {formatDateTime(selectedReservation.start_at)} →{" "}
                  {formatDateTime(selectedReservation.end_at)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-2">Statut</span>
                <span className="text-right text-foreground">
                  {reservationStatusLabels[selectedReservation.status] ??
                    selectedReservation.status}
                </span>
              </div>
              {selectedReservation.notes ? (
                <div>
                  <p className="text-muted-2">Notes</p>
                  <p className="mt-0.5 text-foreground">{selectedReservation.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedReservation(null)}>
              Fermer
            </Button>
            <Button onClick={() => navigate("/reservations")}>
              Ouvrir les réservations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
