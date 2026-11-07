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
import type { LicenseItem } from "@/types/api";

interface LicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license: LicenseItem | null;
  onSaved: () => void;
}

export function LicenseDialog({ open, onOpenChange, license, onSaved }: LicenseDialogProps) {
  const editing = Boolean(license);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [licenseType, setLicenseType] = useState("abonnement");
  const [seats, setSeats] = useState("");
  const [seatsUsed, setSeatsUsed] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [annualCost, setAnnualCost] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(license?.name ?? "");
    setVendor(license?.vendor ?? "");
    setLicenseType(license?.license_type ?? "abonnement");
    setSeats(license?.seats != null ? String(license.seats) : "");
    setSeatsUsed(license?.seats_used != null ? String(license.seats_used) : "");
    setStartDate(license?.start_date ?? "");
    setEndDate(license?.end_date ?? "");
    setAnnualCost(license?.annual_cost != null ? String(license.annual_cost) : "");
    setNotes(license?.notes ?? "");
    setIsActive(license?.is_active ?? true);
    setError(null);
  }, [open, license]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Le nom de la licence est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      name: name.trim(),
      vendor: vendor.trim() || null,
      license_type: licenseType.trim() || null,
      seats: seats ? Number(seats) : null,
      seats_used: seatsUsed ? Number(seatsUsed) : null,
      start_date: startDate || null,
      end_date: endDate || null,
      annual_cost: annualCost ? Number(annualCost.replace(",", ".")) : null,
      notes: notes.trim() || null,
      is_active: isActive,
    };
    try {
      if (license) {
        await apiFetch(`/licenses/${license.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Licence mise à jour.");
      } else {
        await apiFetch("/licenses", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Licence créée.");
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
          <DialogTitle>{editing ? "Modifier la licence" : "Nouvelle licence"}</DialogTitle>
          <DialogDescription>
            Suivi des sièges, des échéances et du coût annuel. Une échéance proche remonte dans le
            tableau de bord.
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
              <Label htmlFor="license-name">Nom</Label>
              <Input id="license-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="license-vendor">Éditeur</Label>
              <Input id="license-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="license-type">Type</Label>
              <Select
                id="license-type"
                value={licenseType}
                onChange={(event) => setLicenseType(event.target.value)}
              >
                <option value="abonnement">Abonnement</option>
                <option value="perpetuelle">Perpétuelle</option>
                <option value="maintenance">Maintenance</option>
                <option value="support">Support</option>
                <option value="saas">SaaS</option>
                <option value="autre">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="license-seats">Sièges</Label>
              <Input
                id="license-seats"
                inputMode="numeric"
                value={seats}
                onChange={(event) => setSeats(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="license-seats-used">Sièges utilisés</Label>
              <Input
                id="license-seats-used"
                inputMode="numeric"
                value={seatsUsed}
                onChange={(event) => setSeatsUsed(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="license-start">Début</Label>
              <Input
                id="license-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="license-end">Échéance</Label>
              <Input
                id="license-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="license-cost">Coût annuel (EUR)</Label>
              <Input
                id="license-cost"
                inputMode="decimal"
                value={annualCost}
                onChange={(event) => setAnnualCost(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="license-notes">Notes</Label>
            <Textarea id="license-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Licence active</p>
              <p className="text-[10px] text-muted-2">Désactivez-la pour la conserver en historique.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Licence active" />
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
