import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
  AgentItem,
  EquipmentReservationItem,
  LocationItem,
  ReservationAvailability,
  ReservableEquipmentItem,
} from "@/types/api";

export const reservationCategoryLabels: Record<string, string> = {
  video: "Vidéoprojection",
  audio: "Sonorisation",
  screen: "Écrans",
  accessory: "Accessoires",
  other: "Autre",
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toLocalInput(value: string | Date): string {
  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function useSubmit(onSaved: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<unknown>, message: string, close: () => void) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      onSaved();
      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, setError, submit };
}

interface EquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: ReservableEquipmentItem | null;
  locations: LocationItem[];
  onSaved: () => void;
}

export function ReservableEquipmentDialog({
  open,
  onOpenChange,
  equipment,
  locations,
  onSaved,
}: EquipmentDialogProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("video");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setName(equipment?.name ?? "");
    setCategory(equipment?.category ?? "video");
    setDescription(equipment?.description ?? "");
    setLocationId(equipment?.location_id ?? "");
    setSortOrder(String(equipment?.sort_order ?? 0));
    setNotes(equipment?.notes ?? "");
    setIsActive(equipment?.is_active ?? true);
    setError(null);
  }, [open, equipment, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom du matériel est obligatoire.");
      return;
    }
    const payload = {
      name: name.trim(),
      category,
      description: nullable(description),
      location_id: locationId || null,
      sort_order: Math.max(0, Number(sortOrder) || 0),
      notes: nullable(notes),
      is_active: isActive,
    };
    void submit(
      () =>
        equipment
          ? apiFetch(`/reservations/equipments/${equipment.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/reservations/equipments", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      equipment ? "Matériel mis à jour." : "Matériel ajouté.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {equipment ? "Modifier le matériel" : "Nouveau matériel réservable"}
          </DialogTitle>
          <DialogDescription>
            Les agents pourront réserver ce matériel par créneaux horaires.
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
              <Label htmlFor="reservation-equipment-name">Nom</Label>
              <Input
                id="reservation-equipment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Vidéoprojecteur 3"
              />
            </div>
            <div>
              <Label htmlFor="reservation-equipment-category">Catégorie</Label>
              <Select
                id="reservation-equipment-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {Object.entries(reservationCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="reservation-equipment-description">Description</Label>
            <Textarea
              id="reservation-equipment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reservation-equipment-location">Site de stockage</Label>
              <Select
                id="reservation-equipment-location"
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
            <div>
              <Label htmlFor="reservation-equipment-order">Ordre d'affichage</Label>
              <Input
                id="reservation-equipment-order"
                inputMode="numeric"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2">
            <input
              id="reservation-equipment-active"
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary-strong)]"
            />
            <Label htmlFor="reservation-equipment-active" className="mb-0">
              Matériel actif et réservable
            </Label>
          </div>
          <div>
            <Label htmlFor="reservation-equipment-notes">Notes</Label>
            <Textarea
              id="reservation-equipment-notes"
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
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: EquipmentReservationItem | null;
  defaultEquipmentId?: string | null;
  defaultDate?: Date | null;
  equipments: ReservableEquipmentItem[];
  agents: AgentItem[];
  onSaved: () => void;
}

export function EquipmentReservationDialog({
  open,
  onOpenChange,
  reservation,
  defaultEquipmentId,
  defaultDate,
  equipments,
  agents,
  onSaved,
}: ReservationDialogProps) {
  const [equipmentId, setEquipmentId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [requesterAgentId, setRequesterAgentId] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  const startIso = toIso(start);
  const endIso = toIso(end);
  const availabilityQuery = useQuery({
    queryKey: [
      "reservations",
      "availability",
      equipmentId,
      startIso,
      endIso,
      reservation?.id ?? "",
      status,
    ],
    queryFn: () =>
      apiFetch<ReservationAvailability>(
        `/reservations/availability?equipment_id=${equipmentId}&start=${encodeURIComponent(
          startIso ?? "",
        )}&end=${encodeURIComponent(endIso ?? "")}${
          reservation ? `&exclude_id=${reservation.id}` : ""
        }`,
      ),
    enabled:
      open &&
      Boolean(equipmentId) &&
      Boolean(startIso) &&
      Boolean(endIso) &&
      new Date(startIso ?? 0) < new Date(endIso ?? 0) &&
      !(reservation && status === "cancelled"),
    retry: false,
  });
  const hasConflict = availabilityQuery.data?.available === false;

  useEffect(() => {
    if (!open) return;
    if (reservation) {
      setEquipmentId(reservation.equipment_id);
      setStart(toLocalInput(new Date(reservation.start_at)));
      setEnd(toLocalInput(new Date(reservation.end_at)));
      setRequesterAgentId(reservation.requester_agent_id ?? "");
      setRequesterName(reservation.requester_name ?? "");
      setRequesterEmail(reservation.requester_email ?? "");
      setPurpose(reservation.purpose);
      setStatus(reservation.status);
      setNotes(reservation.notes ?? "");
    } else {
      const date = defaultDate ?? new Date();
      const startDate = new Date(date);
      startDate.setHours(9, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(12, 0, 0, 0);
      setEquipmentId(defaultEquipmentId ?? equipments[0]?.id ?? "");
      setStart(toLocalInput(startDate));
      setEnd(toLocalInput(endDate));
      setRequesterAgentId("");
      setRequesterName("");
      setRequesterEmail("");
      setPurpose("");
      setStatus("confirmed");
      setNotes("");
    }
    setError(null);
  }, [open, reservation, defaultEquipmentId, defaultDate, equipments, setError]);

  const selectAgent = (id: string) => {
    setRequesterAgentId(id);
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    setRequesterName(`${agent.first_name} ${agent.last_name}`.trim());
    setRequesterEmail(agent.email_pro);
  };

  const doSubmit = () => {
    if (!equipmentId) {
      setError("Sélectionnez le matériel à réserver.");
      return;
    }
    if (hasConflict) {
      setError("Ce matériel est déjà réservé sur ce créneau.");
      return;
    }
    if (!purpose.trim()) {
      setError("Le motif de la réservation est obligatoire.");
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Les dates de début et de fin sont obligatoires.");
      return;
    }
    if (endDate <= startDate) {
      setError("La fin doit être postérieure au début.");
      return;
    }
    const payload = {
      equipment_id: equipmentId,
      requester_agent_id: requesterAgentId || null,
      requester_name: nullable(requesterName),
      requester_email: nullable(requesterEmail),
      purpose: purpose.trim(),
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      notes: nullable(notes),
      ...(reservation ? { status } : {}),
    };
    void submit(
      () =>
        reservation
          ? apiFetch(`/reservations/${reservation.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/reservations", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      reservation ? "Réservation mise à jour." : "Matériel réservé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {reservation ? "Modifier la réservation" : "Réserver du matériel"}
          </DialogTitle>
          <DialogDescription>
            Les créneaux qui se chevauchent pour un même matériel sont refusés.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="reservation-equipment">Matériel</Label>
            <Select
              id="reservation-equipment"
              value={equipmentId}
              onChange={(event) => setEquipmentId(event.target.value)}
            >
              {equipments.map((equipment) => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                  {equipment.location ? ` — ${equipment.location.name}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reservation-start">Début</Label>
              <Input
                id="reservation-start"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reservation-end">Fin</Label>
              <Input
                id="reservation-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          {availabilityQuery.isFetching ? (
            <p className="rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[11px] text-muted">
              Vérification de la disponibilité…
            </p>
          ) : hasConflict && availabilityQuery.data?.conflict ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              <p className="font-semibold">Ce matériel est déjà réservé sur ce créneau.</p>
              <p className="mt-1 text-danger/90">
                {availabilityQuery.data.conflict.requester_name ?? "Demandeur non précisé"} ·{" "}
                {availabilityQuery.data.conflict.purpose}
              </p>
              <p className="text-danger/80">
                {format(new Date(availabilityQuery.data.conflict.start_at), "dd/MM/yyyy HH:mm")} →{" "}
                {format(new Date(availabilityQuery.data.conflict.end_at), "dd/MM/yyyy HH:mm")}
              </p>
            </div>
          ) : availabilityQuery.data?.available ? (
            <p className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[11px] text-success">
              Créneau disponible pour ce matériel.
            </p>
          ) : null}
          <div>
            <Label htmlFor="reservation-agent">Agent demandeur</Label>
            <Select
              id="reservation-agent"
              value={requesterAgentId}
              onChange={(event) => selectAgent(event.target.value)}
            >
              <option value="">Saisie libre</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.first_name} {agent.last_name} — {agent.email_pro}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reservation-name">Nom du demandeur</Label>
              <Input
                id="reservation-name"
                value={requesterName}
                onChange={(event) => setRequesterName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reservation-email">E-mail</Label>
              <Input
                id="reservation-email"
                type="email"
                value={requesterEmail}
                onChange={(event) => setRequesterEmail(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="reservation-purpose">Motif</Label>
            <Input
              id="reservation-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Réunion, formation, projection…"
            />
          </div>
          {reservation ? (
            <div>
              <Label htmlFor="reservation-status">Statut</Label>
              <Select
                id="reservation-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="confirmed">Confirmée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="reservation-notes">Notes</Label>
            <Textarea
              id="reservation-notes"
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
          <Button loading={loading} disabled={hasConflict} onClick={doSubmit}>
            {reservation ? "Enregistrer" : "Réserver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
