import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileSearch,
  FileText,
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
  invoice: "Facture",
  license: "Licence",
  other: "Autre document",
};

const targetLabels: Record<DocumentAiTarget, string> = {
  documentation: "Documentation",
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

export function DocumentIntakePage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("documents.create");
  const canUseAi = hasPermission("ai.use");
  const canCreateContract = hasPermission("contracts.create");
  const canCreateLicense = hasPermission("licenses.manage");
  const canCreateInvoice = hasPermission("budget.update");
  const canReadBudget = hasPermission("budget.read");

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DocumentAiAnalysis | null>(null);
  const [target, setTarget] = useState<DocumentAiTarget>("documentation");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentAiKind>("other");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
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
      (item === "contract" && canCreateContract) ||
      (item === "license" && canCreateLicense) ||
      (item === "invoice" && canCreateInvoice && canReadBudget),
  );

  const analyze = async () => {
    if (!file) {
      toast.error("Sélectionnez un document PDF ou texte.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiFetch<DocumentAiAnalysis>("/documents/analyze", {
        method: "POST",
        body: form,
      });
      setAnalysis(data);
      setTitle(data.title);
      setKind(data.document_type);
      setSupplier(data.supplier ?? "");
      setReference(data.reference ?? "");
      setStartDate(data.start_date ?? "");
      setEndDate(data.end_date ?? "");
      setAmountHt(data.amount_ht != null ? String(data.amount_ht) : "");
      setAmountTtc(data.amount_ttc != null ? String(data.amount_ttc) : "");
      setVatRate(data.vat_rate != null ? String(data.vat_rate) : "");
      setSummary(data.summary);
      const firstTarget = data.suggested_targets.find((item) =>
        item === "documentation" && canCreate ||
        item === "contract" && canCreateContract ||
        item === "license" && canCreateLicense ||
        item === "invoice" && canCreateInvoice && canReadBudget,
      );
      setTarget(firstTarget ?? "documentation");
      toast.success("Document analysé. Vérifiez les informations avant intégration.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Analyse impossible.");
    } finally {
      setAnalyzing(false);
    }
  };

  const integrate = async () => {
    if (!analysis) return;
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
      setResult(data);
      toast.success(data.message);
      setAnalysis(null);
      setFile(null);
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
            <CardTitle className="text-sm">1. Choisir un document</CardTitle>
            <CardDescription>
              PDF texte ou fichier texte. Les PDF scannés doivent être passés par un OCR.
            </CardDescription>
          </div>
          <Badge tone="info">IA cloud ou locale</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setAnalysis(null);
              setResult(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button loading={analyzing} onClick={() => void analyze()}>
              <Sparkles className="h-3.5 w-3.5" />
              Analyser avec l'IA
            </Button>
            <p className="self-center text-[10px] text-muted-2">
              L'IA extrait les dates, montants, fournisseur et référence. Aucune écriture
              n'est faite avant votre validation.
            </p>
          </div>
        </CardContent>
      </Card>

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
                <Label htmlFor="doc-ai-end">Date de fin</Label>
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
                  disabled={!title.trim() || (target === "invoice" && !budgetLineId)}
                  onClick={() => void integrate()}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Intégrer
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAnalysis(null);
                    setFile(null);
                  }}
                >
                  Annuler
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

      <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-2">
        <Upload className="mt-0.5 h-3 w-3 shrink-0" />
        Formats pris en charge : PDF texte et fichiers texte. Les documents scannés
        nécessitent un OCR. Vérifiez toujours les montants et dates extraits avant validation.
      </p>
    </div>
  );
}
