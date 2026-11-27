import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { DayPlanItem } from "@/types/api";

import { formatTime, planKind } from "./dayPlan";

interface DayTimelineProps {
  day: string;
  items: DayPlanItem[];
  now: Date;
  variant?: "default" | "large";
  className?: string;
}

interface Entry {
  item: DayPlanItem;
  visibleStart: number;
  visibleEnd: number;
}

interface Placed extends Entry {
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

const HOUR_HEIGHT_REM: Record<"default" | "large", number> = {
  default: 3,
  large: 3.2,
};

const kindTone: Record<string, string> = {
  meeting: "border-l-accent/80 bg-accent/10 hover:bg-accent/15",
  intervention: "border-l-primary-bright bg-primary/25 hover:bg-primary/30",
  reservation: "border-l-info/80 bg-info/10 hover:bg-info/15",
  event: "border-l-success/80 bg-success/10 hover:bg-success/15",
  action: "border-l-warning bg-warning/10 hover:bg-warning/15",
  ticket: "border-l-danger bg-danger/10 hover:bg-danger/15",
};

function placeItems(entries: Entry[]): Placed[] {
  const sorted = [...entries].sort(
    (left, right) =>
      left.visibleStart - right.visibleStart || left.visibleEnd - right.visibleEnd,
  );

  const clusters: Entry[][] = [];
  let cluster: Entry[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  sorted.forEach((entry) => {
    if (!cluster.length || entry.visibleStart >= clusterEnd) {
      if (cluster.length) clusters.push(cluster);
      cluster = [entry];
      clusterEnd = entry.visibleEnd;
      return;
    }
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.visibleEnd);
  });
  if (cluster.length) clusters.push(cluster);

  const placed: Placed[] = [];
  clusters.forEach((group) => {
    const laneEnds: number[] = [];
    const assignments = group.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.visibleStart);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(entry.visibleEnd);
      } else {
        laneEnds[lane] = entry.visibleEnd;
      }
      return { entry, lane };
    });
    assignments.forEach(({ entry, lane }) => {
      placed.push({ ...entry, lane, lanes: laneEnds.length, top: 0, height: 0 });
    });
  });

  return placed;
}

export function DayTimeline({
  day,
  items,
  now,
  variant = "default",
  className,
}: DayTimelineProps) {
  const hourHeight = HOUR_HEIGHT_REM[variant];
  const dayStart = new Date(`${day}T00:00:00`);
  const fallbackDay = Number.isNaN(dayStart.getTime()) ? new Date() : dayStart;

  const timed = items
    .filter((item) => item.start_at && item.end_at && !item.all_day)
    .map((item) => ({
      item,
      start: new Date(item.start_at as string).getTime(),
      end: new Date(item.end_at as string).getTime(),
    }))
    .filter(
      (entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end > entry.start,
    )
    .sort((left, right) => left.start - right.start);

  const allDay = items.filter((item) => item.all_day || !item.start_at);

  const earliestHour = timed.length
    ? Math.min(8, new Date(timed[0].start).getHours())
    : 8;
  const latestDate = timed.length ? new Date(timed[timed.length - 1].end) : null;
  const latestHour = latestDate
    ? Math.max(20, latestDate.getHours() + (latestDate.getMinutes() > 0 ? 1 : 0))
    : 20;
  const startHour = Math.max(0, earliestHour);
  const endHour = Math.min(24, latestHour);
  const hours = Array.from(
    { length: Math.max(1, endHour - startHour) },
    (_, index) => startHour + index,
  );

  const windowStart = fallbackDay.getTime() + startHour * 3_600_000;
  const windowEnd = fallbackDay.getTime() + endHour * 3_600_000;

  const entries: Entry[] = timed
    .map((entry) => ({
      item: entry.item,
      visibleStart: Math.max(entry.start, windowStart),
      visibleEnd: Math.min(entry.end, windowEnd),
    }))
    .filter((entry) => entry.visibleEnd > entry.visibleStart);

  const placed = placeItems(entries).map((entry) => ({
    ...entry,
    top: ((entry.visibleStart - windowStart) / 3_600_000) * hourHeight,
    height: Math.max(
      1.15,
      ((entry.visibleEnd - entry.visibleStart) / 3_600_000) * hourHeight,
    ),
  }));

  const gridHeight = hours.length * hourHeight;
  const nowMs = now.getTime();
  const nowVisible = nowMs >= windowStart && nowMs <= windowEnd;
  const nowTop = ((nowMs - windowStart) / 3_600_000) * hourHeight;

  return (
    <div className={cn("space-y-2", className)}>
      {allDay.length ? (
        <div className="flex flex-wrap gap-1.5">
          {allDay.map((item) => {
            const meta = planKind(item);
            const Icon = meta.icon;
            return (
              <Link
                key={item.id}
                to={item.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-soft bg-surface-2/60 px-2 py-1 text-[0.65rem] text-foreground transition-colors hover:border-primary/40"
              >
                <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-2">Journée</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        <div
          className="relative w-11 shrink-0"
          style={{ height: `${gridHeight}rem` }}
          aria-hidden="true"
        >
          {hours.map((hour, index) => (
            <span
              key={hour}
              className="absolute right-1 -translate-y-1/2 text-[0.6rem] tabular-nums text-muted-2"
              style={{ top: `${index * hourHeight}rem` }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border-soft bg-background/30"
          style={{ height: `${gridHeight}rem` }}
          role="list"
          aria-label="Déroulé de la journée"
        >
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-border-soft/50"
              style={{ top: `${index * hourHeight}rem` }}
              aria-hidden="true"
            >
              <span className="absolute inset-x-0 border-t border-dashed border-border-soft/25" style={{ top: `${hourHeight / 2}rem` }} />
            </div>
          ))}

          {nowVisible ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
              style={{ top: `${nowTop}rem` }}
              aria-hidden="true"
            >
              <span className="absolute -top-[0.42rem] left-0 h-[0.42rem] w-[0.42rem] rounded-full bg-danger" />
              <span className="absolute -top-[0.55rem] right-1 rounded bg-danger px-1 text-[0.55rem] font-semibold text-white">
                {formatTime(now)}
              </span>
            </div>
          ) : null}

          {placed.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-2">
              Aucune activité sur ce créneau.
            </p>
          ) : null}

          {placed.map((entry) => {
            const meta = planKind(entry.item);
            const Icon = meta.icon;
            const timeLabel = entry.item.all_day
              ? "Journée"
              : entry.item.end_at
                ? `${formatTime(entry.item.start_at)} – ${formatTime(entry.item.end_at)}`
                : formatTime(entry.item.start_at);
            return (
              <Link
                key={entry.item.id}
                to={entry.item.href}
                role="listitem"
                aria-label={`${meta.label} ${entry.item.title} ${timeLabel}`}
                className={cn(
                  "group absolute overflow-hidden rounded-md border border-l-2 border-border-soft px-1.5 py-1 text-left transition-colors",
                  kindTone[entry.item.kind] ?? "border-l-primary bg-surface-2/60",
                  entry.item.severity === "danger" && "ring-1 ring-inset ring-danger/50",
                )}
                style={{
                  top: `${entry.top}rem`,
                  height: `${entry.height}rem`,
                  left: `calc(${(entry.lane / entry.lanes) * 100}% + 2px)`,
                  width: `calc(${100 / entry.lanes}% - 4px)`,
                }}
              >
                <span className="flex items-center gap-1 text-[0.55rem] font-semibold uppercase tracking-wide text-muted-2">
                  <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                  <span className="truncate">{meta.label}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{timeLabel}</span>
                </span>
                <span className="mt-0.5 block truncate text-[0.7rem] font-medium leading-tight text-foreground">
                  {entry.item.title}
                </span>
                {entry.height >= 2.6 && entry.item.detail ? (
                  <span className="mt-0.5 block truncate text-[0.6rem] text-muted">
                    {entry.item.detail}
                  </span>
                ) : null}
                {entry.height >= 3.4 && (entry.item.location || entry.item.travel) ? (
                  <span className="mt-0.5 block truncate text-[0.6rem] text-muted-2">
                    {entry.item.location ?? ""}
                    {entry.item.travel ? " · Déplacement" : ""}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
