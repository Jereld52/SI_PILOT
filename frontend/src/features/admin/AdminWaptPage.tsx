import { useQuery } from "@tanstack/react-query";
import { Boxes, KeyRound, Plug, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type {
  WaptConfig,
  WaptSigningTestResponse,
  WaptSyncResponse,
  WaptTestResponse,
} from "@/types/api";

export function AdminWaptPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("admin.settings.read");
  const canManage = hasPermission("admin.settings.manage");

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verifyTls, setVerifyTls] = useState(true);
  const [hostsPath, setHostsPath] = useState("/api/v1/hosts");
  const [hostDetailPath, setHostDetailPath] = useState("/api/v1/hosts?uuid={uuid}");
  const [fetchDetails, setFetchDetails] = useState(false);
  const [packagesPath, setPackagesPath] = useState("/api/v3/packages");
  const [hostPackagesPath, setHostPackagesPath] = useState(
    "/api/v1/host_data?uuid={uuid}&field=installed_packages",
  );
  const [installPath, setInstallPath] = useState("/api/v1/hosts/{uuid}/install");
  const [uninstallPath, setUninstallPath] = useState("/api/v1/hosts/{uuid}/uninstall");
  const [triggerActionPath, setTriggerActionPath] = useState(
    "/api/v3/trigger_host_action",
  );
  const [signingKeyPath, setSigningKeyPath] = useState("");
  const [signingCertPath, setSigningCertPath] = useState("");
  const [signingKeyPassword, setSigningKeyPassword] = useState("");
  const [packageField, setPackageField] = useState("package");
  const [timeoutSeconds, setTimeoutSeconds] = useState("30");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [signingTesting, setSigningTesting] = useState(false);
  const [testResult, setTestResult] = useState<WaptTestResponse | null>(null);
  const [syncResult, setSyncResult] = useState<WaptSyncResponse | null>(null);
  const [signingResult, setSigningResult] = useState<WaptSigningTestResponse | null>(
    null,
  );

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
    setTriggerActionPath(config.trigger_action_path);
    setSigningKeyPath(config.signing_key_path);
    setSigningCertPath(config.signing_cert_path);
    setSigningKeyPassword("");
    setPackageField(config.package_field);
    setTimeoutSeconds(String(config.timeout_seconds));
    setSigningResult(null);
  }, [config]);

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
          trigger_action_path: triggerActionPath,
          signing_key_path: signingKeyPath,
          signing_cert_path: signingCertPath,
          signing_key_password: signingKeyPassword || null,
          package_field: packageField,
          timeout_seconds: Number(timeoutSeconds) || 30,
        }),
      });
      toast.success("Configuration WAPT enregistrée.");
      setPassword("");
      setSigningKeyPassword("");
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

  const testSigning = async () => {
    setSigningTesting(true);
    setSigningResult(null);
    try {
      const result = await apiFetch<WaptSigningTestResponse>(
        "/admin/wapt/signing-test",
        { method: "POST" },
      );
      setSigningResult(result);
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Test de signature impossible.",
      );
    } finally {
      setSigningTesting(false);
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
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Synchronisation impossible.");
    } finally {
      setSyncing(false);
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
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Connexion au serveur WAPT</h2>
            <p className="mt-1 text-xs text-muted">
              Identifiants et chemins API. Les logiciels, les installations et les mises à jour se
              consultent depuis Support &amp; parc → Logiciels.
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
                placeholder="https://wapt.example.org"
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
                <Label htmlFor="wapt-trigger-path">Actions signées</Label>
                <Input id="wapt-trigger-path" value={triggerActionPath} onChange={(event) => setTriggerActionPath(event.target.value)} disabled={!canManage} />
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
            <div className="mt-3 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-4 text-info">
              WAPT 2.4 : catalogue via <span className="font-mono">/api/v3/packages</span> et paquets installés via{" "}
              <span className="font-mono">/api/v1/host_data?uuid=&#123;uuid&#125;&amp;field=installed_packages</span>.
            </div>
          </details>
          <div className="space-y-3 rounded-lg border border-border-soft bg-background/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Signature des actions à distance
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">
                  WAPT 2.4 refuse les installations et désinstallations non signées. Indiquez la clé
                  privée et le certificat utilisés par la console WAPT.
                </p>
              </div>
              <Badge
                tone={
                  config?.signing_key_path && config?.signing_cert_path
                    ? "success"
                    : "warning"
                }
              >
                {config?.signing_key_path && config?.signing_cert_path
                  ? "Signature configurée"
                  : "Signature non configurée"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="wapt-signing-key">Clé privée</Label>
                <Input
                  id="wapt-signing-key"
                  value={signingKeyPath}
                  onChange={(event) => setSigningKeyPath(event.target.value)}
                  placeholder={"C:\\Users\\compte\\private\\key.pem"}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="wapt-signing-cert">Certificat</Label>
                <Input
                  id="wapt-signing-cert"
                  value={signingCertPath}
                  onChange={(event) => setSigningCertPath(event.target.value)}
                  placeholder={"C:\\Users\\compte\\private\\key.crt"}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="wapt-signing-password">Mot de passe de la clé</Label>
                <Input
                  id="wapt-signing-password"
                  type="password"
                  value={signingKeyPassword}
                  onChange={(event) => setSigningKeyPassword(event.target.value)}
                  placeholder={
                    config?.signing_key_password_set
                      ? "Laisser vide pour conserver"
                      : "Mot de passe de la clé privée"
                  }
                  disabled={!canManage}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  loading={signingTesting}
                  onClick={() => void testSigning()}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Tester la signature
                </Button>
              </div>
            </div>
            {signingResult ? (
              <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
                <p className="font-semibold">{signingResult.message}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-success/90">
                  {signingResult.fingerprint}
                </p>
                <p className="text-[10px] text-success/90">{signingResult.certificate_subject}</p>
              </div>
            ) : null}
            <p className="text-[10px] leading-4 text-muted-2">
              La clé se trouve généralement dans <span className="font-mono">C:\Users\&lt;compte&gt;\private\key.pem</span>{" "}
              avec son certificat <span className="font-mono">key.crt</span>. Le mot de passe est celui
              saisi par la console WAPT lors de la signature. Il est chiffré en base et n'est jamais
              renvoyé par l'API.
            </p>
          </div>
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
              <Link
                to="/logiciels"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <Boxes className="h-3.5 w-3.5" />
                Ouvrir les logiciels
              </Link>
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
    </div>
  );
}
