import { Hash } from "lucide-react";
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
import { renderTagPreview } from "@/features/assets/labels";
import { ApiError, apiFetch } from "@/lib/api";
import type { AssetCategoryItem } from "@/types/api";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: AssetCategoryItem | null;
  onSaved: () => void;
}

export function CategoryDialog({ open, onOpenChange, category, onSaved }: CategoryDialogProps) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    tag_prefix: "",
    tag_template: "PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
    tag_sequence_mode: "year",
    default_life_months: "60",
    is_workstation: false,
    is_infrastructure: false,
    requires_network_fields: false,
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      code: category?.code ?? "",
      name: category?.name ?? "",
      tag_prefix: category?.tag_prefix ?? "",
      tag_template: category?.tag_template ?? "PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
      tag_sequence_mode: category?.tag_sequence_mode ?? "year",
      default_life_months: String(category?.default_life_months ?? 60),
      is_workstation: category?.is_workstation ?? false,
      is_infrastructure: category?.is_infrastructure ?? false,
      requires_network_fields: category?.requires_network_fields ?? false,
      is_active: category?.is_active ?? true,
    });
    setError(null);
  }, [open, category]);

  const update = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));

  const label = category?.name ?? form.name ?? "Catégorie";
  const preview = renderTagPreview(
    form.tag_template || "PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
    form.tag_prefix || form.code || "CAT",
    form.code || "categorie",
  );

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Le nom de la catégorie est obligatoire.");
      return;
    }
    if (!category && !form.code.trim()) {
      setError("Le code de la catégorie est obligatoire.");
      return;
    }
    if (!form.tag_template.includes("{SEQ")) {
      setError("Le modèle de nommage doit contenir {SEQ} ou {SEQ:4}.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        tag_prefix: form.tag_prefix || null,
        tag_template: form.tag_template,
        tag_sequence_mode: form.tag_sequence_mode,
        default_life_months: Number(form.default_life_months) || 0,
        is_workstation: form.is_workstation,
        is_infrastructure: form.is_infrastructure,
        requires_network_fields: form.requires_network_fields,
        is_active: form.is_active,
      };
      if (category) {
        await apiFetch(`/asset-categories/${category.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Catégorie mise à jour.");
      } else {
        await apiFetch("/asset-categories", {
          method: "POST",
          body: JSON.stringify({ ...payload, code: form.code }),
        });
        toast.success("Catégorie créée.");
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{category ? `Modifier ${label}` : "Nouvelle catégorie"}</DialogTitle>
          <DialogDescription>
            Le modèle de nommage s'applique aux nouveaux équipements de cette catégorie. Les
            numéros existants ne sont jamais modifiés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-code">Code</Label>
              <Input
                id="category-code"
                value={form.code}
                onChange={(event) => update("code", event.target.value)}
                disabled={Boolean(category)}
                placeholder="desktop"
              />
            </div>
            <div>
              <Label htmlFor="category-name">Nom</Label>
              <Input id="category-name" value={form.name} onChange={(event) => update("name", event.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-primary-strong/15 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Hash className="mt-0.5 h-4 w-4 text-primary-strong" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                  Aperçu du numéro d'inventaire
                </p>
                <p className="mt-0.5 font-mono text-sm text-foreground">{preview}</p>
                <p className="mt-1 text-[10px] text-muted-2">
                  Variables disponibles : {"{PREFIX}"}, {"{YEAR}"}, {"{SEQ}"} ou {"{SEQ:4}"}.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-prefix">Préfixe</Label>
              <Input
                id="category-prefix"
                value={form.tag_prefix}
                onChange={(event) => update("tag_prefix", event.target.value.toUpperCase())}
                placeholder="PC"
              />
            </div>
            <div>
              <Label htmlFor="category-sequence">Séquence</Label>
              <Select
                id="category-sequence"
                value={form.tag_sequence_mode}
                onChange={(event) => update("tag_sequence_mode", event.target.value)}
              >
                <option value="year">Remise à zéro chaque année</option>
                <option value="global">Séquence continue</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="category-template">Modèle de nommage</Label>
            <Input
              id="category-template"
              value={form.tag_template}
              onChange={(event) => update("tag_template", event.target.value)}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-2">
              Exemple : PNFOR-PC-{"{YEAR}"}-{"{SEQ:4}"} → PNFOR-PC-2026-0001
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-life">Durée de vie (mois)</Label>
              <Input
                id="category-life"
                type="number"
                min={0}
                max={240}
                value={form.default_life_months}
                onChange={(event) => update("default_life_months", event.target.value)}
              />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(value) => update("is_active", value)} label="Catégorie active" />
                <span className="text-xs text-muted">Catégorie active</span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:grid-cols-3">
            {[
              ["is_workstation", "Poste de travail"],
              ["is_infrastructure", "Infrastructure"],
              ["requires_network_fields", "Champs réseau"],
            ].map(([field, text]) => (
              <label key={field} className="flex items-center gap-2 text-[11px] text-muted">
                <Switch
                  checked={Boolean(form[field as keyof typeof form])}
                  onCheckedChange={(value) => update(field as keyof typeof form, value)}
                  label={text}
                />
                {text}
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => void submit()} loading={loading}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
