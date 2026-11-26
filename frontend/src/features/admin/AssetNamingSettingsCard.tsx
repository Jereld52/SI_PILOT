import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiFetch } from "@/lib/api";
import type { AssetNamingSettings } from "@/types/api";

interface AssetNamingSettingsCardProps {
  canManage: boolean;
}

interface NamingDraft {
  enabled: boolean;
  scheme: AssetNamingSettings["scheme"];
  prefix: string;
  sequence_length: number;
  template: string;
}

const SCHEME_TEMPLATES: Record<NamingDraft["scheme"], string> = {
  prefix_seq: "{PREFIX}-{SEQ}",
  prefix_category_seq: "{PREFIX}-{CATEGORY}-{SEQ}",
  category_seq: "{CATEGORY}-{SEQ}",
  custom: "{PREFIX}-{SEQ:4}",
};

const schemeLabels: Record<NamingDraft["scheme"], string> = {
  prefix_seq: "Préfixe + compteur · SI-0001",
  prefix_category_seq: "Préfixe + catégorie + compteur · SI-PC-0001",
  category_seq: "Catégorie + compteur · PC-0001",
  custom: "Modèle personnalisé",
};

function buildPreview(draft: NamingDraft, sample: AssetNamingSettings | undefined): string {
  const base =
    draft.scheme === "custom"
      ? draft.template
      : SCHEME_TEMPLATES[draft.scheme].replace(
          "{SEQ}",
          `{SEQ:${draft.sequence_length}}`,
        );
  return base
    .replaceAll("{PREFIX}", (draft.prefix || "SI").toUpperCase())
    .replaceAll("{CATEGORY}", sample?.sample_category_prefix ?? "PC")
    .replace(/\{SEQ(?::(\d+))?\}/g, (_match, width: string | undefined) =>
      "1".padStart(Number(width ?? draft.sequence_length), "0"),
    );
}

export function AssetNamingSettingsCard({ canManage }: AssetNamingSettingsCardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<NamingDraft | null>(null);

  const query = useQuery({
    queryKey: ["admin", "asset-naming"],
    queryFn: () => apiFetch<AssetNamingSettings>("/admin/settings/asset-naming"),
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      enabled: query.data.enabled,
      scheme: query.data.scheme,
      prefix: query.data.prefix,
      sequence_length: query.data.sequence_length,
      template: query.data.template,
    });
  }, [query.data]);

  const preview = useMemo(
    () => (draft ? buildPreview(draft, query.data) : ""),
    [draft, query.data],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: NamingDraft) =>
      apiFetch<AssetNamingSettings>("/admin/settings/asset-naming", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Nommage des équipements enregistré.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "asset-naming"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  if (query.isLoading || !draft) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-danger">
          Impossible de charger le nommage des équipements.
        </CardContent>
      </Card>
    );
  }

  const changed = JSON.stringify(draft) !== JSON.stringify({
    enabled: query.data?.enabled,
    scheme: query.data?.scheme,
    prefix: query.data?.prefix,
    sequence_length: query.data?.sequence_length,
    template: query.data?.template,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary-strong">
            <Tags className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Nommage des équipements</CardTitle>
            <CardDescription>
              Un modèle simple et global pour les numéros d'inventaire. Les équipements déjà
              créés conservent leur numéro.
            </CardDescription>
          </div>
        </div>
        <Badge tone={draft.enabled ? "success" : "neutral"}>
          {draft.enabled ? "Actif" : "Désactivé"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">
              Utiliser le nommage global simplifié
            </p>
            <p className="mt-0.5 text-[10px] text-muted-2">
              Si désactivé, les modèles définis par catégorie restent utilisés.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(value) => setDraft({ ...draft, enabled: value })}
            disabled={!canManage || saveMutation.isPending}
            label="Activer le nommage global simplifié"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="naming-scheme">Modèle</Label>
            <Select
              id="naming-scheme"
              value={draft.scheme}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  scheme: event.target.value as NamingDraft["scheme"],
                })
              }
              disabled={!canManage || saveMutation.isPending}
            >
              {Object.entries(schemeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="naming-prefix">Préfixe</Label>
            <Input
              id="naming-prefix"
              value={draft.prefix}
              onChange={(event) =>
                setDraft({ ...draft, prefix: event.target.value.toUpperCase() })
              }
              placeholder="SI"
              maxLength={20}
              disabled={!canManage || saveMutation.isPending}
            />
          </div>
          <div>
            <Label htmlFor="naming-length">Chiffres du compteur</Label>
            <Select
              id="naming-length"
              value={String(draft.sequence_length)}
              onChange={(event) =>
                setDraft({ ...draft, sequence_length: Number(event.target.value) })
              }
              disabled={!canManage || saveMutation.isPending}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((length) => (
                <option key={length} value={length}>
                  {length} chiffres
                </option>
              ))}
            </Select>
          </div>
          {draft.scheme === "custom" ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <Label htmlFor="naming-template">Modèle personnalisé</Label>
              <Input
                id="naming-template"
                value={draft.template}
                onChange={(event) =>
                  setDraft({ ...draft, template: event.target.value })
                }
                placeholder="{PREFIX}-{CATEGORY}-{SEQ:4}"
                className="font-mono text-[11px]"
                disabled={!canManage || saveMutation.isPending}
              />
              <p className="mt-1 text-[10px] text-muted-2">
                Variables : {"{PREFIX}"}, {"{CATEGORY}"}, {"{SEQ}"} ou{" "}
                {"{SEQ:4}"}. Le compteur est continu, sans année.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-2">
              Aperçu du prochain numéro
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {preview || "—"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-2">
              Exemple pour la catégorie {query.data?.sample_category_code ?? "PC"}.
            </p>
          </div>
          {canManage ? (
            <Button
              loading={saveMutation.isPending}
              disabled={!changed || (draft.scheme === "custom" && !draft.template.trim())}
              onClick={() => saveMutation.mutate(draft)}
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
