import { ArrowLeft, Construction, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: string;
  icon: LucideIcon;
  features: string[];
}

export function ModulePlaceholder({ title, description, phase, icon: Icon, features }: ModulePlaceholderProps) {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module métier"
        title={title}
        description={description}
        actions={
          <Badge tone="warning">
            <Construction className="h-3 w-3" />
            {phase}
          </Badge>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid-noise border-b border-border-soft bg-gradient-to-br from-surface-2 to-surface p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-strong/20 bg-primary/15 text-primary-strong">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Module en préparation</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Ce module n'est pas encore activé. Aucune donnée fictive n'est affichée et aucun bouton
            inactif n'est présenté comme opérationnel. Il sera développé à la phase indiquée, avec
            ses API, ses permissions et ses tests.
          </p>
        </div>
        <CardContent className="space-y-3 p-6">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-2">
            Fonctionnalités prévues
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary-strong" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-primary-strong"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour à la vue générale
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
