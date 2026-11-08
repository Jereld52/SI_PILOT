import { useBranding } from "@/features/branding/BrandingProvider";
import { cn } from "@/lib/utils";

function splitName(value: string): [string, string] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["SI", "PILOT"];
  if (words.length === 1) return ["", words[0]];
  return [words.slice(0, -1).join(" "), words[words.length - 1]];
}

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  const branding = useBranding();
  const [head, tail] = splitName(branding.app_name);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1 shadow-sm shadow-black/30">
        <img
          src={branding.logo_url}
          alt={branding.organization_name || branding.app_name}
          className="h-full w-full object-contain"
        />
      </div>
      {!compact ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {head ? `${head} ` : ""}
            <span className="text-accent/90">{tail}</span>
          </p>
          {branding.organization_name ? (
            <p className="truncate text-[9px] uppercase tracking-[0.18em] text-muted-2">
              {branding.organization_name}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
