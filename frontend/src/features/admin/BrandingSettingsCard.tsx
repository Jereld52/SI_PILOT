import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Palette, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBranding } from "@/features/branding/BrandingProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { BrandingInfo } from "@/types/api";

interface BrandingSettingsCardProps {
  canManage: boolean;
}

interface BrandingDraft {
  app_name: string;
  organization_name: string;
  tagline: string;
  description: string;
  support_email: string;
  primary_color: string;
}

const EMPTY_DRAFT: BrandingDraft = {
  app_name: "",
  organization_name: "",
  tagline: "",
  description: "",
  support_email: "",
  primary_color: "#772B2F",
};

export function BrandingSettingsCard({ canManage }: BrandingSettingsCardProps) {
  const branding = useBranding();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BrandingDraft>(EMPTY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft({
      app_name: branding.app_name,
      organization_name: branding.organization_name,
      tagline: branding.tagline,
      description: branding.description,
      support_email: branding.support_email ?? "",
      primary_color: branding.primary_color,
    });
  }, [
    branding.app_name,
    branding.organization_name,
    branding.tagline,
    branding.description,
    branding.support_email,
    branding.primary_color,
  ]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["branding"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<BrandingInfo>("/admin/branding", {
        method: "PUT",
        body: JSON.stringify({
          app_name: draft.app_name.trim(),
          organization_name: draft.organization_name.trim(),
          tagline: draft.tagline.trim(),
          description: draft.description.trim(),
          support_email: draft.support_email.trim() || null,
          primary_color: draft.primary_color,
        }),
      }),
    onSuccess: () => {
      toast.success("Identité de l'application enregistrée.");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  const uploadMutation = useMutation({
    mutationFn: (selected: File) => {
      const data = new FormData();
      data.append("file", selected);
      return apiFetch<BrandingInfo>("/admin/branding/logo", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      toast.success("Logo enregistré.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Téléversement impossible."),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<BrandingInfo>("/admin/branding/logo", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Logo personnalisé supprimé.");
      setConfirmRemove(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Suppression impossible."),
  });

  const update = (field: keyof BrandingDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-accent" />
              Identité de l'application
            </CardTitle>
            <CardDescription>
              Personnalisez le nom, la structure, le logo et la couleur principale. Ces valeurs
              sont utilisées dans l'interface, les e-mails et les exports PDF.
            </CardDescription>
          </div>
          <Badge tone={branding.logo_custom ? "success" : "neutral"}>
            {branding.logo_custom ? "Logo personnalisé" : "Logo par défaut"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-border-soft bg-white p-3">
                <img
                  src={branding.logo_url}
                  alt={branding.organization_name || branding.app_name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={!canManage}
                className="block w-full text-[10px] text-muted file:mr-2 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1.5 file:text-[10px] file:text-primary-strong"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canManage || !file}
                  loading={uploadMutation.isPending}
                  onClick={() => file && uploadMutation.mutate(file)}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                  Téléverser
                </Button>
                {branding.logo_custom ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canManage}
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </Button>
                ) : null}
              </div>
              <p className="text-[10px] leading-4 text-muted-2">
                PNG, JPEG ou WEBP, 4 Mo maximum, 32 × 32 pixels minimum.
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="brand-app-name">Nom de l'application</Label>
                  <Input
                    id="brand-app-name"
                    value={draft.app_name}
                    onChange={(event) => update("app_name", event.target.value)}
                    disabled={!canManage}
                    placeholder="SI PILOT"
                  />
                </div>
                <div>
                  <Label htmlFor="brand-organization">Nom de la structure</Label>
                  <Input
                    id="brand-organization"
                    value={draft.organization_name}
                    onChange={(event) => update("organization_name", event.target.value)}
                    disabled={!canManage}
                    placeholder="Votre structure"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="brand-tagline">Accroche</Label>
                <Input
                  id="brand-tagline"
                  value={draft.tagline}
                  onChange={(event) => update("tagline", event.target.value)}
                  disabled={!canManage}
                  placeholder="Cockpit du système d'information"
                />
              </div>
              <div>
                <Label htmlFor="brand-description">Description</Label>
                <Textarea
                  id="brand-description"
                  value={draft.description}
                  onChange={(event) => update("description", event.target.value)}
                  disabled={!canManage}
                  rows={2}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="brand-support-email">Adresse de contact</Label>
                  <Input
                    id="brand-support-email"
                    type="email"
                    value={draft.support_email}
                    onChange={(event) => update("support_email", event.target.value)}
                    disabled={!canManage}
                    placeholder="support@exemple.fr"
                  />
                </div>
                <div>
                  <Label htmlFor="brand-color">Couleur principale</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Choisir la couleur principale"
                      value={draft.primary_color}
                      onChange={(event) => update("primary_color", event.target.value)}
                      disabled={!canManage}
                      className="h-9 w-12 cursor-pointer rounded-md border border-border-soft bg-background p-1"
                    />
                    <Input
                      id="brand-color"
                      value={draft.primary_color}
                      onChange={(event) => update("primary_color", event.target.value)}
                      disabled={!canManage}
                      className="font-mono text-[11px] uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {canManage ? (
            <div className="flex justify-end">
              <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="h-3.5 w-3.5" />
                Enregistrer l'identité
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Retirer le logo personnalisé ?"
        description="Le logo par défaut sera réutilisé dans l'interface et les exports."
        confirmLabel="Retirer"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
