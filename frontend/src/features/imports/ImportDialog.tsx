import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ImportApplyResponse, ImportPreviewResponse, ImportRowPreview } from "@/types/api";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType:
    | "agents"
    | "assets"
    | "mobile_lines"
    | "suppliers"
    | "licenses"
    | "infrastructure"
    | "rdm";
  entityLabel: string;
  onImported: () => void;
}

const statusTones: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  valid: "success",
  duplicate: "warning",
  error: "danger",
  skipped: "neutral",
};

const statusLabels: Record<string, string> = {
  valid: "Valide",
  duplicate: "Doublon",
  error: "Erreur",
  skipped: "Ignorée",
};

export function ImportDialog({
  open,
  onOpenChange,
  entityType,
  entityLabel,
  onImported,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportApplyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setResult(null);
      setError(null);
      setLoading(false);
      setApplying(false);
    }
  }, [open]);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("entity_type", entityType);
      formData.append("file", file);
      const data = await apiFetch<ImportPreviewResponse>("/imports/preview", {
        method: "POST",
        body: formData,
      });
      setPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prévisualisation impossible.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const data = await apiFetch<ImportApplyResponse>(`/imports/${preview.job.id}/apply`, {
        method: "POST",
      });
      setResult(data);
      toast.success(data.message);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Application impossible.");
    } finally {
      setApplying(false);
    }
  };

  const previewRows: ImportRowPreview[] = preview?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer des {entityLabel}</DialogTitle>
          <DialogDescription>
            Téléchargez le modèle, complétez-le puis prévisualisez avant application. Aucune
            donnée existante n'est écrasée. La ligne d'exemple est automatiquement ignorée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">
                {entityType === "mobile_lines" ? "Modèle lignes mobiles" : "Modèle CSV"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {entityType === "assets"
                  ? "CSV standard ou export WAPT reconnu automatiquement. 2 000 lignes maximum."
                  : entityType === "mobile_lines"
                    ? "CSV, XLSX ou XLSM. Les colonnes PIN, PUK, CSIM et EID ne sont pas importées."
                    : entityType === "rdm"
                      ? "Export CSV Remote Desktop Manager. Les identifiants et mots de passe ne sont jamais importés."
                      : "Séparateur point-virgule ou virgule, encodage UTF-8, 2 000 lignes maximum."}
              </p>
            </div>
            <a
              href={`/api/v1/imports/templates/${entityType}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger le modèle
            </a>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-surface/40 p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <FileSpreadsheet className="h-6 w-6 text-primary-strong" aria-hidden="true" />
              <p className="text-xs text-muted">Sélectionnez un fichier CSV</p>
              <input
                type="file"
                accept={entityType === "mobile_lines" ? ".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setResult(null);
                  setError(null);
                }}
                className="block w-full max-w-sm text-[11px] text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-surface-3"
              />
              {file ? <p className="text-[11px] text-foreground">{file.name}</p> : null}
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          {preview ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Lignes", preview.job.total_rows, "neutral"],
                  ["Valides", preview.job.valid_rows, "success"],
                  ["Doublons", preview.job.duplicate_rows, "warning"],
                  ["Erreurs", preview.job.error_rows, "danger"],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="rounded-lg border border-border-soft bg-surface-2/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-semibold",
                        tone === "success" && "text-success",
                        tone === "warning" && "text-warning",
                        tone === "danger" && "text-danger",
                        tone === "neutral" && "text-foreground",
                      )}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {preview.detected_format === "wapt" ? (
                  <Badge tone="accent">Format WAPT</Badge>
                ) : preview.detected_format === "rdm" ? (
                  <Badge tone="accent">Export RDM</Badge>
                ) : preview.detected_format === "xlsx" ? (
                  <Badge tone="info">Classeur XLSX</Badge>
                ) : null}
                <p className="text-[11px] text-muted">{preview.message}</p>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-border-soft">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Ligne</TableHead>
                      <TableHead className="w-24">Statut</TableHead>
                      <TableHead>Élément</TableHead>
                      <TableHead>Détail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.row_number}>
                        <TableCell className="text-[11px] text-muted">{row.row_number}</TableCell>
                        <TableCell>
                          <Badge tone={statusTones[row.status] ?? "neutral"}>
                            {statusLabels[row.status] ?? row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{row.label}</TableCell>
                        <TableCell className="text-[10px] text-muted">
                          {row.errors.length ? row.errors.join(" · ") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.rows.length < preview.job.total_rows ? (
                <p className="text-[10px] text-muted-2">
                  Aperçu limité aux 200 premières lignes. Le rapport d'application couvre tout le fichier.
                </p>
              ) : null}
            </div>
          ) : null}

          {result ? (
            <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success">
              <p className="font-medium">{result.message}</p>
              <p className="mt-1 text-[11px]">
                {result.created} créé(s), {result.errors} erreur(s), {result.skipped} ignoré(s).
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {!result ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void handlePreview()}
                loading={loading}
                disabled={!file}
              >
                <Upload className="h-3.5 w-3.5" />
                Prévisualiser
              </Button>
              <Button
                onClick={() => void handleApply()}
                loading={applying}
                disabled={!preview?.can_apply}
              >
                Appliquer l'import
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
