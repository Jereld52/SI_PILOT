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
  AssetItem,
  InterventionItem,
  SupplierItem,
  TicketItem,
  TicketUserRef,
} from "@/types/api";

interface InterventionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intervention: InterventionItem | null;
  tickets: TicketItem[];
  assets: AssetItem[];
  suppliers: SupplierItem[];
  users: TicketUserRef[];
  onSaved: () => void;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function InterventionDialog({
  open,
  onOpenChange,
  intervention,
  tickets,
  assets,
  suppliers,
  users,
  onSaved,
}: InterventionDialogProps) {
  const editing = Boolean(intervention);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("corrective");
  const [status, setStatus] = useState("planned");
  const [ticketId, setTicketId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("");
  const [cost, setCost] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(intervention?.title ?? "");
    setDescription(intervention?.description ?? "");
    setType(intervention?.type ?? "corrective");
    setStatus(intervention?.status ?? "planned");
    setTicketId(intervention?.ticket_id ?? "");
    setAssetId(intervention?.asset_id ?? "");
    setSupplierId(intervention?.supplier_id ?? "");
    setTechnicianId(intervention?.technician_user_id ?? "");
    setScheduledAt(toLocalInput(intervention?.scheduled_at ?? null));
    setDuration(intervention?.duration_minutes != null ? String(intervention.duration_minutes) : "");
    setCost(intervention?.cost != null ? String(intervention.cost) : "");
    setReport(intervention?.report ?? "");
    setError(null);
  }, [open, intervention]);

  const submit = async () => {
    if (!title.trim()) {
      setError("Le titre de l'intervention est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      status,
      ticket_id: ticketId || null,
      asset_id: assetId || null,
      supplier_id: supplierId || null,
      technician_user_id: technicianId || null,
      scheduled_at: toIso(scheduledAt),
      duration_minutes: duration ? Number(duration) : null,
      cost: cost ? Number(cost.replace(",", ".")) : null,
      report: report.trim() || null,
    };
    try {
      if (intervention) {
        await apiFetch(`/interventions/${intervention.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Intervention mise à jour.");
      } else {
        await apiFetch("/interventions", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Intervention créée.");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'intervention" : "Nouvelle intervention"}</DialogTitle>
          <DialogDescription>
            Planification, technicien, coût et compte rendu. Une intervention peut être liée à une
            demande et à un équipement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="intervention-title">Titre</Label>
            <Input
              id="intervention-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="intervention-type">Type</Label>
              <Select id="intervention-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="corrective">Corrective</option>
                <option value="preventive">Préventive</option>
                <option value="installation">Installation</option>
                <option value="audit">Audit</option>
                <option value="other">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="intervention-status">Statut</Label>
              <Select
                id="intervention-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="planned">Planifiée</option>
                <option value="in_progress">En cours</option>
                <option value="done">Terminée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="intervention-ticket">Demande liée</Label>
              <Select
                id="intervention-ticket"
                value={ticketId}
                onChange={(event) => setTicketId(event.target.value)}
              >
                <option value="">Aucune</option>
                {tickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.reference} — {ticket.subject}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="intervention-asset">Équipement</Label>
              <Select
                id="intervention-asset"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              >
                <option value="">Aucun</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.asset_tag} — {asset.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="intervention-supplier">Prestataire</Label>
              <Select
                id="intervention-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Aucun</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="intervention-technician">Technicien</Label>
              <Select
                id="intervention-technician"
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Non assigné</option>
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
              <Label htmlFor="intervention-date">Planifiée le</Label>
              <Input
                id="intervention-date"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="intervention-duration">Durée (min)</Label>
              <Input
                id="intervention-duration"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="intervention-cost">Coût (EUR)</Label>
              <Input
                id="intervention-cost"
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="intervention-description">Description</Label>
            <Textarea
              id="intervention-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="intervention-report">Compte rendu</Label>
            <Textarea
              id="intervention-report"
              value={report}
              onChange={(event) => setReport(event.target.value)}
              rows={3}
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
