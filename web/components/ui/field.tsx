import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Semantic fieldset primitive for shadcn-style field compositions.
 * Screen-level wrappers may add their own spacing and presentation contract.
 */
function Field({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"small">) {
  return (
    <small
      data-slot="field-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"small">) {
  return (
    <small
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      role="alert"
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldError, FieldLabel };
