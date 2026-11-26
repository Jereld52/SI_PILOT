import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileWarning,
  MapPin,
  Network,
  RefreshCw,
  ShoppingCart,
  UserCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { DataQualityItem, DataQualityOverview } from "@/types/api";

const sectionIcons: Record<string, LucideIcon> = {
  purchase_order_engagement: ShoppingCart,
  contract_end_date: FileWarning,
  asset_location: MapPin,
  asset_assignment: UserCheck,
  asset_duplicate_ip: Network,
  asset_duplicate_mac: Wifi,
  import_errors: FileWarning,
  import_pending: Clock,
};

const severityLabels: Record<string, string> = {
  danger: "Critique",
  warning: "À corriger",
  info: "À vérifier",
};

const severityTones: Record<string, "danger" | "warning" | "info" | "success"> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

function QualityRow({ item }: { item: DataQualityItem }) {
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
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-foreground">{item.title}</p>
          <Badge tone={severityTones[item.severity] ?? "neutral"}>
            {severityLabels[item.severity] ?? item.severity}
          </Badge>
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

export function DataQualityPage() {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const query = useQuery({
    queryKey: ["data-quality", "overview"],
    queryFn: () => apiFetch<DataQualityOverview>("/data-quality/overview"),
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
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const critical = sections.reduce((sum, section) => sum + section.critical, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage"
        title="Qualité des données"
        description="Anomalies à corriger pour fiabiliser le parc, les achats, les contrats et les imports."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        }
      />

      {query.isError ? (
        <Card>
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "Impossible de charger le contrôle qualité."
            }
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : query.isLoading || !data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-xl" />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="panel-sheen border-primary/20 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">
                Anomalies détectées
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
                Critiques
              </p>
              <p className="mt-1 text-3xl font-semibold text-danger">
                {formatNumber(critical)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                À corriger en priorité
              </p>
            </Card>
            <Card className="panel-sheen border-primary/20 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">
                Catégories
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {formatNumber(sections.length)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                Types d’anomalies distincts
              </p>
            </Card>
          </div>

          {sections.length === 0 ? (
            <Card>
              <EmptyState
                icon={CheckCircle2}
                title="Aucune anomalie détectée"
                description="Les contrôles de qualité ne remontent rien pour le moment. Actualise après de nouvelles saisies."
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {sections.map((section) => {
                const Icon = sectionIcons[section.key] ?? ClipboardCheck;
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
                            {section.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {section.critical > 0 ? (
                          <Badge tone="danger">{section.critical} critique(s)</Badge>
                        ) : null}
                        <Badge tone="neutral">
                          {section.items.length < section.total
                            ? `${section.items.length} / ${section.total}`
                            : section.total}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5 pt-0">
                      {section.items.map((item) => (
                        <QualityRow key={item.id} item={item} />
                      ))}
                      {section.items.length < section.total ? (
                        <p className="px-2 pt-1 text-[9px] text-muted-2">
                          {section.total - section.items.length} anomalie(s) supplémentaire(s)
                          non affichée(s).
                        </p>
                      ) : null}
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
