import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarRange,
  Clock,
  Download,
  FileClock,
  FileSpreadsheet,
  FileText,
  LifeBuoy,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  Target,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { StatisticsOverview, StatsKpi, StatsPoint } from "@/types/api";

type Granularity = "day" | "week" | "month" | "year";

const granularityLabels: Record<Granularity, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  year: "Année",
};

const kpiIcons: Record<string, LucideIcon> = {
  tickets_created: LifeBuoy,
  tickets_open: Clock,
  resolution_hours: Clock,
  sla_rate: Target,
  interventions_done: Wrench,
  assets_total: MonitorSmartphone,
  contracts_expiring: FileClock,
  security_incidents: ShieldAlert,
  budget_engaged: Wallet,
  budget_available: Wallet,
  documents_published: BookOpen,
};

const kpiTones: Record<string, string> = {
  danger: "border-l-danger/70 text-danger",
  warning: "border-l-warning/70 text-warning",
  success: "border-l-success/70 text-success",
  neutral: "border-l-primary/70 text-foreground",
};

const statusLabels: Record<string, string> = {
  in_service: "En service",
  in_stock: "En stock",
  maintenance: "Maintenance",
  broken: "En panne",
  to_renew: "À renouveler",
  retired: "Réformé",
  active: "Actif",
  expiring: "Échéance proche",
  expired: "Expiré",
  terminated: "Résilié",
  draft: "Brouillon",
  voted: "Voté",
  closed: "Clos",
  planned: "Planifié",
  in_progress: "En cours",
  on_hold: "En pause",
  done: "Terminé",
  cancelled: "Annulé",
  idea: "Idée",
  todo: "À faire",
  blocked: "Bloquée",
  open: "Ouvert",
  investigating: "Investigation",
  contained: "Contenu",
  published: "Publié",
  archived: "Archivé",
  suspended: "Suspendu",
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  critical: "Critique",
};

const palette = ["#a84349", "#cdc97e", "#8cc46a", "#f6db43", "#d59a9d", "#4a8a33", "#7f2f34"];

function iso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange(granularity: Granularity): { start: string; end: string } {
  const today = new Date();
  if (granularity === "day") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { start: iso(start), end: iso(today) };
  }
  if (granularity === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 7 * 11);
    return { start: iso(start), end: iso(today) };
  }
  if (granularity === "month") {
    return { start: iso(new Date(today.getFullYear(), 0, 1)), end: iso(today) };
  }
  return { start: iso(new Date(today.getFullYear() - 4, 0, 1)), end: iso(today) };
}

function kpiValue(kpi: StatsKpi): string {
  if (kpi.unit === "EUR") return formatCurrency(kpi.value, 0);
  if (kpi.unit === "%") return `${formatNumber(kpi.value, 1)} %`;
  if (kpi.unit === "h") return `${formatNumber(kpi.value, 1)} h`;
  return formatNumber(kpi.value, Number.isInteger(kpi.value) ? 0 : 1);
}

function StatKpiCard({ kpi }: { kpi: StatsKpi }) {
  const Icon = kpiIcons[kpi.key] ?? FileText;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border-soft border-l-2 bg-surface/70 p-3.5 shadow-card",
        kpiTones[kpi.severity] ?? kpiTones.neutral,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border-soft bg-background/40">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="rounded-md border border-border-soft bg-background/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-2">
          {kpi.unit ?? "valeur"}
        </span>
      </div>
      <p className="mt-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-2">{kpi.label}</p>
      <p className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">{kpiValue(kpi)}</p>
      {kpi.hint ? <p className="mt-1 text-[10px] leading-4 text-muted-2">{kpi.hint}</p> : null}
    </div>
  );
}

function DistributionCard({
  title,
  description,
  points,
  labels = statusLabels,
}: {
  title: string;
  description?: string;
  points: StatsPoint[];
  labels?: Record<string, string>;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <Card className="panel-sheen border-primary/20">
      <CardHeader>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        <span className="rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary-strong">
          {formatNumber(points.reduce((sum, point) => sum + point.value, 0))}
        </span>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        {points.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-2">Aucune donnée sur la période.</p>
        ) : (
          points.slice(0, 8).map((point, index) => (
            <div key={`${point.label}-${index}`}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-muted">{labels[point.label] ?? point.label}</span>
                <span className="shrink-0 font-medium text-foreground">{formatNumber(point.value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, (point.value / max) * 100)}%`,
                    backgroundColor: point.color ?? palette[index % palette.length],
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ActivityChart({ overview }: { overview: StatisticsOverview }) {
  const data = overview.ticket_periods.map((point) => ({
    label: point.label,
    Créés: point.created,
    Résolus: point.resolved,
    Clos: point.closed,
    Interventions: overview.intervention_periods.find((item) => item.key === point.key)?.created ?? 0,
  }));
  if (data.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Aucune activité"
        description="Aucun ticket sur la période sélectionnée."
      />
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="stat-created" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a84349" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#772b2f" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="stat-resolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cdc97e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#cdc97e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#29372f" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#8b887c", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#8b887c", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#241416",
            border: "1px solid #772b2f",
            borderRadius: 8,
            fontSize: 11,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: "#b9b5a6" }} />
        <Area
          type="monotone"
          dataKey="Créés"
          stroke="#e0b1b4"
          strokeWidth={2}
          fill="url(#stat-created)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Résolus"
          stroke="#cdc97e"
          strokeWidth={2}
          fill="url(#stat-resolved)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Clos"
          stroke="#8cc46a"
          strokeWidth={1.5}
          fill="transparent"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatisticsPage() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [range, setRange] = useState(() => defaultRange("month"));

  useEffect(() => {
    setRange(defaultRange(granularity));
  }, [granularity]);

  const overviewQuery = useQuery({
    queryKey: ["statistics", "overview", granularity, range.start, range.end],
    queryFn: () =>
      apiFetch<StatisticsOverview>(
        `/statistics/overview${buildQuery({
          start: range.start,
          end: range.end,
          granularity,
        })}`,
      ),
  });

  const overview = overviewQuery.data;
  const exportQuery = buildQuery({
    start: range.start,
    end: range.end,
    granularity,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analyse et pilotage"
        title="Statistiques consolidées"
        description="Tickets, interventions, parc, contrats, budget, sécurité, projets, téléphonie et documentation."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void overviewQuery.refetch()}
              loading={overviewQuery.isFetching}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    window.open(`/api/v1/exports/statistics?format=xlsx&${exportQuery}`, "_blank")
                  }
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel complet (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    window.open(`/api/v1/exports/statistics?format=pdf&${exportQuery}`, "_blank")
                  }
                >
                  <FileText className="h-3.5 w-3.5" />
                  Rapport PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Card className="panel-sheen border-primary/20 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Période</p>
            <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background/40 p-1">
              {(Object.keys(granularityLabels) as Granularity[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setGranularity(item)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    granularity === item
                      ? "bg-primary text-brand-cream"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {granularityLabels[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">Du</p>
              <Input
                type="date"
                value={range.start}
                onChange={(event) => setRange((value) => ({ ...value, start: event.target.value }))}
                className="w-40"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">Au</p>
              <Input
                type="date"
                value={range.end}
                onChange={(event) => setRange((value) => ({ ...value, end: event.target.value }))}
                className="w-40"
              />
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary-strong">
              Granularité {granularityLabels[granularity].toLowerCase()}
            </div>
          </div>
        </div>
      </Card>

      {overviewQuery.isError ? (
        <Card>
          <ErrorState
            message={
              overviewQuery.error instanceof Error ? overviewQuery.error.message : "Erreur inconnue."
            }
            onRetry={() => void overviewQuery.refetch()}
          />
        </Card>
      ) : overviewQuery.isLoading || !overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-xl" />
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {overview.kpis.map((kpi) => (
              <StatKpiCard key={kpi.key} kpi={kpi} />
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <Card className="panel-sheen border-primary/20">
              <CardHeader>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Tickets</p>
                  <h2 className="text-sm font-semibold text-foreground">Activité sur la période</h2>
                  <p className="mt-1 text-xs text-muted">
                    Créations, résolutions et clôtures par {granularityLabels[granularity].toLowerCase()}.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <ActivityChart overview={overview} />
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="panel-sheen border-primary/20">
                <CardHeader>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Interventions</h2>
                    <p className="mt-1 text-xs text-muted">Créées et terminées par période.</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-3">
                  {overview.intervention_periods.slice(-6).reverse().map((point) => (
                    <div key={point.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">{point.label}</span>
                      <span className="text-foreground">
                        {point.created} créée(s) · {point.resolved} terminée(s)
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="panel-sheen border-primary/20">
                <CardHeader>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Sécurité</h2>
                    <p className="mt-1 text-xs text-muted">Incidents détectés et clos.</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-3">
                  {overview.security_periods.slice(-6).reverse().map((point) => (
                    <div key={point.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">{point.label}</span>
                      <span className="text-foreground">
                        {point.created} détecté(s) · {point.closed} clos
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <section>
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Répartitions</p>
              <h2 className="text-base font-semibold text-foreground">Vue par module</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DistributionCard
                title="Tickets par statut"
                description="Tickets créés sur la période."
                points={overview.tickets_by_status}
                labels={{}}
              />
              <DistributionCard
                title="Tickets par priorité"
                points={overview.tickets_by_priority}
                labels={{}}
              />
              <DistributionCard
                title="Tickets par catégorie"
                points={overview.tickets_by_category}
                labels={{}}
              />
              <DistributionCard
                title="Tickets par assigné"
                points={overview.tickets_by_assignee}
                labels={{}}
              />
              <DistributionCard
                title="Parc par état"
                points={overview.assets_by_status}
                description="Photographie actuelle du parc."
              />
              <DistributionCard
                title="Parc par catégorie"
                points={overview.assets_by_category}
              />
              <DistributionCard
                title="Interventions par statut"
                points={overview.interventions_by_status}
              />
              <DistributionCard
                title="Contrats par statut"
                points={overview.contracts_by_status}
              />
              <DistributionCard
                title="Projets par statut"
                points={overview.projects_by_status}
              />
              <DistributionCard
                title="Sécurité par gravité"
                points={overview.security_by_severity}
              />
              <DistributionCard
                title="Téléphonie par statut"
                points={overview.mobile_by_status}
                labels={{}}
              />
              <DistributionCard
                title="Documents par statut"
                points={overview.documents_by_status}
              />
            </div>
          </section>

          {overview.budget ? (
            <Card className="panel-sheen border-primary/20">
              <CardHeader>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Budget</p>
                  <h2 className="text-sm font-semibold text-foreground">
                    Exercice {overview.budget.year} — {statusLabels[overview.budget.status] ?? overview.budget.status}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3 text-right text-[11px]">
                  <span className="text-muted">
                    Voté <span className="ml-1 font-semibold text-foreground">{formatCurrency(overview.budget.voted, 0)}</span>
                  </span>
                  <span className="text-muted">
                    Engagé <span className="ml-1 font-semibold text-warning">{formatCurrency(overview.budget.committed, 0)}</span>
                  </span>
                  <span className="text-muted">
                    Disponible{" "}
                    <span className={cn("ml-1 font-semibold", overview.budget.available < 0 ? "text-danger" : "text-success")}>
                      {formatCurrency(overview.budget.available, 0)}
                    </span>
                  </span>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto pt-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-soft text-[10px] uppercase tracking-wide text-muted-2">
                      <th className="py-2 pr-4 font-medium">Catégorie</th>
                      <th className="py-2 pr-4 text-right font-medium">Voté</th>
                      <th className="py-2 pr-4 text-right font-medium">Engagé</th>
                      <th className="py-2 text-right font-medium">Facturé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.budget.categories.map((category) => (
                      <tr key={category.label} className="border-b border-border-soft/60 last:border-0">
                        <td className="py-2 pr-4 text-foreground">{category.label}</td>
                        <td className="py-2 pr-4 text-right text-muted">{formatCurrency(category.voted, 0)}</td>
                        <td className="py-2 pr-4 text-right text-warning">{formatCurrency(category.committed, 0)}</td>
                        <td className="py-2 text-right text-info">{formatCurrency(category.invoiced, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
