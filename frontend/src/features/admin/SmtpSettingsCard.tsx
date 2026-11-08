import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBranding } from "@/features/branding/BrandingProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { SmtpSettings } from "@/types/api";

interface SmtpSettingsCardProps {
  canManage: boolean;
}

export function SmtpSettingsCard({ canManage }: SmtpSettingsCardProps) {
  const branding = useBranding();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState(branding.app_name);
  const [useTls, setUseTls] = useState(true);
  const [useSsl, setUseSsl] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["admin", "smtp-settings"],
    queryFn: () => apiFetch<SmtpSettings>("/admin/settings/smtp"),
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setHost(data.host);
    setPort(String(data.port));
    setUsername(data.username);
    setPassword("");
    setFromEmail(data.from_email);
    setFromName(data.from_name);
    setUseTls(data.use_tls);
    setUseSsl(data.use_ssl);
    setEnabled(data.email_enabled);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<SmtpSettings>("/admin/settings/smtp", {
        method: "PUT",
        body: JSON.stringify({
          host,
          port: Number(port) || 587,
          username,
          password: password || null,
          from_email: fromEmail,
          from_name: fromName,
          use_tls: useTls,
          use_ssl: useSsl,
          email_enabled: enabled,
        }),
      }),
    onSuccess: () => {
      toast.success("Configuration SMTP enregistrée.");
      setPassword("");
      void settingsQuery.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  const test = async () => {
    if (!testEmail.trim()) {
      toast.error("Saisissez une adresse de test.");
      return;
    }
    setTesting(true);
    try {
      const response = await apiFetch<{ message: string }>("/admin/settings/smtp/test", {
        method: "POST",
        body: JSON.stringify({ to_email: testEmail.trim() }),
      });
      toast.success(response.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Test SMTP impossible.");
    } finally {
      setTesting(false);
    }
  };

  const data = settingsQuery.data;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-accent" />
            Serveur SMTP et notifications e-mail
          </CardTitle>
          <CardDescription>
            Configurez un serveur SMTP externe pour les notifications et les tests d'envoi.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={data?.configured ? "success" : "neutral"}>
            {data?.configured ? "Configuré" : "Non configuré"}
          </Badge>
          <Badge tone={data?.email_enabled ? "success" : "warning"}>
            {data?.email_enabled ? "Envoi actif" : "Envoi désactivé"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="smtp-host">Serveur SMTP</Label>
            <Input
              id="smtp-host"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="smtp.exemple.fr"
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="smtp-port">Port</Label>
            <Input
              id="smtp-port"
              inputMode="numeric"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="smtp-username">Identifiant</Label>
            <Input
              id="smtp-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="smtp-password">Mot de passe</Label>
            <Input
              id="smtp-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={data?.password_set ? "Laisser vide pour conserver" : "Mot de passe SMTP"}
              disabled={!canManage}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="smtp-from-email">Adresse d'expédition</Label>
            <Input
              id="smtp-from-email"
              type="email"
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
              placeholder="informatique@exemple.fr"
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="smtp-from-name">Nom de l'expéditeur</Label>
            <Input
              id="smtp-from-name"
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <Switch
              checked={useTls}
              onCheckedChange={(value) => {
                setUseTls(value);
                if (value) setUseSsl(false);
              }}
              disabled={!canManage}
            />
            STARTTLS
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <Switch
              checked={useSsl}
              onCheckedChange={(value) => {
                setUseSsl(value);
                if (value) setUseTls(false);
              }}
              disabled={!canManage}
            />
            SSL direct
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
            Activer l'envoi des e-mails
          </label>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Save className="h-3.5 w-3.5" />
              Enregistrer la configuration
            </Button>
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="smtp-test-email">Adresse de test</Label>
                <Input
                  id="smtp-test-email"
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  placeholder="vous@exemple.fr"
                  className="w-64"
                />
              </div>
              <Button variant="secondary" loading={testing} onClick={() => void test()}>
                <Send className="h-3.5 w-3.5" />
                Tester
              </Button>
            </div>
          </div>
        ) : null}
        <p className="text-[10px] leading-4 text-muted-2">
          Le mot de passe est chiffré avec `FIELD_ENCRYPTION_KEY`. Les envois sont conservés dans
          la boîte d'envoi interne avec leur statut et leur éventuelle erreur.
        </p>
      </CardContent>
    </Card>
  );
}
