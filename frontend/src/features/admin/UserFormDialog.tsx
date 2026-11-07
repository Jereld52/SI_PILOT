import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
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
import { ApiError, apiFetch } from "@/lib/api";
import { generatePassword } from "@/lib/password";
import type { Role, User } from "@/types/api";

const schema = z.object({
  first_name: z.string().min(1, "Le prénom est requis."),
  last_name: z.string().min(1, "Le nom est requis."),
  email: z.string().email("Adresse e-mail invalide.").or(z.literal("")),
  password: z.string().optional(),
  role_id: z.string().min(1, "Le rôle est requis."),
  data_scope: z.enum(["all", "service", "own"]),
  is_active: z.boolean(),
});

type Values = z.infer<typeof schema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  roles: Role[];
  onSaved: () => void;
}

export function UserFormDialog({ open, onOpenChange, user, roles, onSaved }: UserFormDialogProps) {
  const editing = Boolean(user);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      role_id: "",
      data_scope: "own",
      is_active: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    const defaultRole = roles.find((role) => role.code === (user ? user.role.code : "user")) ?? roles[0];
    reset({
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      email: user?.email ?? "",
      password: "",
      role_id: user?.role_id ?? defaultRole?.id ?? "",
      data_scope: (user?.data_scope as Values["data_scope"]) ?? "own",
      is_active: user?.is_active ?? true,
    });
    setShowPassword(false);
  }, [open, user, roles, reset]);

  const isActive = watch("is_active");

  const onSubmit = async (values: Values) => {
    if (!editing && !values.email.trim()) {
      setError("email", { message: "L'adresse e-mail est requise." });
      return;
    }
    const password = values.password ?? "";
    if (!editing && password.trim().length < 12) {
      setError("password", { message: "Au moins 12 caractères." });
      return;
    }
    try {
      if (editing && user) {
        await apiFetch(`/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            first_name: values.first_name,
            last_name: values.last_name,
            role_id: values.role_id,
            data_scope: values.data_scope,
            is_active: values.is_active,
          }),
        });
        toast.success("Utilisateur mis à jour. Ses sessions ont été révoquées si nécessaire.");
      } else {
        await apiFetch("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: values.email,
            password,
            first_name: values.first_name,
            last_name: values.last_name,
            role_id: values.role_id,
            data_scope: values.data_scope,
            is_active: values.is_active,
          }),
        });
        toast.success("Utilisateur créé. Communiquez-lui son mot de passe initial de façon sûre.");
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

  const generate = () => {
    const password = generatePassword();
    setValue("password", password, { shouldValidate: true });
    setShowPassword(true);
  };

  const copyPassword = async () => {
    const password = watch("password");
    if (!password) return;
    await navigator.clipboard.writeText(password);
    toast.success("Mot de passe copié dans le presse-papiers.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Les changements de rôle, de portée ou de statut révoquent les sessions actives."
              : "Créez un compte local. Aucun mot de passe n'est stocké en clair."}
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
              <Label htmlFor="first_name">Prénom</Label>
              <Input id="first_name" invalid={Boolean(errors.first_name)} {...register("first_name")} />
              {errors.first_name ? (
                <p className="mt-1 text-[11px] text-danger">{errors.first_name.message}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="last_name">Nom</Label>
              <Input id="last_name" invalid={Boolean(errors.last_name)} {...register("last_name")} />
              {errors.last_name ? (
                <p className="mt-1 text-[11px] text-danger">{errors.last_name.message}</p>
              ) : null}
            </div>
          </div>

          {editing && user ? (
            <div>
              <Label>Adresse e-mail</Label>
              <Input value={user.email} readOnly className="opacity-70" />
              <p className="mt-1 text-[10px] text-muted-2">
                L'adresse ne peut pas être modifiée depuis cette version.
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="email">Adresse e-mail professionnelle</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email ? (
                <p className="mt-1 text-[11px] text-danger">{errors.email.message}</p>
              ) : null}
            </div>
          )}

          {!editing ? (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe initial</Label>
                <div className="mb-1.5 flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={generate}>
                    <RefreshCw className="h-3 w-3" />
                    Générer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => void copyPassword()}
                    disabled={!watch("password")}
                  >
                    <Copy className="h-3 w-3" />
                    Copier
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-2 hover:text-foreground"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {errors.password ? (
                <p className="mt-1 text-[11px] text-danger">{errors.password.message}</p>
              ) : (
                <p className="mt-1 text-[10px] text-muted-2">
                  12 caractères minimum, majuscule, minuscule et chiffre.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="role_id">Rôle</Label>
              <Select id="role_id" invalid={Boolean(errors.role_id)} {...register("role_id")}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
              {errors.role_id ? (
                <p className="mt-1 text-[11px] text-danger">{errors.role_id.message}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="data_scope">Portée de données</Label>
              <Select id="data_scope" {...register("data_scope")}>
                <option value="all">Tous les services</option>
                <option value="service">Son service</option>
                <option value="own">Données personnelles</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Compte actif</p>
              <p className="text-[10px] text-muted-2">Un compte inactif ne peut plus se connecter.</p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={(value) => setValue("is_active", value, { shouldDirty: true })}
              label="Compte actif"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Enregistrer" : "Créer l'utilisateur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
