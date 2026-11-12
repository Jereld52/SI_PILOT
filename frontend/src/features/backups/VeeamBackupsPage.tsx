import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  DatabaseBackup,
  HardDrive,
  ListChecks,
  RefreshCw,
  ServerCog,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber, formatRelative, humanize } from "@/lib/utils";
import type { VeeamOverview, VeeamRepository, VeeamSession } from "@/types/api";

type TabKey = "jobs" | "sessions" | "repositories";

function resultTone(value: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (value.toLowerCase()) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "failed":
      return "danger";
    case "working":
    case "running":
    case "inprogress":
      return "info";
    default:
      return "neutral";
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes} min ${remaining.toString().padStart(2, "0")} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${(minutes % 60).toString().padStart(2, "0")} min`;
}

function formatBytes(value: number | null | undefined): string {
  if (value == null) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To", "Po"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${formatNumber(size, size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: typeof DatabaseBackup;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "border-border-soft bg-surface-2/40 text-muted",
    success: "border-success/20 bg-success/[0.07] text-success",
    warning: "border-warning/20 bg-warning/[0.07] text-warning",
    danger: "border-danger/20 bg-danger/[0.07] text-danger",
    info: "border-info/20 bg-info/[0.07] text-info",
  };
  return (
    <div className="rounded-xl border border-border-soft bg-surface-1/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-2">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md border", toneClasses[tone])}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-2">{hint}</p> : null}
    </div>
  );
}

function RepositoryBar({ repository }: { repository: VeeamRepository }) {
  if (repository.free_percent == null) {
    return <span className="text-[11px] text-muted-2">—</span>;
  }
  const free = repository.free_percent;
  const tone = free < 10 ? "bg-danger" : free < 20 ? "bg-warning" : "bg-success";
  return (
    <div className="min-w-24 space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(free, 2)}%` }} />
      </div>
      <span className="text-[10px] text-muted-2">{formatNumber(free, 1)} % libre</span>
    </div>
  );
}

function SessionRow({ session }: { session: VeeamSession }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-[11px] text-muted">
        {formatDateTime(session.creation_time)}
        <span className="ml-1 text-[10px] text-muted-2">({formatRelative(session.creation_time)})</span>
      </TableCell>
      <TableCell className="text-[11px] text-foreground">
        {session.job_name || session.name || "—"}
      </TableCell>
      <TableCell className="text-[11px] text-muted">{humanize(session.session_type)}</TableCell>
      <TableCell>
        <Badge tone={resultTone(session.result || session.state)}>
          {humanize(session.result || session.state)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-[11px] text-muted">
        {formatDuration(session.duration_seconds)}
      </TableCell>
      <TableCell className="max-w-[320px] truncate text-[11px] text-danger" title={session.message ?? ""}>
        {session.message ?? "—"}
      </TableCell>
    </TableRow>
  );
}

export function VeeamBackupsPage() {
  const { hasPermission } = useAuth();
  const canConfigure = hasPermission("admin.settings.read");
  const [tab, setTab] = useState<TabKey>("jobs");
  const [refreshToken, setRefreshToken] = useState(0);

  const overviewQuery = useQuery({
    queryKey: ["veeam", "overview", refreshToken],
    queryFn: () =>
      apiFetch<VeeamOverview>(`/veeam/overview${refreshToken > 0 ? "?refresh=true" : ""}`),
    retry: false,
  });

  const overview = overviewQuery.data;
  const summary = overview?.summary ?? {};
  const jobs = overview?.jobs ?? [];
  const sessions = overview?.sessions ?? [];
  const repositories = overview?.repositories ?? [];

  const numberValue = (key: string): number => {
    const value = summary[key];
    return typeof value === "number" ? value : Number(value ?? 0) || 0;
  };

  const alerts = [
    ...jobs
      .filter((job) => ["failed", "warning"].includes(job.last_result.toLowerCase()))
      .map((job) => ({
        key: `job-${job.id}`,
        tone: job.last_result.toLowerCase() === "failed" ? ("danger" as const) : ("warning" as const),
        title: job.name,
        message: job.last_message || `Dernier résultat : ${humanize(job.last_result)}`,
        date: job.last_session_at,
      })),
    ...repositories
      .filter((repository) => repository.free_percent != null && repository.free_percent < 15)
      .map((repository) => ({
        key: `repo-${repository.id}`,
        tone: "warning" as const,
        title: `Dépôt ${repository.name}`,
        message: `Espace libre faible : ${formatNumber(repository.free_percent ?? 0, 1)} %.`,
        date: null as string | null,
      })),
  ];

  if (overviewQuery.isError) {
    const message =
      overviewQuery.error instanceof ApiError
        ? overviewQuery.error.message
        : overviewQuery.error instanceof Error
          ? overviewQuery.error.message
          : "Erreur inconnue.";
    const notConfigured =
      message.includes("pas configurée") ||
      message.includes("désactivée") ||
      message.includes("configurée");
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Infrastructure"
          title="Sauvegardes Veeam"
          description="Jobs, sessions et dépôts de Veeam Backup & Replication 12."
        />
        <Card>
          <ErrorState
            title={notConfigured ? "Connexion Veeam à configurer" : "Veeam injoignable"}
            message={message}
            onRetry={() => void overviewQuery.refetch()}
          />
          {canConfigure ? (
            <div className="flex justify-center pb-6">
              <Link
                to="/admin/veeam"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <ServerCog className="h-3.5 w-3.5" />
                Configurer la connexion Veeam
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Infrastructure"
        title="Sauvegardes Veeam"
        description="Consultation en lecture seule des jobs, sessions et dépôts Veeam Backup & Replication."
        actions={
          <>
            <Button
              variant="secondary"
              loading={overviewQuery.isFetching}
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
            {canConfigure ? (
              <Link
                to="/admin/veeam"
                className={buttonVariants({ variant: "ghost", size: "md" })}
              >
                <ServerCog className="h-3.5 w-3.5" />
                Connexion
              </Link>
            ) : null}
          </>
        }
      />

      {overviewQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              icon={DatabaseBackup}
              label="Jobs"
              value={formatNumber(numberValue("jobs"))}
              hint={`Dernière session ${formatRelative(
                typeof summary.last_session_at === "string" ? summary.last_session_at : null,
              )}`}
              tone="info"
            />
            <SummaryTile
              icon={CheckCircle2}
              label="Dernier run réussi"
              value={formatNumber(numberValue("success_jobs"))}
              hint={`${formatNumber(numberValue("sessions"))} session(s) analysée(s)`}
              tone="success"
            />
            <SummaryTile
              icon={AlertTriangle}
              label="Avertissements"
              value={formatNumber(numberValue("warning_jobs"))}
              hint={`${formatNumber(numberValue("failed_sessions"))} session(s) en échec`}
              tone="warning"
            />
            <SummaryTile
              icon={XCircle}
              label="Jobs en échec"
              value={formatNumber(numberValue("failed_jobs"))}
              hint={`${formatNumber(numberValue("repositories"))} dépôt(s)`}
              tone={numberValue("failed_jobs") > 0 ? "danger" : "neutral"}
            />
          </div>

          {alerts.length > 0 || (overview?.notes.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Points d'attention</h2>
                  <p className="mt-1 text-xs text-muted">
                    Échecs, avertissements et capacité des dépôts.
                  </p>
                </div>
                <Badge tone={alerts.length > 0 ? "warning" : "neutral"}>
                  {alerts.length} alerte(s)
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.key}
                    className={cn(
                      "flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]",
                      alert.tone === "danger"
                        ? "border-danger/25 bg-danger/[0.07] text-danger"
                        : "border-warning/25 bg-warning/[0.07] text-warning",
                    )}
                  >
                    <div>
                      <p className="font-semibold">{alert.title}</p>
                      <p className="mt-0.5 text-[10px] opacity-90">{alert.message}</p>
                    </div>
                    {alert.date ? (
                      <span className="text-[10px] opacity-80">{formatDateTime(alert.date)}</span>
                    ) : null}
                  </div>
                ))}
                {(overview?.notes ?? []).map((note) => (
                  <div
                    key={note}
                    className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] text-info"
                  >
                    {note}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Tabs
            items={[
              { key: "jobs", label: "Jobs", icon: ListChecks, count: jobs.length },
              { key: "sessions", label: "Sessions", icon: Clock3, count: sessions.length },
              { key: "repositories", label: "Dépôts", icon: HardDrive, count: repositories.length },
            ]}
            value={tab}
            onChange={(value) => setTab(value as TabKey)}
          />

          {tab === "jobs" ? (
            <Card>
              <CardContent className="p-0">
                {jobs.length === 0 ? (
                  <EmptyState
                    icon={DatabaseBackup}
                    title="Aucun job"
                    description="Veeam n'a renvoyé aucun job de sauvegarde."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dernier résultat</TableHead>
                        <TableHead>Dernière session</TableHead>
                        <TableHead>Durée</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="text-[11px] font-medium text-foreground">
                            {job.name}
                            {job.disabled ? (
                              <Badge tone="neutral" className="ml-2">
                                Désactivé
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted">{humanize(job.type)}</TableCell>
                          <TableCell>
                            <Badge tone={resultTone(job.last_result)}>
                              {job.last_result ? humanize(job.last_result) : "Jamais exécuté"}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[11px] text-muted">
                            {formatDateTime(job.last_session_at)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[11px] text-muted">
                            {formatDuration(job.last_duration_seconds)}
                          </TableCell>
                          <TableCell
                            className="max-w-[320px] truncate text-[11px] text-danger"
                            title={job.last_message ?? ""}
                          >
                            {job.last_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "sessions" ? (
            <Card>
              <CardContent className="p-0">
                {sessions.length === 0 ? (
                  <EmptyState
                    icon={Clock3}
                    title="Aucune session"
                    description="Aucune session de sauvegarde n'a été trouvée."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Résultat</TableHead>
                        <TableHead>Durée</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => (
                        <SessionRow key={session.id} session={session} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "repositories" ? (
            <Card>
              <CardContent className="p-0">
                {repositories.length === 0 ? (
                  <EmptyState
                    icon={Database}
                    title="Aucun dépôt lisible"
                    description="Le compte Veeam n'a pas accès aux dépôts, ou aucun dépôt n'est configuré."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dépôt</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Emplacement</TableHead>
                        <TableHead>Capacité</TableHead>
                        <TableHead>Libre</TableHead>
                        <TableHead>Occupation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repositories.map((repository) => (
                        <TableRow key={repository.id}>
                          <TableCell className="text-[11px] font-medium text-foreground">
                            {repository.name}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted">
                            {humanize(repository.type)}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-[11px] text-muted" title={`${repository.host} ${repository.path}`}>
                            {[repository.host, repository.path].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[11px] text-muted">
                            {formatBytes(repository.capacity_bytes)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[11px] text-muted">
                            {formatBytes(repository.free_bytes)}
                          </TableCell>
                          <TableCell>
                            <RepositoryBar repository={repository} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <p className="text-[10px] leading-4 text-muted-2">
            Données en lecture seule, mises en cache quelques minutes pour limiter les appels à
            Veeam. Dernière récupération :{" "}
            {overview?.generated_at ? formatDateTime(overview.generated_at) : "—"}.
          </p>
        </>
      )}
    </div>
  );
}
