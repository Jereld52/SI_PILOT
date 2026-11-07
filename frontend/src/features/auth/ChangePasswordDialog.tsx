import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
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
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";

const schema = z
  .object({
    current_password: z.string().min(1, "Le mot de passe actuel est requis."),
    new_password: z.string().min(12, "Au moins 12 caractères."),
    confirm: z.string().min(1, "Confirmez le nouveau mot de passe."),
  })
  .refine((values) => values.new_password === values.confirm, {
    path: ["confirm"],
    message: "Les mots de passe ne correspondent pas.",
  });

type Values = z.infer<typeof schema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { refresh } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });

  const onSubmit = async (values: Values) => {
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });
      toast.success("Mot de passe modifié. Les autres sessions ont été révoquées.");
      await refresh();
      reset();
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields.length > 0) {
        caught.fields.forEach((field) => {
          if (field.field === "new_password" || field.field === "current_password") {
            setError(field.field, { message: field.message });
          }
        });
        if (caught.fields.every((field) => field.field === "password")) {
          setError("new_password", { message: caught.fields[0]?.message ?? caught.message });
        }
      } else {
        setError("root", {
          message: caught instanceof Error ? caught.message : "Modification impossible.",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-primary-strong/20 bg-primary/15 text-primary-strong">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </div>
          <DialogTitle>Changer le mot de passe</DialogTitle>
          <DialogDescription>
            Le mot de passe doit contenir au moins 12 caractères, une majuscule, une minuscule et
            un chiffre. Les autres sessions seront révoquées.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {errors.root ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {errors.root.message}
            </p>
          ) : null}

          <div>
            <Label htmlFor="current_password">Mot de passe actuel</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              invalid={Boolean(errors.current_password)}
              {...register("current_password")}
            />
            {errors.current_password ? (
              <p className="mt-1 text-[11px] text-danger">{errors.current_password.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="new_password">Nouveau mot de passe</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.new_password)}
              {...register("new_password")}
            />
            {errors.new_password ? (
              <p className="mt-1 text-[11px] text-danger">{errors.new_password.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.confirm)}
              {...register("confirm")}
            />
            {errors.confirm ? (
              <p className="mt-1 text-[11px] text-danger">{errors.confirm.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Modifier le mot de passe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
