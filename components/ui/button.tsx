import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",

        // --- redesign ---
        // The pair. These carry colour and weight only; the fixed widths live
        // on the `action` / `action-secondary` sizes, because cva emits size
        // classes after variant classes and a width declared here would lose to
        // whatever size was in effect.
        //
        // `brand` is the one accent. At most one of these should be visible per
        // section — if two things on a screen are blue, one of them is wrong.
        brand:
          "bg-brand text-white font-semibold hover:bg-brand-hover active:bg-brand-deep rounded-lg",
        // The quiet half of the pair: a real border, never a grey fill.
        quiet:
          "bg-surface text-ink-muted border border-hairline-input hover:bg-surface-raised hover:text-ink active:bg-surface-deep rounded-lg",
        // Destructive as text on a tint, not a red block — a red fill reads as
        // the primary action of the section, which cancelling never is.
        danger:
          "bg-destructive-subtle text-destructive-emphasis border border-destructive-emphasis/20 hover:bg-destructive-subtle/70 rounded-lg",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",

        // --- redesign ---
        // 220 / 168 at 46px tall. Fixed widths, not padding-derived: the pair
        // has to keep the same footprint as its label changes ("Lanjutkan" →
        // "Memproses…"), or the secondary button visibly jumps sideways every
        // time the primary enters a loading state.
        action: "h-[46px] w-[220px] px-4 text-ui",
        "action-secondary": "h-[46px] w-[168px] px-4 text-copy",
        // Same height, hugs its label. For rows of repeated actions (a booking
        // list) where a 220px button per row would be absurd.
        "action-compact": "h-11 px-5 text-copy",
        // The one that ends a form. Full width is the affordance that says
        // "this submits the thing you have been filling in".
        "action-full": "h-12 w-full px-5 text-lede",
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
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
