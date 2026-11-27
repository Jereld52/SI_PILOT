import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Car,
  CheckSquare,
  Clock,
  Contrast,
  Download,
  LifeBuoy,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Type,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { BrandMark } from "@/components/layout/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranding } from "@/features/branding/BrandingProvider";
import { DayTimeline } from "@/features/dashboard/DayTimeline";
import {
  computePlan,
  countdownLabel,
  elapsedPercent,
  findCurrentAndNext,
  formatMinutes,
  formatTime,
  planKind,
} from "@/features/dashboard/dayPlan";
import { useTodayPlan } from "@/features/dashboard/useTodayPlan";
import { apiDownload } from "@/lib/api";
import { cn, formatDate, formatNumber, getErrorMessage } from "@/lib/utils";
import { useNow } from "@/lib/useNow";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function longDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function PilotagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const branding = useBranding();
  const { items, data, query } = useTodayPlan(30_000);
  const now = useNow(1_000);
  const [largeText, setLargeText] = useState(() => readFlag("pnfor.pilotage.large"));
  const [highContrast, setHighContrast] = useState(() =>
    readFlag("pnfor.pilotage.contrast"),
  );
  const printed = useRef(false);

  const plan = useMemo(() => computePlan(items), [items]);
  const { current, next } = useMemo(() => findCurrentAndNext(items, now), [items, now]);
  const focus = current ?? next;
  const focusMeta = focus ? planKind(focus) : null;
  const FocusIcon = focusMeta?.icon ?? CalendarClock;

  const travelLocations = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (item.travel && item.location) {
        counts.set(item.location, (counts.get(item.location) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((left, right) =>
      left[0].localeCompare(right[0]),
    );
  }, [items]);

  const upcoming = useMemo(() => {
    const nowMs = now.getTime();
    return items
      .filter((item) => item.start_at && !item.all_day)
      .filter((item) => new Date(item.start_at as string).getTime() > nowMs)
      .sort(
        (left, right) =>
          new Date(left.start_at as string).getTime() -
          new Date(right.start_at as string).getTime(),
      )
      .slice(0, 4);
  }, [items, now]);

  useEffect(() => {
    try {
      window.localStorage.setItem("pnfor.pilotage.large", largeText ? "1" : "0");
    } catch {
      // stockage local indisponible : le réglage reste actif pour la session
    }
    document.documentElement.style.fontSize = largeText ? "18px" : "";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [largeText]);

  useEffect(() => {
    try {
      window.localStorage.setItem("pnfor.pilotage.contrast", highContrast ? "1" : "0");
    } catch {
      // stockage local indisponible : le réglage reste actif pour la session
    }
  }, [highContrast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        navigate("/aujourdhui");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const shouldPrint = searchParams.get("print") === "1";
  useEffect(() => {
    if (!shouldPrint || !data || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(timer);
  }, [shouldPrint, data]);

  const handleExport = async () => {
    try {
      await apiDownload(
        "/dashboard/today/export.ics",
        `plan-du-jour-${data?.plan.date ?? "jour"}.ics`,
      );
      toast.success("Plan du jour exporté au format ICS.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const busyPercent = Math.min(100, Math.round((plan.busyMinutes / 600) * 100));
  const overdue = items.filter(
    (item) =>
      item.severity === "danger" && (item.kind === "action" || item.kind === "ticket"),
  ).length;

  return (
    <div
      className={cn(
        "pilotage-shell min-h-screen",
        highContrast && "pilotage-contrast",
      )}
      data-contrast={highContrast ? "high" : undefined}
    >
      <header className="print-hidden sticky top-0 z-20 border-b border-border-soft bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3">
          <BrandMark compact />
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-accent">
              Mode pilotage
            </p>
            <p className="truncate text-xs text-muted">
              {data ? longDate(data.plan.date) : branding.organization_name || branding.app_name}
            </p>
          </div>

          <div className="ml-auto flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-foreground sm:text-4xl">
              {formatTime(now)}
            </span>
            <span className="hidden text-[0.65rem] tracking-wide text-muted-2 sm:block">
              {String(now.getSeconds()).padStart(2, "0")} s
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={largeText}
              className={cn(largeText && "border-accent/50 text-accent")}
              onClick={() => setLargeText((value) => !value)}
              title="Agrandir la typographie"
            >
              <Type className="h-3.5 w-3.5" />
              Grande typo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={highContrast}
              className={cn(highContrast && "border-accent/50 text-accent")}
              onClick={() => setHighContrast((value) => !value)}
              title="Renforcer les contrastes"
            >
              <Contrast className="h-3.5 w-3.5" />
              Contraste
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void query.refetch()}
              loading={query.isFetching}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              ICS
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              Imprimer
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/aujourdhui")}
              className="border-danger/30 text-danger hover:bg-danger/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Fermer
            </Button>
          </div>
        </div>
      </header>

      {query.isError ? (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <ErrorState
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </Card>
        </div>
      ) : query.isLoading || !data ? (
        <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 sm:px-6 xl:grid-cols-3">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <main className="print-hidden mx-auto grid max-w-[1800px] gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,300px)]">
          <aside className="space-y-3">
            <Card className="panel-sheen border-accent/25 bg-gradient-to-br from-accent/10 via-surface to-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-accent">
                    {current ? "En cours" : next ? "Prochain rendez-vous" : "Journée libre"}
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-wide text-muted-2">
                    {formatDate(data.plan.date)}
                  </span>
                </div>

                {focus ? (
                  <>
                    <div className="mt-3 flex items-start gap-2">
                      <FocusIcon className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-base font-semibold leading-snug text-foreground">
                          {focus.title}
                        </p>
                        <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                          {formatTime(focus.start_at)}
                          {focus.end_at ? ` – ${formatTime(focus.end_at)}` : ""}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-2xl font-semibold text-accent">
                      {current
                        ? `Fin à ${formatTime(focus.end_at)}`
                        : focus.start_at
                          ? countdownLabel(new Date(focus.start_at), now)
                          : "Journée"}
                    </p>

                    {current ? (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${elapsedPercent(current, now)}%` }}
                        />
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] text-muted">
                      {focus.location ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border-soft bg-background/40 px-1.5 py-0.5">
                          <MapPin className="h-3 w-3 text-accent" aria-hidden="true" />
                          {focus.location}
                        </span>
                      ) : null}
                      {focus.travel ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border-soft bg-background/40 px-1.5 py-0.5 text-accent">
                          <Car className="h-3 w-3" aria-hidden="true" />
                          Déplacement
                        </span>
                      ) : null}
                      {overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-danger">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {overdue} en retard
                        </span>
                      ) : null}
                    </div>

                    {current && next ? (
                      <p className="mt-3 border-t border-border-soft pt-2 text-[0.7rem] text-muted-2">
                        Ensuite : <span className="text-foreground">{next.title}</span> ·{" "}
                        {formatTime(next.start_at)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Aucune activité planifiée. Créneau idéal pour les actions de fond.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="panel-sheen border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Charge du jour</h2>
                  <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex items-end justify-between">
                  <p className="text-xl font-semibold text-foreground">
                    {formatMinutes(plan.busyMinutes)}
                  </p>
                  <p className="text-[0.65rem] text-muted-2">
                    {formatMinutes(plan.freeMinutes)} libres
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-background/70">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      busyPercent >= 80
                        ? "bg-danger"
                        : busyPercent >= 55
                          ? "bg-warning"
                          : "bg-accent",
                    )}
                    style={{ width: `${busyPercent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[0.65rem] text-muted">
                  <div className="rounded-md border border-border-soft bg-background/40 px-2 py-1.5">
                    <p className="text-muted-2">Premier</p>
                    <p className="mt-0.5 font-medium text-foreground">
                      {plan.firstStart ? formatTime(plan.firstStart) : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-soft bg-background/40 px-2 py-1.5">
                    <p className="text-muted-2">Dernière fin</p>
                    <p className="mt-0.5 font-medium text-foreground">
                      {plan.lastEnd ? formatTime(plan.lastEnd) : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Réunions", value: plan.meetings, icon: Users },
                { label: "Interventions", value: plan.interventions, icon: Wrench },
                { label: "Réservations", value: plan.reservations, icon: Package },
                { label: "Actions", value: plan.actions, icon: CheckSquare },
                { label: "Demandes", value: plan.tickets, icon: LifeBuoy },
                { label: "Déplacements", value: plan.travels, icon: Car },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-border-soft bg-surface/50 px-2.5 py-2"
                  >
                    <p className="inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-wide text-muted-2">
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {metric.label}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {formatNumber(metric.value)}
                    </p>
                  </div>
                );
              })}
            </div>

            <Card className="panel-sheen border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">À suivre</h2>
                  <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {upcoming.length === 0 ? (
                  <p className="py-2 text-center text-[0.7rem] text-muted-2">
                    Rien de plus aujourd'hui.
                  </p>
                ) : (
                  upcoming.map((item) => (
                    <Link
                      key={item.id}
                      to={item.href}
                      className="flex items-start gap-2 rounded-md border border-border-soft bg-background/40 px-2 py-1.5 text-[0.7rem] transition-colors hover:border-primary/40"
                    >
                      <span className="font-mono tabular-nums text-muted-2">
                        {formatTime(item.start_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {item.title}
                      </span>
                      {item.travel ? (
                        <Car className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                      ) : null}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0">
            <Card className="panel-sheen h-full border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-accent">
                      Déroulé
                    </p>
                    <h2 className="text-base font-semibold text-foreground">
                      Ma journée heure par heure
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={plan.conflicts > 0 ? "danger" : "success"}>
                      {plan.conflicts > 0
                        ? `${plan.conflicts} conflit(s)`
                        : "Aucun conflit"}
                    </Badge>
                    <Badge tone="neutral">{items.length} activité(s)</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto pt-0">
                <DayTimeline
                  day={data.plan.date}
                  items={items}
                  now={now}
                  variant="large"
                />
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-3">
            <Card className="panel-sheen border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Points de vigilance
                  </h2>
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {(data.plan.suggestions.length
                  ? data.plan.suggestions
                  : ["Aucun point de vigilance particulier."]
                ).map((suggestion) => (
                  <p
                    key={suggestion}
                    className="flex items-start gap-2 rounded-md border border-border-soft bg-background/40 px-2 py-1.5 text-[0.7rem] leading-4 text-muted"
                  >
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {suggestion}
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card className="panel-sheen border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Sur site</h2>
                  <Car className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {travelLocations.length === 0 ? (
                  <p className="py-2 text-center text-[0.7rem] text-muted-2">
                    Aucun déplacement prévu.
                  </p>
                ) : (
                  travelLocations.map(([location, count]) => (
                    <div
                      key={location}
                      className="flex items-center justify-between gap-2 rounded-md border border-border-soft bg-background/40 px-2 py-1.5 text-[0.7rem]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                        <span className="truncate">{location}</span>
                      </span>
                      <Badge tone="neutral">{count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <p className="px-1 text-[0.6rem] uppercase tracking-wide text-muted-2">
              Échap pour fermer · actualisé à{" "}
              {query.dataUpdatedAt ? formatTime(new Date(query.dataUpdatedAt)) : "—"}
            </p>
          </aside>
        </main>
      )}

      {data ? (
        <div className="print-only px-6 py-2 text-black">
          <h1 className="text-lg font-bold">Feuille de route · {longDate(data.plan.date)}</h1>
          <p className="mt-1 text-xs">
            {formatMinutes(plan.busyMinutes)} occupées · {formatMinutes(plan.freeMinutes)}{" "}
            libres · {plan.conflicts} conflit(s) · {plan.travels} déplacement(s)
          </p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black/40 text-left">
                <th className="py-1 pr-2">Heure</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Intitulé</th>
                <th className="py-1">Lieu</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-black/15 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap tabular-nums">
                    {formatTime(item.start_at)}
                    {item.end_at ? ` – ${formatTime(item.end_at)}` : ""}
                  </td>
                  <td className="py-1 pr-2">{planKind(item).label}</td>
                  <td className="py-1 pr-2">
                    <span className="font-medium">{item.title}</span>
                    {item.detail ? (
                      <span className="block text-[0.65rem] text-black/70">{item.detail}</span>
                    ) : null}
                  </td>
                  <td className="py-1">
                    {item.location ?? ""}
                    {item.travel ? " (déplacement)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.plan.suggestions.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">Points de vigilance</p>
              <ul className="mt-1 list-disc pl-4 text-[0.7rem]">
                {data.plan.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
