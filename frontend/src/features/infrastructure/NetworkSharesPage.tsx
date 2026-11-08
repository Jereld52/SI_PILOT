import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FolderTree,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NetworkShareDialog } from "@/features/infrastructure/NetworkShareDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type {
  LocationItem,
  NetworkShareItem,
  NetworkShareOverview,
} from "@/types/api";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ok: "success",
  warning: "warning",
  critical: "danger",
  error: "danger",
  unknown: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  warning: "Alerte",
  critical: "Critique",
  error: "Inaccessible",
  unknown: "Non vérifié",
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

function freePercent(share: NetworkShareItem): number | null {
  if (!share.last_total_bytes || share.last_free_bytes == null) return null;
  return (share.last_free_bytes / share.last_total_bytes) * 100;
}

export function NetworkSharesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("infrastructure.update");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NetworkShareItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<NetworkShareItem | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["network-shares", "overview"],
    queryFn: () => apiFetch<NetworkShareOverview>("/network-shares/overview"),
  });
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["network-shares"] });
  };

  const checkAll = async () => {
    setCheckingAll(true);
    try {
      await apiFetch<NetworkShareItem[]>("/network-shares/check-all", { method: "POST" });
      toast.success("Contrôle de tous les partages terminé.");
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Contrôle impossible.");
    } finally {
      setCheckingAll(false);
    }
  };

  const checkOne = async (share: NetworkShareItem) => {
    setCheckingId(share.id);
    try {
      const result = await apiFetch<NetworkShareItem>(`/network-shares/${share.id}/check`, {
        method: "POST",
      });
      toast.success(
        result.last_status === "ok"
          ? "Volume vérifié : espace suffisant."
          : `Volume vérifié : ${STATUS_LABELS[result.last_status] ?? result.last_status}.`,
      );
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Contrôle impossible.");
    } finally {
      setCheckingId(null);
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiFetch(`/network-shares/${archiveTarget.id}`, { method: "DELETE" });
      toast.success("Partage archivé.");
      setArchiveTarget(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  const data = overviewQuery.data;
  const summary = data?.summary;
  const alertCount = summary ? summary.warning + summary.critical + summary.error : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Infrastructure"
        title="Partages réseau"
        description="Surveillez l'espace disponible des lecteurs et partages réseau, avec seuils d'alerte et d'alerte critique."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void overviewQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
            {canManage ? (
              <Button
                variant="secondary"
                size="sm"
                loading={checkingAll}
                onClick={() => void checkAll()}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Tout vérifier
              </Button>
            ) : null}
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un partage
              </Button>
            ) : null}
          </>
        }
      />

      {overviewQuery.isError ? (
        <Card>
          <ErrorState
            message={
              overviewQuery.error instanceof ApiError
                ? overviewQuery.error.message
                : "Impossible de charger les partages réseau."
            }
            onRetry={() => void overviewQuery.refetch()}
          />
        </Card>
      ) : overviewQuery.isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Partages suivis</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.total ?? 0}</p>
              <p className="mt-1 text-[10px] text-muted-2">{data.items.length} actif(s)</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Volumes OK</p>
              <p className="mt-1 text-2xl font-semibold text-success">{summary?.ok ?? 0}</p>
              <p className="mt-1 text-[10px] text-muted-2">Aucune alerte</p>
            </Card>
            <Card className={alertCount > 0 ? "border-warning/25 bg-warning/[0.04] p-4" : "p-4"}>
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Alertes</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{alertCount}</p>
              <p className="mt-1 text-[10px] text-muted-2">
                {summary?.critical ?? 0} critique(s) · {summary?.error ?? 0} inaccessible(s)
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Espace libre cumulé</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatBytes(summary?.free_bytes)}
              </p>
              <p className="mt-1 text-[10px] text-muted-2">
                sur {formatBytes(summary?.total_bytes)}
              </p>
            </Card>
          </div>

          {data.alerts.length > 0 ? (
            <Card className="border-warning/20 bg-warning/[0.03]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Volumes à surveiller
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.alerts.map((share) => {
                  const percent = freePercent(share);
                  return (
                    <button
                      key={share.id}
                      type="button"
                      onClick={() => {
                        setEditing(share);
                        setDialogOpen(true);
                      }}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border-soft bg-background/50 px-3 py-2.5 text-left transition-colors hover:border-primary/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-foreground">{share.name}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-2">{share.unc_path}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {percent != null ? `${percent.toFixed(1)} % libre` : "Volume non vérifié"}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONES[share.last_status] ?? "neutral"}>
                        {STATUS_LABELS[share.last_status] ?? share.last_status}
                      </Badge>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-accent" />
                Lecteurs et partages
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={FolderTree}
                    title="Aucun partage réseau"
                    description="Ajoutez un chemin UNC ou un lecteur pour suivre son espace disponible."
                    action={
                      canManage ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditing(null);
                            setDialogOpen(true);
                          }}
                        >
                          Ajouter un partage
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partage</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>État</TableHead>
                        <TableHead>Libre</TableHead>
                        <TableHead className="hidden lg:table-cell">Seuils</TableHead>
                        <TableHead className="hidden lg:table-cell">Dernier contrôle</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((share) => {
                        const percent = freePercent(share);
                        return (
                          <TableRow key={share.id}>
                            <TableCell>
                              <p className="text-xs font-medium text-foreground">
                                {share.name}
                                {share.drive_letter ? (
                                  <span className="ml-1.5 font-mono text-[10px] text-muted-2">
                                    {share.drive_letter}
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-2">{share.unc_path}</p>
                              {share.responsible ? (
                                <p className="mt-0.5 text-[10px] text-muted-2">{share.responsible}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted">
                              {share.location?.name ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge tone={STATUS_TONES[share.last_status] ?? "neutral"}>
                                {STATUS_LABELS[share.last_status] ?? share.last_status}
                              </Badge>
                              {share.last_error ? (
                                <p className="mt-1 max-w-[180px] truncate text-[10px] text-danger" title={share.last_error}>
                                  {share.last_error}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <p className="text-xs font-medium text-foreground">
                                {percent != null ? `${percent.toFixed(1)} %` : "—"}
                              </p>
                              <p className="text-[10px] text-muted-2">
                                {formatBytes(share.last_free_bytes)} / {formatBytes(share.last_total_bytes)}
                              </p>
                            </TableCell>
                            <TableCell className="hidden text-[10px] text-muted lg:table-cell">
                              <p>Alerte : {share.warning_percent} %</p>
                              <p>Critique : {share.critical_percent} %</p>
                              {share.min_free_gb != null ? <p>Min. : {share.min_free_gb} Go</p> : null}
                            </TableCell>
                            <TableCell className="hidden text-[10px] text-muted lg:table-cell">
                              {formatDateTime(share.last_checked_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {canManage ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Vérifier ${share.name}`}
                                    loading={checkingId === share.id}
                                    onClick={() => void checkOne(share)}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                {canManage ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Modifier ${share.name}`}
                                    onClick={() => {
                                      setEditing(share);
                                      setDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                {canManage ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Archiver ${share.name}`}
                                    onClick={() => setArchiveTarget(share)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[10px] leading-4 text-muted-2">
            Les contrôles de volumétrie sont lancés manuellement et exécutés avec le compte du
            serveur d'application. Le chemin doit être accessible depuis ce serveur.
          </p>
        </>
      )}

      <NetworkShareDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        share={editing}
        locations={locationsQuery.data ?? []}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver ce partage ?"
        description={`« ${archiveTarget?.name ?? ""} » ne sera plus suivi dans la supervision des volumes. L'historique de contrôle est conservé.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
