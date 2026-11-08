import { type TextareaHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-24 w-full rounded-lg border border-border bg-[#0c1311] px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-2 focus:border-primary/55 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
        invalid && "border-danger/70 focus:border-danger focus:ring-danger/15",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
