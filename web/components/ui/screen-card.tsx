import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const screenCardPrimitiveVariants = cva(
  "grid gap-[var(--screen-utility-gap)] rounded-[var(--screen-radius-surface)] border border-[var(--screen-line)] bg-[var(--screen-surface)] p-[var(--screen-surface-padding)] text-[var(--screen-ink)]",
  {
    variants: {
      tone: {
        default: "",
        emphasis: "border-[#d8d0c6] bg-[#fffdfa]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

export type ScreenCardPrimitiveTone = NonNullable<
  VariantProps<typeof screenCardPrimitiveVariants>["tone"]
>;

export interface ScreenCardPrimitiveProps
  extends
    React.ComponentPropsWithoutRef<typeof Card>,
    VariantProps<typeof screenCardPrimitiveVariants> {}

const ScreenCardPrimitive = React.forwardRef<
  HTMLDivElement,
  ScreenCardPrimitiveProps
>(({ className, tone = "default", ...props }, ref) => (
  <Card
    {...props}
    className={cn(screenCardPrimitiveVariants({ tone }), className)}
    ref={ref}
  />
));

ScreenCardPrimitive.displayName = "ScreenCardPrimitive";

export { ScreenCardPrimitive, screenCardPrimitiveVariants };
