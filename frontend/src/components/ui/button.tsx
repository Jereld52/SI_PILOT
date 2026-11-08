import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border border-primary-bright/40 bg-[linear-gradient(135deg,#9a3d43_0%,#7f2f34_45%,#5d2125_100%)] text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:brightness-95",
        secondary:
          "border border-border bg-surface-2 text-foreground hover:border-primary/60 hover:bg-surface-3 hover:text-primary-strong",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-2 hover:text-foreground",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        danger: "bg-[#9b3b3b] text-white hover:bg-[#b24a4a]",
        success: "bg-brand-green text-brand-cream hover:bg-[#579b3c]",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
