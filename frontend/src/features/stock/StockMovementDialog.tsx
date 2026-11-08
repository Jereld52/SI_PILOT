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
import { formatNumber } from "@/lib/utils";
import type { AgentItem, StockItemItem } from "@/types/api";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItemItem | null;
  agents: AgentItem[];
  onSaved: () => void;
}

export function StockMovementDialog({
  open,
  onOpenChange,
  item,
  agents,
  onSaved,
}: StockMovementDialogProps) {
  const [direction, setDirection] = useState("in");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setDirection("in");
    setQuantity("1");
    setReason("");
    setReference("");
    setRecipientId("");
    setError(null);
  }, [open, item]);

  const submit = async () => {
    if (!item) return;
    const value = Number(quantity);
    if (!Number.isInteger(value) || value < 1) {
      setError("La quantité doit être un nombre entier supérieur à zéro.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/stock/items/${item.id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          quantity: value,
          reason: reason.trim() || null,
          reference: reference.trim() || null,
          recipient_agent_id: direction === "out" ? recipientId || null : null,
        }),
      });
      toast.success("Mouvement de stock enregistré.");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  const projected =
    item && direction === "in"
      ? item.quantity + (Number(quantity) || 0)
      : item && direction === "out"
        ? item.quantity - (Number(quantity) || 0)
        : Number(quantity) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mouvement de stock</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.reference} — ${item.name} · ${formatNumber(item.quantity)} ${item.unit}(s) en stock`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="movement-direction">Type de mouvement</Label>
              <Select
                id="movement-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="in">Entrée en stock</option>
                <option value="out">Sortie de stock</option>
                <option value="adjustment">Ajustement d'inventaire</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="movement-quantity">
                {direction === "adjustment" ? "Quantité constatée" : "Quantité"}
              </Label>
              <Input
                id="movement-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[11px] text-muted">
            Stock après mouvement :{" "}
            <span className={projected < 0 ? "font-semibold text-danger" : "font-semibold text-foreground"}>
              {formatNumber(projected)} {item?.unit ?? ""}
            </span>
          </div>
          {direction === "out" ? (
            <div>
              <Label htmlFor="movement-recipient">Bénéficiaire</Label>
              <Select
                id="movement-recipient"
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name} — {agent.email_pro}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="movement-reason">Motif</Label>
            <Textarea
              id="movement-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder={
                direction === "in"
                  ? "Réception, réapprovisionnement…"
                  : direction === "out"
                    ? "Affectation, remplacement, casse…"
                    : "Inventaire annuel, correction…"
              }
            />
          </div>
          <div>
            <Label htmlFor="movement-reference">Référence</Label>
            <Input
              id="movement-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Bon de livraison, ticket, commande…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            Enregistrer le mouvement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
