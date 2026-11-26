import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Info,
  LifeBuoy,
  RefreshCw,
  Server,
  ShoppingCart,
  Sparkles,
  Users,
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
import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type { DashboardToday, TodayItem } from "@/types/api";

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage quotidien"
        title="Aujourd'hui"
        description="Les actions à traiter en priorité, tous modules confondus."
        actions={
          <>
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
