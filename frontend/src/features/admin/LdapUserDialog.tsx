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
import { Switch } from "@/components/ui/switch";
import { ApiError, apiFetch } from "@/lib/api";
import type { LdapDirectoryActionResponse, LdapDirectoryUser } from "@/types/api";

interface LdapUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: LdapDirectoryUser | null;
  onSaved: () => void;
}

interface Draft {
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  title: string;
  phone: string;
  password: string;
  enabled: boolean;
}

const EMPTY: Draft = {
  login: "",
  firstName: "",
  lastName: "",
  email: "",
  department: "",
  title: "",
  phone: "",
  password: "",
  enabled: true,
};

export function LdapUserDialog({ open, onOpenChange, user, onSaved }: LdapUserDialogProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      user
        ? {
            login: user.login,
            firstName: user.first_name ?? "",
            lastName: user.last_name ?? "",
            email: user.email ?? "",
            department: user.department ?? "",
            title: user.title ?? "",
            phone: user.phone ?? "",
            password: "",
            enabled: user.enabled,
          }
        : EMPTY,
    );
  }, [open, user]);

  const update = (field: keyof Draft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim()) {
      toast.error("Le prénom, le nom et l'adresse e-mail sont obligatoires.");
      return;
    }
    if (!user && !/^[a-zA-Z0-9._-]{1,20}$/.test(draft.login.trim())) {
      toast.error("L'identifiant doit contenir 1 à 20 caractères : lettres, chiffres, point, tiret ou underscore.");
      return;
    }
    setSaving(true);
    try {
      if (user) {
        await apiFetch<LdapDirectoryActionResponse>("/ldap/directory/users", {
          method: "PATCH",
          body: JSON.stringify({
            user_dn: user.distinguished_name,
            first_name: draft.firstName.trim(),
            last_name: draft.lastName.trim(),
            email: draft.email.trim(),
            department: draft.department.trim() || "",
            title: draft.title.trim() || "",
            phone: draft.phone.trim() || "",
            enabled: draft.enabled,
            password: draft.password.trim() || null,
          }),
        });
        toast.success("Utilisateur Active Directory mis à jour.");
      } else {
        await apiFetch<LdapDirectoryActionResponse>("/ldap/directory/users", {
          method: "POST",
          body: JSON.stringify({
            login: draft.login.trim(),
            first_name: draft.firstName.trim(),
            last_name: draft.lastName.trim(),
            email: draft.email.trim(),
            department: draft.department.trim() || null,
            title: draft.title.trim() || null,
            phone: draft.phone.trim() || null,
            password: draft.password.trim() || null,
          }),
        });
        toast.success(
          draft.password.trim()
            ? "Utilisateur Active Directory créé et activé."
            : "Utilisateur créé. Définissez un mot de passe dans AD pour l'activer.",
        );
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
          <DialogTitle>
            {user ? `Modifier ${user.display_name || user.login}` : "Créer un utilisateur Active Directory"}
          </DialogTitle>
          <DialogDescription>
            {user
              ? "Les modifications sont appliquées directement dans l'annuaire."
              : "L'utilisateur est créé dans l'OU configurée. Sans mot de passe, le compte reste désactivé."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-login">Identifiant (sAMAccountName) *</Label>
              <Input
                id="ad-login"
                value={draft.login}
                onChange={(event) => update("login", event.target.value)}
                disabled={Boolean(user)}
                placeholder="prenom.nom"
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="ad-email">Adresse e-mail *</Label>
              <Input
                id="ad-email"
                type="email"
                value={draft.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="prenom.nom@exemple.fr"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-first">Prénom *</Label>
              <Input
                id="ad-first"
                value={draft.firstName}
                onChange={(event) => update("firstName", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ad-last">Nom *</Label>
              <Input
                id="ad-last"
                value={draft.lastName}
                onChange={(event) => update("lastName", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-department">Service / département</Label>
              <Input
                id="ad-department"
                value={draft.department}
                onChange={(event) => update("department", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ad-title">Fonction</Label>
              <Input
                id="ad-title"
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-phone">Téléphone</Label>
              <Input
                id="ad-phone"
                value={draft.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ad-password">
                {user ? "Nouveau mot de passe (optionnel)" : "Mot de passe (optionnel)"}
              </Label>
              <Input
                id="ad-password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder={user ? "Laisser vide pour conserver" : "Nécessite LDAPS"}
              />
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2">
              <Switch checked={draft.enabled} onCheckedChange={(value) => update("enabled", value)} />
              <span className="text-[11px] text-muted">Compte activé dans Active Directory</span>
            </div>
          ) : null}

          <div className="rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 text-[10px] leading-4 text-warning">
            La définition ou la réinitialisation d'un mot de passe nécessite une connexion LDAPS.
            Sans mot de passe, le compte est créé désactivé.
          </div>

          <div className="flex justify-end gap-2 border-t border-border-soft pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />
              {user ? "Enregistrer" : "Créer l'utilisateur"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
