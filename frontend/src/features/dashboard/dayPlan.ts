import {
  CalendarClock,
  CheckSquare,
  Info,
  LifeBuoy,
  Package,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { DayPlanItem } from "@/types/api";

export const planKindMeta: Record<string, { label: string; icon: LucideIcon }> = {
  meeting: { label: "Réunion", icon: Users },
  intervention: { label: "Intervention", icon: Wrench },
  reservation: { label: "Réservation", icon: Package },
  event: { label: "Événement", icon: CalendarClock },
  action: { label: "Action", icon: CheckSquare },
  ticket: { label: "Demande", icon: LifeBuoy },
};

export function planKind(item: DayPlanItem): { label: string; icon: LucideIcon } {
  return planKindMeta[item.kind] ?? { label: item.kind, icon: Info };
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export interface PlanComputation {
  meetings: number;
  interventions: number;
  reservations: number;
  events: number;
  actions: number;
  tickets: number;
  travels: number;
  busyMinutes: number;
  freeMinutes: number;
  conflicts: number;
  firstStart: Date | null;
  lastEnd: Date | null;
}

export function computePlan(items: DayPlanItem[]): PlanComputation {
  const timed = items
    .filter((item) => item.start_at && item.end_at && !item.all_day)
    .map((item) => ({
      start: new Date(item.start_at as string).getTime(),
      end: new Date(item.end_at as string).getTime(),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end))
    .sort((left, right) => left.start - right.start);

  const merged: Array<{ start: number; end: number }> = [];
  timed.forEach((interval) => {
    if (!merged.length || interval.start > merged[merged.length - 1].end) {
      merged.push({ ...interval });
    } else {
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        interval.end,
      );
    }
  });

  const busyMinutes = Math.round(
    merged.reduce((total, interval) => total + (interval.end - interval.start), 0) /
      60000,
  );

  let conflicts = 0;
  for (let index = 0; index < timed.length; index += 1) {
    for (let other = index + 1; other < timed.length; other += 1) {
      if (timed[index].start < timed[other].end && timed[other].start < timed[index].end) {
        conflicts += 1;
        break;
      }
    }
  }

  return {
    meetings: items.filter((item) => item.kind === "meeting").length,
    interventions: items.filter((item) => item.kind === "intervention").length,
    reservations: items.filter((item) => item.kind === "reservation").length,
    events: items.filter((item) => item.kind === "event").length,
    actions: items.filter((item) => item.kind === "action").length,
    tickets: items.filter((item) => item.kind === "ticket").length,
    travels: new Set(
      items.filter((item) => item.travel && item.location).map((item) => item.location),
    ).size,
    busyMinutes,
    freeMinutes: Math.max(0, 600 - busyMinutes),
    conflicts,
    firstStart: timed.length ? new Date(timed[0].start) : null,
    lastEnd: timed.length ? new Date(timed[timed.length - 1].end) : null,
  };
}

export interface CurrentAndNext {
  current: DayPlanItem | null;
  next: DayPlanItem | null;
}

export function findCurrentAndNext(items: DayPlanItem[], now: Date): CurrentAndNext {
  const nowMs = now.getTime();
  const timed = items
    .filter((item) => item.start_at && !item.all_day)
    .map((item) => ({
      item,
      start: new Date(item.start_at as string).getTime(),
      end: new Date(item.end_at ?? (item.start_at as string)).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.start))
    .sort((left, right) => left.start - right.start);

  const current =
    timed.find((entry) => entry.start <= nowMs && entry.end > nowMs)?.item ?? null;
  const next = timed.find((entry) => entry.start > nowMs)?.item ?? null;
  return { current, next };
}

export function countdownLabel(target: Date, now: Date): string {
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diff <= 0) return "maintenant";
  if (diff < 60) return `dans ${diff} min`;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return minutes
    ? `dans ${hours} h ${String(minutes).padStart(2, "0")}`
    : `dans ${hours} h`;
}

export function elapsedPercent(item: DayPlanItem, now: Date): number {
  if (!item.start_at || !item.end_at) return 0;
  const start = new Date(item.start_at).getTime();
  const end = new Date(item.end_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const ratio = (now.getTime() - start) / (end - start);
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}
