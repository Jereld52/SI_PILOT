import { useQuery } from "@tanstack/react-query";
import {
  BadgeEuro,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  BudgetLineDialog,
  BudgetYearDialog,
  CommitmentDialog,
  InvoiceDialog,
} from "@/features/budget/BudgetDialogs";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type {
  BudgetCategoryItem,
  BudgetCommitmentItem,
  BudgetDetailItem,
  BudgetInvoiceItem,
  BudgetItem,
  BudgetLineItem,
  SupplierItem,
} from "@/types/api";

type TabKey = "lines" | "commitments" | "invoices";

const budgetStatusLabels: Record<string, string> = {
  draft: "Brouillon",
  voted: "Voté",
  closed: "Clôturé",
};

const commitmentStatusLabels: Record<string, string> = {
  draft: "Brouillon",
  quoted: "Devis",
  ordered: "Commandé",
  delivered: "Livré",
  invoiced: "Facturé",
  cancelled: "Annulé",
};

const invoiceStatusLabels: Record<string, string> = {
  received: "Reçue",
  validated: "Validée",
  paid: "Payée",
  disputed: "Litige",
};

const statusTones: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  quoted: "info",
  ordered: "warning",
  delivered: "success",
  invoiced: "success",
  cancelled: "neutral",
  received: "info",
  validated: "warning",
  paid: "success",
  disputed: "danger",
  voted: "success",
  closed: "neutral",
};

export function BudgetPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("budget.create");
  const canUpdate = hasPermission("budget.update");
  const canValidate = hasPermission("budget.validate");

  const [tab, setTab] = useState<TabKey>("lines");
  const [selectedId, setSelectedId] = useState("");
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<BudgetItem | null>(null);
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLineItem | null>(null);
  const [commitmentDialogOpen, setCommitmentDialogOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<BudgetCommitmentItem | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<BudgetInvoiceItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "line" | "commitment" | "invoice";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [validating, setValidating] = useState(false);

  const budgetsQuery = useQuery({
    queryKey: ["budgets"],
    queryFn: () => apiFetch<BudgetItem[]>("/budgets"),
  });
  const categoriesQuery = useQuery({
    queryKey: ["budgets", "categories"],
    queryFn: () => apiFetch<BudgetCategoryItem[]>("/budget-categories"),
    staleTime: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "budget"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    staleTime: 60_000,
  });
  const detailQuery = useQuery({
    queryKey: ["budgets", selectedId],
    queryFn: () => apiFetch<BudgetDetailItem>(`/budgets/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const budgets = budgetsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const budget = detailQuery.data ?? null;
  const lines = budget?.lines ?? [];
  const commitments = budget?.commitments ?? [];
  const invoices = budget?.invoices ?? [];

  useEffect(() => {
    if (!budgets.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !budgets.some((item) => item.id === selectedId)) {
      setSelectedId(budgets[0].id);
    }
  }, [budgets, selectedId]);

  const refresh = () => {
    void detailQuery.refetch();
    void budgetsQuery.refetch();
  };

  const validateBudget = async () => {
    if (!budget) return;
    setValidating(true);
    try {
      await apiFetch(`/budgets/${budget.id}/validate`, { method: "POST" });
      toast.success("Budget validé. Les montants votés sont figés dans l'historique.");
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Validation impossible.");
    } finally {
      setValidating(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path =
        deleteTarget.kind === "line"
          ? `/budget-lines/${deleteTarget.id}`
          : deleteTarget.kind === "commitment"
            ? `/budget-commitments/${deleteTarget.id}`
            : `/budget-invoices/${deleteTarget.id}`;
      await apiFetch(path, { method: "DELETE" });
      toast.success("Élément supprimé.");
      setDeleteTarget(null);
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  const usage = budget && budget.voted_total
    ? Math.min(100, Math.round((budget.committed_total / budget.voted_total) * 100))
    : 0;

  if (budgetsQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Budget informatique" />
        <ErrorState
          message={
            budgetsQuery.error instanceof Error ? budgetsQuery.error.message : "Erreur inconnue."
          }
          onRetry={() => void budgetsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage financier"
        title="Budget informatique"
        description="Exercices, lignes par catégorie, engagements, factures et disponible réel."
        actions={
          <>
            {canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingYear(null);
                  setYearDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel exercice
              </Button>
            ) : null}
            {budget && canUpdate ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingYear(budget);
                  setYearDialogOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
            ) : null}
            {budget && budget.status === "draft" && canValidate ? (
              <Button size="sm" loading={validating} onClick={() => void validateBudget()}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Valider le budget
              </Button>
            ) : null}
          </>
        }
      />

      {budgetsQuery.isLoading ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun exercice budgétaire"
          description="Créez le budget de l'année pour suivre les lignes, engagements et factures."
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setYearDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Créer un budget
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px]">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">Exercice</p>
                <Select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  aria-label="Sélectionner un exercice"
                >
                  {budgets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.year} — {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              {budget ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTones[budget.status] ?? "neutral"}>
                    {budgetStatusLabels[budget.status] ?? budget.status}
                  </Badge>
                  {budget.validated_at ? (
                    <span className="text-[11px] text-muted">
                      Validé le {formatDate(budget.validated_at)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>

          {detailQuery.isError ? (
            <ErrorState
              message={
                detailQuery.error instanceof Error ? detailQuery.error.message : "Erreur inconnue."
              }
              onRetry={() => void detailQuery.refetch()}
            />
          ) : detailQuery.isLoading || !budget ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-2">Budget voté</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatCurrency(budget.voted_total ?? 0, 0)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-2">
                    Prévu : {formatCurrency(budget.planned_total ?? 0, 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-2">Engagé</p>
                  <p className="mt-1 text-2xl font-semibold text-warning">
                    {formatCurrency(budget.committed_total, 0)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-2">{usage} % du budget voté</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-2">Facturé</p>
                  <p className="mt-1 text-2xl font-semibold text-info">
                    {formatCurrency(budget.invoiced_total, 0)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-2">
                    Payé : {formatCurrency(budget.paid_total, 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-2">Disponible</p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-semibold",
                      budget.available_total < 0 ? "text-danger" : "text-success",
                    )}
                  >
                    {formatCurrency(budget.available_total, 0)}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        usage >= 100 ? "bg-danger" : usage >= 80 ? "bg-warning" : "bg-success",
                      )}
                      style={{ width: `${usage}%` }}
                    />
                  </div>
                </Card>
              </div>

              <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
                {[
                  { key: "lines" as const, label: "Lignes", icon: FileSpreadsheet },
                  { key: "commitments" as const, label: "Engagements", icon: BadgeEuro },
                  { key: "invoices" as const, label: "Factures", icon: Receipt },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      tab === item.key
                        ? "bg-primary text-brand-cream"
                        : "text-muted hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2 px-1">
                  {tab === "lines" && canUpdate ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingLine(null);
                        setLineDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ligne
                    </Button>
                  ) : null}
                  {tab === "commitments" && canUpdate && lines.length > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingCommitment(null);
                        setCommitmentDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Engagement
                    </Button>
                  ) : null}
                  {tab === "invoices" && canUpdate && lines.length > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingInvoice(null);
                        setInvoiceDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Facture
                    </Button>
                  ) : null}
                </div>
              </div>

              <Card>
                <CardContent className="p-0 pt-3">
                  {tab === "lines" ? (
                    lines.length === 0 ? (
                      <EmptyState
                        icon={FileSpreadsheet}
                        title="Aucune ligne budgétaire"
                        description="Ventilez le budget par catégorie pour suivre les engagements et le disponible."
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ligne</TableHead>
                            <TableHead>Catégorie</TableHead>
                            <TableHead className="hidden lg:table-cell">Prévu</TableHead>
                            <TableHead>Voté</TableHead>
                            <TableHead>Engagé</TableHead>
                            <TableHead className="hidden xl:table-cell">Facturé</TableHead>
                            <TableHead>Disponible</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-xs font-medium text-foreground">
                                {line.label}
                              </TableCell>
                              <TableCell className="text-xs text-muted">
                                {line.category.name}
                              </TableCell>
                              <TableCell className="hidden text-xs text-muted lg:table-cell">
                                {line.planned_amount != null
                                  ? formatCurrency(line.planned_amount, 0)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-foreground">
                                {line.voted_amount != null
                                  ? formatCurrency(line.voted_amount, 0)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-warning">
                                {formatCurrency(line.committed_amount, 0)}
                              </TableCell>
                              <TableCell className="hidden text-xs text-info xl:table-cell">
                                {formatCurrency(line.invoiced_amount, 0)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-xs font-medium",
                                  line.available_amount < 0 ? "text-danger" : "text-success",
                                )}
                              >
                                {formatCurrency(line.available_amount, 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Modifier ${line.label}`}
                                      onClick={() => {
                                        setEditingLine(line);
                                        setLineDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Supprimer ${line.label}`}
                                      onClick={() =>
                                        setDeleteTarget({
                                          kind: "line",
                                          id: line.id,
                                          label: line.label,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )
                  ) : null}

                  {tab === "commitments" ? (
                    commitments.length === 0 ? (
                      <EmptyState
                        icon={BadgeEuro}
                        title="Aucun engagement"
                        description="Enregistrez les devis et commandes pour suivre le budget engagé."
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Engagement</TableHead>
                            <TableHead>Ligne</TableHead>
                            <TableHead className="hidden lg:table-cell">Fournisseur</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead className="hidden lg:table-cell">Date</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commitments.map((commitment) => (
                            <TableRow key={commitment.id}>
                              <TableCell>
                                <p className="text-xs font-medium text-foreground">
                                  {commitment.object}
                                </p>
                                <p className="font-mono text-[10px] text-muted-2">
                                  {commitment.reference ?? "—"}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs text-muted">
                                {commitment.line_label ?? "—"}
                              </TableCell>
                              <TableCell className="hidden text-xs text-muted lg:table-cell">
                                {commitment.supplier_name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-foreground">
                                {commitment.amount_ht != null
                                  ? formatCurrency(commitment.amount_ht, 0)
                                  : commitment.amount_ttc != null
                                    ? formatCurrency(commitment.amount_ttc, 0)
                                    : "—"}
                              </TableCell>
                              <TableCell className="hidden text-xs text-muted lg:table-cell">
                                {formatDate(commitment.ordered_at)}
                              </TableCell>
                              <TableCell>
                                <Badge tone={statusTones[commitment.status] ?? "neutral"}>
                                  {commitmentStatusLabels[commitment.status] ?? commitment.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Modifier ${commitment.object}`}
                                      onClick={() => {
                                        setEditingCommitment(commitment);
                                        setCommitmentDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Supprimer ${commitment.object}`}
                                      onClick={() =>
                                        setDeleteTarget({
                                          kind: "commitment",
                                          id: commitment.id,
                                          label: commitment.object,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )
                  ) : null}

                  {tab === "invoices" ? (
                    invoices.length === 0 ? (
                      <EmptyState
                        icon={Receipt}
                        title="Aucune facture"
                        description="Enregistrez les factures reçues pour suivre la consommation réelle."
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Facture</TableHead>
                            <TableHead>Ligne</TableHead>
                            <TableHead className="hidden lg:table-cell">Fournisseur</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead className="hidden lg:table-cell">Date</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell>
                                <p className="text-xs font-medium text-foreground">
                                  {invoice.invoice_number ?? "Sans numéro"}
                                </p>
                                <p className="text-[10px] text-muted-2">
                                  {invoice.line_label ?? "—"}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs text-muted">
                                {invoice.line_label ?? "—"}
                              </TableCell>
                              <TableCell className="hidden text-xs text-muted lg:table-cell">
                                {invoice.supplier_name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-foreground">
                                {invoice.amount_ht != null
                                  ? formatCurrency(invoice.amount_ht, 0)
                                  : invoice.amount_ttc != null
                                    ? formatCurrency(invoice.amount_ttc, 0)
                                    : "—"}
                              </TableCell>
                              <TableCell className="hidden text-xs text-muted lg:table-cell">
                                {formatDate(invoice.invoice_date)}
                              </TableCell>
                              <TableCell>
                                <Badge tone={statusTones[invoice.status] ?? "neutral"}>
                                  {invoiceStatusLabels[invoice.status] ?? invoice.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Modifier ${invoice.invoice_number ?? "la facture"}`}
                                      onClick={() => {
                                        setEditingInvoice(invoice);
                                        setInvoiceDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                  {canUpdate ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Supprimer la facture"
                                      onClick={() =>
                                        setDeleteTarget({
                                          kind: "invoice",
                                          id: invoice.id,
                                          label: invoice.invoice_number ?? "Facture",
                                        })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )
                  ) : null}
                </CardContent>
              </Card>

              <p className="text-[10px] text-muted-2">
                {formatNumber(lines.length)} ligne(s) · {formatNumber(commitments.length)}{" "}
                engagement(s) · {formatNumber(invoices.length)} facture(s)
              </p>
            </>
          )}
        </>
      )}

      <BudgetYearDialog
        open={yearDialogOpen}
        onOpenChange={setYearDialogOpen}
        budget={editingYear}
        onSaved={refresh}
      />
      {budget ? (
        <>
          <BudgetLineDialog
            open={lineDialogOpen}
            onOpenChange={setLineDialogOpen}
            budgetId={budget.id}
            line={editingLine}
            categories={categories}
            onSaved={refresh}
          />
          <CommitmentDialog
            open={commitmentDialogOpen}
            onOpenChange={setCommitmentDialogOpen}
            budgetId={budget.id}
            commitment={editingCommitment}
            lines={lines}
            suppliers={suppliers}
            onSaved={refresh}
          />
          <InvoiceDialog
            open={invoiceDialogOpen}
            onOpenChange={setInvoiceDialogOpen}
            budgetId={budget.id}
            invoice={editingInvoice}
            lines={lines}
            commitments={commitments}
            suppliers={suppliers}
            onSaved={refresh}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer cet élément ?"
        description={`« ${deleteTarget?.label ?? ""} » sera définitivement supprimé. Les éléments liés bloquent la suppression.`}
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
