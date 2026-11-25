import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Ban,
  FilePlus2,
  FileText,
  Pencil,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CommercialDocumentItem, SupplierItem } from "@/types/api";

type Kind = "quote" | "purchase_order";

const kindLabels: Record<Kind, string> = {
  quote: "Devis",
  purchase_order: "Bon de commande",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  converted: "Converti",
  confirmed: "Confirmé",
  delivered: "Livré",
  cancelled: "Annulé",
};

const statusTones: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  refused: "danger",
  expired: "warning",
  converted: "success",
  confirmed: "info",
  delivered: "success",
  cancelled: "danger",
};

const quoteStatuses = ["draft", "sent", "accepted", "refused", "expired", "converted", "cancelled"];
const orderStatuses = ["draft", "sent", "confirmed", "delivered", "cancelled"];

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

interface FormState {
  supplierId: string;
  object: string;
  reference: string;
  status: string;
  issueDate: string;
  endDate: string;
  amountHt: string;
  amountTtc: string;
  vatRate: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  supplierId: "",
  object: "",
  reference: "",
  status: "draft",
  issueDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  amountHt: "",
  amountTtc: "",
  vatRate: "20",
  notes: "",
});

export function CommercialDocumentsPage({ kind }: { kind: Kind }) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("suppliers.read");
  const canManage = hasPermission("suppliers.manage");
  const label = kindLabels[kind];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommercialDocumentItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CommercialDocumentItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["commercial", kind, search, statusFilter],
    queryFn: () =>
      apiFetch<CommercialDocumentItem[]>(
        `/commercial-documents?kind=${kind}${search ? `&q=${encodeURIComponent(search)}` : ""}${
          statusFilter ? `&status=${statusFilter}` : ""
        }`,
      ),
    enabled: canRead,
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "commercial"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    enabled: canRead,
    staleTime: 60_000,
  });
  const documents = documentsQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setForm({
        supplierId: editing.supplier_id,
        object: editing.object,
        reference: editing.reference,
        status: editing.status,
        issueDate: editing.issue_date,
        endDate: (kind === "quote" ? editing.valid_until : editing.expected_date) ?? "",
        amountHt: editing.amount_ht != null ? String(editing.amount_ht) : "",
        amountTtc: editing.amount_ttc != null ? String(editing.amount_ttc) : "",
        vatRate: editing.vat_rate != null ? String(editing.vat_rate) : "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [dialogOpen, editing, kind]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (document: CommercialDocumentItem) => {
    setEditing(document);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.supplierId || !form.object.trim()) {
      toast.error("Sélectionnez un fournisseur et renseignez l'objet.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        supplier_id: form.supplierId,
        reference: nullable(form.reference) ?? "",
        object: form.object.trim(),
        status: form.status,
        issue_date: form.issueDate,
        valid_until: kind === "quote" ? form.endDate || null : null,
        expected_date: kind === "purchase_order" ? form.endDate || null : null,
        amount_ht: numeric(form.amountHt),
        amount_ttc: numeric(form.amountTtc),
        vat_rate: numeric(form.vatRate),
        notes: nullable(form.notes),
      };
      if (editing) {
        await apiFetch(`/commercial-documents/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success(`${label} mis à jour.`);
      } else {
        await apiFetch("/commercial-documents", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(`${label} créé.`);
      }
      setDialogOpen(false);
      void documentsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiFetch(`/commercial-documents/${cancelTarget.id}`, { method: "DELETE" });
      toast.success(`${label} annulé.`);
      setCancelTarget(null);
      void documentsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Annulation impossible.");
    } finally {
      setCancelling(false);
    }
  };

  const convert = async (document: CommercialDocumentItem) => {
    setConvertingId(document.id);
    try {
      const created = await apiFetch<CommercialDocumentItem>(
        `/commercial-documents/${document.id}/convert`,
        { method: "POST" },
      );
      toast.success(`Bon de commande ${created.reference} créé.`);
      void documentsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Conversion impossible.");
    } finally {
      setConvertingId(null);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={FileText}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les devis et bons de commande."
      />
    );
  }

  const statuses = kind === "quote" ? quoteStatuses : orderStatuses;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Gestion des achats"
        title={kind === "quote" ? "Devis" : "Bons de commande"}
        description={
          kind === "quote"
            ? "Préparer, envoyer et suivre les devis fournisseurs, puis les convertir en bons de commande."
            : "Suivre les commandes fournisseurs, leurs montants, leurs dates et leur livraison."
        }
        actions={
          <>
            {canManage ? (
              <Button size="sm" onClick={openCreate} disabled={suppliers.length === 0}>
                <FilePlus2 className="h-3.5 w-3.5" />
                {kind === "quote" ? "Nouveau devis" : "Nouveau bon de commande"}
              </Button>
            ) : null}
            <Link
              to="/fournisseurs"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Fournisseurs
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{documents.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">En attente</p>
          <p className="mt-1 text-2xl font-semibold text-info">
            {documents.filter((item) => ["draft", "sent", "confirmed"].includes(item.status)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Acceptés / livrés</p>
          <p className="mt-1 text-2xl font-semibold text-success">
            {documents.filter((item) => ["accepted", "delivered"].includes(item.status)).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Montant TTC</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatCurrency(
              documents.reduce((total, item) => total + (item.amount_ttc ?? 0), 0),
              0,
            )}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une référence, un objet…"
            className="sm:max-w-xs"
          />
          <div className="flex flex-1 justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="sm:w-44"
            >
              <option value="">Tous les statuts</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status] ?? status}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {documentsQuery.isError ? (
            <ErrorState
              message={
                documentsQuery.error instanceof Error
                  ? documentsQuery.error.message
                  : "Impossible de charger les documents."
              }
              onRetry={() => void documentsQuery.refetch()}
            />
          ) : documentsQuery.isLoading ? (
            <div className="space-y-1 px-3 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={`Aucun ${label.toLowerCase()}`}
              description={
                suppliers.length === 0
                  ? "Créez d'abord un fournisseur dans Gestion → Fournisseurs & licences."
                  : "Créez un premier document ou importez-le depuis l'import intelligent."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Montant TTC</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-mono text-[11px] text-foreground">
                      {document.reference}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-[11px] text-foreground">
                      {document.object}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted">
                      {document.supplier.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted">
                      {formatDate(document.issue_date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-foreground">
                      {formatCurrency(document.amount_ttc ?? 0, 2)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[document.status] ?? "neutral"}>
                        {statusLabels[document.status] ?? document.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {kind === "quote" && canManage && document.status !== "converted" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Convertir en bon de commande"
                            loading={convertingId === document.id}
                            onClick={() => void convert(document)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-success" />
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Modifier"
                            onClick={() => openEdit(document)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canManage && document.status !== "cancelled" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Annuler"
                            onClick={() => setCancelTarget(document)}
                          >
                            <Ban className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Modifier le ${label.toLowerCase()}` : `Nouveau ${label.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              Fournisseur, montants, statut et dates. La référence peut être laissée vide pour
              une génération automatique.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="commercial-supplier">Fournisseur</Label>
                <Select
                  id="commercial-supplier"
                  value={form.supplierId}
                  onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="commercial-status">Statut</Label>
                <Select
                  id="commercial-status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status] ?? status}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="commercial-object">Objet</Label>
                <Input
                  id="commercial-object"
                  value={form.object}
                  onChange={(event) => setForm({ ...form, object: event.target.value })}
                  placeholder="Renouvellement des postes, maintenance réseau…"
                />
              </div>
              <div>
                <Label htmlFor="commercial-reference">Référence</Label>
                <Input
                  id="commercial-reference"
                  value={form.reference}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                  placeholder="Automatique"
                />
              </div>
              <div>
                <Label htmlFor="commercial-issue">Date d'émission</Label>
                <Input
                  id="commercial-issue"
                  type="date"
                  value={form.issueDate}
                  onChange={(event) => setForm({ ...form, issueDate: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="commercial-end">
                  {kind === "quote" ? "Valable jusqu'au" : "Livraison prévue"}
                </Label>
                <Input
                  id="commercial-end"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="commercial-ht">Montant HT</Label>
                <Input
                  id="commercial-ht"
                  inputMode="decimal"
                  value={form.amountHt}
                  onChange={(event) => setForm({ ...form, amountHt: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="commercial-ttc">Montant TTC</Label>
                <Input
                  id="commercial-ttc"
                  inputMode="decimal"
                  value={form.amountTtc}
                  onChange={(event) => setForm({ ...form, amountTtc: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="commercial-vat">TVA (%)</Label>
                <Input
                  id="commercial-vat"
                  inputMode="decimal"
                  value={form.vatRate}
                  onChange={(event) => setForm({ ...form, vatRate: event.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="commercial-notes">Notes</Label>
              <Textarea
                id="commercial-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={`Annuler ce ${label.toLowerCase()} ?`}
        description={`${cancelTarget?.reference ?? ""} sera marqué comme annulé.`}
        confirmLabel="Annuler le document"
        tone="danger"
        loading={cancelling}
        onConfirm={() => void cancel()}
      />
    </div>
  );
}
