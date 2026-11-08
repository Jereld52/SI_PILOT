import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border-soft/70 pb-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-1 w-5 rounded-full bg-primary" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">
              {eyebrow}
            </p>
          </div>
        ) : null}
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
