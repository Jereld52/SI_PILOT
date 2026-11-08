import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Package,
  Plug,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  WaptActionResponse,
  WaptConfig,
  WaptHost,
  WaptHostPackage,
  WaptPackage,
  WaptSyncResponse,
  WaptTestResponse,
} from "@/types/api";

type TabKey = "connection" | "hosts" | "packages";

interface PendingAction {
  kind: "install" | "uninstall";
  packageName: string;
}

export function AdminWaptPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("admin.settings.read");
  const canManage = hasPermission("admin.settings.manage");

  const [tab, setTab] = useState<TabKey>("connection");
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);
  const [hostsPath, setHostsPath] = useState("/api/v1/hosts");
  const [hostDetailPath, setHostDetailPath] = useState("/api/v1/hosts/{uuid}");
  const [fetchDetails, setFetchDetails] = useState(true);
  const [packagesPath, setPackagesPath] = useState("/api/v1/packages");
  const [hostPackagesPath, setHostPackagesPath] = useState("/api/v1/hosts/{uuid}/packages");
  const [installPath, setInstallPath] = useState("/api/v1/hosts/{uuid}/install");
  const [uninstallPath, setUninstallPath] = useState("/api/v1/hosts/{uuid}/uninstall");
  const [packageField, setPackageField] = useState("package");
  const [timeoutSeconds, setTimeoutSeconds] = useState("30");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<WaptTestResponse | null>(null);
  const [syncResult, setSyncResult] = useState<WaptSyncResponse | null>(null);
  const [selectedUuid, setSelectedUuid] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [packageFilter, setPackageFilter] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const configQuery = useQuery({
    queryKey: ["admin", "wapt", "config"],
    queryFn: () => apiFetch<WaptConfig>("/admin/wapt/config"),
    enabled: canRead,
  });
  const config = configQuery.data;

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setBaseUrl(config.base_url);
    setUsername(config.username);
    setPassword("");
    setVerifyTls(config.verify_tls);
    setHostsPath(config.hosts_path);
    setHostDetailPath(config.host_detail_path);
    setFetchDetails(config.fetch_details);
    setPackagesPath(config.packages_path);
    setHostPackagesPath(config.host_packages_path);
    setInstallPath(config.install_path);
    setUninstallPath(config.uninstall_path);
    setPackageField(config.package_field);
    setTimeoutSeconds(String(config.timeout_seconds));
  }, [config]);

  const hostsQuery = useQuery({
    queryKey: ["admin", "wapt", "hosts"],
    queryFn: () => apiFetch<WaptHost[]>("/admin/wapt/hosts"),
    enabled:
      canRead &&
      Boolean(config?.configured) &&
      (tab === "hosts" || tab === "packages"),
  });
  const packagesQuery = useQuery({
    queryKey: ["admin", "wapt", "packages"],
    queryFn: () => apiFetch<WaptPackage[]>("/admin/wapt/packages"),
    enabled: canRead && Boolean(config?.configured) && tab === "packages",
  });
  const hostPackagesQuery = useQuery({
    queryKey: ["admin", "wapt", "host-packages", selectedUuid],
    queryFn: () =>
      apiFetch<WaptHostPackage[]>(`/admin/wapt/hosts/${selectedUuid}/packages`),
    enabled: canRead && Boolean(selectedUuid),
  });

  const hosts = hostsQuery.data ?? [];
  const packages = packagesQuery.data ?? [];
  const hostPackages = hostPackagesQuery.data ?? [];
  const selectedHost = hosts.find((host) => host.uuid === selectedUuid) ?? null;

  const filteredHosts = useMemo(() => {
    const needle = hostFilter.trim().toLowerCase();
    if (!needle) return hosts;
    return hosts.filter((host) =>
      [host.hostname, host.ip_address, host.serial_number, host.last_user, host.os_name]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [hosts, hostFilter]);

  const filteredPackages = useMemo(() => {
    const needle = packageFilter.trim().toLowerCase();
    if (!needle) return packages;
    return packages.filter((item) =>
      `${item.name} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [packages, packageFilter]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch<WaptConfig>("/admin/wapt/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          base_url: baseUrl,
          username,
          password: password || null,
          verify_tls: verifyTls,
          hosts_path: hostsPath,
          host_detail_path: hostDetailPath,
          fetch_details: fetchDetails,
          packages_path: packagesPath,
          host_packages_path: hostPackagesPath,
          install_path: installPath,
          uninstall_path: uninstallPath,
          package_field: packageField,
          timeout_seconds: Number(timeoutSeconds) || 30,
        }),
      });
      toast.success("Configuration WAPT enregistrée.");
      setPassword("");
      void configQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<WaptTestResponse>("/admin/wapt/test", { method: "POST" });
      setTestResult(result);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Test WAPT impossible.");
    } finally {
      setTesting(false);
    }
  };

  const syncInventory = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await apiFetch<WaptSyncResponse>("/admin/wapt/sync", { method: "POST" });
      setSyncResult(result);
      toast.success(
        `Synchronisation terminée : ${result.created} créé(s), ${result.updated} mis à jour.`,
      );
      void hostsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  };

  const runAction = async () => {
    if (!pendingAction || !selectedUuid) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<WaptActionResponse>(
        `/admin/wapt/hosts/${selectedUuid}/${pendingAction.kind}`,
        {
          method: "POST",
          body: JSON.stringify({ package: pendingAction.packageName }),
        },
      );
      toast.success(result.message);
      setPendingAction(null);
      if (pendingAction.kind === "uninstall") {
        void hostPackagesQuery.refetch();
      }
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
        description="Votre rôle ne permet pas de consulter la connexion WAPT."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        items={[
          { key: "connection", label: "Connexion", icon: Plug },
          { key: "hosts", label: "Postes", icon: Server },
          { key: "packages", label: "Logiciels", icon: Package },
        ]}
        value={tab}
        onChange={(value) => setTab(value as TabKey)}
      />

      {tab === "connection" ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Connexion au serveur WAPT</h2>
              <p className="mt-1 text-xs text-muted">
                Synchronisez l'inventaire, l'état en ligne et les logiciels des postes.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={config?.configured ? "success" : "neutral"}>
                {config?.configured ? "Configuré" : "Non configuré"}
              </Badge>
              <Badge tone={config?.enabled ? "success" : "warning"}>
                {config?.enabled ? "Actif" : "Désactivé"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="sm:col-span-2">
                <Label htmlFor="wapt-url">URL du serveur WAPT</Label>
                <Input
                  id="wapt-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://wapt.forets-parcnational.fr"
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="wapt-user">Identifiant</Label>
                <Input
                  id="wapt-user"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="wapt-password">Mot de passe</Label>
                <Input
                  id="wapt-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={config?.password_set ? "Laisser vide pour conserver" : "Mot de passe"}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
                Connexion active
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <Switch checked={verifyTls} onCheckedChange={setVerifyTls} disabled={!canManage} />
                Vérifier le certificat TLS
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <Switch checked={fetchDetails} onCheckedChange={setFetchDetails} disabled={!canManage} />
                Récupérer l'inventaire détaillé
              </label>
            </div>
            <details className="rounded-lg border border-border-soft bg-background/30 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-medium text-muted">
                Chemins API avancés
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <Label htmlFor="wapt-hosts-path">Liste des postes</Label>
                  <Input id="wapt-hosts-path" value={hostsPath} onChange={(event) => setHostsPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-host-detail-path">Détail d'un poste</Label>
                  <Input id="wapt-host-detail-path" value={hostDetailPath} onChange={(event) => setHostDetailPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-packages-path">Liste des paquets</Label>
                  <Input id="wapt-packages-path" value={packagesPath} onChange={(event) => setPackagesPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-host-packages-path">Paquets installés</Label>
                  <Input id="wapt-host-packages-path" value={hostPackagesPath} onChange={(event) => setHostPackagesPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-install-path">Installation</Label>
                  <Input id="wapt-install-path" value={installPath} onChange={(event) => setInstallPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-uninstall-path">Désinstallation</Label>
                  <Input id="wapt-uninstall-path" value={uninstallPath} onChange={(event) => setUninstallPath(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-package-field">Champ paquet</Label>
                  <Input id="wapt-package-field" value={packageField} onChange={(event) => setPackageField(event.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <Label htmlFor="wapt-timeout">Délai (secondes)</Label>
                  <Input id="wapt-timeout" inputMode="numeric" value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(event.target.value)} disabled={!canManage} />
                </div>
              </div>
            </details>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button loading={saving} onClick={() => void saveConfig()}>
                  <Save className="h-3.5 w-3.5" />
                  Enregistrer
                </Button>
                <Button variant="secondary" loading={testing} onClick={() => void testConnection()}>
                  <Plug className="h-3.5 w-3.5" />
                  Tester la connexion
                </Button>
                <Button variant="secondary" loading={syncing} onClick={() => void syncInventory()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Synchroniser l'inventaire
                </Button>
              </div>
            ) : null}
            {testResult ? (
              <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
                <p className="font-semibold">{testResult.message}</p>
                {testResult.sample_hosts.length > 0 ? (
                  <p className="mt-1 text-success/90">
                    Exemples : {testResult.sample_hosts.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {syncResult ? (
              <div className="rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-[11px] text-info">
                <p className="font-semibold">Synchronisation terminée en {syncResult.duration_seconds}s</p>
                <p>
                  {formatNumber(syncResult.total)} poste(s) · {formatNumber(syncResult.created)} créé(s) ·{" "}
                  {formatNumber(syncResult.updated)} mis à jour · {formatNumber(syncResult.skipped)} ignoré(s)
                </p>
                {syncResult.errors.length > 0 ? (
                  <p className="mt-1 text-warning">{syncResult.errors.join(" · ")}</p>
                ) : null}
              </div>
            ) : null}
            <p className="text-[10px] leading-4 text-muted-2">
              Les appels utilisent les identifiants WAPT fournis. Le mot de passe est chiffré et
              n'est jamais renvoyé par l'API. Les installations et désinstallations sont auditées.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tab === "hosts" ? (
        <Card>
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Postes WAPT</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                État en ligne, dernière connexion et inventaire remonté par le serveur.
              </p>
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                <Input
                  value={hostFilter}
                  onChange={(event) => setHostFilter(event.target.value)}
                  placeholder="Rechercher un poste…"
                  className="pl-8"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={() => void hostsQuery.refetch()}>
                <RefreshCw className={cn("h-3.5 w-3.5", hostsQuery.isFetching && "animate-spin")} />
                Actualiser
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {!config?.configured ? (
              <EmptyState icon={Plug} title="WAPT non configuré" description="Renseignez la connexion dans l'onglet Connexion." />
            ) : hostsQuery.isError ? (
              <ErrorState
                message={hostsQuery.error instanceof Error ? hostsQuery.error.message : "Erreur inconnue."}
                onRetry={() => void hostsQuery.refetch()}
              />
            ) : hostsQuery.isLoading ? (
              <div className="space-y-1 px-3 pb-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : filteredHosts.length === 0 ? (
              <EmptyState icon={Server} title="Aucun poste" description="Aucun poste WAPT ne correspond à la recherche." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Poste</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead className="hidden lg:table-cell">Système</TableHead>
                    <TableHead className="hidden xl:table-cell">IP</TableHead>
                    <TableHead className="hidden xl:table-cell">Dernière connexion</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Dernier utilisateur</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHosts.map((host) => (
                    <TableRow key={host.uuid || host.hostname}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{host.hostname || "—"}</p>
                        <p className="font-mono text-[10px] text-muted-2">{host.uuid || host.serial_number || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={host.connected ? "success" : "danger"}>
                          {host.connected ? "En ligne" : "Hors ligne"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {[host.os_name, host.os_version].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] text-muted xl:table-cell">
                        {host.ip_address || "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {host.last_seen ? formatDateTime(host.last_seen) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted 2xl:table-cell">
                        {host.last_user || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUuid(host.uuid);
                            setTab("packages");
                          }}
                        >
                          <Package className="h-3.5 w-3.5" />
                          Logiciels
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "packages" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Poste cible</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Sélectionnez un poste pour installer ou désinstaller des applications.
                </p>
              </div>
              <div className="flex flex-1 justify-end">
                <Select
                  value={selectedUuid}
                  onChange={(event) => setSelectedUuid(event.target.value)}
                  className="w-full sm:w-80"
                >
                  <option value="">Sélectionner un poste</option>
                  {hosts.map((host) => (
                    <option key={host.uuid || host.hostname} value={host.uuid}>
                      {host.hostname || host.uuid} — {host.connected ? "en ligne" : "hors ligne"}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            {selectedHost ? (
              <CardContent className="grid gap-2 text-[11px] sm:grid-cols-2 xl:grid-cols-4">
                <p><span className="text-muted-2">UUID : </span>{selectedHost.uuid}</p>
                <p><span className="text-muted-2">IP : </span>{selectedHost.ip_address || "—"}</p>
                <p><span className="text-muted-2">Système : </span>{[selectedHost.os_name, selectedHost.os_version].filter(Boolean).join(" ") || "—"}</p>
                <p><span className="text-muted-2">État : </span>{selectedHost.connected ? "En ligne" : "Hors ligne"}</p>
              </CardContent>
            ) : null}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Paquets disponibles</h2>
                  <p className="mt-0.5 text-[11px] text-muted">Applications proposées par le serveur WAPT.</p>
                </div>
                <div className="relative w-full sm:w-48">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                  <Input value={packageFilter} onChange={(event) => setPackageFilter(event.target.value)} placeholder="Filtrer…" className="pl-8" />
                </div>
              </CardHeader>
              <CardContent className="max-h-[520px] space-y-1 overflow-y-auto">
                {packagesQuery.isError ? (
                  <ErrorState message={packagesQuery.error instanceof Error ? packagesQuery.error.message : "Erreur inconnue."} onRetry={() => void packagesQuery.refetch()} />
                ) : packagesQuery.isLoading ? (
                  <div className="space-y-1">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
                ) : filteredPackages.length === 0 ? (
                  <EmptyState icon={Package} title="Aucun paquet" description="Le serveur WAPT ne renvoie aucun paquet." />
                ) : (
                  filteredPackages.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] text-foreground">{item.name}</p>
                        <p className="truncate text-[10px] text-muted-2">{item.version || item.description || "—"}</p>
                      </div>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!selectedUuid}
                          onClick={() => setPendingAction({ kind: "install", packageName: item.name })}
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

            <Card>
              <CardHeader>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Paquets installés</h2>
                  <p className="mt-0.5 text-[11px] text-muted">Applications actuellement présentes sur le poste.</p>
                </div>
              </CardHeader>
              <CardContent className="max-h-[520px] space-y-1 overflow-y-auto">
                {!selectedUuid ? (
                  <EmptyState icon={Server} title="Aucun poste sélectionné" description="Choisissez un poste pour afficher ses logiciels." />
                ) : hostPackagesQuery.isError ? (
                  <ErrorState message={hostPackagesQuery.error instanceof Error ? hostPackagesQuery.error.message : "Erreur inconnue."} onRetry={() => void hostPackagesQuery.refetch()} />
                ) : hostPackagesQuery.isLoading ? (
                  <div className="space-y-1">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
                ) : hostPackages.length === 0 ? (
                  <EmptyState icon={Package} title="Aucun logiciel" description="Aucun paquet installé n'a été remonté." />
                ) : (
                  hostPackages.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] text-foreground">{item.name}</p>
                        <p className="truncate text-[10px] text-muted-2">{item.version || "—"}</p>
                      </div>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          onClick={() => setPendingAction({ kind: "uninstall", packageName: item.name })}
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
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.kind === "install"
            ? `Installer ${pendingAction.packageName} ?`
            : `Désinstaller ${pendingAction?.packageName ?? ""} ?`
        }
        description={`Action à distance sur ${selectedHost?.hostname ?? "le poste sélectionné"}. L'opération sera tracée dans l'audit.`}
        confirmLabel={pendingAction?.kind === "install" ? "Installer" : "Désinstaller"}
        tone={pendingAction?.kind === "uninstall" ? "danger" : "primary"}
        loading={actionLoading}
        onConfirm={() => void runAction()}
      />
    </div>
  );
}
