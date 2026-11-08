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
import { stockCategoryOptions } from "@/features/stock/labels";
import { ApiError, apiFetch } from "@/lib/api";
import type { LocationItem, StockItemItem, SupplierItem } from "@/types/api";

interface StockItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItemItem | null;
  suppliers: SupplierItem[];
  locations: LocationItem[];
  onSaved: () => void;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function StockItemDialog({
  open,
  onOpenChange,
  item,
  suppliers,
  locations,
  onSaved,
}: StockItemDialogProps) {
  const editing = Boolean(item);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("keyboard");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [unit, setUnit] = useState("pièce");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setReference(item?.reference ?? "");
    setCategory(item?.category ?? "keyboard");
    setBrand(item?.brand ?? "");
    setModel(item?.model ?? "");
    setSupplierId(item?.supplier_id ?? "");
    setLocationId(item?.location_id ?? "");
    setUnit(item?.unit ?? "pièce");
    setInitialQuantity("0");
    setMinQuantity(item ? String(item.min_quantity) : "0");
    setUnitPrice(item?.unit_price != null ? String(item.unit_price) : "");
    setNotes(item?.notes ?? "");
    setError(null);
  }, [open, item]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Le nom de l'article est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const price = unitPrice ? Number(unitPrice.replace(",", ".")) : null;
    const payload = {
      name: name.trim(),
      category,
      brand: nullable(brand),
      model: nullable(model),
      supplier_id: supplierId || null,
      location_id: locationId || null,
      unit: unit.trim() || "pièce",
      min_quantity: Math.max(0, Number(minQuantity) || 0),
      unit_price: price,
      notes: nullable(notes),
      ...(editing
        ? {}
        : {
            reference: nullable(reference),
            initial_quantity: Math.max(0, Number(initialQuantity) || 0),
          }),
    };
    try {
      if (item) {
        await apiFetch(`/stock/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Article de stock mis à jour.");
      } else {
        await apiFetch("/stock/items", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Article ajouté au stock.");
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
          <DialogTitle>{editing ? "Modifier l'article" : "Nouvel article de stock"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "La quantité se modifie uniquement par un mouvement d'entrée, de sortie ou d'ajustement."
              : "Créez l'article puis utilisez les mouvements pour suivre les entrées et sorties."}
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
              <Label htmlFor="stock-name">Nom</Label>
              <Input id="stock-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="stock-category">Catégorie</Label>
              <Select
                id="stock-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {stockCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="stock-reference">Référence interne</Label>
              <Input
                id="stock-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={editing}
                placeholder={editing ? item?.reference : "Générée automatiquement si vide"}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="stock-unit">Unité</Label>
              <Input id="stock-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="stock-brand">Marque</Label>
              <Input id="stock-brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="stock-model">Modèle</Label>
              <Input id="stock-model" value={model} onChange={(event) => setModel(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="stock-supplier">Fournisseur</Label>
              <Select
                id="stock-supplier"
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
              <Label htmlFor="stock-location">Emplacement</Label>
              <Select
                id="stock-location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {!editing ? (
              <div>
                <Label htmlFor="stock-initial">Quantité initiale</Label>
                <Input
                  id="stock-initial"
                  inputMode="numeric"
                  value={initialQuantity}
                  onChange={(event) => setInitialQuantity(event.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="stock-min">Seuil d'alerte</Label>
              <Input
                id="stock-min"
                inputMode="numeric"
                value={minQuantity}
                onChange={(event) => setMinQuantity(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="stock-price">Prix unitaire (EUR)</Label>
              <Input
                id="stock-price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="stock-notes">Notes</Label>
            <Textarea
              id="stock-notes"
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
          <Button loading={loading} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
