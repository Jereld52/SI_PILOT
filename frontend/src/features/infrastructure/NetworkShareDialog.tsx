import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type { LocationItem, NetworkShareItem } from "@/types/api";

interface NetworkShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  share: NetworkShareItem | null;
  locations: LocationItem[];
  onSaved: () => void;
}

interface Draft {
  name: string;
  uncPath: string;
  driveLetter: string;
  locationId: string;
  responsible: string;
  description: string;
  warningPercent: string;
  criticalPercent: string;
  minFreeGb: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: Draft = {
  name: "",
  uncPath: "",
  driveLetter: "",
  locationId: "",
  responsible: "",
  description: "",
  warningPercent: "20",
  criticalPercent: "10",
  minFreeGb: "",
  sortOrder: "0",
  isActive: true,
};

export function NetworkShareDialog({
  open,
  onOpenChange,
  share,
  locations,
  onSaved,
}: NetworkShareDialogProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (share) {
      setDraft({
        name: share.name,
        uncPath: share.unc_path,
        driveLetter: share.drive_letter ?? "",
        locationId: share.location_id ?? "",
        responsible: share.responsible ?? "",
        description: share.description ?? "",
        warningPercent: String(share.warning_percent),
        criticalPercent: String(share.critical_percent),
        minFreeGb: share.min_free_gb != null ? String(share.min_free_gb) : "",
        sortOrder: String(share.sort_order),
        isActive: share.is_active,
      });
    } else {
      setDraft(EMPTY);
    }
  }, [open, share]);

  const update = (field: keyof Draft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (!draft.name.trim() || !draft.uncPath.trim()) {
      toast.error("Le nom et le chemin du partage sont obligatoires.");
      return;
    }
    const warning = Number(draft.warningPercent);
    const critical = Number(draft.criticalPercent);
    if (!Number.isFinite(warning) || warning <= 0 || warning >= 100) {
      toast.error("Le seuil d'alerte doit être compris entre 1 et 99 %.");
      return;
    }
    if (!Number.isFinite(critical) || critical < 0 || critical >= warning) {
      toast.error("Le seuil critique doit être inférieur au seuil d'alerte.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        unc_path: draft.uncPath.trim(),
        drive_letter: draft.driveLetter.trim() || null,
        location_id: draft.locationId || null,
        responsible: draft.responsible.trim() || null,
        description: draft.description.trim() || null,
        warning_percent: warning,
        critical_percent: critical,
        min_free_gb: draft.minFreeGb.trim() ? Number(draft.minFreeGb) : null,
        sort_order: Math.max(0, Number(draft.sortOrder) || 0),
        is_active: draft.isActive,
      };
      if (share) {
        await apiFetch(`/network-shares/${share.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Partage mis à jour.");
      } else {
        await apiFetch("/network-shares", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Partage ajouté.");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{share ? "Modifier le partage" : "Ajouter un partage réseau"}</DialogTitle>
          <DialogDescription>
            Le contrôle de volumétrie interroge l'espace disponible du chemin configuré. Utilisez
            un chemin UNC accessible par le compte qui exécute l'application.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="share-name">Nom du partage *</Label>
              <Input
                id="share-name"
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Données communes"
              />
            </div>
            <div>
              <Label htmlFor="share-path">Chemin UNC ou lecteur *</Label>
              <Input
                id="share-path"
                value={draft.uncPath}
                onChange={(event) => update("uncPath", event.target.value)}
                placeholder={"\\\\serveur\\partage ou Z:\\"}
                className="font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="share-drive">Lettre de lecteur</Label>
              <Input
                id="share-drive"
                value={draft.driveLetter}
                onChange={(event) => update("driveLetter", event.target.value)}
                placeholder="Z:"
                maxLength={8}
              />
            </div>
            <div>
              <Label htmlFor="share-site">Site</Label>
              <Select
                id="share-site"
                value={draft.locationId}
                onChange={(event) => update("locationId", event.target.value)}
              >
                <option value="">Non précisé</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="share-order">Ordre</Label>
              <Input
                id="share-order"
                inputMode="numeric"
                value={draft.sortOrder}
                onChange={(event) => update("sortOrder", event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="share-responsible">Responsable</Label>
            <Input
              id="share-responsible"
              value={draft.responsible}
              onChange={(event) => update("responsible", event.target.value)}
              placeholder="Équipe informatique, service, prestataire..."
            />
          </div>

          <div>
            <Label htmlFor="share-description">Description</Label>
            <Textarea
              id="share-description"
              value={draft.description}
              onChange={(event) => update("description", event.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="share-warning">Seuil d'alerte (%)</Label>
              <Input
                id="share-warning"
                inputMode="numeric"
                value={draft.warningPercent}
                onChange={(event) => update("warningPercent", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="share-critical">Seuil critique (%)</Label>
              <Input
                id="share-critical"
                inputMode="numeric"
                value={draft.criticalPercent}
                onChange={(event) => update("criticalPercent", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="share-min-free">Libre minimum (Go)</Label>
              <Input
                id="share-min-free"
                inputMode="decimal"
                value={draft.minFreeGb}
                onChange={(event) => update("minFreeGb", event.target.value)}
                placeholder="Optionnel"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2">
            <Switch checked={draft.isActive} onCheckedChange={(value) => update("isActive", value)} />
            <span className="text-[11px] text-muted">Partage actif et visible dans la supervision des volumes</span>
          </div>

          <div className="flex justify-end gap-2 border-t border-border-soft pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />
              {share ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
