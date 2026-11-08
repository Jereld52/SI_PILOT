import { type InputHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-[#0c1311] px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-2 focus:border-primary/55 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
        invalid && "border-danger/70 focus:border-danger focus:ring-danger/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
