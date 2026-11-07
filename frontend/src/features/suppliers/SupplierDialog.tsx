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
import type { SupplierItem } from "@/types/api";

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierItem | null;
  onSaved: () => void;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: SupplierDialogProps) {
  const editing = Boolean(supplier);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [siret, setSiret] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setType(supplier?.type ?? "");
    setSiret(supplier?.siret ?? "");
    setContactName(supplier?.contact_name ?? "");
    setEmail(supplier?.email ?? "");
    setPhone(supplier?.phone ?? "");
    setAddress(supplier?.address ?? "");
    setWebsite(supplier?.website ?? "");
    setNotes(supplier?.notes ?? "");
    setIsActive(supplier?.is_active ?? true);
    setError(null);
  }, [open, supplier]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Le nom du fournisseur est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      name: name.trim(),
      type: nullable(type),
      siret: nullable(siret),
      contact_name: nullable(contactName),
      email: nullable(email),
      phone: nullable(phone),
      address: nullable(address),
      website: nullable(website),
      notes: nullable(notes),
      is_active: isActive,
    };
    try {
      if (supplier) {
        await apiFetch(`/suppliers/${supplier.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Fournisseur mis à jour.");
      } else {
        await apiFetch("/suppliers", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Fournisseur créé.");
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
          <DialogTitle>{editing ? "Modifier le fournisseur" : "Nouveau fournisseur"}</DialogTitle>
          <DialogDescription>
            Coordonnées et informations administratives. Les équipements et licences rattachés sont
            comptabilisés automatiquement.
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
              <Label htmlFor="supplier-name">Nom</Label>
              <Input id="supplier-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="supplier-type">Type</Label>
              <Input
                id="supplier-type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                placeholder="Matériel, infogérance, téléphonie…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier-siret">SIRET</Label>
              <Input id="supplier-siret" value={siret} onChange={(event) => setSiret(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="supplier-contact">Contact principal</Label>
              <Input
                id="supplier-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier-email">E-mail</Label>
              <Input
                id="supplier-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="supplier-phone">Téléphone</Label>
              <Input id="supplier-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier-address">Adresse</Label>
              <Input
                id="supplier-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="supplier-website">Site web</Label>
              <Input
                id="supplier-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea id="supplier-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Fournisseur actif</p>
              <p className="text-[10px] text-muted-2">Un fournisseur inactif reste historique.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Fournisseur actif" />
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
