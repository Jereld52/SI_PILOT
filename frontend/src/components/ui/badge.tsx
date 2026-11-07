import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeStyles: Record<string, string> = {
  neutral: "border-border bg-surface-2 text-muted",
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  accent: "border-accent/25 bg-accent/10 text-accent",
  outline: "border-border bg-transparent text-foreground",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof badgeStyles;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        badgeStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
