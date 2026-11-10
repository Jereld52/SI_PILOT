import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpCircle,
  Boxes,
  Download,
  MonitorSmartphone,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  WaptActionResponse,
  WaptAsset,
  WaptAssetSoftware,
  WaptPackage,
  WaptSoftwareOverview,
  WaptSoftwareSyncResponse,
} from "@/types/api";

type TabKey = "overview" | "assets";

interface PendingAction {
  kind: "install" | "uninstall";
  packageName: string;
  assetId: string;
  hostLabel: string;
}

export function SoftwarePage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("assets.read");
  const canManage = hasPermission("assets.update");
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState(searchParams.get("software") ?? "");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(searchParams.get("software"));
  const [selectedAssetId, setSelectedAssetId] = useState(searchParams.get("asset") ?? "");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<WaptSoftwareSyncResponse | null>(null);

  useEffect(() => {
    const requested = searchParams.get("software");
    if (requested) {
      setSearch(requested);
      setExpanded(requested);
    }
    const asset = searchParams.get("asset");
    if (asset) {
      setTab("assets");
      setSelectedAssetId(asset);
    }
  }, [searchParams]);

  const overviewQuery = useQuery({
    queryKey: ["wapt", "software", "overview"],
    queryFn: () => apiFetch<WaptSoftwareOverview>("/wapt/overview"),
    enabled: canRead,
  });
  const assetsQuery = useQuery({
    queryKey: ["wapt", "software", "assets"],
    queryFn: () => apiFetch<WaptAsset[]>("/wapt/assets"),
    enabled: canRead && tab === "assets",
  });
  const assetSoftwareQuery = useQuery({
    queryKey: ["wapt", "software", "asset", selectedAssetId],
    queryFn: () => apiFetch<WaptAssetSoftware>(`/wapt/assets/${selectedAssetId}/software`),
    enabled: canRead && Boolean(selectedAssetId),
  });
  const catalogQuery = useQuery({
    queryKey: ["wapt", "software", "catalog"],
    queryFn: () => apiFetch<WaptPackage[]>("/wapt/packages"),
    enabled: canRead && canManage && tab === "assets",
  });

  const overview = overviewQuery.data;
  const items = overview?.items ?? [];
  const summary = overview?.summary;
  const assets = assetsQuery.data ?? [];
  const assetSoftware = assetSoftwareQuery.data?.packages ?? [];
  const catalog = catalogQuery.data ?? [];
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.name} ${item.installed_versions.join(" ")} ${item.available_version}`
        .toLowerCase()
        .includes(needle),
    );
  }, [items, search]);

  const filteredCatalog = useMemo(() => {
    const needle = catalogFilter.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter((item) =>
      `${item.name} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [catalog, catalogFilter]);

  const filteredAssets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) =>
      `${asset.name} ${asset.asset_tag} ${asset.hostname}`.toLowerCase().includes(needle),
    );
  }, [assets, search]);

  const syncSoftware = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await apiFetch<WaptSoftwareSyncResponse>("/wapt/sync", { method: "POST" });
      setSyncResult(result);
      toast.success(
        `Synchronisation terminée : ${result.packages} logiciel(s), ${result.updates} mise(s) à jour.`,
      );
      void overviewQuery.refetch();
      if (selectedAssetId) void assetSoftwareQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  };

  const runAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<WaptActionResponse>(
        `/wapt/assets/${pendingAction.assetId}/${pendingAction.kind}`,
        {
          method: "POST",
          body: JSON.stringify({ package: pendingAction.packageName }),
        },
      );
      toast.success(result.message);
      setPendingAction(null);
      void assetSoftwareQuery.refetch();
      void overviewQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action WAPT impossible.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les logiciels du parc."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Support & parc"
        title="Logiciels"
        description="Parc logiciel remonté par WAPT, versions installées, mises à jour disponibles et déploiement par poste."
        actions={
          canManage ? (
            <Button size="sm" loading={syncing} onClick={() => void syncSoftware()}>
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              Synchroniser les logiciels
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Logiciels suivis</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(summary?.total_software ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Installations</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(summary?.total_installations ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Mises à jour disponibles</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              (summary?.updates_available ?? 0) > 0 ? "text-warning" : "text-success",
            )}
          >
            {formatNumber(summary?.updates_available ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Postes concernés</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(summary?.hosts_with_updates ?? 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            {summary?.synced_at ? `Synchronisé le ${formatDateTime(summary.synced_at)}` : "Jamais synchronisé"}
          </p>
        </Card>
      </div>

      {syncResult ? (
        <div className="rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-[11px] text-info">
          <p className="font-semibold">Synchronisation terminée en {syncResult.duration_seconds}s</p>
          <p>
            {formatNumber(syncResult.synced_hosts)}/{formatNumber(syncResult.total_hosts)} poste(s) ·{" "}
            {formatNumber(syncResult.packages)} logiciel(s) · {formatNumber(syncResult.updates)} mise(s) à jour
          </p>
          {syncResult.errors.length > 0 ? (
            <p className="mt-1 text-warning">{syncResult.errors.join(" · ")}</p>
          ) : null}
        </div>
      ) : null}

      <Tabs
        items={[
          { key: "overview", label: "Vue d'ensemble", icon: Boxes },
          { key: "assets", label: "Par poste", icon: MonitorSmartphone },
        ]}
        value={tab}
        onChange={(value) => setTab(value as TabKey)}
      />

      {tab === "overview" ? (
        <Card>
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un logiciel ou une version…"
                className="pl-8"
                aria-label="Rechercher un logiciel"
              />
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => void overviewQuery.refetch()}>
                <RefreshCw
                  className={cn("h-3.5 w-3.5", overviewQuery.isFetching && "animate-spin")}
                />
                Actualiser
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {overviewQuery.isError ? (
              <ErrorState
                message={
                  overviewQuery.error instanceof Error
                    ? overviewQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void overviewQuery.refetch()}
              />
            ) : overviewQuery.isLoading ? (
              <div className="space-y-1 px-3 pb-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Aucun logiciel suivi"
                description={
                  summary?.configured === false
                    ? "Configurez la connexion WAPT dans Administration → WAPT."
                    : "Lancez une synchronisation des logiciels pour alimenter le parc."
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Logiciel</TableHead>
                    <TableHead>Version(s) installée(s)</TableHead>
                    <TableHead className="hidden md:table-cell">Postes</TableHead>
                    <TableHead>Mises à jour</TableHead>
                    <TableHead className="hidden lg:table-cell">Version disponible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const isExpanded = expanded === item.name;
                    return (
                      <Fragment key={item.name}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : item.name)}
                        >
                          <TableCell>
                            <p className="font-mono text-[11px] text-foreground">{item.name}</p>
                            <p className="text-[10px] text-muted-2">
                              {formatNumber(item.host_count)} installation(s)
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted">
                            {item.installed_versions.length > 0
                              ? item.installed_versions.join(", ")
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted md:table-cell">
                            {formatNumber(item.host_count)}
                          </TableCell>
                          <TableCell>
                            {item.update_count > 0 ? (
                              <Badge tone="warning">
                                {formatNumber(item.update_count)} poste(s)
                              </Badge>
                            ) : (
                              <Badge tone="success">À jour</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted lg:table-cell">
                            {item.available_version || "—"}
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-background-soft/50">
                              <div className="space-y-1 py-1">
                                <p className="text-[10px] uppercase tracking-wide text-muted-2">
                                  Postes concernés
                                </p>
                                {item.hosts.map((host) => (
                                  <div
                                    key={`${item.name}-${host.asset_id}`}
                                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-1.5"
                                  >
                                    <Link
                                      to={`/logiciels?asset=${host.asset_id}`}
                                      className="text-xs font-medium text-accent hover:underline"
                                    >
                                      {host.asset_tag}
                                    </Link>
                                    <span className="text-[11px] text-foreground">{host.name}</span>
                                    <span className="text-[10px] text-muted-2">
                                      {host.hostname || "—"}
                                    </span>
                                    {host.installed_version ? (
                                      <span className="font-mono text-[10px] text-muted">
                                        {host.installed_version}
                                      </span>
                                    ) : null}
                                    {host.available_version ? (
                                      <Badge tone="warning">
                                        <ArrowUpCircle className="h-3 w-3" />
                                        {host.available_version}
                                      </Badge>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Poste</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Sélectionnez un poste pour consulter ses logiciels et demander une installation ou
                  une désinstallation.
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filtrer les postes…"
                    className="pl-8"
                    aria-label="Filtrer les postes"
                  />
                </div>
                <Select
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                  className="w-full sm:w-80"
                >
                  <option value="">Sélectionner un poste</option>
                  {filteredAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_tag} — {asset.name}
                      {asset.update_count > 0 ? ` (${asset.update_count} MAJ)` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            {selectedAsset ? (
              <CardContent className="grid gap-2 text-[11px] sm:grid-cols-2 xl:grid-cols-4">
                <p><span className="text-muted-2">Inventaire : </span>{selectedAsset.asset_tag}</p>
                <p><span className="text-muted-2">Machine : </span>{selectedAsset.hostname || "—"}</p>
                <p><span className="text-muted-2">Système : </span>{[selectedAsset.os_name, selectedAsset.os_version].filter(Boolean).join(" ") || "—"}</p>
                <p>
                  <span className="text-muted-2">Mises à jour : </span>
                  <span className={selectedAsset.update_count > 0 ? "text-warning" : "text-success"}>
                    {formatNumber(selectedAsset.update_count)}
                  </span>
                </p>
              </CardContent>
            ) : null}
          </Card>

          {!selectedAssetId ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="Aucun poste sélectionné"
              description="Choisissez un poste relié à WAPT pour afficher ses logiciels."
            />
          ) : (
            <>
              <div className="rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 text-[10px] leading-4 text-warning">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                WAPT 2.4 exige une action signée avec la clé privée WAPT pour installer ou
                désinstaller un paquet. Configurez la clé et le certificat dans{" "}
                <span className="font-medium">Administration → Connexion WAPT</span>, ou utilisez la
                console WAPT.
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Logiciels installés</h2>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Applications actuellement présentes sur le poste et mises à jour disponibles.
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[520px] space-y-1 overflow-y-auto">
                    {assetSoftwareQuery.isError ? (
                      <ErrorState
                        message={
                          assetSoftwareQuery.error instanceof Error
                            ? assetSoftwareQuery.error.message
                            : "Erreur inconnue."
                        }
                        onRetry={() => void assetSoftwareQuery.refetch()}
                      />
                    ) : assetSoftwareQuery.isLoading ? (
                      <div className="space-y-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Skeleton key={index} className="h-10 rounded-lg" />
                        ))}
                      </div>
                    ) : assetSoftware.length === 0 ? (
                      <EmptyState
                        icon={Package}
                        title="Aucun logiciel"
                        description="Lancez une synchronisation pour remonter les logiciels de ce poste."
                      />
                    ) : (
                      assetSoftware.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-[11px] text-foreground">
                              {item.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-2">
                              {item.version || "—"}
                              {item.update_available && item.available_version
                                ? ` → ${item.available_version}`
                                : ""}
                            </p>
                          </div>
                          {item.update_available ? (
                            <Badge tone="warning">
                              <ArrowUpCircle className="h-3 w-3" />
                              MAJ
                            </Badge>
                          ) : null}
                          {canManage ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              onClick={() =>
                                setPendingAction({
                                  kind: "uninstall",
                                  packageName: item.name,
                                  assetId: selectedAssetId,
                                  hostLabel: selectedAsset?.name ?? "le poste sélectionné",
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Désinstaller
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Catalogue WAPT</h2>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Applications proposées par le serveur WAPT.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-48">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                      <Input
                        value={catalogFilter}
                        onChange={(event) => setCatalogFilter(event.target.value)}
                        placeholder="Filtrer…"
                        className="pl-8"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[520px] space-y-1 overflow-y-auto">
                    {catalogQuery.isError ? (
                      <ErrorState
                        message={
                          catalogQuery.error instanceof Error
                            ? catalogQuery.error.message
                            : "Erreur inconnue."
                        }
                        onRetry={() => void catalogQuery.refetch()}
                      />
                    ) : catalogQuery.isLoading ? (
                      <div className="space-y-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Skeleton key={index} className="h-10 rounded-lg" />
                        ))}
                      </div>
                    ) : filteredCatalog.length === 0 ? (
                      <EmptyState
                        icon={Package}
                        title="Aucun paquet"
                        description="Le serveur WAPT ne renvoie aucun paquet."
                      />
                    ) : (
                      filteredCatalog.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-[11px] text-foreground">
                              {item.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-2">
                              {item.version || item.description || "—"}
                            </p>
                          </div>
                          {canManage ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setPendingAction({
                                  kind: "install",
                                  packageName: item.name,
                                  assetId: selectedAssetId,
                                  hostLabel: selectedAsset?.name ?? "le poste sélectionné",
                                })
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              Installer
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.kind === "install"
            ? `Installer ${pendingAction.packageName} ?`
            : `Désinstaller ${pendingAction?.packageName ?? ""} ?`
        }
        description={`Action à distance sur ${pendingAction?.hostLabel ?? "le poste sélectionné"}. L'opération sera tracée dans l'audit.`}
        confirmLabel={pendingAction?.kind === "install" ? "Installer" : "Désinstaller"}
        tone={pendingAction?.kind === "uninstall" ? "danger" : "primary"}
        loading={actionLoading}
        onConfirm={() => void runAction()}
      />
    </div>
  );
}
