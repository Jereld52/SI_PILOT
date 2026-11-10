import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Power, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { ModuleSettings } from "@/types/api";

export function AdminModulesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admin.settings.manage");
  const { refresh: refreshModules } = useModules();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const modulesQuery = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => apiFetch<ModuleSettings>("/admin/modules"),
  });
  const modules = modulesQuery.data?.modules ?? [];

  useEffect(() => {
    if (!modulesQuery.data) return;
    setDisabled(new Set(modulesQuery.data.disabled));
  }, [modulesQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof modules>();
    for (const module of modules) {
      const list = map.get(module.section) ?? [];
      list.push(module);
      map.set(module.section, list);
    }
    return [...map.entries()];
  }, [modules]);

  const enabledCount = modules.length - disabled.size;

  const toggle = (key: string, enabled: boolean) => {
    setDisabled((current) => {
      const next = new Set(current);
      if (enabled) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch<ModuleSettings>("/admin/modules", {
        method: "PUT",
        body: JSON.stringify({ disabled: [...disabled] }),
      });
      toast.success("Modules mis à jour.");
      refreshModules();
      void modulesQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LayoutGrid className="h-4 w-4 text-accent" />
              Modules de l'application
            </h2>
            <p className="mt-1 text-xs text-muted">
              Désactivez les modules inutilisés pour alléger le menu. Les données sont conservées et
              le module peut être réactivé à tout moment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={enabledCount === modules.length ? "success" : "warning"}>
              {enabledCount}/{modules.length} actifs
            </Badge>
            {canManage ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDisabled(new Set())}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Tout activer
                </Button>
                <Button size="sm" loading={saving} onClick={() => void save()}>
                  <Save className="h-3.5 w-3.5" />
                  Enregistrer
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {modulesQuery.isError ? (
            <ErrorState
              message={
                modulesQuery.error instanceof Error
                  ? modulesQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void modulesQuery.refetch()}
            />
          ) : modulesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Aucun module"
              description="Aucun module n'est enregistré."
            />
          ) : (
            grouped.map(([section, items]) => (
              <div key={section}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
                  {section}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((module) => {
                    const enabled = !disabled.has(module.key);
                    return (
                      <div
                        key={module.key}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border-soft bg-background/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            {module.label}
                            {!enabled ? (
                              <Badge tone="neutral">Désactivé</Badge>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[10px] leading-4 text-muted-2">
                            {module.description}
                          </p>
                          <p className="mt-0.5 font-mono text-[9px] text-muted-2">
                            {module.path}
                          </p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(value) => toggle(module.key, value)}
                          disabled={!canManage}
                          aria-label={`Activer ou désactiver ${module.label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-4 text-info">
        <Power className="mr-1 inline h-3 w-3" />
        Un module désactivé disparaît du menu et son URL directe affiche un écran « Module désactivé ».
        Les données, permissions et historiques restent intacts.
      </div>
      <div className="rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[10px] leading-4 text-muted-2">
        <ShieldCheck className="mr-1 inline h-3 w-3" />
        Par défaut, tous les modules sont actifs. Seuls les administrateurs disposant de la permission
        de gestion des paramètres peuvent modifier cette liste.
      </div>
    </div>
  );
}
