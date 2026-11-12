import { useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Plug, Save, ShieldCheck } from "lucide-react";
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
import type { VeeamConfig, VeeamTestResponse } from "@/types/api";

const API_VERSIONS = ["1.2-rev1", "1.3-rev1", "1.1-rev0", "1.0-rev1"];

export function AdminVeeamPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("admin.settings.read");
  const canManage = hasPermission("admin.settings.manage");

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiVersion, setApiVersion] = useState("1.2-rev1");
  const [verifyTls, setVerifyTls] = useState(true);
  const [timeoutSeconds, setTimeoutSeconds] = useState("30");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<VeeamTestResponse | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin", "veeam", "config"],
    queryFn: () => apiFetch<VeeamConfig>("/admin/veeam/config"),
    enabled: canRead,
  });
  const config = configQuery.data;

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setBaseUrl(config.base_url);
    setUsername(config.username);
    setPassword("");
    setApiVersion(config.api_version);
    setVerifyTls(config.verify_tls);
    setTimeoutSeconds(String(config.timeout_seconds));
    setTestResult(null);
  }, [config]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch<VeeamConfig>("/admin/veeam/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          base_url: baseUrl,
          username,
          password: password || null,
          api_version: apiVersion,
          verify_tls: verifyTls,
          timeout_seconds: Number(timeoutSeconds) || 30,
        }),
      });
      toast.success("Configuration Veeam enregistrée.");
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
      const result = await apiFetch<VeeamTestResponse>("/admin/veeam/test", { method: "POST" });
      setTestResult(result);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Test Veeam impossible.");
    } finally {
      setTesting(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter la connexion Veeam."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Connexion à Veeam Backup &amp; Replication
            </h2>
            <p className="mt-1 text-xs text-muted">
              API REST VBR 12. Les jobs, sessions et dépôts se consultent depuis Infrastructure →
              Sauvegardes.
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
              <Label htmlFor="veeam-url">URL de l'API REST</Label>
              <Input
                id="veeam-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://veeam.example.org:9419"
                disabled={!canManage}
              />
              <p className="mt-1 text-[10px] text-muted-2">
                Généralement <span className="font-mono">https://serveur-veeam:9419</span>, sans{" "}
                <span className="font-mono">/api</span> à la fin.
              </p>
            </div>
            <div>
              <Label htmlFor="veeam-user">Identifiant</Label>
              <Input
                id="veeam-user"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="compte de service"
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="veeam-password">Mot de passe</Label>
              <Input
                id="veeam-password"
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
          </div>
          <details className="rounded-lg border border-border-soft bg-background/30 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-muted">
              Paramètres avancés
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="veeam-api-version">Version de l'API</Label>
                <Input
                  id="veeam-api-version"
                  list="veeam-api-versions"
                  value={apiVersion}
                  onChange={(event) => setApiVersion(event.target.value)}
                  disabled={!canManage}
                />
                <datalist id="veeam-api-versions">
                  {API_VERSIONS.map((version) => (
                    <option key={version} value={version} />
                  ))}
                </datalist>
                <p className="mt-1 text-[10px] text-muted-2">
                  VBR 12.0 : <span className="font-mono">1.2-rev1</span>. VBR 12.1 et 12.3 :{" "}
                  <span className="font-mono">1.3-rev1</span>.
                </p>
              </div>
              <div>
                <Label htmlFor="veeam-timeout">Délai maximal (secondes)</Label>
                <Input
                  id="veeam-timeout"
                  inputMode="numeric"
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-4 text-info">
              L'authentification utilise <span className="font-mono">POST /api/oauth2/token</span>{" "}
              puis l'en-tête <span className="font-mono">x-api-version</span>. Les appels sont en
              lecture seule sur les jobs, sessions et dépôts.
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
              <Link
                to="/sauvegardes"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <DatabaseBackup className="h-3.5 w-3.5" />
                Ouvrir les sauvegardes
              </Link>
            </div>
          ) : null}
          {testResult ? (
            <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
              <p className="font-semibold">{testResult.message}</p>
            </div>
          ) : null}
          <div className="rounded-lg border border-border-soft bg-background/30 px-3 py-2 text-[10px] leading-4 text-muted-2">
            <p className="font-medium text-muted">Prérequis côté Veeam</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Le service API REST doit être démarré sur le serveur VBR (port 9419 par défaut).</li>
              <li>
                Le compte utilisé doit disposer au minimum du rôle <em>Veeam Backup Viewer</em> pour
                la lecture des jobs et sessions.
              </li>
              <li>
                Les dépôts peuvent être refusés à un compte Viewer : la page de suivi reste
                utilisable, seule la partie dépôts est alors indisponible.
              </li>
              <li>
                Le mot de passe est chiffré avec <span className="font-mono">FIELD_ENCRYPTION_KEY</span>{" "}
                et n'est jamais renvoyé par l'API.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
