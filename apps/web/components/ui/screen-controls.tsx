import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const screenIconButtonPrimitiveVariants = cva(
  "text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-accent)] focus-visible:border-[var(--screen-focus)] focus-visible:ring-[var(--screen-focus)]/20",
  {
    variants: {
      tone: {
        default: "",
        soft: "border-[var(--screen-line)] bg-[var(--screen-surface)]",
        danger:
          "text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)] hover:text-[var(--screen-danger)]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

interface ScreenIconButtonPrimitiveProps
  extends
    Omit<React.ComponentProps<typeof Button>, "shape" | "size" | "variant">,
    VariantProps<typeof screenIconButtonPrimitiveVariants> {
  "aria-label": string;
}

/** Icon-only action with mandatory accessible naming and 44px hit geometry. */
const ScreenIconButtonPrimitive = ({
  className,
  tone = "default",
  ...props
}: ScreenIconButtonPrimitiveProps) => (
  <Button
    {...props}
    className={cn(screenIconButtonPrimitiveVariants({ tone }), className)}
    data-screen-icon-button="true"
    shape="circle"
    size="icon"
    variant="ghost"
  />
);

const screenFilterChipPrimitiveVariants = cva(
  "inline-flex min-h-[var(--screen-touch-target)] shrink-0 items-center justify-center rounded-[var(--screen-radius-pill)] border px-[var(--screen-control-padding-inline)] text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:border-[var(--screen-focus)] focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]/20 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      selected: {
        false:
          "border-[var(--screen-line)] bg-[var(--screen-surface)] text-[var(--screen-muted)] hover:border-[var(--screen-line-strong)] hover:text-[var(--screen-ink)]",
        true: "border-[color-mix(in_srgb,var(--screen-accent)_35%,var(--screen-line))] bg-[var(--screen-accent-soft)] text-[var(--screen-accent)]",
      },
    },
    defaultVariants: {
      selected: false,
    },
  }
);

type ScreenFilterChipPrimitiveProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  "asChild" | "shape" | "size" | "variant"
> &
  VariantProps<typeof screenFilterChipPrimitiveVariants>;

const ScreenFilterChipPrimitive = ({
  children,
  className,
  selected = false,
  type = "button",
  ...props
}: ScreenFilterChipPrimitiveProps) => (
  <Button
    {...props}
    aria-pressed={selected ?? false}
    className={cn(
      screenFilterChipPrimitiveVariants({ selected: selected ?? false }),
      className
    )}
    data-screen-filter-chip
    data-selected={selected ?? false}
    size="default"
    type={type}
    variant="ghost"
  >
    {children}
  </Button>
);

export {
  ScreenFilterChipPrimitive,
  ScreenIconButtonPrimitive,
  screenIconButtonPrimitiveVariants,
};
