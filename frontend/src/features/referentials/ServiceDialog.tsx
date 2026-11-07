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
import { ApiError, apiFetch } from "@/lib/api";
import type { ServiceItem } from "@/types/api";

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceItem | null;
  onSaved: () => void;
}

export function ServiceDialog({ open, onOpenChange, service, onSaved }: ServiceDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(service?.code ?? "");
    setName(service?.name ?? "");
    setIsActive(service?.is_active ?? true);
    setError(null);
  }, [open, service]);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      setError("Le code et le nom sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (service) {
        await apiFetch(`/services/${service.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, is_active: isActive }),
        });
        toast.success("Service mis à jour.");
      } else {
        await apiFetch("/services", {
          method: "POST",
          body: JSON.stringify({ code, name, is_active: isActive }),
        });
        toast.success("Service créé.");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Modifier le service" : "Nouveau service"}</DialogTitle>
          <DialogDescription>
            Les services servent au rattachement des agents, équipements et tickets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}
          <div>
            <Label htmlFor="service-code">Code</Label>
            <Input
              id="service-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={Boolean(service)}
              placeholder="DSI"
            />
          </div>
          <div>
            <Label htmlFor="service-name">Nom</Label>
            <Input id="service-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Service actif</p>
              <p className="text-[10px] text-muted-2">Un service inactif n'est plus proposé par défaut.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Service actif" />
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
