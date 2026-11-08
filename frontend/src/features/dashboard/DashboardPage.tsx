import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  FileClock,
  FileText,
  FolderKanban,
  LifeBuoy,
  MonitorSmartphone,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ChartCard } from "@/features/dashboard/ChartCard";
import { KpiCard } from "@/features/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, formatRelative, humanize } from "@/lib/utils";
import type {
  ActivityItem,
  AlertItem,
  CockpitDeadline,
  CockpitModule,
  DashboardActivity,
  DashboardAlerts,
  DashboardCharts,
  DashboardCockpit,
  DashboardSummary,
  KpiValue,
} from "@/types/api";

const alertIcons: Record<string, typeof ShieldAlert> = {
  security: ShieldAlert,
  assets: TriangleAlert,
  contracts: FileClock,
  actions: Clock,
  tickets: LifeBuoy,
};

const alertTones: Record<string, string> = {
  critical: "border-danger/25 bg-danger/10 text-danger",
  high: "border-warning/25 bg-warning/10 text-warning",
  medium: "border-info/25 bg-info/10 text-info",
};

const moduleIcons: Record<string, LucideIcon> = {
  assets: MonitorSmartphone,
  tickets: LifeBuoy,
  contracts: FileText,
  budget: Wallet,
  projects: FolderKanban,
  security: ShieldAlert,
  rgpd: Scale,
  documents: BookOpen,
  calendar: CalendarDays,
  mobile: Smartphone,
};

const moduleTones: Record<
  string,
  { card: string; icon: string; badge: string; value: string; bar: string }
> = {
  primary: {
    card: "border-l-primary/70",
    icon: "border-primary/30 bg-primary/10 text-primary-strong",
    badge: "border-primary/25 bg-primary/10 text-primary-strong",
    value: "text-foreground",
    bar: "from-primary/60 to-primary/10",
  },
  accent: {
    card: "border-l-accent/70",
    icon: "border-accent/30 bg-accent/10 text-accent",
    badge: "border-accent/25 bg-accent/[0.07] text-accent",
    value: "text-accent",
    bar: "from-accent/60 to-accent/10",
  },
  success: {
    card: "border-l-success/70",
    icon: "border-success/30 bg-success/10 text-success",
    badge: "border-success/25 bg-success/[0.07] text-success",
    value: "text-success",
    bar: "from-success/60 to-success/10",
  },
  warning: {
    card: "border-l-warning/70",
    icon: "border-warning/30 bg-warning/10 text-warning",
    badge: "border-warning/25 bg-warning/[0.07] text-warning",
    value: "text-warning",
    bar: "from-warning/60 to-warning/10",
  },
  danger: {
    card: "border-l-danger/70",
    icon: "border-danger/30 bg-danger/10 text-danger",
    badge: "border-danger/25 bg-danger/[0.07] text-danger",
    value: "text-danger",
    bar: "from-danger/60 to-danger/10",
  },
};

const featuredKeys = ["open_tickets", "critical_incidents", "contracts_expiring", "budget_engaged"];
const preferredCharts = [
  "tickets_evolution",
  "assets_by_status",
  "budget_by_category",
  "contracts_expiry",
  "tickets_by_status",
  "assets_by_category",
];

function AlertRow({ alert }: { alert: AlertItem }) {
  const Icon = alertIcons[alert.category] ?? ShieldAlert;
  const tone = alertTones[alert.severity] ?? "border-border bg-surface-2 text-muted";
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-primary/25 hover:bg-primary/10">
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{alert.title}</span>
        {alert.detail ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-muted">{alert.detail}</span>
        ) : null}
      </span>
      {alert.link ? <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden="true" /> : null}
    </div>
  );
  return alert.link ? <Link to={alert.link}>{content}</Link> : content;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-primary/25 hover:bg-primary/10">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15 text-primary-strong">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-foreground">
          <span className="font-medium">{item.actor ?? "Système"}</span>{" "}
          <span className="text-muted">{humanize(item.action).toLowerCase()}</span>
          {item.label ? <span className="text-muted"> · {item.label}</span> : null}
        </span>
        <span className="mt-0.5 block text-[10px] text-muted-2">
          {humanize(item.module)} · {formatRelative(item.occurred_at)}
        </span>
      </span>
      {item.link ? <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden="true" /> : null}
    </div>
  );
  return item.link ? <Link to={item.link}>{content}</Link> : content;
}

function MiniKpi({ kpi }: { kpi: KpiValue }) {
  const value =
    kpi.unit === "EUR"
      ? formatCurrency(kpi.value, 0)
      : formatNumber(kpi.value, Number.isInteger(kpi.value) ? 0 : 1);
  const tone =
    kpi.severity === "danger"
      ? "text-danger"
      : kpi.severity === "warning"
        ? "text-warning"
        : kpi.severity === "success"
          ? "text-success"
          : "text-foreground";
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-background/40 px-3 py-2 transition-colors hover:border-primary/35 hover:bg-primary/10">
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-2">{kpi.label}</p>
        <p className={cn("text-lg font-semibold", tone)}>{value}</p>
      </div>
      {kpi.link ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-2" /> : null}
    </div>
  );
  return kpi.link ? <Link to={kpi.link}>{content}</Link> : content;
}

function ModuleCard({ module }: { module: CockpitModule }) {
  const Icon = moduleIcons[module.key] ?? Sparkles;
  const tone = moduleTones[module.tone] ?? moduleTones.primary;
  const primary =
    module.key === "budget"
      ? formatCurrency(module.primary, 0)
      : formatNumber(module.primary, 0);
  const secondary =
    module.key === "budget"
      ? formatCurrency(module.secondary, 0)
      : formatNumber(module.secondary, 0);
  return (
    <Link
      to={module.href}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border border-border-soft border-l-2 bg-surface/70 p-3.5 shadow-card transition-colors hover:bg-surface/85",
        tone.card,
      )}
    >
      <span className={cn("absolute inset-x-0 bottom-0 h-px bg-gradient-to-r opacity-50", tone.bar)} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-md border", tone.icon)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-2.5 text-[11px] font-semibold text-foreground">{module.label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("text-[1.55rem] font-semibold tracking-tight", tone.value)}>{primary}</span>
        <span className="text-[10px] text-muted-2">{module.primary_label}</span>
      </div>
      <span className={cn("mt-1.5 inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[9px]", tone.badge)}>
        {secondary} {module.secondary_label}
      </span>
      <p className="mt-1.5 line-clamp-2 text-[9px] leading-3.5 text-muted-2">{module.hint}</p>
    </Link>
  );
}

function DeadlineRow({ deadline }: { deadline: CockpitDeadline }) {
  const tone =
    deadline.severity === "danger"
      ? "bg-danger"
      : deadline.severity === "warning"
        ? "bg-warning"
        : "bg-accent";
  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-primary/25 hover:bg-primary/10">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">{deadline.label}</span>
        <span className="text-[10px] text-muted-2">{humanize(deadline.kind)}</span>
      </span>
      <span className="shrink-0 rounded-md border border-border-soft bg-background/50 px-2 py-0.5 text-[10px] text-muted">
        {formatDate(deadline.due_date)}
      </span>
    </div>
  );
  return <Link to={deadline.href}>{content}</Link>;
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [showAllCharts, setShowAllCharts] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => apiFetch<DashboardSummary>("/dashboard/summary"),
    staleTime: 30_000,
  });
  const cockpitQuery = useQuery({
    queryKey: ["dashboard", "cockpit"],
    queryFn: () => apiFetch<DashboardCockpit>("/dashboard/cockpit"),
    staleTime: 30_000,
  });
  const chartsQuery = useQuery({
    queryKey: ["dashboard", "charts"],
    queryFn: () => apiFetch<DashboardCharts>("/dashboard/charts"),
    staleTime: 60_000,
  });
  const alertsQuery = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => apiFetch<DashboardAlerts>("/dashboard/alerts"),
    staleTime: 30_000,
  });
  const activityQuery = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: () => apiFetch<DashboardActivity>("/dashboard/activity"),
    staleTime: 30_000,
  });

  const isRefreshing =
    summaryQuery.isFetching ||
    cockpitQuery.isFetching ||
    chartsQuery.isFetching ||
    alertsQuery.isFetching ||
    activityQuery.isFetching;

  const refreshAll = () => {
    void summaryQuery.refetch();
    void cockpitQuery.refetch();
    void chartsQuery.refetch();
    void alertsQuery.refetch();
    void activityQuery.refetch();
  };

  const firstName = user?.first_name ? `, ${user.first_name}` : "";
  const kpis = summaryQuery.data?.kpis ?? [];
  const kpiMap = new Map(kpis.map((kpi) => [kpi.key, kpi]));
  const featured = featuredKeys
    .map((key) => kpiMap.get(key))
    .filter((kpi): kpi is KpiValue => Boolean(kpi));
  const featuredSet = new Set(featured.map((kpi) => kpi.key));
  const secondaryKpis = kpis.filter((kpi) => !featuredSet.has(kpi.key));
  const modules = cockpitQuery.data?.modules ?? [];
  const deadlines = cockpitQuery.data?.deadlines ?? [];
  const alerts = alertsQuery.data?.items ?? [];
  const activities = activityQuery.data?.items ?? [];
  const charts = chartsQuery.data?.series ?? [];
  const orderedCharts = [...charts].sort((a, b) => {
    const indexA = preferredCharts.indexOf(a.key);
    const indexB = preferredCharts.indexOf(b.key);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });
  const visibleCharts = showAllCharts ? orderedCharts : orderedCharts.slice(0, 4);

  const openTickets = kpiMap.get("open_tickets")?.value ?? 0;
  const brokenAssets = kpiMap.get("broken_assets")?.value ?? 0;
  const criticalIncidents = kpiMap.get("critical_incidents")?.value ?? 0;

  return (
    <div className="space-y-5">
      <section className="hero-wine ring-wine relative overflow-hidden rounded-xl border border-primary/30 p-5 sm:p-6">
        <div className="hero-grid pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-70" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-accent/20 bg-accent/5 blur-2xl" aria-hidden="true" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                <Sparkles className="h-3 w-3" />
                Cockpit du système d'information
              </span>
              <span className="text-[10px] uppercase tracking-wide text-brand-cream/60">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-brand-cream sm:text-3xl">
              Bonjour{firstName}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-cream/75">
              Une vue consolidée du parc, des demandes, des contrats, du budget, des projets et des
              risques de sécurité. Les indicateurs sont calculés à partir des données réelles.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {hasPermission("assets.read") ? (
                <Link
                  to="/parc"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-brand-cream transition-colors hover:border-accent/30 hover:bg-white/10"
                >
                  <MonitorSmartphone className="h-3.5 w-3.5 text-accent" />
                  Ouvrir le parc
                </Link>
              ) : null}
              {hasPermission("tickets.read") ? (
                <Link
                  to="/demandes"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-brand-cream transition-colors hover:border-accent/30 hover:bg-white/10"
                >
                  <LifeBuoy className="h-3.5 w-3.5 text-accent" />
                  Voir les demandes
                </Link>
              ) : null}
              {hasPermission("budget.read") ? (
                <Link
                  to="/budget"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-brand-cream transition-colors hover:border-accent/30 hover:bg-white/10"
                >
                  <Wallet className="h-3.5 w-3.5 text-accent" />
                  Suivre le budget
                </Link>
              ) : null}
              {hasPermission("security.read") ? (
                <Link
                  to="/cybersecurite"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-brand-cream transition-colors hover:border-accent/30 hover:bg-white/10"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                  Cybersécurité
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 backdrop-blur-[2px]">
              <p className="text-[10px] uppercase tracking-wide text-brand-cream/55">Alertes</p>
              <p className="mt-1 text-2xl font-semibold text-accent">{formatNumber(alerts.length)}</p>
              <p className="text-[10px] text-brand-cream/55">priorités à traiter</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 backdrop-blur-[2px]">
              <p className="text-[10px] uppercase tracking-wide text-brand-cream/55">Demandes ouvertes</p>
              <p className="mt-1 text-2xl font-semibold text-brand-cream">{formatNumber(openTickets)}</p>
              <p className="text-[10px] text-brand-cream/55">{formatNumber(criticalIncidents)} incident(s) critique(s)</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 backdrop-blur-[2px]">
              <p className="text-[10px] uppercase tracking-wide text-brand-cream/55">Équipements en panne</p>
              <p className={cn("mt-1 text-2xl font-semibold", brokenAssets > 0 ? "text-warning" : "text-brand-cream")}>
                {formatNumber(brokenAssets)}
              </p>
              <p className="text-[10px] text-brand-cream/55">à remettre en service</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3 backdrop-blur-[2px]">
              <p className="text-[10px] uppercase tracking-wide text-brand-cream/55">Échéances suivies</p>
              <p className="mt-1 text-2xl font-semibold text-brand-cream">{formatNumber(deadlines.length)}</p>
              <p className="text-[10px] text-brand-cream/55">contrats, projets, RGPD…</p>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 backdrop-blur-[2px]">
              <span className="text-[10px] text-brand-cream/60">
                {summaryQuery.data
                  ? `Actualisé ${formatDateTime(summaryQuery.data.generated_at)}`
                  : "Chargement des indicateurs…"}
              </span>
              <Button variant="secondary" size="sm" onClick={refreshAll} loading={isRefreshing} className="border-white/10 bg-white/[0.06] text-brand-cream hover:bg-white/10 hover:text-brand-cream">
                <RefreshCw className="h-3.5 w-3.5" />
                Actualiser
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Pilotage</p>
            <h2 className="text-base font-semibold text-foreground">État des modules</h2>
          </div>
          <p className="text-[11px] text-muted-2">Accès direct aux domaines qui demandent votre attention.</p>
        </div>
        {cockpitQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-[168px] rounded-xl" />
            ))}
          </div>
        ) : cockpitQuery.isError ? (
          <Card>
            <ErrorState
              message={cockpitQuery.error instanceof Error ? cockpitQuery.error.message : "Erreur inconnue."}
              onRetry={() => void cockpitQuery.refetch()}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {modules.map((module) => (
              <ModuleCard key={module.key} module={module} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Indicateurs</p>
              <h2 className="text-base font-semibold text-foreground">Chiffres clés</h2>
            </div>
          </div>
          {summaryQuery.isError ? (
            <Card>
              <ErrorState
                message={summaryQuery.error instanceof Error ? summaryQuery.error.message : "Erreur inconnue."}
                onRetry={() => void summaryQuery.refetch()}
              />
            </Card>
          ) : summaryQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[150px] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {featured.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          )}
        </div>

        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Compléments</p>
              <h2 className="text-sm font-semibold text-foreground">Autres indicateurs</h2>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {summaryQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {secondaryKpis.map((kpi) => (
                  <MiniKpi key={kpi.key} kpi={kpi} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Analyses</p>
            <h2 className="text-base font-semibold text-foreground">Tendances et répartitions</h2>
          </div>
          {charts.length > 4 ? (
            <Button variant="secondary" size="sm" onClick={() => setShowAllCharts((value) => !value)}>
              <BarChart3 className="h-3.5 w-3.5" />
              {showAllCharts ? "Réduire" : `Afficher les ${charts.length} graphiques`}
            </Button>
          ) : null}
        </div>
        {chartsQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[360px] rounded-xl lg:col-span-2" />
            <Skeleton className="h-[330px] rounded-xl" />
            <Skeleton className="h-[330px] rounded-xl" />
          </div>
        ) : chartsQuery.isError ? (
          <Card>
            <ErrorState
              message={chartsQuery.error instanceof Error ? chartsQuery.error.message : "Erreur inconnue."}
              onRetry={() => void chartsQuery.refetch()}
            />
          </Card>
        ) : visibleCharts.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleCharts.map((series, index) => (
              <div key={series.key} className={index === 0 ? "lg:col-span-2" : undefined}>
                <ChartCard series={series} />
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="Aucune donnée graphique"
              description="Les graphiques s'afficheront dès que des équipements, tickets, contrats ou budgets seront enregistrés."
            />
          </Card>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Échéances à venir</h2>
              <p className="mt-1 text-xs text-muted">Contrats, licences, projets, RGPD et certificats.</p>
            </div>
            <span className="rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary-strong">
              {deadlines.length}
            </span>
          </CardHeader>
          <CardContent className="pt-2">
            {cockpitQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-11 rounded-lg" />
                ))}
              </div>
            ) : deadlines.length > 0 ? (
              <div className="space-y-0.5">
                {deadlines.slice(0, 6).map((deadline) => (
                  <DeadlineRow key={`${deadline.kind}-${deadline.id}`} deadline={deadline} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Aucune échéance proche"
                description="Les échéances à 90 jours apparaîtront ici."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>

        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Alertes prioritaires</h2>
              <p className="mt-1 text-xs text-muted">Éléments nécessitant une attention immédiate.</p>
            </div>
            <span className="rounded-full border border-danger/30 bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
              {alerts.length}
            </span>
          </CardHeader>
          <CardContent className="pt-2">
            {alertsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : alertsQuery.isError ? (
              <ErrorState
                message={alertsQuery.error instanceof Error ? alertsQuery.error.message : "Erreur inconnue."}
                onRetry={() => void alertsQuery.refetch()}
                className="py-8"
              />
            ) : alerts.length > 0 ? (
              <div className="space-y-0.5">
                {alerts.slice(0, 6).map((alert) => (
                  <AlertRow key={`${alert.category}-${alert.id}`} alert={alert} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="Aucune alerte prioritaire"
                description="Les incidents critiques, pannes, échéances et retards apparaîtront ici."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>

        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Dernières activités</h2>
              <p className="mt-1 text-xs text-muted">Traçabilité des actions récentes.</p>
            </div>
            <Link
              to="/admin/audit"
              className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
            >
              Journal
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-2">
            {activityQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : activityQuery.isError ? (
              <ErrorState
                message={activityQuery.error instanceof Error ? activityQuery.error.message : "Erreur inconnue."}
                onRetry={() => void activityQuery.refetch()}
                className="py-8"
              />
            ) : activities.length > 0 ? (
              <div className="space-y-0.5">
                {activities.slice(0, 8).map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Activity}
                title="Aucune activité récente"
                description="Les connexions, créations et modifications seront journalisées ici."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
