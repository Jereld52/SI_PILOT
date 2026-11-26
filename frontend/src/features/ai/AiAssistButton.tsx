import { ArrowRight, Sparkles } from "lucide-react";

import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiAssistButtonProps {
  prompt: string;
  hint: string;
  label?: string;
  compact?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}

export function AiAssistButton({
  prompt,
  hint,
  label = "Assistant IA",
  compact = false,
  variant = "secondary",
  className,
}: AiAssistButtonProps) {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { open: openAi } = useAiAssistant();

  if (!hasPermission("ai.use") || !isEnabled("ai")) {
    return null;
  }

  return (
    <div className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => openAi(null, prompt)}
        className={cn(
          buttonVariants({ variant, size: compact ? "icon" : "md" }),
          "relative",
          compact ? "h-8 w-8" : "",
        )}
        aria-label={label}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {compact ? null : <span>{label}</span>}
        {compact ? null : (
          <span className="ml-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent">
            IA
          </span>
        )}
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 origin-top-right translate-y-1 scale-95 rounded-xl border border-primary/25 bg-surface/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur transition-all duration-150 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        <span className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-primary/25 bg-surface" />
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Sparkles className="h-3 w-3" />
          Assistant IA
        </span>
        <span className="mt-1 block text-[10px] leading-4 text-muted">{hint}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-primary-strong">
          Cliquer pour ouvrir
          <ArrowRight className="h-3 w-3" />
        </span>
      </span>
    </div>
  );
}
