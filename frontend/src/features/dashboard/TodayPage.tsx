import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Car,
  CheckCircle2,
  CheckSquare,
  Clock,
  Info,
  LifeBuoy,
  MapPin,
  Package,
  RefreshCw,
  Server,
  ShoppingCart,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type { DashboardToday, DayPlanItem, TodayItem } from "@/types/api";

const sectionIcons: Record<string, LucideIcon> = {
  support: LifeBuoy,
  achats: ShoppingCart,
  infrastructure: Server,
  organisation: Users,
  pilotage: BarChart3,
};

const sectionDescriptions: Record<string, string> = {
  support: "Demandes, priorités et interventions à traiter.",
  achats: "Devis, bons de commande, livraisons et contrats.",
  infrastructure: "Supervision, sécurité, certificats et sauvegardes.",
  organisation: "Arrivées, départs et stock informatique.",
  pilotage: "Actions, projets, budget et conformité.",
};

const severityLabels: Record<string, string> = {
  danger: "Urgent",
  warning: "À traiter",
  info: "À suivre",
  success: "OK",
};

const severityTones: Record<string, "danger" | "warning" | "info" | "success"> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

const planKindMeta: Record<string, { label: string; icon: LucideIcon }> = {
  meeting: { label: "Réunion", icon: Users },
  intervention: { label: "Intervention", icon: Wrench },
  reservation: { label: "Réservation", icon: Package },
  event: { label: "Événement", icon: CalendarClock },
  action: { label: "Action", icon: CheckSquare },
  ticket: { label: "Demande", icon: LifeBuoy },
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

function computePlan(items: DayPlanItem[]) {
  const timed = items
    .filter((item) => item.start_at && item.end_at && !item.all_day)
    .map((item) => ({
      start: new Date(item.start_at as string).getTime(),
      end: new Date(item.end_at as string).getTime(),
    }))
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

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "danger") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (severity === "warning") return <Clock className="h-3.5 w-3.5" />;
  if (severity === "success") return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

function TodayRow({ item }: { item: TodayItem }) {
  return (
    <Link
      to={item.href}
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-surface-2/60",
        item.severity === "danger" && "border-danger/25 bg-danger/5",
        item.severity === "warning" && "border-warning/20",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          item.severity === "danger" && "border-danger/30 text-danger",
          item.severity === "warning" && "border-warning/30 text-warning",
          item.severity === "info" && "border-info/30 text-info",
          item.severity === "success" && "border-success/30 text-success",
        )}
      >
        <SeverityIcon severity={item.severity} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-foreground">{item.title}</p>
          <Badge tone={severityTones[item.severity] ?? "neutral"}>
            {severityLabels[item.severity] ?? item.severity}
          </Badge>
          {item.due_date ? (
            <span className="text-[9px] text-muted-2">échéance {formatDate(item.due_date)}</span>
          ) : null}
        </div>
        {item.detail ? (
          <p className="mt-0.5 text-[10px] leading-4 text-muted">{item.detail}</p>
        ) : null}
      </div>
      <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-wide text-accent">
        {item.action_label}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function PlanRow({ item }: { item: DayPlanItem }) {
  const meta = planKindMeta[item.kind] ?? { label: item.kind, icon: Info };
  const Icon = meta.icon;
  return (
    <Link
      to={item.href}
      className={cn(
        "group grid grid-cols-[64px_1fr] gap-3 rounded-xl border border-border-soft bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-surface-2/60 sm:grid-cols-[82px_1fr]",
        item.severity === "danger" && "border-danger/30 bg-danger/5",
        item.severity === "warning" && "border-warning/20",
      )}
    >
      <div className="pt-0.5 text-right">
        <p className="font-mono text-[11px] font-semibold text-foreground">
          {item.all_day ? "Journée" : formatTime(item.start_at)}
        </p>
        {!item.all_day && item.end_at ? (
          <p className="text-[9px] text-muted-2">{formatTime(item.end_at)}</p>
        ) : null}
        <span className="mt-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-2">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">{item.title}</p>
          {item.severity === "danger" ? (
            <Badge tone="danger">Urgent</Badge>
          ) : item.severity === "warning" ? (
            <Badge tone="warning">À traiter</Badge>
          ) : null}
        </div>
        {item.detail ? (
          <p className="mt-1 text-[10px] leading-4 text-muted">{item.detail}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] text-muted-2">
          {item.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          ) : null}
          {item.travel ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Car className="h-3 w-3" />
              Déplacement
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 uppercase tracking-wide text-accent">
            {item.action_label}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function TodayPage() {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { open: openAi } = useAiAssistant();

  const query = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => apiFetch<DashboardToday>("/dashboard/today"),
    refetchInterval: 5 * 60_000,
  });

  const data = query.data;
  const sections = (data?.sections ?? [])
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.module_key && !isEnabled(item.module_key)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const urgent = sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.severity === "danger").length,
    0,
  );

  const planItems = useMemo(
    () =>
      (data?.plan?.items ?? []).filter((item) => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.module_key && !isEnabled(item.module_key)) return false;
        return true;
      }),
    [data, hasPermission, isEnabled],
  );
  const plan = useMemo(() => computePlan(planItems), [planItems]);
  const travelLocations = useMemo(() => {
    const counts = new Map<string, number>();
    planItems.forEach((item) => {
      if (item.travel && item.location) {
        counts.set(item.location, (counts.get(item.location) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((left, right) =>
      left[0].localeCompare(right[0]),
    );
  }, [planItems]);
  const busyPercent = Math.min(100, Math.round((plan.busyMinutes / 600) * 100));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage quotidien"
        title="Aujourd'hui"
        description="Votre journée complète : rendez-vous, déplacements, interventions, actions et demandes à traiter."
        actions={
          <>
            <Button
              size="sm"
              onClick={() =>
                openAi(
                  null,
                  "Organise ma journée en tenant compte des réunions, déplacements, interventions, actions et demandes. Propose un ordre de priorité, des créneaux et les points de vigilance.",
                )
              }
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Organiser ma journée
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openAi(
                  null,
                  "Fais-moi le briefing du jour et propose un ordre de priorité pour les actions à traiter.",
                )
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              Briefing IA
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
          </>
        }
      />

      {query.isError ? (
        <Card>
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "Impossible de charger les actions du jour."
            }
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : query.isLoading || !data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-xl" />
        </>
      ) : (
        <>
          <Card className="panel-sheen border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-accent/5 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Plan de la journée
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {formatDate(data.plan.date)}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {planItems.length === 0
                    ? "Aucune activité planifiée pour le moment."
                    : `${planItems.length} activité(s) planifiée(s) · ${formatMinutes(
                        plan.busyMinutes,
                      )} occupées · ${formatMinutes(plan.freeMinutes)} libres`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={plan.conflicts > 0 ? "danger" : "success"}>
                  {plan.conflicts > 0
                    ? `${plan.conflicts} conflit(s)`
                    : "Aucun conflit"}
                </Badge>
                <Badge tone="neutral">{plan.travels} déplacement(s)</Badge>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {[
                { label: "Réunions", value: plan.meetings, icon: Users },
                { label: "Interventions", value: plan.interventions, icon: Wrench },
                { label: "Réservations", value: plan.reservations, icon: Package },
                { label: "Événements", value: plan.events, icon: CalendarClock },
                { label: "Actions", value: plan.actions, icon: CheckSquare },
                { label: "Demandes", value: plan.tickets, icon: LifeBuoy },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-border-soft bg-background/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted-2">
                      <Icon className="h-3 w-3" />
                      {metric.label}
                    </div>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {formatNumber(metric.value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <Card className="panel-sheen border-primary/20">
              <CardHeader>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Déroulé
                  </p>
                  <h2 className="text-sm font-semibold text-foreground">
                    Ma journée heure par heure
                  </h2>
                  <p className="mt-1 text-[10px] text-muted">
                    Réunions, déplacements, interventions, réservations, actions et demandes
                    dues.
                  </p>
                </div>
                <CalendarClock className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {planItems.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="Aucune activité planifiée"
                    description="La journée est libre. Profitez-en pour avancer sur les actions de fond."
                  />
                ) : (
                  planItems.map((item) => <PlanRow key={item.id} item={item} />)
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="panel-sheen border-primary/20">
                <CardHeader>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      Charge
                    </p>
                    <h2 className="text-sm font-semibold text-foreground">Équilibre du jour</h2>
                  </div>
                  <Clock className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted-2">Temps occupé</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {formatMinutes(plan.busyMinutes)}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-2">
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
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
                    <div className="rounded-md border border-border-soft bg-background/40 px-2 py-1.5">
                      <p className="text-muted-2">Premier rendez-vous</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {plan.firstStart ? formatTime(plan.firstStart.toISOString()) : "—"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border-soft bg-background/40 px-2 py-1.5">
                      <p className="text-muted-2">Dernière fin</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {plan.lastEnd ? formatTime(plan.lastEnd.toISOString()) : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="panel-sheen border-primary/20">
                <CardHeader>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      Déplacements
                    </p>
                    <h2 className="text-sm font-semibold text-foreground">Sur site</h2>
                  </div>
                  <Car className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {travelLocations.length === 0 ? (
                    <p className="py-3 text-center text-[10px] text-muted-2">
                      Aucun déplacement prévu.
                    </p>
                  ) : (
                    travelLocations.map(([location, count]) => (
                      <div
                        key={location}
                        className="flex items-center justify-between gap-2 rounded-md border border-border-soft bg-background/40 px-2.5 py-1.5 text-[10px]"
                      >
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                          <MapPin className="h-3 w-3 text-accent" />
                          {location}
                        </span>
                        <Badge tone="neutral">{count}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="panel-sheen border-primary/20">
                <CardHeader>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      Points de vigilance
                    </p>
                    <h2 className="text-sm font-semibold text-foreground">
                      Pour ne pas être débordé
                    </h2>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {(data.plan.suggestions.length
                    ? data.plan.suggestions
                    : ["Aucun point de vigilance particulier."]
                  ).map((suggestion) => (
                    <p
                      key={suggestion}
                      className="flex items-start gap-2 rounded-md border border-border-soft bg-background/40 px-2.5 py-1.5 text-[10px] leading-4 text-muted"
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {suggestion}
                    </p>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="panel-sheen border-primary/20 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">
                Actions à traiter
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {formatNumber(total)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                Mis à jour le {formatDateTime(data.generated_at)}
              </p>
            </Card>
            <Card className="panel-sheen border-danger/25 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">
                Urgences
              </p>
              <p className="mt-1 text-3xl font-semibold text-danger">
                {formatNumber(urgent)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                À traiter en priorité aujourd'hui
              </p>
            </Card>
            <Card className="panel-sheen border-primary/20 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">
                Domaines concernés
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {formatNumber(sections.length)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                Regroupés par module
              </p>
            </Card>
          </div>

          {total === 0 ? (
            <Card>
              <EmptyState
                icon={CheckCircle2}
                title="Rien d'urgent pour le moment"
                description="Aucune action prioritaire détectée. Actualise si tu viens de saisir de nouvelles données."
              />
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    À traiter
                  </p>
                  <h2 className="text-sm font-semibold text-foreground">
                    Actions et alertes du jour
                  </h2>
                </div>
              </div>
              {sections.map((section) => {
                const Icon = sectionIcons[section.key] ?? Info;
                const sectionUrgent = section.items.filter(
                  (item) => item.severity === "danger",
                ).length;
                return (
                  <Card key={section.key} className="panel-sheen border-primary/20">
                    <CardHeader>
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-soft bg-background/40 text-accent">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">
                            {section.label}
                          </h2>
                          <p className="mt-0.5 text-[10px] text-muted">
                            {sectionDescriptions[section.key] ?? ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sectionUrgent > 0 ? (
                          <Badge tone="danger">{sectionUrgent} urgent(s)</Badge>
                        ) : null}
                        <Badge tone="neutral">{section.items.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5 pt-0">
                      {section.items.map((item) => (
                        <TodayRow key={item.id} item={item} />
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
