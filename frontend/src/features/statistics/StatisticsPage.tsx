import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CalendarRange,
  Clock,
  Download,
  FileClock,
  FileSpreadsheet,
  FileText,
  Layers,
  LifeBuoy,
  MonitorSmartphone,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
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
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type {
  StatisticsOverview,
  StatsCommercial,
  StatsKpi,
  StatsPoint,
  SupplierItem,
} from "@/types/api";

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
  commercial_quotes: FileText,
  commercial_quotes_total: Wallet,
  commercial_conversion_rate: ArrowRightLeft,
  commercial_orders: ShoppingCart,
  commercial_engaged_total: ShoppingCart,
  commercial_delivered_total: PackageCheck,
  commercial_without_engagement: AlertTriangle,
  commercial_late_orders: Clock,
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
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  converted: "Converti",
  confirmed: "Confirmé",
  delivered: "Livré",
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  critical: "Critique",
};

const commercialStatusOptions: Record<string, { value: string; label: string }[]> = {
  quote: [
    { value: "draft", label: "Brouillon" },
    { value: "sent", label: "Envoyé" },
    { value: "accepted", label: "Accepté" },
    { value: "refused", label: "Refusé" },
    { value: "expired", label: "Expiré" },
    { value: "converted", label: "Converti" },
    { value: "cancelled", label: "Annulé" },
  ],
  purchase_order: [
    { value: "draft", label: "Brouillon" },
    { value: "sent", label: "Envoyé" },
    { value: "confirmed", label: "Confirmé" },
    { value: "delivered", label: "Livré" },
    { value: "cancelled", label: "Annulé" },
  ],
};

const palette = [
  "var(--color-primary-bright)",
  "var(--color-accent)",
  "var(--color-brand-green)",
  "var(--color-warning)",
  "var(--color-primary-strong)",
  "var(--color-info)",
  "var(--color-primary)",
];

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
            <stop offset="0%" stopColor="var(--color-primary-bright)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="stat-resolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--color-muted-2)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--color-muted-2)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--color-foreground)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: "var(--color-muted)" }} />
        <Area
          type="monotone"
          dataKey="Créés"
          stroke="var(--color-primary-strong)"
          strokeWidth={2}
          fill="url(#stat-created)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Résolus"
          stroke="var(--color-accent)"
          strokeWidth={2}
          fill="url(#stat-resolved)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="Clos"
          stroke="var(--color-brand-green)"
          strokeWidth={1.5}
          fill="transparent"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatisticsPage() {
  const { hasPermission } = useAuth();
  const { open: openAi } = useAiAssistant();
  const [tab, setTab] = useState<"overview" | "distributions" | "budget" | "achats">(
    "overview",
  );
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [range, setRange] = useState(() => defaultRange("month"));
  const [commercialKind, setCommercialKind] = useState("");
  const [commercialStatus, setCommercialStatus] = useState("");
  const [commercialSupplier, setCommercialSupplier] = useState("");
  const [commercialEngagement, setCommercialEngagement] = useState("");
  const [commercialSearch, setCommercialSearch] = useState("");

  useEffect(() => {
    setRange(defaultRange(granularity));
  }, [granularity]);

  const canReadCommercial = hasPermission("suppliers.read");
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
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "statistics"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    enabled: canReadCommercial && tab === "achats",
    staleTime: 120_000,
  });
  const commercialFilters = {
    start: range.start,
    end: range.end,
    granularity,
    kind: commercialKind || undefined,
    status: commercialStatus || undefined,
    supplier_id: commercialSupplier || undefined,
    with_engagement:
      commercialEngagement === "with"
        ? true
        : commercialEngagement === "without"
          ? false
          : undefined,
    q: commercialSearch.trim() || undefined,
  };
  const commercialQuery = useQuery({
    queryKey: ["statistics", "commercial", commercialFilters],
    queryFn: () =>
      apiFetch<StatsCommercial>(
        `/statistics/commercial${buildQuery(commercialFilters)}`,
      ),
    enabled: canReadCommercial && tab === "achats",
  });
  const suppliers = suppliersQuery.data ?? [];

  const overview = overviewQuery.data;
  const commercial = commercialQuery.data;
  const exportQuery = buildQuery({
    start: range.start,
    end: range.end,
    granularity,
  });
  const commercialExportQuery = buildQuery(commercialFilters);
  const commercialStatuses = commercialKind
    ? commercialStatusOptions[commercialKind] ?? []
    : [
        ...commercialStatusOptions.quote,
        ...commercialStatusOptions.purchase_order.filter(
          (option) =>
            !commercialStatusOptions.quote.some(
              (quoteOption) => quoteOption.value === option.value,
            ),
        ),
      ];

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
              onClick={() => {
                if (tab === "achats") {
                  const parts = [
                    `du ${formatDate(range.start)} au ${formatDate(range.end)}`,
                    commercialKind === "quote"
                      ? "uniquement les devis"
                      : commercialKind === "purchase_order"
                        ? "uniquement les bons de commande"
                        : "devis et bons de commande",
                    commercialStatus ? `statut ${statusLabels[commercialStatus] ?? commercialStatus}` : "",
                    commercialEngagement === "without"
                      ? "sans numéro d'engagement"
                      : commercialEngagement === "with"
                        ? "avec numéro d'engagement"
                        : "",
                  ].filter(Boolean);
                  openAi(
                    null,
                    `Analyse les achats ${parts.join(", ")}. Donne les points d'attention, les livraisons en retard, les devis à convertir et propose des actions concrètes.`,
                  );
                  return;
                }
                openAi(
                  null,
                  `Analyse les statistiques du ${formatDate(range.start)} au ${formatDate(range.end)} et propose une synthèse avec les points d'attention et les actions prioritaires.`,
                );
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyse IA
            </Button>
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
                <DropdownMenuItem
                  onSelect={() =>
                    window.open(
                      `/api/v1/exports/operations?${buildQuery({
                        start: range.start,
                        end: range.end,
                      })}`,
                      "_blank",
                    )
                  }
                >
                  <FileText className="h-3.5 w-3.5" />
                  Rapport d'exploitation (PDF)
                </DropdownMenuItem>
                {canReadCommercial ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() =>
                        window.open(
                          `/api/v1/exports/commercial-documents?format=xlsx&${commercialExportQuery}`,
                          "_blank",
                        )
                      }
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Achats filtrés (XLSX)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        window.open(
                          `/api/v1/exports/commercial-documents?format=pdf&${commercialExportQuery}`,
                          "_blank",
                        )
                      }
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Achats filtrés (PDF)
                    </DropdownMenuItem>
                  </>
                ) : null}
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

      <Tabs
        items={[
          { key: "overview", label: "Vue d'ensemble", icon: BarChart3 },
          { key: "distributions", label: "Répartitions", icon: Layers },
          { key: "budget", label: "Budget", icon: Wallet },
          { key: "achats", label: "Achats", icon: ShoppingCart },
        ]}
        value={tab}
        onChange={(value) =>
          setTab(value as "overview" | "distributions" | "budget" | "achats")
        }
      />

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
          {tab === "overview" ? (
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
            </>
          ) : null}

          {tab === "distributions" ? (
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
          ) : null}

          {tab === "budget" ? (
            overview.budget ? (
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
            ) : (
              <Card>
                <EmptyState
                  icon={Wallet}
                  title="Aucun exercice budgétaire"
                  description="Créez un budget pour afficher sa répartition dans les statistiques."
                />
              </Card>
            )
          ) : null}

          {tab === "achats" ? (
            !canReadCommercial ? (
              <Card>
                <EmptyState
                  icon={ShoppingCart}
                  title="Accès aux achats non autorisé"
                  description="Votre rôle ne permet pas de consulter les devis et bons de commande."
                />
              </Card>
            ) : commercialQuery.isError ? (
              <Card>
                <ErrorState
                  message={
                    commercialQuery.error instanceof Error
                      ? commercialQuery.error.message
                      : "Impossible de charger les statistiques d'achats."
                  }
                  onRetry={() => void commercialQuery.refetch()}
                />
              </Card>
            ) : commercialQuery.isLoading || !commercial ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="h-32 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-[280px] rounded-xl" />
              </>
            ) : (
              <>
                <Card className="panel-sheen border-primary/20 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                    <div className="flex-1">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                        Recherche
                      </p>
                      <Input
                        value={commercialSearch}
                        onChange={(event) => setCommercialSearch(event.target.value)}
                        placeholder="Référence, objet, engagement, fournisseur…"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                        Type
                      </p>
                      <Select
                        value={commercialKind}
                        onChange={(event) => {
                          setCommercialKind(event.target.value);
                          setCommercialStatus("");
                        }}
                        className="xl:w-44"
                      >
                        <option value="">Tous</option>
                        <option value="quote">Devis</option>
                        <option value="purchase_order">Bons de commande</option>
                      </Select>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                        Statut
                      </p>
                      <Select
                        value={commercialStatus}
                        onChange={(event) => setCommercialStatus(event.target.value)}
                        className="xl:w-44"
                      >
                        <option value="">Tous</option>
                        {commercialStatuses.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                        Fournisseur
                      </p>
                      <Select
                        value={commercialSupplier}
                        onChange={(event) => setCommercialSupplier(event.target.value)}
                        className="xl:w-52"
                      >
                        <option value="">Tous</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                        Engagement
                      </p>
                      <Select
                        value={commercialEngagement}
                        onChange={(event) => setCommercialEngagement(event.target.value)}
                        className="xl:w-48"
                      >
                        <option value="">Tous</option>
                        <option value="with">Avec engagement</option>
                        <option value="without">Sans engagement</option>
                      </Select>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] text-muted-2">
                    {commercial.documents.length} document(s) correspondant aux filtres,
                    du {formatDate(commercial.start)} au {formatDate(commercial.end)}.
                  </p>
                </Card>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
                  {commercial.kpis.map((kpi) => (
                    <StatKpiCard key={kpi.key} kpi={kpi} />
                  ))}
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <DistributionCard
                    title="Achats par statut"
                    description="Documents correspondant aux filtres."
                    points={commercial.by_status}
                  />
                  <Card className="panel-sheen border-primary/20">
                    <CardHeader>
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          Montant par fournisseur
                        </h2>
                        <p className="mt-1 text-xs text-muted">
                          Montants TTC des documents filtrés.
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-3">
                      {commercial.by_supplier.length === 0 ? (
                        <p className="py-4 text-center text-[11px] text-muted-2">
                          Aucun montant sur la période.
                        </p>
                      ) : (
                        commercial.by_supplier.slice(0, 10).map((point, index) => {
                          const max = Math.max(
                            1,
                            ...commercial.by_supplier.map((item) => item.value),
                          );
                          return (
                            <div key={`${point.label}-${index}`}>
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate text-muted">{point.label}</span>
                                <span className="shrink-0 font-medium text-foreground">
                                  {formatCurrency(point.value, 2)}
                                </span>
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
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="panel-sheen border-primary/20">
                  <CardHeader>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                        Détail
                      </p>
                      <h2 className="text-sm font-semibold text-foreground">
                        Devis et bons de commande
                      </h2>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `/api/v1/exports/commercial-documents?format=xlsx&${commercialExportQuery}`,
                            "_blank",
                          )
                        }
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        XLSX
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `/api/v1/exports/commercial-documents?format=pdf&${commercialExportQuery}`,
                            "_blank",
                          )
                        }
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[520px] overflow-auto pt-0">
                    {commercial.documents.length === 0 ? (
                      <EmptyState
                        icon={ShoppingCart}
                        title="Aucun document"
                        description="Aucun devis ou bon de commande ne correspond aux filtres."
                      />
                    ) : (
                      <table className="w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-surface">
                          <tr className="border-b border-border-soft text-[10px] uppercase tracking-wide text-muted-2">
                            <th className="py-2 pr-3 font-medium">Type</th>
                            <th className="py-2 pr-3 font-medium">Référence</th>
                            <th className="py-2 pr-3 font-medium">Objet</th>
                            <th className="py-2 pr-3 font-medium">Fournisseur</th>
                            <th className="py-2 pr-3 font-medium">Statut</th>
                            <th className="py-2 pr-3 font-medium">Date</th>
                            <th className="py-2 pr-3 font-medium">Échéance</th>
                            <th className="py-2 pr-3 font-medium">Engagement</th>
                            <th className="py-2 pr-3 text-right font-medium">TTC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercial.documents.map((document) => (
                            <tr
                              key={document.id}
                              className="border-b border-border-soft/60 last:border-0"
                            >
                              <td className="py-2 pr-3 text-muted">
                                {document.kind === "quote" ? "Devis" : "BC"}
                              </td>
                              <td className="py-2 pr-3 font-mono text-foreground">
                                {document.reference}
                              </td>
                              <td className="max-w-[220px] truncate py-2 pr-3 text-foreground">
                                {document.object}
                              </td>
                              <td className="py-2 pr-3 text-muted">{document.supplier}</td>
                              <td className="py-2 pr-3 text-muted">
                                {statusLabels[document.status] ?? document.status}
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3 text-muted">
                                {formatDate(document.issue_date)}
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3 text-muted">
                                {document.due_date ? formatDate(document.due_date) : "—"}
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                {document.engagement_number ? (
                                  <span className="text-foreground">
                                    {document.engagement_number}
                                  </span>
                                ) : (
                                  <span className="text-danger">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3 text-right text-foreground">
                                {document.amount_ttc != null
                                  ? formatCurrency(document.amount_ttc, 2)
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
