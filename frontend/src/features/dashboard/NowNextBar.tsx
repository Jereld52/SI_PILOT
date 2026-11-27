import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Car,
  MapPin,
  MonitorPlay,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/useNow";

import { countdownLabel, findCurrentAndNext, formatTime, planKind } from "./dayPlan";
import { useTodayPlan } from "./useTodayPlan";

export function NowNextBar() {
  const { allowed, items, query } = useTodayPlan(60_000);
  const now = useNow(30_000);

  if (!allowed || query.isLoading || !query.data) return null;

  const { current, next } = findCurrentAndNext(items, now);
  const focus = current ?? next;
  const overdue = items.filter(
    (item) =>
      item.severity === "danger" && (item.kind === "action" || item.kind === "ticket"),
  ).length;

  const meta = focus ? planKind(focus) : null;
  const Icon = meta?.icon ?? CalendarClock;
  const start = focus?.start_at ? new Date(focus.start_at) : null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-soft bg-surface/55 px-3 py-2 panel-sheen">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
          current
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border-soft bg-background/50 text-muted-2",
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {current ? "En cours" : next ? "Ensuite" : "Journée"}
      </span>

      {focus ? (
        <>
          <Link
            to={focus.href}
            className="min-w-0 flex-1 truncate text-xs font-medium text-foreground transition-colors hover:text-accent"
          >
            {focus.title}
          </Link>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
            {formatTime(focus.start_at)}
            {focus.end_at ? ` – ${formatTime(focus.end_at)}` : ""}
          </span>
          {start ? (
            <span className="shrink-0 text-[10px] font-medium text-accent">
              {current ? `fin à ${formatTime(focus.end_at)}` : countdownLabel(start, now)}
            </span>
          ) : null}
          {focus.location ? (
            <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-2 lg:inline-flex">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {focus.location}
            </span>
          ) : null}
          {focus.travel ? (
            <span className="hidden shrink-0 items-center gap-1 text-[10px] text-accent sm:inline-flex">
              <Car className="h-3 w-3" aria-hidden="true" />
              Déplacement
            </span>
          ) : null}
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-2">
          Aucune activité planifiée pour le moment.
        </span>
      )}

      {overdue > 0 ? (
        <Badge tone="danger" className="shrink-0">
          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
          {overdue} en retard
        </Badge>
      ) : null}

      <Link
        to="/pilotage"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
      >
        <MonitorPlay className="h-3 w-3" aria-hidden="true" />
        Mode pilotage
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
