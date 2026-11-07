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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  ContractCategoryItem,
  ContractItem,
  SupplierItem,
  TicketUserRef,
} from "@/types/api";

interface ContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ContractItem | null;
  categories: ContractCategoryItem[];
  suppliers: SupplierItem[];
  users: TicketUserRef[];
  onSaved: () => void;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ContractDialog({
  open,
  onOpenChange,
  contract,
  categories,
  suppliers,
  users,
  onSaved,
}: ContractDialogProps) {
  const editing = Boolean(contract);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [object, setObject] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [annualCost, setAnnualCost] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [noticeDays, setNoticeDays] = useState("60");
  const [autoRenew, setAutoRenew] = useState(false);
  const [responsibleId, setResponsibleId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSupplierId(contract?.supplier_id ?? suppliers[0]?.id ?? "");
    setReference(contract?.reference ?? "");
    setObject(contract?.object ?? "");
    setCategoryId(contract?.category_id ?? "");
    setStartDate(contract?.start_date ?? "");
    setEndDate(contract?.end_date ?? "");
    setDuration(contract?.duration_months != null ? String(contract.duration_months) : "");
    setAmountHt(contract?.amount_ht != null ? String(contract.amount_ht) : "");
    setAmountTtc(contract?.amount_ttc != null ? String(contract.amount_ttc) : "");
    setVatRate(contract?.vat_rate != null ? String(contract.vat_rate) : "");
    setAnnualCost(contract?.annual_cost != null ? String(contract.annual_cost) : "");
    setMonthlyCost(contract?.monthly_cost != null ? String(contract.monthly_cost) : "");
    setNoticeDays(contract?.notice_days != null ? String(contract.notice_days) : "60");
    setAutoRenew(contract?.auto_renew ?? false);
    setResponsibleId(contract?.responsible_user_id ?? "");
    setContactName(contract?.contact_name ?? "");
    setContactEmail(contract?.contact_email ?? "");
    setStatus(contract?.status ?? "active");
    setComments(contract?.comments ?? "");
    setError(null);
  }, [open, contract, suppliers]);

  const submit = async () => {
    if (!supplierId) {
      setError("Sélectionnez un fournisseur.");
      return;
    }
    if (!reference.trim() || !object.trim()) {
      setError("La référence et l'objet du contrat sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      supplier_id: supplierId,
      reference: reference.trim(),
      object: object.trim(),
      category_id: categoryId || null,
      start_date: startDate || null,
      end_date: endDate || null,
      duration_months: duration ? Number(duration) : null,
      amount_ht: amountHt ? Number(amountHt.replace(",", ".")) : null,
      amount_ttc: amountTtc ? Number(amountTtc.replace(",", ".")) : null,
      vat_rate: vatRate ? Number(vatRate.replace(",", ".")) : null,
      annual_cost: annualCost ? Number(annualCost.replace(",", ".")) : null,
      monthly_cost: monthlyCost ? Number(monthlyCost.replace(",", ".")) : null,
      notice_days: noticeDays ? Number(noticeDays) : null,
      auto_renew: autoRenew,
      responsible_user_id: responsibleId || null,
      contact_name: nullable(contactName),
      contact_email: nullable(contactEmail),
      status,
      comments: nullable(comments),
    };
    try {
      if (contract) {
        await apiFetch(`/contracts/${contract.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Contrat mis à jour.");
      } else {
        await apiFetch("/contracts", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Contrat créé.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le contrat" : "Nouveau contrat"}</DialogTitle>
          <DialogDescription>
            Contrat, prestation ou abonnement : fournisseur, montants, préavis et échéance.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contract-supplier">Fournisseur</Label>
              <Select
                id="contract-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Sélectionner…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="contract-reference">Référence</Label>
              <Input
                id="contract-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="CTR-2026-001"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="contract-object">Objet</Label>
            <Input
              id="contract-object"
              value={object}
              onChange={(event) => setObject(event.target.value)}
              placeholder="Maintenance du parc, hébergement, téléphonie…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="contract-category">Catégorie</Label>
              <Select
                id="contract-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Non classé</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="contract-status">Statut</Label>
              <Select
                id="contract-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Brouillon</option>
                <option value="active">Actif</option>
                <option value="expiring">Échéance proche</option>
                <option value="expired">Expiré</option>
                <option value="terminated">Résilié</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="contract-responsible">Responsable</Label>
              <Select
                id="contract-responsible"
                value={responsibleId}
                onChange={(event) => setResponsibleId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="contract-start">Début</Label>
              <Input
                id="contract-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-end">Échéance</Label>
              <Input
                id="contract-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-duration">Durée (mois)</Label>
              <Input
                id="contract-duration"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="contract-amount-ht">Montant HT</Label>
              <Input
                id="contract-amount-ht"
                inputMode="decimal"
                value={amountHt}
                onChange={(event) => setAmountHt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-amount-ttc">Montant TTC</Label>
              <Input
                id="contract-amount-ttc"
                inputMode="decimal"
                value={amountTtc}
                onChange={(event) => setAmountTtc(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-vat">TVA (%)</Label>
              <Input
                id="contract-vat"
                inputMode="decimal"
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="contract-annual">Coût annuel</Label>
              <Input
                id="contract-annual"
                inputMode="decimal"
                value={annualCost}
                onChange={(event) => setAnnualCost(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-monthly">Coût mensuel</Label>
              <Input
                id="contract-monthly"
                inputMode="decimal"
                value={monthlyCost}
                onChange={(event) => setMonthlyCost(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-notice">Préavis (jours)</Label>
              <Input
                id="contract-notice"
                inputMode="numeric"
                value={noticeDays}
                onChange={(event) => setNoticeDays(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contract-contact">Contact</Label>
              <Input
                id="contract-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contract-email">E-mail du contact</Label>
              <Input
                id="contract-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Reconduction tacite</p>
              <p className="text-[10px] text-muted-2">
                Le préavis est déduit de l'échéance pour calculer la date limite de résiliation.
              </p>
            </div>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} label="Reconduction tacite" />
          </div>
          <div>
            <Label htmlFor="contract-comments">Commentaires</Label>
            <Textarea
              id="contract-comments"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
