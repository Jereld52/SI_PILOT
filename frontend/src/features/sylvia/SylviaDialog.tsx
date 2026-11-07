import { ArrowRight, Cpu, LockKeyhole, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthProvider";

interface SylviaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const capabilities = [
  "Préparer un bilan informatique mensuel",
  "Analyser les tickets non résolus",
  "Identifier les équipements à renouveler",
  "Résumer les contrats arrivant à échéance",
  "Préparer une synthèse budgétaire",
  "Rédiger un compte rendu d'intervention",
];

export function SylviaDialog({ open, onOpenChange }: SylviaDialogProps) {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-primary-strong/20 bg-primary/15 text-primary-strong">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="flex items-center gap-2">
            SylvIA
            <Badge tone="warning">Non configurée</Badge>
          </DialogTitle>
          <DialogDescription>
            L'assistant IA institutionnel du Parc national de forêts. L'intégration est prévue en
            Phase 5 et restera facultative : SI PNFor PILOTE fonctionne intégralement sans elle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
            <div className="flex items-start gap-2.5">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-foreground">Cible technique</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  Ollama et Open WebUI sur le DGX Spark, derrière un reverse proxy Nginx. L'URL,
                  le modèle et la clé seront configurables depuis l'administration.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
            <div className="flex items-start gap-2.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-foreground">Garde-fous</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  Minimisation des données, aperçu avant envoi, journalisation, aucune écriture
                  directe en base. Toute proposition devra être validée par un utilisateur habilité.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-2">
              Usages prévus
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <li key={capability} className="flex items-start gap-1.5 text-[11px] leading-5 text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary-strong" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {hasPermission("admin.settings.read") ? (
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                navigate("/admin/settings");
              }}
            >
              Voir les paramètres
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
