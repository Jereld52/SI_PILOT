import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock,
  DatabaseBackup,
  FileText,
  Mail,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type { SchedulerConfig, SchedulerRunItem, SchedulerRunResponse } from "@/types/api";

const jobLabels: Record<string, string> = {
  checks: "Contrôles",
  veeam: "Veeam",
  backup: "Sauvegarde",
  digest: "Digest",
  report: "Rapport mensuel",
};

const triggerLabels: Record<string, string> = {
  manual: "Manuel",
  schedule: "Planifié",
};

const statusLabels: Record<string, string> = {
  success: "Succès",
  warning: "Avertissement",
  error: "Erreur",
  skipped: "Ignoré",
  running: "En cours",
};

const statusTones: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  success: "success",
  warning: "warning",
  error: "danger",
  skipped: "neutral",
  running: "info",
};

const weekdays = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

function two(value: number): string {
  return String(value).padStart(2, "0");
}

function toTime(hour: number, minute: number): string {
  return `${two(hour)}:${two(minute)}`;
}

function fromTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 0,
    minute: Number.isFinite(minute) ? Math.min(Math.max(minute, 0), 59) : 0,
  };
}

function formatDuration(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function AdminAutomationPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("admin.settings.read");
  const canManage = hasPermission("admin.settings.manage");

  const [enabled, setEnabled] = useState(false);
  const [checksInterval, setChecksInterval] = useState("60");
  const [veeamEnabled, setVeeamEnabled] = useState(true);
  const [veeamTime, setVeeamTime] = useState("06:00");
  const [veeamStaleHours, setVeeamStaleHours] = useState("48");
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState<"daily" | "weekly">("daily");
  const [backupWeekday, setBackupWeekday] = useState("0");
  const [backupTime, setBackupTime] = useState("02:00");
  const [backupRetention, setBackupRetention] = useState("30");
  const [backupKeepMin, setBackupKeepMin] = useState("3");
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState("07:30");
  const [digestEmails, setDigestEmails] = useState("");
  const [reportEnabled, setReportEnabled] = useState(true);
  const [reportDay, setReportDay] = useState("1");
  const [reportTime, setReportTime] = useState("08:00");
  const [reportEmails, setReportEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin", "scheduler", "config"],
    queryFn: () => apiFetch<SchedulerConfig>("/admin/scheduler/config"),
    enabled: canRead,
  });
  const runsQuery = useQuery({
    queryKey: ["admin", "scheduler", "runs"],
    queryFn: () => apiFetch<SchedulerRunItem[]>("/admin/scheduler/runs?limit=25"),
    enabled: canRead,
  });

  const config = configQuery.data;

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setChecksInterval(String(config.checks_interval_seconds));
    setVeeamEnabled(config.veeam_enabled);
    setVeeamTime(toTime(config.veeam_hour, config.veeam_minute));
    setVeeamStaleHours(String(config.veeam_stale_hours));
    setBackupEnabled(config.backup_enabled);
    setBackupFrequency(config.backup_frequency);
    setBackupWeekday(String(config.backup_weekday));
    setBackupTime(toTime(config.backup_hour, config.backup_minute));
    setBackupRetention(String(config.backup_retention_days));
    setBackupKeepMin(String(config.backup_keep_min));
    setDigestEnabled(config.digest_enabled);
    setDigestTime(toTime(config.digest_hour, config.digest_minute));
    setDigestEmails(config.digest_emails);
    setReportEnabled(config.report_enabled);
    setReportDay(String(config.report_day));
    setReportTime(toTime(config.report_hour, config.report_minute));
    setReportEmails(config.report_emails);
    setTestResult(null);
  }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      const veeam = fromTime(veeamTime);
      const backup = fromTime(backupTime);
      const digest = fromTime(digestTime);
      const report = fromTime(reportTime);
      const updated = await apiFetch<SchedulerConfig>("/admin/scheduler/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          checks_interval_seconds: Number(checksInterval) || 60,
          veeam_enabled: veeamEnabled,
          veeam_hour: veeam.hour,
          veeam_minute: veeam.minute,
          veeam_stale_hours: Number(veeamStaleHours) || 48,
          backup_enabled: backupEnabled,
          backup_frequency: backupFrequency,
          backup_weekday: Number(backupWeekday) || 0,
          backup_hour: backup.hour,
          backup_minute: backup.minute,
          backup_retention_days: Number(backupRetention) || 30,
          backup_keep_min: Number(backupKeepMin) || 3,
          digest_enabled: digestEnabled,
          digest_hour: digest.hour,
          digest_minute: digest.minute,
          digest_emails: digestEmails,
          report_enabled: reportEnabled,
          report_day: Number(reportDay) || 1,
          report_hour: report.hour,
          report_minute: report.minute,
          report_emails: reportEmails,
        }),
      });
      toast.success(
        updated.enabled
          ? "Veille enregistrée et planificateur actif."
          : "Veille enregistrée. Le planificateur est inactif.",
      );
      void configQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const runJob = async (job: string) => {
    setRunning(job);
    setTestResult(null);
    try {
      const result = await apiFetch<SchedulerRunResponse>(`/admin/scheduler/run/${job}`, {
        method: "POST",
      });
      setTestResult(result.message);
      if (result.run.status === "error") {
        toast.error(result.message);
      } else if (result.run.status === "warning") {
        toast.warning(result.message);
      } else if (result.run.status === "skipped") {
        toast.info(result.message);
      } else {
        toast.success(result.message);
      }
      void runsQuery.refetch();
      void configQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Exécution impossible.");
    } finally {
      setRunning(null);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter la veille automatique."
      />
    );
  }

  if (configQuery.isError) {
    return (
      <Card>
        <ErrorState
          message={
            configQuery.error instanceof Error
              ? configQuery.error.message
              : "Impossible de charger la configuration."
          }
          onRetry={() => void configQuery.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-sm">Veille automatique</CardTitle>
            <CardDescription>
              Contrôles, vérification Veeam, sauvegarde de SI PILOT et digest quotidien.
              Le planificateur fonctionne uniquement lorsque l'application est démarrée.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={config?.enabled ? "success" : "neutral"}>
              {config?.enabled ? "Planificateur actif" : "Planificateur inactif"}
            </Badge>
            <Badge tone={config?.smtp_configured ? "success" : "warning"}>
              {config?.smtp_configured ? "SMTP prêt" : "SMTP non prêt"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
            Activer la veille automatique
          </label>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="scheduler-checks-interval">
                Fréquence de vérification des contrôles
              </Label>
              <Input
                id="scheduler-checks-interval"
                type="number"
                min={30}
                max={3600}
                value={checksInterval}
                onChange={(event) => setChecksInterval(event.target.value)}
                disabled={!canManage}
              />
              <p className="mt-1 text-[10px] text-muted-2">
                En secondes. Chaque contrôle conserve son propre intervalle dans Supervision.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button loading={saving} onClick={() => void save()}>
                <Save className="h-3.5 w-3.5" />
                Enregistrer la configuration
              </Button>
            ) : null}
            <Link
              to="/infrastructure"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <Activity className="h-3.5 w-3.5" />
              Ouvrir la supervision
            </Link>
          </div>
          <p className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-4 text-info">
            Pour un fonctionnement continu, SI PILOT doit tourner en permanence. Sur Windows,
            installez l'application comme service ou laissez le script de démarrage actif.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-accent" />
                Contrôles automatiques
              </CardTitle>
              <CardDescription>
                Exécute les contrôles de supervision autorisés et activés, selon leur intervalle.
              </CardDescription>
            </div>
            <Badge tone="info">Ping · HTTP · TCP · SNMP</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] leading-5 text-muted">
              Un contrôle en échec crée une notification pour les administrateurs. Le résultat
              est ajouté à l'historique de l'équipement.
            </p>
            {canManage ? (
              <Button
                variant="secondary"
                loading={running === "checks"}
                onClick={() => void runJob("checks")}
              >
                <Play className="h-3.5 w-3.5" />
                Exécuter les contrôles maintenant
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <DatabaseBackup className="h-4 w-4 text-accent" />
                Vérification Veeam
              </CardTitle>
              <CardDescription>
                Détecte les jobs en échec, les sauvegardes anciennes et les dépôts presque pleins.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <Switch
                checked={veeamEnabled}
                onCheckedChange={setVeeamEnabled}
                disabled={!canManage}
              />
              Activé
            </label>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="scheduler-veeam-time">Heure de vérification</Label>
                <Input
                  id="scheduler-veeam-time"
                  type="time"
                  value={veeamTime}
                  onChange={(event) => setVeeamTime(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="scheduler-veeam-stale">Ancienneté maximale (heures)</Label>
                <Input
                  id="scheduler-veeam-stale"
                  type="number"
                  min={6}
                  max={720}
                  value={veeamStaleHours}
                  onChange={(event) => setVeeamStaleHours(event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <Button
                  variant="secondary"
                  loading={running === "veeam"}
                  onClick={() => void runJob("veeam")}
                >
                  <Play className="h-3.5 w-3.5" />
                  Vérifier maintenant
                </Button>
              ) : null}
              <Link
                to="/sauvegardes"
                className={buttonVariants({ variant: "ghost", size: "md" })}
              >
                Ouvrir les sauvegardes
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <DatabaseBackup className="h-4 w-4 text-accent" />
                Sauvegarde SI PILOT
              </CardTitle>
              <CardDescription>
                Archive complète de la base, de la configuration et des fichiers téléversés.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <Switch
                checked={backupEnabled}
                onCheckedChange={setBackupEnabled}
                disabled={!canManage}
              />
              Activée
            </label>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <Label htmlFor="scheduler-backup-frequency">Fréquence</Label>
                <Select
                  id="scheduler-backup-frequency"
                  value={backupFrequency}
                  onChange={(event) =>
                    setBackupFrequency(event.target.value as "daily" | "weekly")
                  }
                  disabled={!canManage}
                >
                  <option value="daily">Tous les jours</option>
                  <option value="weekly">Une fois par semaine</option>
                </Select>
              </div>
              {backupFrequency === "weekly" ? (
                <div>
                  <Label htmlFor="scheduler-backup-weekday">Jour</Label>
                  <Select
                    id="scheduler-backup-weekday"
                    value={backupWeekday}
                    onChange={(event) => setBackupWeekday(event.target.value)}
                    disabled={!canManage}
                  >
                    {weekdays.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div>
                <Label htmlFor="scheduler-backup-time">Heure</Label>
                <Input
                  id="scheduler-backup-time"
                  type="time"
                  value={backupTime}
                  onChange={(event) => setBackupTime(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="scheduler-backup-retention">Rétention (jours)</Label>
                <Input
                  id="scheduler-backup-retention"
                  type="number"
                  min={1}
                  max={3650}
                  value={backupRetention}
                  onChange={(event) => setBackupRetention(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="scheduler-backup-keep">Minimum conservé</Label>
                <Input
                  id="scheduler-backup-keep"
                  type="number"
                  min={1}
                  max={100}
                  value={backupKeepMin}
                  onChange={(event) => setBackupKeepMin(event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <Button
                  variant="secondary"
                  loading={running === "backup"}
                  onClick={() => void runJob("backup")}
                >
                  <Play className="h-3.5 w-3.5" />
                  Sauvegarder maintenant
                </Button>
              ) : null}
              <Link
                to="/admin/backup"
                className={buttonVariants({ variant: "ghost", size: "md" })}
              >
                Ouvrir la sauvegarde
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-accent" />
                Digest quotidien
              </CardTitle>
              <CardDescription>
                Synthèse des contrôles, sauvegardes Veeam, sauvegarde SI PILOT et alertes du
                tableau de bord.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <Switch
                checked={digestEnabled}
                onCheckedChange={setDigestEnabled}
                disabled={!canManage}
              />
              Activé
            </label>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="scheduler-digest-time">Heure d'envoi</Label>
                <Input
                  id="scheduler-digest-time"
                  type="time"
                  value={digestTime}
                  onChange={(event) => setDigestTime(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="scheduler-digest-emails">Destinataires</Label>
                <Input
                  id="scheduler-digest-emails"
                  value={digestEmails}
                  onChange={(event) => setDigestEmails(event.target.value)}
                  placeholder="vide = administrateurs"
                  disabled={!canManage}
                />
                <p className="mt-1 text-[10px] text-muted-2">
                  Adresses séparées par des virgules. Vide : tous les administrateurs actifs.
                </p>
              </div>
            </div>
            {canManage ? (
              <Button
                variant="secondary"
                loading={running === "digest"}
                onClick={() => void runJob("digest")}
              >
                <Play className="h-3.5 w-3.5" />
                Envoyer le digest maintenant
              </Button>
            ) : null}
            {config && !config.smtp_configured ? (
              <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[10px] text-warning">
                Le SMTP doit être activé et configuré dans Administration → Paramètres pour
                envoyer le digest.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-accent" />
                Rapport mensuel d'exploitation
              </CardTitle>
              <CardDescription>
                Synthèse PDF du mois précédent : parc, support, sécurité, supervision,
                sauvegardes, contrats, projets et budget.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <Switch
                checked={reportEnabled}
                onCheckedChange={setReportEnabled}
                disabled={!canManage}
              />
              Activé
            </label>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label htmlFor="scheduler-report-day">Jour du mois</Label>
                <Select
                  id="scheduler-report-day"
                  value={reportDay}
                  onChange={(event) => setReportDay(event.target.value)}
                  disabled={!canManage}
                >
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="scheduler-report-time">Heure d'envoi</Label>
                <Input
                  id="scheduler-report-time"
                  type="time"
                  value={reportTime}
                  onChange={(event) => setReportTime(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="scheduler-report-emails">Destinataires</Label>
                <Input
                  id="scheduler-report-emails"
                  value={reportEmails}
                  onChange={(event) => setReportEmails(event.target.value)}
                  placeholder="vide = digest / administrateurs"
                  disabled={!canManage}
                />
                <p className="mt-1 text-[10px] text-muted-2">
                  Vide : destinataires du digest, puis administrateurs actifs.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <Button
                  variant="secondary"
                  loading={running === "report"}
                  onClick={() => void runJob("report")}
                >
                  <Play className="h-3.5 w-3.5" />
                  Générer et envoyer maintenant
                </Button>
              ) : null}
              <a
                href="/api/v1/exports/operations"
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "ghost", size: "md" })}
              >
                <FileText className="h-3.5 w-3.5" />
                Télécharger le dernier rapport
              </a>
            </div>
            <p className="text-[10px] leading-4 text-muted-2">
              Le rapport planifié couvre le mois précédent. Le bouton de téléchargement
              génère le rapport du mois précédent à la demande.
            </p>
          </CardContent>
        </Card>
      </div>

      {testResult ? (
        <p className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[11px] text-info">
          Dernier résultat : {testResult}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-accent" />
              Journal des exécutions
            </CardTitle>
            <CardDescription>25 dernières exécutions planifiées ou manuelles.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            loading={runsQuery.isFetching}
            onClick={() => void runsQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {runsQuery.isError ? (
            <ErrorState
              message={
                runsQuery.error instanceof Error
                  ? runsQuery.error.message
                  : "Impossible de charger le journal."
              }
              onRetry={() => void runsQuery.refetch()}
            />
          ) : runsQuery.isLoading ? (
            <div className="space-y-1 px-3 pb-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (runsQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Aucune exécution"
              description="Activez la veille ou lancez une tâche manuellement pour alimenter le journal."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tâche</TableHead>
                  <TableHead>Déclencheur</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Résumé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runsQuery.data ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-[11px] font-medium text-foreground">
                      {jobLabels[run.job] ?? run.job}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted">
                      {triggerLabels[run.trigger] ?? run.trigger}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted">
                      {formatDateTime(run.started_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted">
                      {formatDuration(run.duration_ms)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[run.status] ?? "neutral"}>
                        {statusLabels[run.status] ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "max-w-[420px] truncate text-[11px]",
                        run.status === "error" ? "text-danger" : "text-muted",
                      )}
                      title={run.summary ?? ""}
                    >
                      {run.summary ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
