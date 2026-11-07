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
import type { AssetCategoryItem, AssetItem } from "@/types/api";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: AssetCategoryItem[];
  assets: AssetItem[];
  onSaved: () => void;
}

export function StockMovementDialog({
  open,
  onOpenChange,
  categories,
  assets,
  onSaved,
}: StockMovementDialogProps) {
  const [target, setTarget] = useState("asset");
  const [assetId, setAssetId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [direction, setDirection] = useState("in");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget("asset");
    setAssetId(assets[0]?.id ?? "");
    setCategoryId(categories[0]?.id ?? "");
    setDirection("in");
    setQuantity("1");
    setReason("");
    setReference("");
    setError(null);
  }, [open, assets, categories]);

  const submit = async () => {
    if (target === "asset" && !assetId) {
      setError("Sélectionnez un équipement.");
      return;
    }
    if (target === "category" && !categoryId) {
      setError("Sélectionnez une catégorie.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      asset_id: target === "asset" ? assetId : null,
      category_id: target === "category" ? categoryId : null,
      direction,
      quantity: Math.max(1, Number(quantity) || 1),
      reason: reason.trim() || null,
      reference: reference.trim() || null,
    };
    try {
      await apiFetch("/stock/movements", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Mouvement de stock enregistré.");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau mouvement de stock</DialogTitle>
          <DialogDescription>
            Une entrée replace l'équipement en stock. Une sortie le passe en service. Chaque
            mouvement est audité.
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
              <Label htmlFor="stock-target">Portée</Label>
              <Select id="stock-target" value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="asset">Équipement identifié</option>
                <option value="category">Catégorie (consommables)</option>
              </Select>
            </div>
            {target === "asset" ? (
              <div>
                <Label htmlFor="stock-asset">Équipement</Label>
                <Select id="stock-asset" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
                  <option value="">Sélectionner…</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_tag} — {asset.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <Label htmlFor="stock-category">Catégorie</Label>
                <Select
                  id="stock-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="stock-direction">Sens</Label>
              <Select
                id="stock-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="in">Entrée</option>
                <option value="out">Sortie</option>
                <option value="adjustment">Ajustement</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="stock-quantity">Quantité</Label>
              <Input
                id="stock-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="stock-reference">Référence</Label>
              <Input
                id="stock-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="BL, commande…"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="stock-reason">Motif</Label>
            <Textarea
              id="stock-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Réception, mise en service, retour, casse…"
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
