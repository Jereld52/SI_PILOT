import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, KeyRound, Save, Settings2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, humanize } from "@/lib/utils";
import type { SettingItem } from "@/types/api";

const categoryLabels: Record<string, string> = {
  general: "Général",
  dashboard: "Vue générale",
  alerts: "Alertes",
  security: "Sécurité",
  notifications: "Notifications",
  sylvia: "SylvIA",
};

const categoryOrder = ["general", "dashboard", "alerts", "security", "notifications", "sylvia"];

function toInputValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseInputValue(raw: string, original: unknown): unknown {
  if (typeof original === "number") {
    const parsed = Number(raw.replace(",", "."));
    return Number.isNaN(parsed) ? raw : parsed;
  }
  if (Array.isArray(original)) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (Number.isNaN(Number(item)) ? item : Number(item)));
  }
  return raw;
}

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admin.settings.manage");
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => apiFetch<SettingItem[]>("/admin/settings"),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDrafts(Object.fromEntries(settingsQuery.data.map((setting) => [setting.key, setting.value])));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch(`/admin/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      toast.success("Paramètre enregistré.");
      void settingsQuery.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, SettingItem[]>();
    (settingsQuery.data ?? []).forEach((setting) => {
      const list = map.get(setting.category) ?? [];
      list.push(setting);
      map.set(setting.category, list);
    });
    return Array.from(map.entries()).sort(
      ([left], [right]) =>
        (categoryOrder.indexOf(left) === -1 ? 99 : categoryOrder.indexOf(left)) -
        (categoryOrder.indexOf(right) === -1 ? 99 : categoryOrder.indexOf(right)),
    );
  }, [settingsQuery.data]);

  if (settingsQuery.isError) {
    return (
      <Card>
        <ErrorState
          message={settingsQuery.error instanceof Error ? settingsQuery.error.message : "Erreur inconnue."}
          onRetry={() => void settingsQuery.refetch()}
        />
      </Card>
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <Card>
        <EmptyState icon={Settings2} title="Aucun paramètre" description="Aucun paramètre n'est configuré." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Paramètres généraux</h2>
        <p className="mt-0.5 text-xs text-muted">
          Les paramètres sont versionnés en base et chaque modification est auditée.
          {!canManage ? " Votre rôle permet la consultation uniquement." : ""}
        </p>
      </div>

      {grouped.map(([category, settings]) => (
        <Card key={category}>
          <CardHeader>
            <div>
              <CardTitle>{categoryLabels[category] ?? humanize(category)}</CardTitle>
              <CardDescription>{settings.length} paramètre(s).</CardDescription>
            </div>
            {category === "sylvia" ? (
              <Badge tone="warning">Désactivée</Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {settings.map((setting) => {
              const draft = drafts[setting.key];
              const changed = JSON.stringify(draft) !== JSON.stringify(setting.value);
              const isBoolean = typeof setting.value === "boolean";
              return (
                <div
                  key={setting.key}
                  className="flex flex-col gap-2 rounded-lg border border-border-soft bg-background-soft/40 px-3 py-2.5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{setting.description ?? setting.key}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted-2">{setting.key}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:w-[420px]">
                    {isBoolean ? (
                      <Switch
                        checked={Boolean(draft)}
                        onCheckedChange={(value) =>
                          setDrafts((current) => ({ ...current, [setting.key]: value }))
                        }
                        disabled={!canManage || saveMutation.isPending}
                        label={setting.description ?? setting.key}
                      />
                    ) : (
                      <Input
                        value={toInputValue(draft)}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [setting.key]: parseInputValue(event.target.value, setting.value),
                          }))
                        }
                        disabled={!canManage || saveMutation.isPending}
                        className={cn("flex-1", setting.key.endsWith("base_url") && "font-mono text-[11px]")}
                        aria-label={setting.description ?? setting.key}
                      />
                    )}
                    {canManage ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!changed || saveMutation.isPending}
                        onClick={() => saveMutation.mutate({ key: setting.key, value: draft })}
                      >
                        {changed ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        {changed ? "Enregistrer" : "À jour"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card className="border-primary-strong/15 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-strong/20 bg-primary/15 text-primary-strong">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Intégration SylvIA</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              L'URL et le modèle se configurent ci-dessus. La clé d'API n'est jamais stockée en
              base : renseignez <span className="font-mono text-[10px]">SYLVIA_API_KEY</span> dans
              <span className="font-mono text-[10px]"> backend/.env</span>, puis redémarrez l'API.
              L'intégration reste désactivée par défaut et sera branchée en Phase 5.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-2">
              <KeyRound className="h-3 w-3" />
              Aucune donnée n'est transmise tant que l'intégration n'est pas activée et validée.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
