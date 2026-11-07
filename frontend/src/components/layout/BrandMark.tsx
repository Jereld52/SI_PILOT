import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-cream/20 bg-brand-cream p-1 shadow-lg shadow-black/20">
        <img
          src="/logo-emblem.png"
          alt="Parc national de forêts"
          className="h-full w-full object-contain"
        />
      </div>
      {!compact ? (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            SI PNFor <span className="text-accent">PILOTE</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Parc national de forêts
          </p>
        </div>
      ) : null}
    </div>
  );
}
