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
          "border border-primary-bright/35 bg-[linear-gradient(180deg,#813237_0%,#6c272c_100%)] text-primary-foreground shadow-sm shadow-black/20 hover:border-primary-bright/60 hover:bg-[#7a2e33] active:brightness-95",
        secondary:
          "border border-border bg-surface-2/70 text-foreground hover:border-primary/35 hover:bg-surface-3 hover:text-foreground",
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
