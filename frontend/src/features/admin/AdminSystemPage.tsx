import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CircleAlert,
  Download,
  HardDrive,
  Info,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { ApiError, apiFetch } from "@/lib/api";
import type { AboutData, DiagnosticCheck, DiagnosticsData } from "@/types/api";

const TABS = [
  { key: "diagnostic", label: "Diagnostic", icon: Activity },
  { key: "about", label: "À propos", icon: Info },
  { key: "updates", label: "Mises à jour", icon: RefreshCw },
];

const CHECK_TONES: Record<DiagnosticCheck["status"], "success" | "warning" | "danger" | "info"> = {
  ok: "success",
  warning: "warning",
  error: "danger",
  info: "info",
};

const CHECK_LABELS: Record<DiagnosticCheck["status"], string> = {
  ok: "OK",
  warning: "À surveiller",
  error: "Erreur",
  info: "Information",
};

function formatBytes(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR");
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-soft/60 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-2">{label}</span>
      <span className={`min-w-0 break-words text-right text-[11px] text-foreground ${mono ? "font-mono text-[10px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function CheckList({ checks }: { checks: DiagnosticCheck[] }) {
  return (
    <div className="space-y-1.5">
      {checks.map((check) => (
        <div
          key={check.key}
          className="flex items-start justify-between gap-3 rounded-lg border border-border-soft bg-background-soft/40 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground">{check.label}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-2">{check.detail}</p>
          </div>
          <Badge tone={CHECK_TONES[check.status]}>{CHECK_LABELS[check.status]}</Badge>
        </div>
      ))}
    </div>
  );
}

export function AdminSystemPage() {
  const [tab, setTab] = useState("diagnostic");

  const diagnosticsQuery = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => apiFetch<DiagnosticsData>("/admin/diagnostics"),
    staleTime: 30_000,
  });
  const aboutQuery = useQuery({
    queryKey: ["admin-about"],
    queryFn: () => apiFetch<AboutData>("/admin/about"),
    staleTime: 5 * 60_000,
  });

  const data = diagnosticsQuery.data;
  const about = aboutQuery.data;

  const counts = useMemo(
    () => [
      { key: "users", label: "Comptes" },
      { key: "agents", label: "Agents" },
      { key: "assets", label: "Équipements" },
      { key: "infrastructure", label: "Infra" },
      { key: "tickets", label: "Tickets" },
      { key: "open_tickets", label: "Tickets ouverts" },
      { key: "upcoming_reservations", label: "Réservations à venir" },
    ],
    [],
  );

  const refresh = () => {
    void diagnosticsQuery.refetch();
    void aboutQuery.refetch();
    toast.success("Diagnostic actualisé.");
  };

  const downloadReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagnostic-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (diagnosticsQuery.isError) {
    return (
      <Card>
        <ErrorState
          message={
            diagnosticsQuery.error instanceof ApiError
              ? diagnosticsQuery.error.message
              : "Impossible de charger le diagnostic."
          }
          onRetry={() => void diagnosticsQuery.refetch()}
        />
      </Card>
    );
  }

  if (diagnosticsQuery.isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const errorCount = data.security.checks.filter((check) => check.status === "error").length;
  const warningCount = data.security.checks.filter((check) => check.status === "warning").length;
  const overallTone = errorCount > 0 ? "danger" : warningCount > 0 ? "warning" : "success";
  const overallLabel = errorCount > 0 ? "Action requise" : warningCount > 0 ? "À surveiller" : "Système sain";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={TABS} value={tab} onChange={setTab} />
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadReport}>
            <Download className="h-3.5 w-3.5" />
            Rapport JSON
          </Button>
        </div>
      </div>

      {tab === "diagnostic" ? (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-primary/10 text-primary-strong">
                  <ServerCog className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    État général : <span className="text-foreground">{overallLabel}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {data.application.name} {data.application.version} · {data.application.environment} ·
                    dernier contrôle {formatDate(data.generated_at)}
                  </p>
                </div>
              </div>
              <Badge tone={overallTone}>{overallLabel}</Badge>
            </CardContent>
          </Card>

          {data.warnings.length > 0 ? (
            <Card className="border-warning/20 bg-warning/[0.04]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <CircleAlert className="h-4 w-4" />
                  Points d'attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {data.warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-2 text-[11px] leading-5 text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                  Application
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Nom" value={data.application.name} />
                <InfoRow label="Version" value={data.application.version} mono />
                <InfoRow label="Environnement" value={data.application.environment} />
                <InfoRow label="Python" value={data.application.python} mono />
                <InfoRow label="Démarrée le" value={formatDate(data.application.started_at)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-accent" />
                  Base de données
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="État" value={data.database.status === "ok" ? "Connectée" : "Indisponible"} />
                <InfoRow label="Moteur" value={data.database.dialect} mono />
                <InfoRow label="Taille" value={formatBytes(data.database.size_bytes)} />
                <InfoRow label="Migration" value={data.database.migration_current ?? "—"} mono />
                <InfoRow label="Attendue" value={data.database.migration_head ?? "—"} mono />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-accent" />
                  Stockage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Dossier" value={data.storage.path} mono />
                <InfoRow label="Écriture" value={data.storage.writable ? "Autorisée" : "Refusée"} />
                <InfoRow label="Fichiers" value={formatBytes(data.storage.uploads_bytes)} />
                <InfoRow label="Libre" value={formatBytes(data.storage.free_bytes)} />
                <InfoRow label="Total" value={formatBytes(data.storage.total_bytes)} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>SMTP</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Configuré" value={data.smtp.configured ? "Oui" : "Non"} />
                <InfoRow label="Envoi actif" value={data.smtp.enabled ? "Oui" : "Non"} />
                <InfoRow label="Expéditeur" value={data.smtp.from_email || "—"} mono />
                <InfoRow label="Dernier statut" value={data.smtp.last_status ?? "—"} />
                <InfoRow label="Dernier envoi" value={formatDate(data.smtp.last_sent_at)} />
                {data.smtp.last_error ? (
                  <p className="mt-2 rounded-md border border-danger/20 bg-danger/[0.05] px-2 py-1.5 text-[10px] text-danger">
                    {data.smtp.last_error}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WAPT</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Configuré" value={data.wapt.configured ? "Oui" : "Non"} />
                <InfoRow label="Actif" value={data.wapt.enabled ? "Oui" : "Non"} />
                <InfoRow label="Serveur" value={data.wapt.base_url || "—"} mono />
                <InfoRow label="Dernière synchro" value={formatDate(data.wapt.last_sync_at)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LDAP / AD</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Configuré" value={data.ldap.configured ? "Oui" : "Non"} />
                <InfoRow label="Actif" value={data.ldap.enabled ? "Oui" : "Non"} />
                <InfoRow label="Serveur" value={data.ldap.url || "—"} mono />
                <InfoRow label="Dernière synchro" value={formatDate(data.ldap.last_sync_at)} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  Contrôles de sécurité et d'exploitation
                </CardTitle>
                <CardDescription>
                  Vérifications non intrusives. Aucun secret n'est affiché.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CheckList checks={data.security.checks} />
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Sauvegardes</CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label="Dossier" value={data.backup.directory} mono />
                  <InfoRow label="Nombre" value={String(data.backup.count)} />
                  <InfoRow label="Dernière" value={formatDate(data.backup.last_backup_at)} />
                  <InfoRow label="Fichier" value={data.backup.last_backup_name ?? "—"} mono />
                  <InfoRow label="Taille" value={formatBytes(data.backup.last_backup_size)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Volumétrie</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {counts.map((item) => (
                    <div key={item.key} className="rounded-lg border border-border-soft bg-background-soft/40 px-2.5 py-2">
                      <p className="text-[10px] text-muted-2">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground">{data.counts[item.key] ?? 0}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      {tab === "about" ? (
        aboutQuery.isError ? (
          <Card>
            <ErrorState
              message={
                aboutQuery.error instanceof ApiError
                  ? aboutQuery.error.message
                  : "Impossible de charger les informations système."
              }
              onRetry={() => void aboutQuery.refetch()}
            />
          </Card>
        ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4 text-accent" />
                Application
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aboutQuery.isLoading || !about ? (
                <Skeleton className="h-40 rounded-lg" />
              ) : (
                <>
                  <InfoRow label="Nom" value={about.name} />
                  <InfoRow label="Structure" value={about.organization_name} />
                  <InfoRow label="Version" value={about.version} mono />
                  <InfoRow label="Environnement" value={about.environment} />
                  <InfoRow label="Python" value={about.python} mono />
                  <InfoRow label="Plateforme" value={about.platform} />
                  <InfoRow label="Démarrée le" value={formatDate(about.started_at)} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration technique</CardTitle>
            </CardHeader>
            <CardContent>
              {aboutQuery.isLoading || !about ? (
                <Skeleton className="h-40 rounded-lg" />
              ) : (
                <>
                  <InfoRow label="Base de données" value={about.database_url} mono />
                  <InfoRow label="Stockage" value={about.upload_dir} mono />
                  <InfoRow label="Migration actuelle" value={about.migration_current ?? "—"} mono />
                  <InfoRow label="Migration attendue" value={about.migration_head ?? "—"} mono />
                  <InfoRow
                    label="Schéma"
                    value={about.migration_current === about.migration_head ? "À jour" : "À mettre à jour"}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-accent" />
                Documentation de référence
              </CardTitle>
              <CardDescription>
                Les documents sont disponibles dans le dossier <span className="font-mono">docs/</span> de l'installation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aboutQuery.isLoading || !about ? (
                <Skeleton className="h-24 rounded-lg" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {about.documentation.map((item) => (
                    <div key={item.path} className="rounded-lg border border-border-soft bg-background-soft/40 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground">{item.label}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-2">{item.path}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )
      ) : null}

      {tab === "updates" ? (
        aboutQuery.isError ? (
          <Card>
            <ErrorState
              message={
                aboutQuery.error instanceof ApiError
                  ? aboutQuery.error.message
                  : "Impossible de charger les informations de mise à jour."
              }
              onRetry={() => void aboutQuery.refetch()}
            />
          </Card>
        ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader>
              <CardTitle>Procédure de mise à jour</CardTitle>
              <CardDescription>
                À suivre dans l'ordre, avec une sauvegarde préalable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aboutQuery.isLoading || !about ? (
                <Skeleton className="h-64 rounded-lg" />
              ) : (
                <ol className="space-y-3">
                  {about.update_steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary-strong">
                        {index + 1}
                      </span>
                      <p className="pt-0.5 text-[11px] leading-5 text-muted">{step}</p>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-4 rounded-lg border border-warning/20 bg-warning/[0.05] px-3 py-2.5 text-[11px] leading-5 text-warning">
                <CircleAlert className="mr-1.5 inline h-3.5 w-3.5" />
                Ne jamais lancer une migration sans sauvegarde vérifiée de la base et du stockage.
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>Version installée</CardTitle>
              </CardHeader>
              <CardContent>
                {about ? (
                  <>
                    <InfoRow label="Version" value={about.version} mono />
                    <InfoRow label="Schéma actuel" value={about.migration_current ?? "—"} mono />
                    <InfoRow label="Schéma attendu" value={about.migration_head ?? "—"} mono />
                    <div className="mt-3">
                      <Badge
                        tone={
                          about.migration_current === about.migration_head ? "success" : "warning"
                        }
                      >
                        {about.migration_current === about.migration_head
                          ? "Base à jour"
                          : "Migration requise"}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <Skeleton className="h-24 rounded-lg" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Commandes utiles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <pre className="overflow-x-auto rounded-lg border border-border-soft bg-background px-3 py-2 font-mono text-[10px] leading-5 text-muted">
{`cd backend
.\\.venv\\Scripts\\alembic.exe upgrade head`}
                </pre>
                <pre className="overflow-x-auto rounded-lg border border-border-soft bg-background px-3 py-2 font-mono text-[10px] leading-5 text-muted">
{`cd frontend
npm ci
npm run build`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
        )
      ) : null}
    </div>
  );
}
