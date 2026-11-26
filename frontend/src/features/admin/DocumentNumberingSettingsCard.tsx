import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { DocumentNumberingSettings } from "@/types/api";

interface DocumentNumberingSettingsCardProps {
  canManage: boolean;
}

interface NumberingDraft {
  scheme: DocumentNumberingSettings["scheme"];
  sequence_length: number;
}

const schemeLabels: Record<NumberingDraft["scheme"], string> = {
  short_year: "Année courte + compteur · DEM-26-0001",
  full_year: "Année complète + compteur · DEM-2026-0001",
  simple: "Compteur seul · DEM-0001",
};

function buildPreview(draft: NumberingDraft, sampleYear: number | undefined): string {
  const year = sampleYear ?? new Date().getFullYear();
  const yearPart =
    draft.scheme === "short_year"
      ? String(year % 100).padStart(2, "0")
      : draft.scheme === "full_year"
        ? String(year)
        : null;
  const sequence = "1".padStart(draft.sequence_length, "0");
  return ["DEM", yearPart, sequence].filter(Boolean).join("-");
}

export function DocumentNumberingSettingsCard({
  canManage,
}: DocumentNumberingSettingsCardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<NumberingDraft | null>(null);

  const query = useQuery({
    queryKey: ["admin", "document-numbering"],
    queryFn: () =>
      apiFetch<DocumentNumberingSettings>("/admin/settings/document-numbering"),
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      scheme: query.data.scheme,
      sequence_length: query.data.sequence_length,
    });
  }, [query.data]);

  const preview = useMemo(
    () => (draft ? buildPreview(draft, query.data?.sample_year) : ""),
    [draft, query.data],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: NumberingDraft) =>
      apiFetch<DocumentNumberingSettings>("/admin/settings/document-numbering", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Numérotation des documents enregistrée.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "document-numbering"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  if (query.isLoading || !draft) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-danger">
          Impossible de charger la numérotation des documents.
        </CardContent>
      </Card>
    );
  }

  const changed =
    draft.scheme !== query.data?.scheme ||
    draft.sequence_length !== query.data?.sequence_length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary-strong">
            <Hash className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Numérotation des documents</CardTitle>
            <CardDescription>
              Références des demandes, devis, bons de commande, interventions et autres
              documents. Le numéro garde l'année et reste court. Les références déjà créées
              ne changent pas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="document-numbering-scheme">Format</Label>
            <Select
              id="document-numbering-scheme"
              value={draft.scheme}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  scheme: event.target.value as NumberingDraft["scheme"],
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
            <Label htmlFor="document-numbering-length">Chiffres du compteur</Label>
            <Select
              id="document-numbering-length"
              value={String(draft.sequence_length)}
              onChange={(event) =>
                setDraft({ ...draft, sequence_length: Number(event.target.value) })
              }
              disabled={!canManage || saveMutation.isPending}
            >
              {[2, 3, 4, 5, 6].map((length) => (
                <option key={length} value={length}>
                  {length} chiffres
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-2">
              Aperçu de la prochaine référence
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {preview || "—"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-2">
              Exemple avec le préfixe DEM pour une demande IT.
            </p>
          </div>
          {canManage ? (
            <Button
              loading={saveMutation.isPending}
              disabled={!changed}
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
