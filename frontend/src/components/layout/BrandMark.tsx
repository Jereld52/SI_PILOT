import { Trees } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary-strong/25 bg-gradient-to-br from-primary to-[#0c3b50] shadow-lg shadow-primary/20">
        <Trees className="h-5 w-5 text-primary-strong" aria-hidden="true" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary-strong shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
      </div>
      {!compact ? (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            SI PNFor <span className="text-primary-strong">PILOTE</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Parc national de forêts
          </p>
        </div>
      ) : null}
    </div>
  );
}
