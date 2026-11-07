import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Clock,
  FileClock,
  LifeBuoy,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ChartCard } from "@/features/dashboard/ChartCard";
import { KpiCard } from "@/features/dashboard/KpiCard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatRelative, humanize } from "@/lib/utils";
import type {
  ActivityItem,
  AlertItem,
  DashboardActivity,
  DashboardAlerts,
  DashboardCharts,
  DashboardSummary,
} from "@/types/api";

const alertIcons: Record<string, typeof ShieldAlert> = {
  security: ShieldAlert,
  assets: TriangleAlert,
  contracts: FileClock,
  actions: Clock,
  tickets: LifeBuoy,
};

const alertTones: Record<string, string> = {
  critical: "border-danger/20 bg-danger/10 text-danger",
  high: "border-warning/20 bg-warning/10 text-warning",
  medium: "border-info/20 bg-info/10 text-info",
};

function AlertRow({ alert }: { alert: AlertItem }) {
  const Icon = alertIcons[alert.category] ?? ShieldAlert;
  const tone = alertTones[alert.severity] ?? "border-border bg-surface-2 text-muted";
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-border-soft hover:bg-surface-2/60">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{alert.title}</span>
        {alert.detail ? <span className="mt-0.5 block text-[11px] leading-4 text-muted">{alert.detail}</span> : null}
      </span>
      {alert.link ? <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden="true" /> : null}
    </div>
  );
  return alert.link ? <Link to={alert.link}>{content}</Link> : content;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-border-soft hover:bg-surface-2/60">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-background-soft text-muted">
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

export function DashboardPage() {
  const { user } = useAuth();

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => apiFetch<DashboardSummary>("/dashboard/summary"),
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
    chartsQuery.isFetching ||
    alertsQuery.isFetching ||
    activityQuery.isFetching;

  const refreshAll = () => {
    void summaryQuery.refetch();
    void chartsQuery.refetch();
    void alertsQuery.refetch();
    void activityQuery.refetch();
  };

  const firstName = user?.first_name ? `, ${user.first_name}` : "";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Cockpit du système d'information"
        title={`Bonjour${firstName}`}
        description="Une lecture synthétique et actualisée du parc, des demandes, des contrats, du budget et des risques."
        actions={
          <>
            <span className="hidden text-[11px] text-muted-2 sm:inline">
              {summaryQuery.data ? `Actualisé ${formatDateTime(summaryQuery.data.generated_at)}` : "—"}
            </span>
            <Button variant="secondary" size="sm" onClick={refreshAll} loading={isRefreshing}>
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
          </>
        }
      />

      {summaryQuery.isError ? (
        <Card>
          <ErrorState
            message={summaryQuery.error instanceof Error ? summaryQuery.error.message : "Erreur inconnue."}
            onRetry={() => void summaryQuery.refetch()}
          />
        </Card>
      ) : summaryQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 13 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {summaryQuery.data?.kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {chartsQuery.isLoading ? (
          <>
            <Skeleton className="h-[330px] rounded-xl" />
            <Skeleton className="h-[330px] rounded-xl" />
          </>
        ) : chartsQuery.isError ? (
          <Card className="xl:col-span-2">
            <ErrorState
              message={chartsQuery.error instanceof Error ? chartsQuery.error.message : "Erreur inconnue."}
              onRetry={() => void chartsQuery.refetch()}
            />
          </Card>
        ) : chartsQuery.data && chartsQuery.data.series.length > 0 ? (
          chartsQuery.data.series.map((series) => <ChartCard key={series.key} series={series} />)
        ) : (
          <Card className="xl:col-span-2">
            <EmptyState
              icon={BarChart3}
              title="Aucune donnée graphique"
              description="Les graphiques s'afficheront dès que des équipements, tickets, contrats ou budgets seront enregistrés."
            />
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Alertes prioritaires</CardTitle>
              <CardDescription>Éléments nécessitant une attention immédiate.</CardDescription>
            </div>
            <span className="rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-danger">
              {alertsQuery.data?.items.length ?? 0}
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
            ) : alertsQuery.data && alertsQuery.data.items.length > 0 ? (
              <div className="space-y-0.5">
                {alertsQuery.data.items.map((alert) => <AlertRow key={`${alert.category}-${alert.id}`} alert={alert} />)}
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

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Dernières activités</CardTitle>
              <CardDescription>Traçabilité des actions récentes.</CardDescription>
            </div>
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
            ) : activityQuery.data && activityQuery.data.items.length > 0 ? (
              <div className="space-y-0.5">
                {activityQuery.data.items.slice(0, 8).map((item) => <ActivityRow key={item.id} item={item} />)}
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
      </div>
    </div>
  );
}
