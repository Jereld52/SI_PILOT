import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanText, Save } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { OcrSettings } from "@/types/api";

interface OcrSettingsCardProps {
  canManage: boolean;
}

interface OcrDraft {
  enabled: boolean;
  tesseract_command: string;
  language: string;
  max_pages: number;
  dpi: number;
  tessdata_dir: string;
}

export function OcrSettingsCard({ canManage }: OcrSettingsCardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OcrDraft | null>(null);

  const query = useQuery({
    queryKey: ["admin", "ocr"],
    queryFn: () => apiFetch<OcrSettings>("/admin/settings/ocr"),
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      enabled: query.data.enabled,
      tesseract_command: query.data.tesseract_command,
      language: query.data.language,
      max_pages: query.data.max_pages,
      dpi: query.data.dpi,
      tessdata_dir: query.data.tessdata_dir,
    });
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: OcrDraft) =>
      apiFetch<OcrSettings>("/admin/settings/ocr", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Paramètres OCR enregistrés.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "ocr"] });
      void query.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  if (query.isLoading || !draft) {
    return <Skeleton className="h-56 rounded-xl" />;
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-danger">
          Impossible de charger les paramètres OCR.
        </CardContent>
      </Card>
    );
  }

  const changed = JSON.stringify(draft) !== JSON.stringify({
    enabled: query.data?.enabled,
    tesseract_command: query.data?.tesseract_command,
    language: query.data?.language,
    max_pages: query.data?.max_pages,
    dpi: query.data?.dpi,
    tessdata_dir: query.data?.tessdata_dir,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary-strong">
            <ScanText className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>OCR des documents</CardTitle>
            <CardDescription>
              Lire les PDF scannés et les images avant l'analyse IA. Tesseract reste local.
            </CardDescription>
          </div>
        </div>
        <Badge tone={query.data?.available ? "success" : "danger"}>
          {query.data?.available ? query.data.version ?? "Tesseract détecté" : "Tesseract introuvable"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background/40 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Activer l'OCR</p>
            <p className="mt-0.5 text-[10px] text-muted-2">
              Utilisé uniquement si un PDF contient peu ou pas de texte.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(value) => setDraft({ ...draft, enabled: value })}
            disabled={!canManage || saveMutation.isPending}
            label="Activer l'OCR"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="ocr-command">Chemin de tesseract.exe</Label>
            <Input
              id="ocr-command"
              value={draft.tesseract_command}
              onChange={(event) =>
                setDraft({ ...draft, tesseract_command: event.target.value })
              }
              placeholder="Détection automatique"
              className="font-mono text-[11px]"
              disabled={!canManage || saveMutation.isPending}
            />
          </div>
          <div>
            <Label htmlFor="ocr-language">Langues</Label>
            <Select
              id="ocr-language"
              value={draft.language}
              onChange={(event) => setDraft({ ...draft, language: event.target.value })}
              disabled={!canManage || saveMutation.isPending}
            >
              <option value="fra+eng">Français + anglais</option>
              <option value="fra">Français</option>
              <option value="eng">Anglais</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ocr-max-pages">Pages maximum</Label>
            <Input
              id="ocr-max-pages"
              type="number"
              min={1}
              max={50}
              value={draft.max_pages}
              onChange={(event) =>
                setDraft({ ...draft, max_pages: Number(event.target.value) || 1 })
              }
              disabled={!canManage || saveMutation.isPending}
            />
          </div>
          <div>
            <Label htmlFor="ocr-dpi">Résolution (DPI)</Label>
            <Input
              id="ocr-dpi"
              type="number"
              min={120}
              max={400}
              step={20}
              value={draft.dpi}
              onChange={(event) =>
                setDraft({ ...draft, dpi: Number(event.target.value) || 200 })
              }
              disabled={!canManage || saveMutation.isPending}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ocr-tessdata">Dossier des langues Tesseract</Label>
            <Input
              id="ocr-tessdata"
              value={draft.tessdata_dir}
              onChange={(event) =>
                setDraft({ ...draft, tessdata_dir: event.target.value })
              }
              placeholder="Détection automatique"
              className="font-mono text-[11px]"
              disabled={!canManage || saveMutation.isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-muted-2">
            Tesseract est exécuté localement. Les fichiers ne sont pas envoyés à un service
            OCR externe. L'analyse IA du texte reste soumise au fournisseur configuré.
          </p>
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
