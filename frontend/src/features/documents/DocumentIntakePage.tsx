import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileSearch,
  FileText,
  ListChecks,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  BudgetDetailItem,
  BudgetItem,
  DocumentAiAnalysis,
  DocumentAiIntegration,
  DocumentAiKind,
  DocumentAiTarget,
} from "@/types/api";

const typeLabels: Record<DocumentAiKind, string> = {
  contract: "Contrat",
  quote: "Devis",
  purchase_order: "Bon de commande",
  invoice: "Facture",
  license: "Licence",
  other: "Autre document",
};

const targetLabels: Record<DocumentAiTarget, string> = {
  documentation: "Documentation",
  quote: "Devis",
  purchase_order: "Bon de commande",
  contract: "Contrat",
  license: "Licence",
  invoice: "Facture budgétaire",
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

type QueueStatus = "pending" | "analyzing" | "ready" | "error" | "integrated";

interface IntakeQueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  analysis?: DocumentAiAnalysis;
  error?: string;
  result?: DocumentAiIntegration;
}

export function DocumentIntakePage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("documents.create");
  const canUseAi = hasPermission("ai.use");
  const canCreateContract = hasPermission("contracts.create");
  const canCreateLicense = hasPermission("licenses.manage");
  const canCreateInvoice = hasPermission("budget.update");
  const canManageCommercial = hasPermission("suppliers.manage");
  const canReadBudget = hasPermission("budget.read");

  const [queue, setQueue] = useState<IntakeQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DocumentAiAnalysis | null>(null);
  const [target, setTarget] = useState<DocumentAiTarget>("documentation");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentAiKind>("other");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [engagementNumber, setEngagementNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [summary, setSummary] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [integrating, setIntegrating] = useState(false);
  const [result, setResult] = useState<DocumentAiIntegration | null>(null);
  const [archiveAllOpen, setArchiveAllOpen] = useState(false);

  const budgetsQuery = useQuery({
    queryKey: ["budgets", "document-intake"],
    queryFn: () => apiFetch<BudgetItem[]>("/budgets"),
    enabled: target === "invoice" && canReadBudget,
  });
  const budgetDetailQuery = useQuery({
    queryKey: ["budgets", "document-intake", budgetId],
    queryFn: () => apiFetch<BudgetDetailItem>(`/budgets/${budgetId}`),
    enabled: target === "invoice" && Boolean(budgetId),
  });
  const budgets = budgetsQuery.data ?? [];
  const budgetLines = budgetDetailQuery.data?.lines ?? [];

  const availableTargets = (analysis?.suggested_targets ?? ["documentation"]).filter(
    (item) =>
      (item === "documentation" && canCreate) ||
      (item === "quote" && canManageCommercial) ||
      (item === "purchase_order" && canManageCommercial) ||
      (item === "contract" && canCreateContract) ||
      (item === "license" && canCreateLicense) ||
      (item === "invoice" && canCreateInvoice && canReadBudget),
  );

  const firstAllowedTarget = (data: DocumentAiAnalysis): DocumentAiTarget => {
    return (
      data.suggested_targets.find(
        (item) =>
          (item === "documentation" && canCreate) ||
          (item === "quote" && canManageCommercial) ||
          (item === "purchase_order" && canManageCommercial) ||
          (item === "contract" && canCreateContract) ||
          (item === "license" && canCreateLicense) ||
          (item === "invoice" && canCreateInvoice && canReadBudget),
      ) ?? "documentation"
    );
  };

  const loadAnalysis = (data: DocumentAiAnalysis) => {
    setAnalysis(data);
    setTitle(data.title);
    setKind(data.document_type);
    setSupplier(data.supplier ?? "");
    setReference(data.reference ?? "");
    setEngagementNumber(data.engagement_number ?? "");
    setStartDate(data.start_date ?? "");
    setEndDate(data.end_date ?? "");
    setAmountHt(data.amount_ht != null ? String(data.amount_ht) : "");
    setAmountTtc(data.amount_ttc != null ? String(data.amount_ttc) : "");
    setVatRate(data.vat_rate != null ? String(data.vat_rate) : "");
    setSummary(data.summary);
    setTarget(firstAllowedTarget(data));
  };

  const selectQueueItem = (item: IntakeQueueItem) => {
    if (!item.analysis) return;
    setResult(item.result ?? null);
    setSelectedId(item.id);
    loadAnalysis(item.analysis);
  };

  const addFiles = (files: FileList | null) => {
    const incoming = Array.from(files ?? []).map((file) => ({
      id: `${Date.now()}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "pending" as QueueStatus,
    }));
    if (incoming.length === 0) return;
    setQueue((current) => {
      const keys = new Set(
        current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
      );
      const unique = incoming.filter(
        (item) => !keys.has(`${item.file.name}:${item.file.size}:${item.file.lastModified}`),
      );
      return [...current, ...unique];
    });
    setAnalysis(null);
    setSelectedId(null);
    setResult(null);
  };

  const analyzeItem = async (item: IntakeQueueItem) => {
    const form = new FormData();
    form.append("file", item.file);
    return apiFetch<DocumentAiAnalysis>("/documents/analyze", {
      method: "POST",
      body: form,
    });
  };

  const analyzeBatch = async () => {
    const pending = queue.filter(
      (item) => item.status === "pending" || item.status === "error",
    );
    if (pending.length === 0) {
      toast.error("Sélectionnez au moins un document à analyser.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    setAnalysis(null);
    setSelectedId(null);
    let firstReady: IntakeQueueItem | null = null;
    for (const item of pending) {
      setQueue((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, status: "analyzing", error: undefined } : row,
        ),
      );
      try {
        const data = await analyzeItem(item);
        const readyItem: IntakeQueueItem = {
          ...item,
          status: "ready",
          analysis: data,
          error: undefined,
        };
        if (!firstReady) firstReady = readyItem;
        setQueue((current) =>
          current.map((row) =>
            row.id === item.id
              ? { ...row, status: "ready", analysis: data, error: undefined }
              : row,
          ),
        );
      } catch (error) {
        setQueue((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: "error",
                  error:
                    error instanceof ApiError
                      ? error.message
                      : "Analyse impossible.",
                }
              : row,
          ),
        );
      }
    }
    setAnalyzing(false);
    if (firstReady) {
      selectQueueItem(firstReady);
      toast.success(
        `${pending.length} document(s) traité(s). Vérifiez chaque fiche avant intégration.`,
      );
    } else {
      toast.error("Aucun document n'a pu être analysé.");
    }
  };

  const retryItem = async (item: IntakeQueueItem) => {
    setAnalyzing(true);
    setQueue((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, status: "analyzing", error: undefined } : row,
      ),
    );
    try {
      const data = await analyzeItem(item);
      setQueue((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, status: "ready", analysis: data, error: undefined }
            : row,
        ),
      );
      selectQueueItem({ ...item, status: "ready", analysis: data });
    } catch (error) {
      setQueue((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: "error",
                error: error instanceof ApiError ? error.message : "Analyse impossible.",
              }
            : row,
        ),
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const archiveAll = async () => {
    const ready = queue.filter((item) => item.status === "ready" && item.analysis);
    if (ready.length === 0) {
      toast.error("Aucun document analysé à archiver.");
      return;
    }
    setIntegrating(true);
    let done = 0;
    let failed = 0;
    for (const item of ready) {
      const data = item.analysis;
      if (!data) continue;
      try {
        const integrated = await apiFetch<DocumentAiIntegration>(
          `/documents/intake/${data.token}/integrate`,
          {
            method: "POST",
            body: JSON.stringify({
              target: "documentation",
              title: data.title || item.file.name,
              document_type: data.document_type,
              supplier: data.supplier,
              reference: data.reference,
              engagement_number: null,
              start_date: data.start_date,
              end_date: data.end_date,
              amount_ht: data.amount_ht,
              amount_ttc: data.amount_ttc,
              vat_rate: data.vat_rate,
              summary: data.summary,
              budget_line_id: null,
            }),
          },
        );
        done += 1;
        setQueue((current) =>
          current.map((row) =>
            row.id === item.id
              ? { ...row, status: "integrated", result: integrated }
              : row,
          ),
        );
      } catch {
        failed += 1;
      }
    }
    setIntegrating(false);
    setArchiveAllOpen(false);
    setAnalysis(null);
    setSelectedId(null);
    toast.success(
      `${done} document(s) archivé(s) dans la documentation${
        failed ? `, ${failed} échec(s)` : ""
      }.`,
    );
  };

  const integrate = async () => {
    if (!analysis || !selectedId) return;
    if (target === "purchase_order" && !engagementNumber.trim()) {
      toast.error("Le numéro d'engagement est obligatoire pour un bon de commande.");
      return;
    }
    setIntegrating(true);
    setResult(null);
    try {
      const data = await apiFetch<DocumentAiIntegration>(
        `/documents/intake/${analysis.token}/integrate`,
        {
          method: "POST",
          body: JSON.stringify({
            target,
            title: title.trim(),
            document_type: kind,
            supplier: nullable(supplier),
            reference: nullable(reference),
            engagement_number: nullable(engagementNumber),
            start_date: startDate || null,
            end_date: endDate || null,
            amount_ht: numberOrNull(amountHt),
            amount_ttc: numberOrNull(amountTtc),
            vat_rate: numberOrNull(vatRate),
            summary: nullable(summary),
            budget_line_id: target === "invoice" ? budgetLineId || null : null,
          }),
        },
      );
      setQueue((current) =>
        current.map((row) =>
          row.id === selectedId
            ? { ...row, status: "integrated", result: data }
            : row,
        ),
      );
      const next = queue.find(
        (row) =>
          row.id !== selectedId && row.status === "ready" && Boolean(row.analysis),
      );
      if (next?.analysis) {
        setSelectedId(next.id);
        loadAnalysis(next.analysis);
        setResult(null);
      } else {
        setAnalysis(null);
        setSelectedId(null);
        setResult(data);
      }
      toast.success(data.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Intégration impossible.");
    } finally {
      setIntegrating(false);
    }
  };

  if (!canCreate || !canUseAi) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Accès refusé"
        description="L'import intelligent nécessite les permissions documents.create et ai.use."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Gestion documentaire"
        title="Import intelligent de documents"
        description="Analysez un contrat, un devis, une facture ou une licence, puis intégrez-le au bon endroit."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-sm">1. Choisir un ou plusieurs documents</CardTitle>
            <CardDescription>
              Import en lot : PDF texte ou fichiers texte. Les PDF scannés doivent être
              passés par un OCR.
            </CardDescription>
          </div>
          <Badge tone="info">IA cloud ou locale</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            multiple
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              loading={analyzing}
              disabled={queue.every((item) => item.status === "integrated")}
              onClick={() => void analyzeBatch()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyser le lot avec l'IA
            </Button>
            {queue.some((item) => item.status === "ready") ? (
              <Button
                variant="secondary"
                disabled={integrating}
                onClick={() => setArchiveAllOpen(true)}
              >
                <Upload className="h-3.5 w-3.5" />
                Tout archiver dans la documentation
              </Button>
            ) : null}
            {queue.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQueue([]);
                  setAnalysis(null);
                  setSelectedId(null);
                  setResult(null);
                }}
              >
                Vider le lot
              </Button>
            ) : null}
            <p className="text-[10px] text-muted-2">
              {queue.length === 0
                ? "Aucun fichier sélectionné."
                : `${queue.length} fichier(s) · ${
                    queue.filter((item) => item.status === "ready").length
                  } prêt(s) · ${
                    queue.filter((item) => item.status === "integrated").length
                  } intégré(s)`}
            </p>
          </div>
          <p className="text-[10px] text-muted-2">
            L'IA extrait les dates, montants, fournisseur et référence. Aucune écriture
            n'est faite avant votre validation.
          </p>
        </CardContent>
      </Card>

      {queue.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary-strong">
                <ListChecks className="h-4 w-4" />
              </span>
              <div>
                <CardTitle>Lot de documents</CardTitle>
                <CardDescription>
                  Cliquez sur « Vérifier » pour contrôler et intégrer chaque document.
                </CardDescription>
              </div>
            </div>
            <Badge tone={queue.some((item) => item.status === "error") ? "warning" : "neutral"}>
              {queue.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {queue.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between",
                  selectedId === item.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border-soft bg-background/40",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-2" />
                    <p className="truncate text-[11px] font-medium text-foreground">
                      {item.file.name}
                    </p>
                    <Badge
                      tone={
                        item.status === "integrated"
                          ? "success"
                          : item.status === "error"
                            ? "danger"
                            : item.status === "ready"
                              ? "info"
                              : "neutral"
                      }
                    >
                      {item.status === "pending"
                        ? "En attente"
                        : item.status === "analyzing"
                          ? "Analyse…"
                          : item.status === "ready"
                            ? "Prêt"
                            : item.status === "integrated"
                              ? "Intégré"
                              : "Erreur"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[9px] text-muted-2">
                    <span>{formatFileSize(item.file.size)}</span>
                    {item.analysis ? (
                      <>
                        <span>{typeLabels[item.analysis.document_type]}</span>
                        {item.analysis.supplier ? <span>{item.analysis.supplier}</span> : null}
                        {item.analysis.amount_ttc != null ? (
                          <span>{item.analysis.amount_ttc.toFixed(2)} EUR TTC</span>
                        ) : null}
                        <span>confiance {Math.round(item.analysis.confidence * 100)} %</span>
                      </>
                    ) : null}
                    {item.error ? <span className="text-danger">{item.error}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status === "ready" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => selectQueueItem(item)}
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                      Vérifier
                    </Button>
                  ) : null}
                  {item.status === "error" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={analyzing}
                      onClick={() => void retryItem(item)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Réessayer
                    </Button>
                  ) : null}
                  {item.status === "integrated" && item.result ? (
                    <Link
                      to={item.result.link || "/documentation"}
                      className={buttonVariants({ variant: "ghost", size: "md" })}
                    >
                      Ouvrir
                    </Link>
                  ) : null}
                  {item.status === "analyzing" ? (
                    <span className="flex items-center gap-1 text-[10px] text-muted-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyse
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {analysis ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-sm">2. Vérifier et intégrer</CardTitle>
              <CardDescription>
                {analysis.filename} · confiance {Math.round(analysis.confidence * 100)} %
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.suggested_targets.map((item) => (
                <Badge key={item} tone={item === target ? "success" : "neutral"}>
                  {targetLabels[item]}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysis.warnings.length > 0 ? (
              <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[10px] text-warning">
                {analysis.warnings.join(" · ")}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="doc-ai-title">Titre</Label>
                <Input
                  id="doc-ai-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-kind">Type</Label>
                <Select
                  id="doc-ai-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as DocumentAiKind)}
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-ai-supplier">Fournisseur</Label>
                <Input
                  id="doc-ai-supplier"
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-reference">Référence</Label>
                <Input
                  id="doc-ai-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
              {target === "purchase_order" ? (
                <div>
                  <Label htmlFor="doc-ai-engagement">N° d'engagement *</Label>
                  <Input
                    id="doc-ai-engagement"
                    value={engagementNumber}
                    onChange={(event) => setEngagementNumber(event.target.value)}
                    placeholder="Obligatoire pour un bon de commande"
                  />
                </div>
              ) : null}
              <div>
                <Label htmlFor="doc-ai-start">Date de début / facture</Label>
                <Input
                  id="doc-ai-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-end">
                  {target === "quote"
                    ? "Valable jusqu'au"
                    : target === "purchase_order"
                      ? "Livraison prévue"
                      : "Date de fin"}
                </Label>
                <Input
                  id="doc-ai-end"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-ht">Montant HT</Label>
                <Input
                  id="doc-ai-ht"
                  inputMode="decimal"
                  value={amountHt}
                  onChange={(event) => setAmountHt(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-ttc">Montant TTC</Label>
                <Input
                  id="doc-ai-ttc"
                  inputMode="decimal"
                  value={amountTtc}
                  onChange={(event) => setAmountTtc(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-ai-vat">TVA (%)</Label>
                <Input
                  id="doc-ai-vat"
                  inputMode="decimal"
                  value={vatRate}
                  onChange={(event) => setVatRate(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="doc-ai-summary">Résumé</Label>
              <Textarea
                id="doc-ai-summary"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </div>

            <div className="rounded-lg border border-border-soft bg-background/40 p-3">
              <p className="text-xs font-semibold text-foreground">Destination</p>
              <p className="mt-0.5 text-[10px] text-muted-2">
                Le fichier source est toujours archivé dans la documentation.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(targetLabels).map(([value, label]) => {
                  const enabled = availableTargets.includes(value as DocumentAiTarget);
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!enabled}
                      onClick={() => setTarget(value as DocumentAiTarget)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        target === value
                          ? "border-primary bg-primary/15 text-primary-strong"
                          : "border-border-soft bg-background/60 text-muted hover:text-foreground",
                        !enabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {target === "invoice" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="doc-ai-budget">Budget</Label>
                    <Select
                      id="doc-ai-budget"
                      value={budgetId}
                      onChange={(event) => {
                        setBudgetId(event.target.value);
                        setBudgetLineId("");
                      }}
                    >
                      <option value="">Sélectionner un budget</option>
                      {budgets.map((budget) => (
                        <option key={budget.id} value={budget.id}>
                          {budget.year} — {budget.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="doc-ai-line">Ligne budgétaire</Label>
                    <Select
                      id="doc-ai-line"
                      value={budgetLineId}
                      onChange={(event) => setBudgetLineId(event.target.value)}
                      disabled={!budgetId}
                    >
                      <option value="">Sélectionner une ligne</option>
                      {budgetLines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  loading={integrating}
                  disabled={
                    !title.trim() ||
                    (target === "invoice" && !budgetLineId) ||
                    (target === "purchase_order" && !engagementNumber.trim())
                  }
                  onClick={() => void integrate()}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Intégrer
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAnalysis(null);
                    setSelectedId(null);
                    setResult(null);
                  }}
                >
                  Fermer la vérification
                </Button>
              </div>
            </div>

            {analysis.text_excerpt ? (
              <details className="rounded-lg border border-border-soft bg-background/30 px-3 py-2">
                <summary className="cursor-pointer text-[10px] font-medium text-muted">
                  Extrait du texte analysé
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-muted-2">
                  {analysis.text_excerpt}
                </p>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card className="border-success/25">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileSearch className="h-4 w-4 text-success" />
                Document intégré
              </CardTitle>
              <CardDescription>{result.message}</CardDescription>
            </div>
            <Badge tone="success">Terminé</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              to={result.link}
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <FileText className="h-3.5 w-3.5" />
              Ouvrir la destination
            </Link>
            <Link
              to="/documentation"
              className={buttonVariants({ variant: "ghost", size: "md" })}
            >
              <ReceiptText className="h-3.5 w-3.5" />
              Voir la documentation
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={archiveAllOpen}
        onOpenChange={setArchiveAllOpen}
        title="Archiver tout le lot dans la documentation ?"
        description={`${queue.filter((item) => item.status === "ready").length} document(s) analysé(s) seront archivés avec les métadonnées extraites. Aucun contrat, devis, bon de commande ou facture ne sera créé. Vous pourrez ensuite les classer manuellement.`}
        confirmLabel="Archiver tout le lot"
        loading={integrating}
        onConfirm={() => void archiveAll()}
      />

      <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-2">
        <Upload className="mt-0.5 h-3 w-3 shrink-0" />
        Formats pris en charge : PDF texte et fichiers texte. Les documents scannés
        nécessitent un OCR. Vérifiez toujours les montants et dates extraits avant validation.
      </p>
    </div>
  );
}
