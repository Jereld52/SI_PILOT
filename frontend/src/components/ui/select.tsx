import { ChevronDown } from "lucide-react";
import { type SelectHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-border bg-background-soft px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary/55 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
          invalid && "border-danger/70",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";
