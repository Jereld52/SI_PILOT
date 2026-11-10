import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  HardDriveDownload,
  History,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type {
  BackupStatus,
  ConfigImportResult,
  RestoreResult,
} from "@/types/api";

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1024) return `${value} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

async function download(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`/api/v1${path}`, { credentials: "include" });
  if (!response.ok) {
    let detail = "Téléchargement impossible.";
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AdminBackupPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admin.backup.manage");
  const configInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState<string | null>(null);
  const [configFile, setConfigFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["admin", "backup", "status"],
    queryFn: () => apiFetch<BackupStatus>("/admin/backup/status"),
    enabled: canManage,
  });
  const status = statusQuery.data;

  const runDownload = async (path: string, fallbackName: string, key: string) => {
    setDownloading(key);
    try {
      await download(path, fallbackName);
      toast.success("Téléchargement terminé.");
      void statusQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Téléchargement impossible.",
      );
    } finally {
      setDownloading(null);
    }
  };

  const importConfig = async () => {
    if (!configFile) {
      toast.error("Sélectionnez un fichier de configuration JSON.");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", configFile);
      const result = await apiFetch<ConfigImportResult>("/admin/backup/config", {
        method: "POST",
        body: form,
      });
      toast.success(result.message);
      setConfigFile(null);
      if (configInput.current) configInput.current.value = "";
      void statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Import impossible.");
    } finally {
      setImporting(false);
    }
  };

  const restoreDatabase = async () => {
    if (!restoreFile) {
      toast.error("Sélectionnez un fichier .dump, .sql ou .zip.");
      return;
    }
    if (confirmation.trim().toUpperCase() !== "RESTAURER") {
      toast.error("Saisissez RESTAURER pour confirmer.");
      return;
    }
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("file", restoreFile);
      form.append("confirmation", confirmation);
      const result = await apiFetch<RestoreResult>("/admin/backup/restore", {
        method: "POST",
        body: form,
      });
      toast.success(result.message);
      setRestoreFile(null);
      setConfirmation("");
      if (restoreInput.current) restoreInput.current.value = "";
      void statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restauration impossible.");
    } finally {
      setRestoring(false);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={Database}
        title="Accès refusé"
        description="Votre rôle ne permet pas de gérer les sauvegardes de SI PILOT."
      />
    );
  }

  return (
    <div className="space-y-4">
      {statusQuery.isError ? (
        <ErrorState
          message={
            statusQuery.error instanceof Error
              ? statusQuery.error.message
              : "Erreur inconnue."
          }
          onRetry={() => void statusQuery.refetch()}
        />
      ) : statusQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : status ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Base de données</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {status.database_name || "—"}
              </p>
              <p className="text-[10px] text-muted-2">
                {status.dialect}
                {status.database_host
                  ? ` · ${status.database_host}:${status.database_port ?? ""}`
                  : ""}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Outils PostgreSQL</p>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                {status.pg_dump_available && status.pg_restore_available ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-success">Disponibles</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="text-warning">Incomplets</span>
                  </>
                )}
              </p>
              <p className="truncate text-[10px] text-muted-2" title={status.pg_dump_path}>
                {status.pg_dump_path || "pg_dump introuvable"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Dernière sauvegarde</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {status.last_backup_at ? formatDateTime(status.last_backup_at) : "Aucune"}
              </p>
              <p className="text-[10px] text-muted-2">
                {status.last_backup_size != null
                  ? formatBytes(status.last_backup_size)
                  : `${status.backup_count} fichier(s)`}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Fichiers utilisateurs</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatBytes(status.uploads_size)}
              </p>
              <p className="truncate text-[10px] text-muted-2" title={status.uploads_directory}>
                {status.uploads_directory}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Exporter</h2>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Téléchargez la configuration, la base ou une archive complète.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">Configuration (JSON)</p>
                    <p className="text-[10px] text-muted-2">
                      Paramètres, identité, e-mails, WAPT, LDAP et secrets chiffrés.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === "config"}
                    onClick={() =>
                      void runDownload("/admin/backup/config", "si-pilot-config.json", "config")
                    }
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    Télécharger
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">Base de données</p>
                    <p className="text-[10px] text-muted-2">
                      Dump PostgreSQL complet au format custom, restaurable avec pg_restore.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === "database"}
                    onClick={() =>
                      void runDownload(
                        "/admin/backup/database",
                        "si-pilot.dump",
                        "database",
                      )
                    }
                  >
                    <Database className="h-3.5 w-3.5" />
                    Télécharger
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">Archive complète (ZIP)</p>
                    <p className="text-[10px] text-muted-2">
                      Base, configuration, manifeste et fichiers utilisateurs.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    loading={downloading === "full"}
                    onClick={() =>
                      void runDownload(
                        "/admin/backup/full?include_uploads=true",
                        "si-pilot-full.zip",
                        "full",
                      )
                    }
                  >
                    <HardDriveDownload className="h-3.5 w-3.5" />
                    Télécharger
                  </Button>
                </div>
                <p className="text-[10px] leading-4 text-muted-2">
                  Les sauvegardes sont aussi conservées dans{" "}
                  <span className="font-mono">{status.backup_directory}</span>. Copiez-les sur un
                  support distinct et chiffré.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Importer</h2>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Restaurez une configuration ou une sauvegarde complète.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-lg border border-border-soft bg-background/40 p-3">
                  <p className="text-xs font-semibold text-foreground">Configuration (JSON)</p>
                  <p className="text-[10px] text-muted-2">
                    Remplace les paramètres existants. Les données métier ne sont pas modifiées.
                  </p>
                  <Input
                    ref={configInput}
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => setConfigFile(event.target.files?.[0] ?? null)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={importing}
                    onClick={() => void importConfig()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Importer la configuration
                  </Button>
                </div>

                <div className="space-y-2 rounded-lg border border-danger/25 bg-danger/[0.04] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restaurer une base
                  </p>
                  <p className="text-[10px] leading-4 text-danger/90">
                    Opération destructive : la base actuelle est remplacée. Une sauvegarde de
                    sécurité est créée automatiquement avant l'import.
                  </p>
                  <Input
                    ref={restoreInput}
                    type="file"
                    accept=".dump,.sql,.zip,application/zip,application/octet-stream"
                    onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
                  />
                  <div>
                    <Label htmlFor="backup-confirmation">
                      Saisissez RESTAURER pour confirmer
                    </Label>
                    <Input
                      id="backup-confirmation"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="RESTAURER"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={restoring}
                    onClick={() => void restoreDatabase()}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restaurer la base
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Sauvegardes récentes</h2>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Fichiers présents dans le dossier de sauvegarde.
                  </p>
                </div>
              </div>
              <Badge tone="neutral">{status.backup_count} fichier(s)</Badge>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {status.backups.length === 0 ? (
                <EmptyState
                  icon={Download}
                  title="Aucune sauvegarde"
                  description="Créez une première sauvegarde depuis cette page."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fichier</TableHead>
                      <TableHead>Taille</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.backups.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-mono text-[11px] text-foreground">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {formatBytes(item.size)}
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {formatDateTime(item.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 text-[10px] leading-4 text-warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            La clé <span className="font-mono">FIELD_ENCRYPTION_KEY</span> n'est pas incluse dans
            les exports. Conservez-la séparément : sans elle, les secrets chiffrés (mots de passe
            WAPT, SMTP, LDAP, PIN/PUK) restent illisibles après réinstallation.
          </div>
        </>
      ) : null}
    </div>
  );
}
