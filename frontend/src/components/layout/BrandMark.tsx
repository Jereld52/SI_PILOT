import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-[#1a1213] shadow-sm shadow-black/30">
        <img
          src="/favicon.png"
          alt="Parc national de forêts"
          className="h-full w-full object-cover"
        />
      </div>
      {!compact ? (
        <div className="leading-tight">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">
            SI PNFor <span className="text-accent/90">PILOTE</span>
          </p>
          <p className="text-[9px] uppercase tracking-[0.18em] text-muted-2">
            Parc national de forêts
          </p>
        </div>
      ) : null}
    </div>
  );
}
