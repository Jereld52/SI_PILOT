import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-accent/50 bg-[linear-gradient(145deg,#9a3d43,#5d2125)] shadow-lg shadow-primary/30 ring-1 ring-white/10">
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
