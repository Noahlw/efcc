"use client";

import { cva } from "class-variance-authority";
import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const switchVariants = cva(
  "peer group/switch relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent transition-all outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 before:pointer-events-none before:absolute before:rounded-full before:border before:border-transparent before:content-[''] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:before:bg-primary data-unchecked:before:bg-input dark:data-unchecked:before:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-disabled:cursor-not-allowed data-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "before:h-[18.4px] before:w-[32px]",
        sm: "before:h-[14px] before:w-[24px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const switchThumbVariants = cva(
  "pointer-events-none z-10 block rounded-full bg-background ring-0 transition-transform dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground",
  {
    variants: {
      size: {
        default:
          "size-4 data-checked:translate-x-2 data-unchecked:-translate-x-2",
        sm: "size-3 data-checked:translate-x-[6px] data-unchecked:-translate-x-[6px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(switchVariants({ size, className }))}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={switchThumbVariants({ size })}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
