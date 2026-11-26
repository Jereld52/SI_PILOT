import { ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "react-router-dom";

import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { cn } from "@/lib/utils";

interface ContextConfig {
  label: string;
  hint: string;
  prompt: string;
  secondary: string;
}

const contexts: { prefix: string; config: ContextConfig }[] = [
  {
    prefix: "/demandes",
    config: {
      label: "Support",
      hint: "Résumer une demande, proposer une qualification, détecter les doublons et rédiger une réponse.",
      prompt: "Quels tickets sont prioritaires et lesquels sont en retard ?",
      secondary: "Rédige une réponse pour la demande sélectionnée.",
    },
  },
  {
    prefix: "/parc",
    config: {
      label: "Parc",
      hint: "Analyser un équipement, repérer les pannes, les garanties et les renouvellements.",
      prompt: "Quels équipements sont en panne ou à renouveler ?",
      secondary: "Prépare un plan de renouvellement du parc.",
    },
  },
  {
    prefix: "/logiciels",
    config: {
      label: "Logiciels",
      hint: "Identifier les mises à jour WAPT en attente et les postes concernés.",
      prompt: "Quelles mises à jour WAPT sont en attente ?",
      secondary: "Quels logiciels sont installés sur le poste sélectionné ?",
    },
  },
  {
    prefix: "/infrastructure",
    config: {
      label: "Infrastructure",
      hint: "Diagnostiquer les contrôles en échec, les équipements hors ligne et les dépendances.",
      prompt: "Fais-moi un point sur l'infrastructure et les contrôles en échec.",
      secondary: "Quelles dépendances sont à risque ?",
    },
  },
  {
    prefix: "/supervision",
    config: {
      label: "Supervision",
      hint: "Analyser la carte, les contrôles et les incidents de supervision.",
      prompt: "Quels contrôles de supervision sont en échec ?",
      secondary: "Propose un plan de remise en état.",
    },
  },
  {
    prefix: "/devis",
    config: {
      label: "Devis",
      hint: "Analyser les devis, les montants, les relances et la conversion en bon de commande.",
      prompt: "Analyse les devis en attente et propose les relances.",
      secondary: "Quels devis sont à convertir ?",
    },
  },
  {
    prefix: "/bons-commande",
    config: {
      label: "Bons de commande",
      hint: "Contrôler les engagements, les montants et les livraisons en retard.",
      prompt: "Quels bons de commande sont en retard ou sans engagement ?",
      secondary: "Quelles livraisons relancer ?",
    },
  },
  {
    prefix: "/contrats",
    config: {
      label: "Contrats",
      hint: "Anticiper les échéances, les préavis et les renouvellements.",
      prompt: "Quels contrats arrivent à échéance dans les 90 jours ?",
      secondary: "Quels contrats sont sans date de fin ?",
    },
  },
  {
    prefix: "/fournisseurs",
    config: {
      label: "Fournisseurs",
      hint: "Analyser les fournisseurs, licences, sièges et coûts annuels.",
      prompt: "Quelles licences sont à renouveler ou dépassées ?",
      secondary: "Quels fournisseurs ont le plus de contrats ?",
    },
  },
  {
    prefix: "/budget",
    config: {
      label: "Budget",
      hint: "Analyser les engagements, les factures, le disponible et les dépassements.",
      prompt: "Analyse le budget informatique et les points d'attention.",
      secondary: "Quelles lignes budgétaires sont dépassées ?",
    },
  },
  {
    prefix: "/projets",
    config: {
      label: "Projets",
      hint: "Repérer les projets en retard, bloqués ou à risque.",
      prompt: "Quels projets sont en retard ou à risque ?",
      secondary: "Propose un plan d'action pour les projets bloqués.",
    },
  },
  {
    prefix: "/cybersecurite",
    config: {
      label: "Cybersécurité",
      hint: "Analyser les incidents, vulnérabilités, certificats et actions de sécurité.",
      prompt: "Quels incidents de sécurité sont ouverts et quelles actions mener ?",
      secondary: "Quels certificats arrivent à expiration ?",
    },
  },
  {
    prefix: "/sauvegardes",
    config: {
      label: "Sauvegardes",
      hint: "Analyser les jobs Veeam, les échecs et l'espace des dépôts.",
      prompt: "Quel est l'état des sauvegardes Veeam ?",
      secondary: "Quels jobs sont en échec ?",
    },
  },
  {
    prefix: "/rgpd",
    config: {
      label: "RGPD",
      hint: "Suivre les traitements, demandes DPO, droits et violations.",
      prompt: "Quels traitements RGPD arrivent à revue ?",
      secondary: "Quelles demandes de droits sont ouvertes ?",
    },
  },
  {
    prefix: "/documentation",
    config: {
      label: "Documentation",
      hint: "Identifier les documents à mettre à jour, classer ou compléter.",
      prompt: "Quels documents sont à mettre à jour ou à classer ?",
      secondary: "Propose une organisation de la documentation.",
    },
  },
  {
    prefix: "/import-documents",
    config: {
      label: "Import intelligent",
      hint: "Analyser un ou plusieurs documents, détecter les doublons et choisir la bonne destination.",
      prompt: "Quels imports sont en erreur ou non finalisés ?",
      secondary: "Comment classer les documents importés ?",
    },
  },
  {
    prefix: "/statistiques",
    config: {
      label: "Statistiques",
      hint: "Analyser la période, les tendances et les points d'attention.",
      prompt: "Analyse les statistiques de la période et propose une synthèse.",
      secondary: "Quels sont les points d'attention du mois ?",
    },
  },
  {
    prefix: "/aujourdhui",
    config: {
      label: "Aujourd'hui",
      hint: "Prioriser les actions du jour et préparer le briefing.",
      prompt: "Fais-moi le briefing du jour et propose un ordre de priorité.",
      secondary: "Quelles actions sont les plus urgentes ?",
    },
  },
  {
    prefix: "/qualite-donnees",
    config: {
      label: "Qualité des données",
      hint: "Analyser les anomalies et proposer un plan de correction.",
      prompt: "Analyse les anomalies de qualité des données et propose un plan de correction.",
      secondary: "Quelles anomalies corriger en premier ?",
    },
  },
  {
    prefix: "/stock",
    config: {
      label: "Stock",
      hint: "Repérer les articles sous le seuil, épuisés ou à recommander.",
      prompt: "Quels articles du stock sont sous le seuil ou épuisés ?",
      secondary: "Prépare une liste de réapprovisionnement.",
    },
  },
  {
    prefix: "/telephonie",
    config: {
      label: "Téléphonie",
      hint: "Analyser les lignes, forfaits, terminaux et engagements.",
      prompt: "Quelles lignes mobiles arrivent en fin d'engagement ?",
      secondary: "Quelles lignes sont sans titulaire ?",
    },
  },
  {
    prefix: "/agents",
    config: {
      label: "Agents",
      hint: "Analyser les agents, leurs équipements, comptes et affectations.",
      prompt: "Quels agents n'ont pas d'équipement ou de compte ?",
      secondary: "Que possède l'agent sélectionné ?",
    },
  },
  {
    prefix: "/arrivees-departs",
    config: {
      label: "Arrivées & départs",
      hint: "Repérer les dossiers incomplets, en retard ou sans checklist.",
      prompt: "Quelles arrivées ou quels départs sont incomplets ?",
      secondary: "Prépare la checklist d'arrivée.",
    },
  },
  {
    prefix: "/calendrier",
    config: {
      label: "Calendrier",
      hint: "Analyser les événements, actions et échéances de la semaine.",
      prompt: "Quels événements et actions nécessitent mon attention cette semaine ?",
      secondary: "Quelles actions sont en retard ?",
    },
  },
  {
    prefix: "/reservations",
    config: {
      label: "Réservations",
      hint: "Analyser les réservations, indisponibilités et retours de matériel.",
      prompt: "Quelles réservations sont en cours ou en retard ?",
      secondary: "Quel matériel est disponible ?",
    },
  },
];

const fallback: ContextConfig = {
  label: "SI PILOT",
  hint: "Analyser les données, préparer une synthèse ou proposer une action.",
  prompt: "Fais-moi le briefing du jour.",
  secondary: "Prépare une synthèse pour la direction.",
};

export function AiContextDock() {
  const location = useLocation();
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { open: openAi } = useAiAssistant();

  if (!hasPermission("ai.use") || !isEnabled("ai")) return null;
  if (location.pathname.startsWith("/assistant-ia")) return null;

  const match = contexts.find((item) => location.pathname.startsWith(item.prefix));
  const context = match?.config ?? fallback;

  return (
    <div className="group fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-72 translate-y-1 scale-95 rounded-xl border border-primary/25 bg-surface/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Sparkles className="h-3 w-3" />
          Assistant IA · {context.label}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-muted">{context.hint}</p>
        <div className="mt-2 space-y-1">
          {[context.prompt, context.secondary].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => openAi(null, prompt)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border-soft bg-background/50 px-2 py-1.5 text-left text-[10px] text-foreground transition-colors hover:border-primary/40 hover:bg-background/80"
            >
              <span>{prompt}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-accent" />
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-muted-2">
          <span>Réponses et actions soumises à confirmation.</span>
          <button
            type="button"
            onClick={() => openAi(null, context.prompt)}
            className="text-accent hover:underline"
          >
            Ouvrir
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openAi(null, context.prompt)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary/90 to-primary-strong px-3.5 py-2.5 text-xs font-semibold text-brand-cream shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl",
        )}
        aria-label={`Assistant IA pour ${context.label}`}
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-accent" />
        </span>
        <span className="hidden sm:inline">Assistant IA</span>
        <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[8px] uppercase tracking-wide">
          {context.label}
        </span>
      </button>
    </div>
  );
}
