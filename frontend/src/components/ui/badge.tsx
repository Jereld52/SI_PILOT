import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeStyles: Record<string, string> = {
  neutral: "border-border/80 bg-surface-2/60 text-muted",
  info: "border-info/20 bg-info/[0.07] text-info",
  success: "border-success/20 bg-success/[0.07] text-success",
  warning: "border-warning/20 bg-warning/[0.07] text-warning",
  danger: "border-danger/20 bg-danger/[0.07] text-danger",
  accent: "border-accent/20 bg-accent/[0.07] text-accent",
  outline: "border-border bg-transparent text-foreground",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof badgeStyles;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
        badgeStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
