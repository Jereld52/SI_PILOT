import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  BudgetCategoryItem,
  BudgetCommitmentItem,
  BudgetInvoiceItem,
  BudgetItem,
  BudgetLineItem,
  SupplierItem,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function money(value: string): number | null {
  return value ? Number(value.replace(",", ".")) : null;
}

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

function useSubmit(onSaved: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<unknown>, message: string, close: () => void) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      onSaved();
      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, setError, submit };
}

// --- Exercice budgétaire -----------------------------------------------------

interface BudgetYearDialogProps extends BaseDialogProps {
  budget: BudgetItem | null;
}

export function BudgetYearDialog({ open, onOpenChange, budget, onSaved }: BudgetYearDialogProps) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setYear(budget ? String(budget.year) : String(new Date().getFullYear()));
    setName(budget?.name ?? `Budget informatique ${new Date().getFullYear()}`);
    setStatus(budget?.status ?? "draft");
    setNotes(budget?.notes ?? "");
    setError(null);
  }, [open, budget, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom du budget est obligatoire.");
      return;
    }
    const payload = {
      year: Number(year),
      name: name.trim(),
      status,
      notes: nullable(notes),
    };
    void submit(
      () =>
        budget
          ? apiFetch(`/budgets/${budget.id}`, {
              method: "PATCH",
              body: JSON.stringify({ name: payload.name, status, notes: payload.notes }),
            })
          : apiFetch("/budgets", { method: "POST", body: JSON.stringify(payload) }),
      budget ? "Budget mis à jour." : "Budget créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{budget ? "Modifier l'exercice" : "Nouvel exercice budgétaire"}</DialogTitle>
          <DialogDescription>
            Un budget par année. Les totaux sont calculés à partir des lignes, engagements et
            factures.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="budget-year">Année</Label>
              <Input
                id="budget-year"
                inputMode="numeric"
                value={year}
                disabled={Boolean(budget)}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="budget-status">Statut</Label>
              <Select id="budget-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="draft">Brouillon</option>
                <option value="voted">Voté</option>
                <option value="closed">Clôturé</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="budget-name">Nom</Label>
            <Input id="budget-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="budget-notes">Notes</Label>
            <Textarea
              id="budget-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Ligne budgétaire --------------------------------------------------------

interface BudgetLineDialogProps extends BaseDialogProps {
  budgetId: string;
  line: BudgetLineItem | null;
  categories: BudgetCategoryItem[];
}

export function BudgetLineDialog({
  open,
  onOpenChange,
  budgetId,
  line,
  categories,
  onSaved,
}: BudgetLineDialogProps) {
  const [categoryId, setCategoryId] = useState("");
  const [label, setLabel] = useState("");
  const [planned, setPlanned] = useState("");
  const [voted, setVoted] = useState("");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setCategoryId(line?.category_id ?? categories[0]?.id ?? "");
    setLabel(line?.label ?? "");
    setPlanned(line?.planned_amount != null ? String(line.planned_amount) : "");
    setVoted(line?.voted_amount != null ? String(line.voted_amount) : "");
    setNotes(line?.notes ?? "");
    setError(null);
  }, [open, line, categories, setError]);

  const doSubmit = () => {
    if (!categoryId || !label.trim()) {
      setError("La catégorie et le libellé sont obligatoires.");
      return;
    }
    const payload = {
      category_id: categoryId,
      label: label.trim(),
      planned_amount: money(planned),
      voted_amount: money(voted),
      notes: nullable(notes),
    };
    void submit(
      () =>
        line
          ? apiFetch(`/budget-lines/${line.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/budgets/${budgetId}/lines`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      line ? "Ligne mise à jour." : "Ligne budgétaire créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{line ? "Modifier la ligne" : "Nouvelle ligne budgétaire"}</DialogTitle>
          <DialogDescription>
            Ventilation par catégorie. Le disponible est calculé après engagements.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="line-category">Catégorie</Label>
            <Select
              id="line-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="line-label">Libellé</Label>
            <Input id="line-label" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="line-planned">Prévu (EUR)</Label>
              <Input
                id="line-planned"
                inputMode="decimal"
                value={planned}
                onChange={(event) => setPlanned(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="line-voted">Voté (EUR)</Label>
              <Input
                id="line-voted"
                inputMode="decimal"
                value={voted}
                onChange={(event) => setVoted(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="line-notes">Notes</Label>
            <Textarea
              id="line-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Engagement --------------------------------------------------------------

interface CommitmentDialogProps extends BaseDialogProps {
  budgetId: string;
  commitment: BudgetCommitmentItem | null;
  lines: BudgetLineItem[];
  suppliers: SupplierItem[];
}

export function CommitmentDialog({
  open,
  onOpenChange,
  budgetId,
  commitment,
  lines,
  suppliers,
  onSaved,
}: CommitmentDialogProps) {
  const [lineId, setLineId] = useState("");
  const [reference, setReference] = useState("");
  const [object, setObject] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [orderedAt, setOrderedAt] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setLineId(commitment?.budget_line_id ?? lines[0]?.id ?? "");
    setReference(commitment?.reference ?? "");
    setObject(commitment?.object ?? "");
    setAmountHt(commitment?.amount_ht != null ? String(commitment.amount_ht) : "");
    setAmountTtc(commitment?.amount_ttc != null ? String(commitment.amount_ttc) : "");
    setOrderedAt(commitment?.ordered_at ?? "");
    setSupplierId(commitment?.supplier_id ?? "");
    setStatus(commitment?.status ?? "draft");
    setNotes(commitment?.notes ?? "");
    setError(null);
  }, [open, commitment, lines, setError]);

  const doSubmit = () => {
    if (!lineId || !object.trim()) {
      setError("La ligne budgétaire et l'objet sont obligatoires.");
      return;
    }
    const payload = {
      budget_line_id: lineId,
      reference: nullable(reference),
      object: object.trim(),
      amount_ht: money(amountHt),
      amount_ttc: money(amountTtc),
      ordered_at: orderedAt || null,
      supplier_id: supplierId || null,
      status,
      notes: nullable(notes),
    };
    void submit(
      () =>
        commitment
          ? apiFetch(`/budget-commitments/${commitment.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/budgets/${budgetId}/commitments`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      commitment ? "Engagement mis à jour." : "Engagement créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{commitment ? "Modifier l'engagement" : "Nouvel engagement"}</DialogTitle>
          <DialogDescription>
            Devis, commande ou engagement : le montant est déduit du disponible de la ligne.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="commitment-line">Ligne budgétaire</Label>
              <Select
                id="commitment-line"
                value={lineId}
                onChange={(event) => setLineId(event.target.value)}
              >
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.label} — {line.category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="commitment-reference">Référence</Label>
              <Input
                id="commitment-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Devis, bon de commande…"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="commitment-object">Objet</Label>
            <Input
              id="commitment-object"
              value={object}
              onChange={(event) => setObject(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="commitment-ht">Montant HT</Label>
              <Input
                id="commitment-ht"
                inputMode="decimal"
                value={amountHt}
                onChange={(event) => setAmountHt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="commitment-ttc">Montant TTC</Label>
              <Input
                id="commitment-ttc"
                inputMode="decimal"
                value={amountTtc}
                onChange={(event) => setAmountTtc(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="commitment-status">Statut</Label>
              <Select
                id="commitment-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Brouillon</option>
                <option value="quoted">Devis</option>
                <option value="ordered">Commandé</option>
                <option value="delivered">Livré</option>
                <option value="invoiced">Facturé</option>
                <option value="cancelled">Annulé</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="commitment-date">Date de commande</Label>
              <Input
                id="commitment-date"
                type="date"
                value={orderedAt}
                onChange={(event) => setOrderedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="commitment-supplier">Fournisseur</Label>
              <Select
                id="commitment-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="commitment-notes">Notes</Label>
            <Textarea
              id="commitment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Facture -----------------------------------------------------------------

interface InvoiceDialogProps extends BaseDialogProps {
  budgetId: string;
  invoice: BudgetInvoiceItem | null;
  lines: BudgetLineItem[];
  commitments: BudgetCommitmentItem[];
  suppliers: SupplierItem[];
}

export function InvoiceDialog({
  open,
  onOpenChange,
  budgetId,
  invoice,
  lines,
  commitments,
  suppliers,
  onSaved,
}: InvoiceDialogProps) {
  const [lineId, setLineId] = useState("");
  const [commitmentId, setCommitmentId] = useState("");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [status, setStatus] = useState("received");
  const [paidAt, setPaidAt] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setLineId(invoice?.budget_line_id ?? lines[0]?.id ?? "");
    setCommitmentId(invoice?.commitment_id ?? "");
    setNumber(invoice?.invoice_number ?? "");
    setInvoiceDate(invoice?.invoice_date ?? "");
    setAmountHt(invoice?.amount_ht != null ? String(invoice.amount_ht) : "");
    setAmountTtc(invoice?.amount_ttc != null ? String(invoice.amount_ttc) : "");
    setVatRate(invoice?.vat_rate != null ? String(invoice.vat_rate) : "");
    setStatus(invoice?.status ?? "received");
    setPaidAt(invoice?.paid_at ?? "");
    setSupplierId(invoice?.supplier_id ?? "");
    setError(null);
  }, [open, invoice, lines, setError]);

  const doSubmit = () => {
    if (!lineId) {
      setError("Sélectionnez une ligne budgétaire.");
      return;
    }
    const payload = {
      budget_line_id: lineId,
      commitment_id: commitmentId || null,
      invoice_number: nullable(number),
      invoice_date: invoiceDate || null,
      amount_ht: money(amountHt),
      amount_ttc: money(amountTtc),
      vat_rate: money(vatRate),
      status,
      paid_at: status === "paid" ? paidAt || new Date().toISOString().slice(0, 10) : null,
      supplier_id: supplierId || null,
    };
    void submit(
      () =>
        invoice
          ? apiFetch(`/budget-invoices/${invoice.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/budgets/${budgetId}/invoices`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      invoice ? "Facture mise à jour." : "Facture créée.",
      () => onOpenChange(false),
    );
  };

  const lineCommitments = commitments.filter((item) => item.budget_line_id === lineId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{invoice ? "Modifier la facture" : "Nouvelle facture"}</DialogTitle>
          <DialogDescription>
            Les factures validées ou payées alimentent le budget consommé.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoice-line">Ligne budgétaire</Label>
              <Select
                id="invoice-line"
                value={lineId}
                onChange={(event) => {
                  setLineId(event.target.value);
                  setCommitmentId("");
                }}
              >
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.label} — {line.category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="invoice-commitment">Engagement lié</Label>
              <Select
                id="invoice-commitment"
                value={commitmentId}
                onChange={(event) => setCommitmentId(event.target.value)}
              >
                <option value="">Aucun</option>
                {lineCommitments.map((commitment) => (
                  <option key={commitment.id} value={commitment.id}>
                    {commitment.object}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="invoice-number">N° facture</Label>
              <Input
                id="invoice-number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-date">Date</Label>
              <Input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-status">Statut</Label>
              <Select
                id="invoice-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="received">Reçue</option>
                <option value="validated">Validée</option>
                <option value="paid">Payée</option>
                <option value="disputed">Litige</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="invoice-ht">Montant HT</Label>
              <Input
                id="invoice-ht"
                inputMode="decimal"
                value={amountHt}
                onChange={(event) => setAmountHt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-ttc">Montant TTC</Label>
              <Input
                id="invoice-ttc"
                inputMode="decimal"
                value={amountTtc}
                onChange={(event) => setAmountTtc(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-vat">TVA (%)</Label>
              <Input
                id="invoice-vat"
                inputMode="decimal"
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoice-supplier">Fournisseur</Label>
              <Select
                id="invoice-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="invoice-paid">Payée le</Label>
              <Input
                id="invoice-paid"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                disabled={status !== "paid"}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
