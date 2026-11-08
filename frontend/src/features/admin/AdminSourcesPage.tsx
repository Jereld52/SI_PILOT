import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Link2,
  MonitorSmartphone,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Upload,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { LdapDirectoryPanel } from "@/features/admin/LdapDirectoryPanel";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  ImportJob,
  LdapConfig,
  LdapPreviewResponse,
  LdapSyncResponse,
  LdapTestResponse,
} from "@/types/api";

type TabKey = "ldap" | "directory" | "rdm";

const ldapStatusTones: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  create: "success",
  update: "info",
  skip: "neutral",
  error: "danger",
};

const ldapStatusLabels: Record<string, string> = {
  create: "À créer",
  update: "À mettre à jour",
  skip: "Ignoré",
  error: "Erreur",
};

export function AdminSourcesPage() {
  const { hasPermission } = useAuth();
  const canReadSettings = hasPermission("admin.settings.read");
  const canManageSettings = hasPermission("admin.settings.manage");
  const canPreview = hasPermission("imports.preview");
  const canApply = hasPermission("imports.apply");

  const [tab, setTab] = useState<TabKey>("ldap");
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapUrl, setLdapUrl] = useState("");
  const [ldapBaseDn, setLdapBaseDn] = useState("");
  const [ldapBindDn, setLdapBindDn] = useState("");
  const [ldapPassword, setLdapPassword] = useState("");
  const [ldapClearPassword, setLdapClearPassword] = useState(false);
  const [ldapFilter, setLdapFilter] = useState("");
  const [ldapTlsVerify, setLdapTlsVerify] = useState(true);
  const [ldapUsersBaseDn, setLdapUsersBaseDn] = useState("");
  const [ldapGroupsBaseDn, setLdapGroupsBaseDn] = useState("");
  const [ldapWriteEnabled, setLdapWriteEnabled] = useState(false);
  const [ldapUpnSuffix, setLdapUpnSuffix] = useState("");
  const [ldapPasswordSet, setLdapPasswordSet] = useState(false);
  const [ldapSaving, setLdapSaving] = useState(false);
  const [ldapTesting, setLdapTesting] = useState(false);
  const [ldapTest, setLdapTest] = useState<LdapTestResponse | null>(null);
  const [ldapPreview, setLdapPreview] = useState<LdapPreviewResponse | null>(null);
  const [ldapPreviewLoading, setLdapPreviewLoading] = useState(false);
  const [ldapSyncing, setLdapSyncing] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [ldapError, setLdapError] = useState<string | null>(null);
  const [rdmImportOpen, setRdmImportOpen] = useState(false);

  const ldapQuery = useQuery({
    queryKey: ["ldap", "config"],
    queryFn: () => apiFetch<LdapConfig>("/ldap/config"),
    enabled: canReadSettings,
  });
  const historyQuery = useQuery({
    queryKey: ["imports", "history", "sources"],
    queryFn: () => apiFetch<ImportJob[]>("/imports"),
    enabled: canPreview,
  });

  useEffect(() => {
    const config = ldapQuery.data;
    if (!config) return;
    setLdapEnabled(config.enabled);
    setLdapUrl(config.url);
    setLdapBaseDn(config.base_dn);
    setLdapBindDn(config.bind_dn);
    setLdapPassword("");
    setLdapClearPassword(false);
    setLdapFilter(config.user_filter);
    setLdapTlsVerify(config.tls_verify);
    setLdapUsersBaseDn(config.users_base_dn ?? "");
    setLdapGroupsBaseDn(config.groups_base_dn ?? "");
    setLdapWriteEnabled(config.write_enabled ?? false);
    setLdapUpnSuffix(config.upn_suffix ?? "");
    setLdapPasswordSet(config.bind_password_set);
  }, [ldapQuery.data]);

  const history = historyQuery.data ?? [];
  const rdmImports = history.filter((job) => job.entity_type === "rdm").length;
  const lastLdapSync = history.find((job) => job.entity_type === "ldap");
  const ldapConfigured = Boolean(ldapQuery.data?.url && ldapQuery.data?.base_dn);

  const saveLdap = async () => {
    setLdapSaving(true);
    setLdapError(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: ldapEnabled,
        url: ldapUrl,
        base_dn: ldapBaseDn,
        bind_dn: ldapBindDn,
        user_filter: ldapFilter,
        tls_verify: ldapTlsVerify,
        users_base_dn: ldapUsersBaseDn,
        groups_base_dn: ldapGroupsBaseDn,
        write_enabled: ldapWriteEnabled,
        upn_suffix: ldapUpnSuffix,
      };
      if (ldapClearPassword) payload.bind_password = "";
      else if (ldapPassword) payload.bind_password = ldapPassword;
      const updated = await apiFetch<LdapConfig>("/ldap/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setLdapPasswordSet(updated.bind_password_set);
      setLdapPassword("");
      setLdapClearPassword(false);
      toast.success("Configuration LDAP enregistrée.");
      void ldapQuery.refetch();
    } catch (caught) {
      setLdapError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLdapSaving(false);
    }
  };

  const testLdap = async () => {
    setLdapTesting(true);
    setLdapError(null);
    setLdapTest(null);
    try {
      const result = await apiFetch<LdapTestResponse>("/ldap/test", { method: "POST" });
      setLdapTest(result);
      toast.success(result.message);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Test impossible.";
      setLdapError(message);
      toast.error(message);
    } finally {
      setLdapTesting(false);
    }
  };

  const previewLdap = async () => {
    setLdapPreviewLoading(true);
    setLdapError(null);
    setLdapPreview(null);
    try {
      const result = await apiFetch<LdapPreviewResponse>(
        `/ldap/preview${buildQuery({ update_existing: updateExisting })}`,
        { method: "POST" },
      );
      setLdapPreview(result);
      toast.success(result.message);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Prévisualisation impossible.";
      setLdapError(message);
      toast.error(message);
    } finally {
      setLdapPreviewLoading(false);
    }
  };

  const syncLdap = async () => {
    setLdapSyncing(true);
    setLdapError(null);
    try {
      const result = await apiFetch<LdapSyncResponse>("/ldap/sync", {
        method: "POST",
        body: JSON.stringify({ update_existing: updateExisting }),
      });
      toast.success(result.message);
      setLdapPreview(null);
      void historyQuery.refetch();
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Synchronisation impossible.";
      setLdapError(message);
      toast.error(message);
    } finally {
      setLdapSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Sources de données</h2>
        <p className="mt-0.5 text-xs text-muted">
          Connexions d'enrichissement de la base : annuaire Active Directory et Remote Desktop Manager.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Active Directory</p>
          <p className="mt-1">
            <Badge tone={ldapQuery.data?.enabled ? "success" : ldapConfigured ? "warning" : "neutral"}>
              {ldapQuery.data?.enabled
                ? "Synchronisation active"
                : ldapConfigured
                  ? "Configuré, inactif"
                  : "Non configuré"}
            </Badge>
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            {ldapPasswordSet ? "Compte de service enregistré" : "Aucun compte de service"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Dernière synchronisation</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {lastLdapSync ? formatDateTime(lastLdapSync.applied_at ?? lastLdapSync.created_at) : "—"}
          </p>
          <p className="text-[10px] text-muted-2">
            {lastLdapSync
              ? `${lastLdapSync.valid_rows} agent(s) créé(s) ou mis à jour`
              : "Aucune synchronisation"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Imports RDM</p>
          <p className="mt-1 text-2xl font-semibold text-accent">{formatNumber(rdmImports)}</p>
          <p className="mt-1 text-[10px] text-muted-2">exports CSV traités</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
        {[
          { key: "ldap" as const, label: "Active Directory", icon: Link2 },
          { key: "directory" as const, label: "Utilisateurs & groupes", icon: UsersRound },
          { key: "rdm" as const, label: "Remote Desktop Manager", icon: MonitorSmartphone },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === item.key
                ? "bg-primary text-brand-cream"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "ldap" ? (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="panel-sheen border-primary/20">
            <CardHeader>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Annuaire</p>
                <h2 className="text-sm font-semibold text-foreground">Connexion Active Directory</h2>
                <p className="mt-1 text-xs text-muted">
                  Lecture et, si activé, écriture contrôlée. Le mot de passe est chiffré avec la clé
                  de l'application.
                </p>
              </div>
              <Badge tone={ldapEnabled ? "success" : "neutral"}>
                {ldapEnabled ? "Activé" : "Désactivé"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {ldapError ? (
                <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {ldapError}
                </p>
              ) : null}
              <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Synchronisation autorisée</p>
                  <p className="text-[10px] text-muted-2">
                    Nécessaire pour appliquer une synchronisation des agents.
                  </p>
                </div>
                <Switch
                  checked={ldapEnabled}
                  onCheckedChange={setLdapEnabled}
                  disabled={!canManageSettings}
                  label="Synchronisation LDAP"
                />
              </div>
              <div>
                <Label htmlFor="ldap-url">URL du serveur</Label>
                <Input
                  id="ldap-url"
                  value={ldapUrl}
                  onChange={(event) => setLdapUrl(event.target.value)}
                  placeholder="ldaps://dc01.pnfor.local:636"
                  disabled={!canManageSettings}
                />
              </div>
              <div>
                <Label htmlFor="ldap-base">Base de recherche</Label>
                <Input
                  id="ldap-base"
                  value={ldapBaseDn}
                  onChange={(event) => setLdapBaseDn(event.target.value)}
                  placeholder="OU=Agents,DC=pnfor,DC=local"
                  disabled={!canManageSettings}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ldap-users-base">OU de création des utilisateurs</Label>
                  <Input
                    id="ldap-users-base"
                    value={ldapUsersBaseDn}
                    onChange={(event) => setLdapUsersBaseDn(event.target.value)}
                    placeholder="OU=Agents,DC=pnfor,DC=local"
                    disabled={!canManageSettings}
                  />
                </div>
                <div>
                  <Label htmlFor="ldap-groups-base">Base des groupes</Label>
                  <Input
                    id="ldap-groups-base"
                    value={ldapGroupsBaseDn}
                    onChange={(event) => setLdapGroupsBaseDn(event.target.value)}
                    placeholder="OU=Groupes,DC=pnfor,DC=local"
                    disabled={!canManageSettings}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ldap-upn">Suffixe UPN</Label>
                <Input
                  id="ldap-upn"
                  value={ldapUpnSuffix}
                  onChange={(event) => setLdapUpnSuffix(event.target.value)}
                  placeholder="@forets-parcnational.fr"
                  disabled={!canManageSettings}
                />
                <p className="mt-1 text-[10px] text-muted-2">
                  Utilisé pour construire le userPrincipalName à la création. Laissez vide pour
                  utiliser l'adresse e-mail.
                </p>
              </div>
              <div>
                <Label htmlFor="ldap-bind">Compte de service (DN)</Label>
                <Input
                  id="ldap-bind"
                  value={ldapBindDn}
                  onChange={(event) => setLdapBindDn(event.target.value)}
                  placeholder="CN=svc-si,OU=Services,DC=pnfor,DC=local"
                  disabled={!canManageSettings}
                />
              </div>
              <div>
                <Label htmlFor="ldap-password">
                  Mot de passe du compte de service
                  {ldapPasswordSet ? " (déjà enregistré)" : ""}
                </Label>
                <Input
                  id="ldap-password"
                  type="password"
                  autoComplete="new-password"
                  value={ldapPassword}
                  onChange={(event) => setLdapPassword(event.target.value)}
                  placeholder={ldapPasswordSet ? "Laisser vide pour conserver" : "Mot de passe"}
                  disabled={!canManageSettings}
                />
                {ldapPasswordSet ? (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                    <Checkbox
                      checked={ldapClearPassword}
                      onChange={(event) => setLdapClearPassword(event.target.checked)}
                      disabled={!canManageSettings}
                    />
                    Effacer le mot de passe enregistré
                  </label>
                ) : null}
              </div>
              <div>
                <Label htmlFor="ldap-filter">Filtre utilisateurs</Label>
                <Textarea
                  id="ldap-filter"
                  value={ldapFilter}
                  onChange={(event) => setLdapFilter(event.target.value)}
                  rows={2}
                  className="font-mono text-[11px]"
                  disabled={!canManageSettings}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Gestion de l'annuaire</p>
                  <p className="text-[10px] text-muted-2">
                    Autorise la création, la modification des utilisateurs et l'appartenance aux groupes.
                  </p>
                </div>
                <Switch
                  checked={ldapWriteEnabled}
                  onCheckedChange={setLdapWriteEnabled}
                  disabled={!canManageSettings}
                  label="Gestion de l'annuaire"
                />
              </div>
              {ldapWriteEnabled && !ldapUrl.toLowerCase().startsWith("ldaps://") ? (
                <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[10px] leading-4 text-warning">
                  Les écritures sont possibles en LDAP simple, mais la définition d'un mot de passe
                  nécessite impérativement LDAPS.
                </p>
              ) : null}
              <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Vérifier le certificat TLS</p>
                  <p className="text-[10px] text-muted-2">
                    Désactivez uniquement pour un contrôleur avec certificat interne non approuvé.
                  </p>
                </div>
                <Switch
                  checked={ldapTlsVerify}
                  onCheckedChange={setLdapTlsVerify}
                  disabled={!canManageSettings}
                  label="Vérifier le certificat TLS"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageSettings ? (
                  <Button size="sm" loading={ldapSaving} onClick={() => void saveLdap()}>
                    <Save className="h-3.5 w-3.5" />
                    Enregistrer
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-2">
                    Seul un administrateur peut modifier la configuration.
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  loading={ldapTesting}
                  disabled={!canReadSettings || !ldapUrl}
                  onClick={() => void testLdap()}
                >
                  <Plug className="h-3.5 w-3.5" />
                  Tester
                </Button>
              </div>
              {ldapTest ? (
                <div className="rounded-lg border border-success/25 bg-success/10 p-3 text-xs text-success">
                  <p className="font-medium">{ldapTest.message}</p>
                  <p className="mt-1 text-[10px] text-success/80">
                    {ldapTest.server_vendor ?? "Serveur LDAP"}
                    {ldapTest.server_version ? ` · ${ldapTest.server_version}` : ""}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="panel-sheen border-primary/20">
            <CardHeader>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Synchronisation</p>
                <h2 className="text-sm font-semibold text-foreground">Prévisualiser et importer les agents</h2>
                <p className="mt-1 text-xs text-muted">
                  Les comptes désactivés sont exclus par le filtre par défaut. Les agents existants
                  peuvent être mis à jour sans être dupliqués.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-xs text-muted">
                <Checkbox
                  checked={updateExisting}
                  onChange={(event) => setUpdateExisting(event.target.checked)}
                />
                Mettre à jour les agents déjà présents
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={ldapPreviewLoading}
                  disabled={!canPreview || !ldapUrl || !ldapBaseDn}
                  onClick={() => void previewLdap()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Prévisualiser
                </Button>
                <Button
                  size="sm"
                  loading={ldapSyncing}
                  disabled={
                    !canApply ||
                    !ldapEnabled ||
                    !ldapPreview ||
                    ldapPreview.to_create + ldapPreview.to_update === 0
                  }
                  onClick={() => void syncLdap()}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Appliquer la synchronisation
                </Button>
              </div>
              {!ldapEnabled ? (
                <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                  Activez la synchronisation et enregistrez la configuration avant d'appliquer.
                </p>
              ) : null}

              {ldapPreview ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Total", ldapPreview.total, "text-foreground"],
                      ["À créer", ldapPreview.to_create, "text-success"],
                      ["À mettre à jour", ldapPreview.to_update, "text-info"],
                      ["Erreurs", ldapPreview.errors, "text-danger"],
                    ].map(([label, value, tone]) => (
                      <div key={String(label)} className="rounded-lg border border-border-soft bg-background/40 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
                        <p className={cn("mt-1 text-lg font-semibold", tone)}>{formatNumber(Number(value))}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted">{ldapPreview.message}</p>
                  <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border-soft">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Utilisateur</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="hidden lg:table-cell">Service</TableHead>
                          <TableHead>Détail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ldapPreview.rows.map((row) => (
                          <TableRow key={`${row.login}-${row.email}`}>
                            <TableCell>
                              <p className="text-xs font-medium text-foreground">{row.label}</p>
                              <p className="text-[10px] text-muted-2">
                                {row.login ?? "—"} · {row.email ?? "—"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge tone={ldapStatusTones[row.status] ?? "neutral"}>
                                {ldapStatusLabels[row.status] ?? row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden text-xs text-muted lg:table-cell">
                              {row.service_name ?? row.department ?? "—"}
                            </TableCell>
                            <TableCell className="text-[10px] text-muted">
                              {row.errors.length ? row.errors.join(" · ") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border-soft bg-background/40 p-4">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    Aucune prévisualisation. Lancez d'abord un test de connexion puis une
                    prévisualisation.
                  </p>
                  <p className="mt-2 text-[10px] text-muted-2">
                    Attributs lus : sAMAccountName, mail, userPrincipalName, givenName, sn,
                    displayName, telephoneNumber, department, title.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "directory" ? (
        <LdapDirectoryPanel
          canManage={canManageSettings}
          writeEnabled={ldapQuery.data?.write_enabled ?? false}
          configured={ldapConfigured}
        />
      ) : null}

      {tab === "rdm" ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="panel-sheen border-primary/20">
            <CardHeader>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Enrichissement</p>
                <h2 className="text-sm font-semibold text-foreground">Remote Desktop Manager</h2>
                <p className="mt-1 text-xs text-muted">
                  RDM est une excellente source pour l'inventaire des serveurs, VM et équipements
                  réseau : noms, hôtes, IP, systèmes, groupes et descriptions.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  "Serveurs et machines virtuelles",
                  "Équipements réseau et pare-feu",
                  "Adresses IP, MAC et systèmes",
                  "Groupes et descriptions",
                  "Responsables et environnements",
                  "Rattachement aux équipements du parc",
                ].map((item) => (
                  <p key={item} className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    {item}
                  </p>
                ))}
              </div>
              <div className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-[11px] text-warning">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Les identifiants, mots de passe et secrets RDM ne sont jamais importés.
                </p>
                <p className="mt-1 text-warning/80">
                  Exportez uniquement les champs d'inventaire et vérifiez le fichier avant l'envoi.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canPreview ? (
                  <Button size="sm" onClick={() => setRdmImportOpen(true)}>
                    <Upload className="h-3.5 w-3.5" />
                    Importer un export RDM
                  </Button>
                ) : null}
                <a
                  href="/api/v1/imports/templates/rdm"
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  Modèle CSV
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-sheen border-primary/20">
            <CardHeader>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Mode d'emploi</h2>
                <p className="mt-1 text-xs text-muted">Comment préparer l'export depuis RDM.</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  title: "1. Exporter les entrées",
                  detail: "Dans RDM, sélectionnez les serveurs, VM et équipements réseau utiles, puis exportez en CSV.",
                },
                {
                  title: "2. Vérifier les colonnes",
                  detail: "Name, Host, IP, OS, Group et Description sont reconnus. Les autres colonnes sont conservées ou ignorées sans danger.",
                },
                {
                  title: "3. Supprimer les secrets",
                  detail: "N'incluez jamais les mots de passe, clés ou identifiants dans le fichier exporté.",
                },
                {
                  title: "4. Prévisualiser",
                  detail: "Le module détecte les doublons par nom et adresse IP avant toute écriture.",
                },
              ].map((step) => (
                <div key={step.title} className="rounded-lg border border-border-soft bg-background/40 p-3">
                  <p className="text-xs font-medium text-foreground">{step.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted">{step.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ImportDialog
        open={rdmImportOpen}
        onOpenChange={setRdmImportOpen}
        entityType="rdm"
        entityLabel="équipements RDM"
        onImported={() => void historyQuery.refetch()}
      />
    </div>
  );
}
