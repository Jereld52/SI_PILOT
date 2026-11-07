import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Hash, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  AgentItem,
  AssetCategoryItem,
  AssetItem,
  AssetTagPreview,
  LocationItem,
  ServiceItem,
} from "@/types/api";

const schema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  category_id: z.string().min(1, "La catégorie est requise."),
  asset_tag: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  mac_address: z.string().optional(),
  ip_address: z.string().optional(),
  hostname: z.string().optional(),
  os_name: z.string().optional(),
  os_version: z.string().optional(),
  purchase_date: z.string().optional(),
  commissioning_date: z.string().optional(),
  warranty_end: z.string().optional(),
  purchase_price: z.string().optional(),
  status: z.enum(["in_service", "in_stock", "maintenance", "broken", "to_renew", "retired"]),
  condition: z.enum(["new", "good", "fair", "poor", "out_of_service"]),
  assigned_agent_id: z.string().optional(),
  service_id: z.string().optional(),
  location_id: z.string().optional(),
  comments: z.string().optional(),
  is_critical: z.boolean(),
});

type Values = z.infer<typeof schema>;

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetItem | null;
  categories: AssetCategoryItem[];
  agents: AgentItem[];
  services: ServiceItem[];
  locations: LocationItem[];
  onSaved: () => void;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  categories,
  agents,
  services,
  locations,
  onSaved,
}: AssetFormDialogProps) {
  const editing = Boolean(asset);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category_id: "",
      asset_tag: "",
      brand: "",
      model: "",
      serial_number: "",
      mac_address: "",
      ip_address: "",
      hostname: "",
      os_name: "",
      os_version: "",
      purchase_date: "",
      commissioning_date: "",
      warranty_end: "",
      purchase_price: "",
      status: "in_stock",
      condition: "good",
      assigned_agent_id: "",
      service_id: "",
      location_id: "",
      comments: "",
      is_critical: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: asset?.name ?? "",
      category_id: asset?.category_id ?? categories[0]?.id ?? "",
      asset_tag: asset?.asset_tag ?? "",
      brand: asset?.brand ?? "",
      model: asset?.model ?? "",
      serial_number: asset?.serial_number ?? "",
      mac_address: asset?.mac_address ?? "",
      ip_address: asset?.ip_address ?? "",
      hostname: asset?.hostname ?? "",
      os_name: asset?.os_name ?? "",
      os_version: asset?.os_version ?? "",
      purchase_date: asset?.purchase_date ?? "",
      commissioning_date: asset?.commissioning_date ?? "",
      warranty_end: asset?.warranty_end ?? "",
      purchase_price: asset?.purchase_price != null ? String(asset.purchase_price) : "",
      status: (asset?.status as Values["status"]) ?? "in_stock",
      condition: (asset?.condition as Values["condition"]) ?? "good",
      assigned_agent_id: asset?.assigned_agent_id ?? "",
      service_id: asset?.service_id ?? "",
      location_id: asset?.location_id ?? "",
      comments: asset?.comments ?? "",
      is_critical: asset?.is_critical ?? false,
    });
  }, [open, asset, categories, reset]);

  const categoryId = watch("category_id");
  const assignedAgentId = watch("assigned_agent_id");
  const isCritical = watch("is_critical");
  const customTag = watch("asset_tag");
  const category = categories.find((item) => item.id === categoryId);

  const tagQuery = useQuery({
    queryKey: ["assets", "next-tag", categoryId],
    queryFn: () => apiFetch<AssetTagPreview>(`/assets/next-tag?category_id=${categoryId}`),
    enabled: open && !editing && Boolean(categoryId),
    staleTime: 5_000,
  });

  const onSubmit = async (values: Values) => {
    const price = values.purchase_price?.replace(",", ".").trim();
    const payload = {
      name: values.name,
      category_id: values.category_id,
      asset_tag: editing ? undefined : nullable(values.asset_tag),
      brand: nullable(values.brand),
      model: nullable(values.model),
      serial_number: nullable(values.serial_number),
      mac_address: nullable(values.mac_address),
      ip_address: nullable(values.ip_address),
      hostname: nullable(values.hostname),
      os_name: nullable(values.os_name),
      os_version: nullable(values.os_version),
      purchase_date: values.purchase_date || null,
      commissioning_date: values.commissioning_date || null,
      warranty_end: values.warranty_end || null,
      purchase_price: price ? Number(price) : null,
      status: values.status,
      condition: values.condition,
      assigned_agent_id: values.assigned_agent_id || null,
      service_id: values.service_id || null,
      location_id: values.location_id || null,
      comments: nullable(values.comments),
      is_critical: values.is_critical,
    };
    try {
      if (editing && asset) {
        await apiFetch(`/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Équipement mis à jour.");
      } else {
        await apiFetch("/assets", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Équipement créé. Son numéro d'inventaire a été enregistré.");
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

  const tagPreview = editing ? asset?.asset_tag : customTag?.trim() || tagQuery.data?.tag;
  const agent = agents.find((item) => item.id === assignedAgentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'équipement" : "Nouvel équipement"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Le numéro d'inventaire existant est conservé. Les changements d'affectation sont historisés."
              : "Le numéro d'inventaire est généré selon le modèle configuré pour la catégorie, sauf si vous en saisissez un."}
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
              <Label htmlFor="asset-name">Nom de l'équipement</Label>
              <Input id="asset-name" invalid={Boolean(errors.name)} {...register("name")} />
              {errors.name ? <p className="mt-1 text-[11px] text-danger">{errors.name.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="asset-category">Catégorie</Label>
              <Select id="asset-category" invalid={Boolean(errors.category_id)} {...register("category_id")}>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              {errors.category_id ? (
                <p className="mt-1 text-[11px] text-danger">{errors.category_id.message}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-primary-strong/15 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Hash className="mt-0.5 h-4 w-4 text-primary-strong" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                  Numéro d'inventaire
                </p>
                <p className="mt-0.5 font-mono text-sm text-foreground">
                  {tagPreview ?? "Sélectionnez une catégorie"}
                </p>
                {!editing ? (
                  <div className="mt-2">
                    <Input
                      placeholder="Laisser vide pour générer automatiquement"
                      className="font-mono text-xs"
                      {...register("asset_tag")}
                    />
                    <p className="mt-1 text-[10px] text-muted-2">
                      Modèle de la catégorie : {category?.tag_template ?? "—"}
                    </p>
                  </div>
                ) : null}
              </div>
              <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden="true" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-brand">Marque</Label>
              <Input id="asset-brand" {...register("brand")} />
            </div>
            <div>
              <Label htmlFor="asset-model">Modèle</Label>
              <Input id="asset-model" {...register("model")} />
            </div>
            <div>
              <Label htmlFor="asset-serial">Numéro de série</Label>
              <Input id="asset-serial" {...register("serial_number")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-mac">Adresse MAC</Label>
              <Input id="asset-mac" {...register("mac_address")} placeholder="00:11:22:33:44:55" />
            </div>
            <div>
              <Label htmlFor="asset-ip">Adresse IP</Label>
              <Input id="asset-ip" {...register("ip_address")} placeholder="192.168.1.10" />
            </div>
            <div>
              <Label htmlFor="asset-hostname">Nom machine</Label>
              <Input id="asset-hostname" {...register("hostname")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="asset-os">Système d'exploitation</Label>
              <Input id="asset-os" {...register("os_name")} />
            </div>
            <div>
              <Label htmlFor="asset-os-version">Version</Label>
              <Input id="asset-os-version" {...register("os_version")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-purchase-date">Date d'achat</Label>
              <Input id="asset-purchase-date" type="date" {...register("purchase_date")} />
            </div>
            <div>
              <Label htmlFor="asset-commissioning">Mise en service</Label>
              <Input id="asset-commissioning" type="date" {...register("commissioning_date")} />
            </div>
            <div>
              <Label htmlFor="asset-warranty">Fin de garantie</Label>
              <Input id="asset-warranty" type="date" {...register("warranty_end")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-price">Prix d'achat (EUR)</Label>
              <Input id="asset-price" inputMode="decimal" {...register("purchase_price")} />
            </div>
            <div>
              <Label htmlFor="asset-status">État</Label>
              <Select id="asset-status" {...register("status")}>
                <option value="in_service">En service</option>
                <option value="in_stock">En stock</option>
                <option value="maintenance">Maintenance</option>
                <option value="broken">En panne</option>
                <option value="to_renew">À renouveler</option>
                <option value="retired">Réformé</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-condition">Condition</Label>
              <Select id="asset-condition" {...register("condition")}>
                <option value="new">Neuf</option>
                <option value="good">Bon</option>
                <option value="fair">Moyen</option>
                <option value="poor">Mauvais</option>
                <option value="out_of_service">Hors service</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-agent">Agent affecté</Label>
              <Select
                id="asset-agent"
                {...register("assigned_agent_id", {
                  onChange: (event) => {
                    const selected = agents.find((item) => item.id === event.target.value);
                    if (selected) {
                      if (selected.service_id) setValue("service_id", selected.service_id);
                      if (selected.location_id) setValue("location_id", selected.location_id);
                    }
                  },
                })}
              >
                <option value="">Non affecté</option>
                {agents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name} — {item.email_pro}
                  </option>
                ))}
              </Select>
              {agent ? (
                <p className="mt-1 text-[10px] text-muted-2">
                  Service et site préremplis depuis la fiche agent, modifiables.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="asset-service">Service</Label>
              <Select id="asset-service" {...register("service_id")}>
                <option value="">Non renseigné</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.code} — {service.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-location">Site</Label>
              <Select id="asset-location" {...register("location_id")}>
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

          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Équipement critique</p>
              <p className="text-[10px] text-muted-2">Priorité renforcée en cas d'incident.</p>
            </div>
            <Switch
              checked={isCritical}
              onCheckedChange={(value) => setValue("is_critical", value, { shouldDirty: true })}
              label="Équipement critique"
            />
          </div>

          <div>
            <Label htmlFor="asset-comments">Commentaires</Label>
            <Textarea id="asset-comments" {...register("comments")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Enregistrer" : "Créer l'équipement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
