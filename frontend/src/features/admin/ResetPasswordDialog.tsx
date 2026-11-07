import { Copy, RefreshCw } from "lucide-react";
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
import { ApiError, apiFetch } from "@/lib/api";
import { generatePassword } from "@/lib/password";
import type { User } from "@/types/api";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onDone: () => void;
}

export function ResetPasswordDialog({ open, onOpenChange, user, onDone }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword(generatePassword());
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!user) return;
    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: password }),
      });
      toast.success("Mot de passe réinitialisé. Toutes les sessions de l'utilisateur sont révoquées.");
      onDone();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Réinitialisation impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            {user ? `${user.first_name} ${user.last_name} — ${user.email}` : ""}
            <br />
            Le mot de passe ne sera plus affiché après fermeture. Communiquez-le par un canal sûr.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="reset-password">Nouveau mot de passe</Label>
            <Input
              id="reset-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPassword(generatePassword())}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Générer
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(password);
                toast.success("Mot de passe copié.");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copier
            </Button>
          </div>
          <p className="text-[10px] leading-4 text-muted-2">
            12 caractères minimum, une majuscule, une minuscule et un chiffre. L'utilisateur devra
            le changer à sa prochaine connexion.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={loading}>
            Réinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
