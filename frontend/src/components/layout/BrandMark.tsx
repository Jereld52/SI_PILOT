import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-accent/30 bg-primary shadow-lg shadow-black/30">
        <img
          src="/favicon.png"
          alt="Parc national de forêts"
          className="h-full w-full object-cover"
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
