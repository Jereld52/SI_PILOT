import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordDialog } from "@/features/auth/ChangePasswordDialog";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { MfaEnableResult, MfaSetup, MfaStatus } from "@/types/api";

interface SessionItem {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export function AccountSecurityPage() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const mfaQuery = useQuery({
    queryKey: ["auth", "mfa"],
    queryFn: () => apiFetch<MfaStatus>("/auth/mfa"),
  });
  const sessionsQuery = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => apiFetch<SessionItem[]>("/auth/sessions"),
  });
  const mfa = mfaQuery.data;

  const startSetup = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MfaSetup>("/auth/mfa/setup", { method: "POST" });
      setSetup(data);
      setRecoveryCodes(null);
      setCode("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Configuration impossible.");
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    if (code.trim().length < 6) {
      toast.error("Saisissez le code à 6 chiffres de l'application.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<MfaEnableResult>("/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setRecoveryCodes(result.recovery_codes);
      setSetup(null);
      setCode("");
      toast.success(result.message);
      void mfaQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Activation impossible.");
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!disablePassword || disableCode.trim().length < 6) {
      toast.error("Renseignez le mot de passe et un code d'authentification.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>("/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode.trim(),
        }),
      });
      toast.success(result.message);
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      void mfaQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Désactivation impossible.");
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      await apiFetch(`/auth/sessions/${sessionId}`, { method: "DELETE" });
      toast.success("Session révoquée.");
      void sessionsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Révocation impossible.");
    }
  };

  const copyRecoveryCodes = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Codes de secours copiés.");
    } catch {
      toast.error("Copie impossible. Notez les codes manuellement.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Mon compte"
        title="Sécurité du compte"
        description="Mot de passe, double authentification par application et sessions actives."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Mot de passe</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Modifiez votre mot de passe. Les autres sessions seront révoquées.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
              Changer le mot de passe
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Double authentification (TOTP)
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Compatible Google Authenticator, Microsoft Authenticator, FreeOTP, Bitwarden…
                  </p>
                </div>
              </div>
              <Badge tone={mfa?.enabled ? "success" : "neutral"}>
                {mfa?.enabled ? "Activée" : "Désactivée"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mfaQuery.isError ? (
              <ErrorState
                message={
                  mfaQuery.error instanceof Error
                    ? mfaQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void mfaQuery.refetch()}
              />
            ) : mfaQuery.isLoading ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : recoveryCodes ? (
              <div className="space-y-2 rounded-lg border border-success/25 bg-success/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  MFA activée. Conservez ces codes de secours.
                </p>
                <p className="text-[10px] leading-4 text-success/90">
                  Ils permettent de vous connecter si vous perdez votre téléphone. Chaque code ne
                  fonctionne qu'une seule fois.
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-background/50 p-2 font-mono text-[11px] text-foreground sm:grid-cols-3">
                  {recoveryCodes.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void copyRecoveryCodes()}>
                    <Copy className="h-3.5 w-3.5" />
                    Copier
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRecoveryCodes(null)}>
                    J'ai terminé
                  </Button>
                </div>
              </div>
            ) : mfa?.enabled ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-5 text-muted">
                  Un code vous est demandé à chaque connexion. Si vous perdez votre application,
                  utilisez un code de secours ou demandez à un administrateur de réinitialiser la
                  MFA.
                </p>
                {!disableOpen ? (
                  <Button variant="danger" size="sm" onClick={() => setDisableOpen(true)}>
                    <ShieldOff className="h-3.5 w-3.5" />
                    Désactiver la MFA
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-danger/25 bg-danger/[0.04] p-3">
                    <p className="text-[11px] font-medium text-danger">
                      Confirmez avec votre mot de passe et un code.
                    </p>
                    <Input
                      type="password"
                      value={disablePassword}
                      onChange={(event) => setDisablePassword(event.target.value)}
                      placeholder="Mot de passe"
                    />
                    <Input
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                      placeholder="Code à 6 chiffres ou code de secours"
                      autoComplete="one-time-code"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger" size="sm" loading={loading} onClick={() => void disable()}>
                        Confirmer la désactivation
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDisableOpen(false);
                          setDisablePassword("");
                          setDisableCode("");
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : setup ? (
              <div className="space-y-3">
                <p className="text-[11px] leading-5 text-muted">
                  1. Scannez ce QR code avec votre application d'authentification.
                </p>
                <div className="rounded-lg border border-border-soft bg-white p-2">
                  <img
                    src={setup.qr_code_data_url}
                    alt="QR code de configuration MFA"
                    className="mx-auto h-48 w-48"
                  />
                </div>
                <p className="text-[10px] text-muted-2">
                  Ou saisissez la clé manuellement :{" "}
                  <span className="select-all font-mono text-foreground">{setup.secret}</span>
                </p>
                <p className="text-[11px] leading-5 text-muted">
                  2. Saisissez le code généré par l'application pour activer la MFA.
                </p>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Code à 6 chiffres"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={loading} onClick={() => void enable()}>
                    Activer la MFA
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSetup(null);
                      setCode("");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] leading-5 text-muted">
                  La double authentification ajoute un code temporaire à votre mot de passe. Elle
                  fonctionne hors ligne et ne dépend pas du serveur SMTP.
                </p>
                <Button loading={loading} onClick={() => void startSetup()}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Configurer la MFA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Sessions actives</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Appareils et navigateurs connectés à votre compte.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessionsQuery.isError ? (
            <ErrorState
              message={
                sessionsQuery.error instanceof Error
                  ? sessionsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void sessionsQuery.refetch()}
            />
          ) : sessionsQuery.isLoading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : (sessionsQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="Aucune session"
              description="Aucune session active n'a été trouvée."
            />
          ) : (
            (sessionsQuery.data ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-foreground">
                    {item.is_current ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-2" />
                    )}
                    {item.ip || "Adresse inconnue"}
                    {item.is_current ? " · session actuelle" : ""}
                  </p>
                  <p className="truncate text-[10px] text-muted-2">
                    {item.user_agent || "Navigateur inconnu"}
                  </p>
                  <p className="text-[10px] text-muted-2">
                    Dernière activité : {formatDateTime(item.last_seen_at)}
                  </p>
                </div>
                {!item.is_current ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => void revokeSession(item.id)}
                  >
                    Révoquer
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
