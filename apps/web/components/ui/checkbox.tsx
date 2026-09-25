"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const checkboxVariants = cva(
  "peer group/checkbox relative flex shrink-0 items-center justify-center rounded-md border border-input bg-transparent text-primary-foreground transition-colors outline-none after:absolute after:-inset-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
  {
    variants: {
      size: {
        default: "size-11",
        sm: "size-11 rounded-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> &
  VariantProps<typeof checkboxVariants>;

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size = "default", ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    data-slot="checkbox"
    data-size={size}
    className={cn(checkboxVariants({ size, className }))}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className="grid place-content-center text-current transition-none [&>svg]:size-4"
    >
      <CheckIcon className="group-data-[state=indeterminate]/checkbox:hidden" />
      <MinusIcon className="hidden group-data-[state=indeterminate]/checkbox:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox, checkboxVariants };
