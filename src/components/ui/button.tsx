import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Estados padronizados âmbar dourado (hover/active/focus/disabled) com contraste AA sobre grafite
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-[var(--interactive-disabled-opacity)] disabled:saturate-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md hover:bg-primary-hover hover:shadow-lg hover:shadow-glow active:bg-primary-active active:scale-[0.98] focus-visible:ring-primary",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive",
        outline:
          "border border-input bg-background text-foreground hover:bg-primary-soft hover:text-primary-foreground hover:border-primary active:bg-primary/20 focus-visible:ring-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 focus-visible:ring-primary",
        ghost:
          "text-foreground hover:bg-primary-soft hover:text-foreground active:bg-primary/20 focus-visible:ring-primary",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary-hover focus-visible:ring-primary",
        accent:
          "bg-accent text-accent-foreground shadow-md hover:bg-accent/90 hover:shadow-lg hover:shadow-glow-petrol active:bg-accent/80 focus-visible:ring-accent",
        premium:
          "bg-gradient-primary text-primary-foreground shadow-md hover:shadow-lg hover:shadow-glow active:scale-[0.98] focus-visible:ring-primary",
        brand:
          "bg-gradient-petrol-amber text-primary-foreground shadow-md hover:shadow-lg hover:shadow-glow-petrol active:scale-[0.98] focus-visible:ring-primary",
        success: "bg-success text-success-foreground hover:bg-success/90 active:bg-success/80 shadow-md focus-visible:ring-success",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90 active:bg-warning/80 shadow-md focus-visible:ring-warning",
        info: "bg-info text-info-foreground hover:bg-info/90 active:bg-info/80 shadow-md focus-visible:ring-info",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8 text-base",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
