import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import type { AgentItem, LocationItem, ServiceItem } from "@/types/api";

const schema = z.object({
  first_name: z.string().min(1, "Le prénom est requis."),
  last_name: z.string().min(1, "Le nom est requis."),
  email_pro: z.string().email("Adresse e-mail invalide."),
  phone_pro: z.string().optional(),
  service_id: z.string().optional(),
  function_label: z.string().optional(),
  location_id: z.string().optional(),
  login: z.string().optional(),
  arrival_date: z.string().optional(),
  departure_date: z.string().optional(),
  status: z.enum(["active", "arriving", "departed", "suspended"]),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

interface AgentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentItem | null;
  services: ServiceItem[];
  locations: LocationItem[];
  onSaved: () => void;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function AgentFormDialog({
  open,
  onOpenChange,
  agent,
  services,
  locations,
  onSaved,
}: AgentFormDialogProps) {
  const editing = Boolean(agent);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email_pro: "",
      phone_pro: "",
      service_id: "",
      function_label: "",
      location_id: "",
      login: "",
      arrival_date: "",
      departure_date: "",
      status: "active",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      first_name: agent?.first_name ?? "",
      last_name: agent?.last_name ?? "",
      email_pro: agent?.email_pro ?? "",
      phone_pro: agent?.phone_pro ?? "",
      service_id: agent?.service_id ?? "",
      function_label: agent?.function_label ?? "",
      location_id: agent?.location_id ?? "",
      login: agent?.login ?? "",
      arrival_date: agent?.arrival_date ?? "",
      departure_date: agent?.departure_date ?? "",
      status: (agent?.status as Values["status"]) ?? "active",
      notes: agent?.notes ?? "",
    });
  }, [open, agent, reset]);

  const onSubmit = async (values: Values) => {
    const payload = {
      first_name: values.first_name,
      last_name: values.last_name,
      email_pro: values.email_pro,
      phone_pro: nullable(values.phone_pro),
      service_id: values.service_id || null,
      function_label: nullable(values.function_label),
      location_id: values.location_id || null,
      login: nullable(values.login),
      arrival_date: values.arrival_date || null,
      departure_date: values.departure_date || null,
      status: values.status,
      notes: nullable(values.notes),
    };
    try {
      if (editing && agent) {
        await apiFetch(`/agents/${agent.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Agent mis à jour.");
      } else {
        await apiFetch("/agents", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Agent créé.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields.length > 0) {
        caught.fields.forEach((field) => {
          const key = field.field as keyof Values;
          if (key in values) setError(key, { message: field.message });
        });
      } else {
        setError("root", {
          message: caught instanceof Error ? caught.message : "Enregistrement impossible.",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'agent" : "Nouvel agent"}</DialogTitle>
          <DialogDescription>
            Fiche annuaire de l'agent. Elle ne crée pas de compte applicatif : la liaison avec un
            compte utilisateur sera ajoutée ultérieurement.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {errors.root ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {errors.root.message}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-first-name">Prénom</Label>
              <Input id="agent-first-name" invalid={Boolean(errors.first_name)} {...register("first_name")} />
              {errors.first_name ? <p className="mt-1 text-[11px] text-danger">{errors.first_name.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="agent-last-name">Nom</Label>
              <Input id="agent-last-name" invalid={Boolean(errors.last_name)} {...register("last_name")} />
              {errors.last_name ? <p className="mt-1 text-[11px] text-danger">{errors.last_name.message}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-email">E-mail professionnel</Label>
              <Input id="agent-email" type="email" invalid={Boolean(errors.email_pro)} {...register("email_pro")} />
              {errors.email_pro ? <p className="mt-1 text-[11px] text-danger">{errors.email_pro.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="agent-phone">Téléphone professionnel</Label>
              <Input id="agent-phone" {...register("phone_pro")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-service">Service</Label>
              <Select id="agent-service" {...register("service_id")}>
                <option value="">Non renseigné</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.code} — {service.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="agent-location">Site</Label>
              <Select id="agent-location" {...register("location_id")}>
                <option value="">Non renseigné</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code ? `${location.code} — ` : ""}
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-function">Fonction</Label>
              <Input id="agent-function" {...register("function_label")} />
            </div>
            <div>
              <Label htmlFor="agent-login">Identifiant annuaire</Label>
              <Input id="agent-login" {...register("login")} placeholder="prenom.nom" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="agent-arrival">Date d'arrivée</Label>
              <Input id="agent-arrival" type="date" {...register("arrival_date")} />
            </div>
            <div>
              <Label htmlFor="agent-departure">Date de départ</Label>
              <Input id="agent-departure" type="date" {...register("departure_date")} />
            </div>
            <div>
              <Label htmlFor="agent-status">Statut</Label>
              <Select id="agent-status" {...register("status")}>
                <option value="active">Actif</option>
                <option value="arriving">Arrivée prévue</option>
                <option value="departed">Parti</option>
                <option value="suspended">Suspendu</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="agent-notes">Notes</Label>
            <Textarea id="agent-notes" {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Enregistrer" : "Créer l'agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
