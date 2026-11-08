import { Plus, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { cn } from "@/lib/utils";
import type { LocationItem, SupervisionMapItem } from "@/types/api";

const kindLabels: Record<string, string> = {
  site: "Plan de site",
  building: "Plan de bâtiment",
  floor: "Plan d'étage",
  rack: "Baie / rack",
  other: "Autre plan",
};

interface SupervisionMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maps: SupervisionMapItem[];
  locations: LocationItem[];
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
  onSaved: () => void;
}

export function SupervisionMapDialog({
  open,
  onOpenChange,
  maps,
  locations,
  selectedMapId,
  onSelectMap,
  onSaved,
}: SupervisionMapDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("site");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<SupervisionMapItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editing = maps.find((item) => item.id === editingId) ?? null;

  useEffect(() => {
    if (!open) return;
    const target = maps.find((item) => item.id === selectedMapId) ?? maps[0] ?? null;
    setEditingId(target?.id ?? null);
    setFile(null);
  }, [open, selectedMapId, maps]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setDescription(editing.description ?? "");
      setLocationId(editing.location_id ?? "");
      setSortOrder(String(editing.sort_order));
      setIsActive(editing.is_active);
    } else {
      setName("");
      setKind("site");
      setDescription("");
      setLocationId("");
      setSortOrder("0");
      setIsActive(true);
    }
  }, [editing]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Le nom du plan est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        kind,
        description: description.trim() || null,
        location_id: locationId || null,
        sort_order: Math.max(0, Number(sortOrder) || 0),
        is_active: isActive,
      };
      const saved = editing
        ? await apiFetch<SupervisionMapItem>(`/infrastructure/maps/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<SupervisionMapItem>("/infrastructure/maps", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      toast.success(editing ? "Plan mis à jour." : "Plan créé.");
      setEditingId(saved.id);
      onSelectMap(saved.id);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    if (!editing || !file) {
      toast.error("Sélectionnez d'abord une image.");
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      await apiFetch<SupervisionMapItem>(`/infrastructure/maps/${editing.id}/background`, {
        method: "POST",
        body: data,
      });
      toast.success("Image du plan enregistrée.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Téléversement impossible.");
    } finally {
      setUploading(false);
    }
  };

  const removeBackground = async () => {
    if (!editing) return;
    try {
      await apiFetch(`/infrastructure/maps/${editing.id}/background`, {
        method: "DELETE",
      });
      toast.success("Image du plan supprimée.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Suppression impossible.");
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiFetch(`/infrastructure/maps/${archiveTarget.id}`, { method: "DELETE" });
      toast.success("Plan archivé.");
      setArchiveTarget(null);
      const remaining = maps.filter((item) => item.id !== archiveTarget.id);
      setEditingId(remaining[0]?.id ?? null);
      if (remaining[0]) onSelectMap(remaining[0].id);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Plans et cartes de supervision</DialogTitle>
            <DialogDescription>
              Créez un plan de site, de bâtiment, d'étage ou de baie, puis chargez une image de fond.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1 rounded-lg border border-border-soft p-2">
              {maps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setEditingId(item.id)}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                    editingId === item.id
                      ? "border-primary/30 bg-primary/10"
                      : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="block truncate text-xs font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-2">
                    {kindLabels[item.kind] ?? item.kind}
                    {item.has_background ? " · image" : ""}
                  </span>
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setEditingId(null)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle carte
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="map-name">Nom du plan</Label>
                  <Input id="map-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Siège — RDC" />
                </div>
                <div>
                  <Label htmlFor="map-kind">Type</Label>
                  <Select id="map-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                    {Object.entries(kindLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="map-location">Site</Label>
                  <Select id="map-location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                    <option value="">Non précisé</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="map-order">Ordre</Label>
                  <Input id="map-order" inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="map-description">Description</Label>
                <Textarea id="map-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-[11px] text-muted">Plan actif et visible dans la supervision</span>
              </div>

              {editing ? (
                <div className="space-y-2 rounded-lg border border-border-soft bg-background/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-foreground">Image de fond</p>
                    <Badge tone={editing.has_background ? "success" : "neutral"}>
                      {editing.has_background
                        ? `${editing.background_width ?? "?"} × ${editing.background_height ?? "?"}`
                        : "Aucune image"}
                    </Badge>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    className="block w-full text-[11px] text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-2.5 file:py-1.5 file:text-[11px] file:text-primary-strong"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" size="sm" loading={uploading} disabled={!file} onClick={() => void upload()}>
                      <Upload className="h-3.5 w-3.5" />
                      Téléverser l'image
                    </Button>
                    {editing.has_background ? (
                      <Button variant="ghost" size="sm" onClick={() => void removeBackground()}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Retirer l'image
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-muted-2">
                    Formats acceptés : PNG, JPEG ou WEBP, 12 Mo maximum. L'image est utilisée comme fond de la carte.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex gap-1.5">
                  <Button loading={saving} onClick={() => void save()}>
                    <Save className="h-3.5 w-3.5" />
                    {editing ? "Enregistrer" : "Créer la carte"}
                  </Button>
                  {editing && editing.is_active ? (
                    <Button
                      variant="ghost"
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                      onClick={() => setArchiveTarget(editing)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Archiver
                    </Button>
                  ) : null}
                </div>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver ce plan ?"
        description={`« ${archiveTarget?.name ?? ""} » ne sera plus visible dans la supervision. Les équipements et leurs positions sont conservés.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </>
  );
}
