import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AiCollapsibleSectionProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function AiCollapsibleSection({
  title,
  description,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
  className,
}: AiCollapsibleSectionProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-xl border border-border-soft bg-surface/60",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-soft bg-background/40 text-accent">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-foreground">{title}</span>
            {badge !== undefined ? (
              <span className="shrink-0 rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-2">
                {badge}
              </span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-0.5 block text-[10px] leading-4 text-muted-2">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-2 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border-soft/70 p-3">{children}</div>
    </details>
  );
}
