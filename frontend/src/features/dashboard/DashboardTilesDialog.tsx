import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api";
import type { CockpitModule } from "@/types/api";

interface DashboardTilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: CockpitModule[];
  selected: string[];
  onSaved: (tiles: string[]) => void;
}

export function DashboardTilesDialog({
  open,
  onOpenChange,
  modules,
  selected,
  onSaved,
}: DashboardTilesDialogProps) {
  const [draft, setDraft] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(selected.length > 0 ? selected : modules.map((module) => module.key));
  }, [open, selected, modules]);

  const saveMutation = useMutation({
    mutationFn: (tiles: string[]) =>
      apiFetch<{ tiles: string[] }>("/dashboard/tiles", {
        method: "PUT",
        body: JSON.stringify({ tiles }),
      }),
    onSuccess: (data) => {
      toast.success("Tableau de bord personnalisé.");
      onSaved(data.tiles);
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  const toggle = (key: string) => {
    setDraft((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const move = (key: string, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.indexOf(key);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    if (draft.length === 0) {
      toast.error("Sélectionnez au moins une tuile.");
      return;
    }
    saveMutation.mutate(draft);
  };

  const orderedModules = draft
    .map((key) => modules.find((module) => module.key === key))
    .filter((module): module is CockpitModule => Boolean(module));
  const remaining = modules.filter((module) => !draft.includes(module.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            Personnaliser le tableau de bord
          </DialogTitle>
          <DialogDescription>
            Choisissez les tuiles affichées et leur ordre. Cette préférence est propre à votre compte.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {orderedModules.map((module) => (
            <div
              key={module.key}
              className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2"
            >
              <Checkbox
                checked
                onChange={() => toggle(module.key)}
                aria-label={`Afficher ${module.label}`}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{module.label}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Monter ${module.label}`}
                onClick={() => move(module.key, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Descendre ${module.label}`}
                onClick={() => move(module.key, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {remaining.length > 0 ? (
            <div className="pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                Tuiles masquées
              </p>
              {remaining.map((module) => (
                <label
                  key={module.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-surface-2"
                >
                  <Checkbox
                    checked={false}
                    onChange={() => toggle(module.key)}
                    aria-label={`Afficher ${module.label}`}
                  />
                  <span className="truncate">{module.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={saveMutation.isPending} onClick={save}>
            <Save className="h-3.5 w-3.5" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
