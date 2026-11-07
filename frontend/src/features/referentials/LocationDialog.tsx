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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type { LocationItem } from "@/types/api";

interface LocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationItem | null;
  onSaved: () => void;
}

export function LocationDialog({ open, onOpenChange, location, onSaved }: LocationDialogProps) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    address: "",
    postal_code: "",
    city: "",
    building: "",
    floor: "",
    room: "",
    notes: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      code: location?.code ?? "",
      name: location?.name ?? "",
      address: location?.address ?? "",
      postal_code: location?.postal_code ?? "",
      city: location?.city ?? "",
      building: location?.building ?? "",
      floor: location?.floor ?? "",
      room: location?.room ?? "",
      notes: location?.notes ?? "",
      is_active: location?.is_active ?? true,
    });
    setError(null);
  }, [open, location]);

  const update = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Le nom du site est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim() || null,
        name: form.name,
        address: form.address || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        building: form.building || null,
        floor: form.floor || null,
        room: form.room || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };
      if (location) {
        await apiFetch(`/locations/${location.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Site mis à jour.");
      } else {
        await apiFetch("/locations", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Site créé.");
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
          <DialogTitle>{location ? "Modifier le site" : "Nouveau site"}</DialogTitle>
          <DialogDescription>Localisation physique des agents et des équipements.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="location-code">Code</Label>
              <Input id="location-code" value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="SIEGE" />
            </div>
            <div>
              <Label htmlFor="location-name">Nom</Label>
              <Input id="location-name" value={form.name} onChange={(event) => update("name", event.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="location-address">Adresse</Label>
            <Input id="location-address" value={form.address} onChange={(event) => update("address", event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="location-postal">Code postal</Label>
              <Input id="location-postal" value={form.postal_code} onChange={(event) => update("postal_code", event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="location-city">Ville</Label>
              <Input id="location-city" value={form.city} onChange={(event) => update("city", event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="location-building">Bâtiment</Label>
              <Input id="location-building" value={form.building} onChange={(event) => update("building", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="location-floor">Étage</Label>
              <Input id="location-floor" value={form.floor} onChange={(event) => update("floor", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="location-room">Bureau</Label>
              <Input id="location-room" value={form.room} onChange={(event) => update("room", event.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="location-notes">Notes</Label>
            <Textarea id="location-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">Site actif</p>
            <Switch checked={form.is_active} onCheckedChange={(value) => update("is_active", value)} label="Site actif" />
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
