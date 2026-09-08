import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export type AlertTone =
  | "info"
  | "success"
  | "pending"
  | "warning"
  | "conflict"
  | "error";
export type AlertAnnouncement = "none" | "polite" | "assertive";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      tone: {
        info: "border-[var(--info-border)] bg-[var(--info-surface)] text-[var(--info)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        pending:
          "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)]",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]",
        conflict:
          "border-[var(--conflict-border)] bg-[var(--conflict-surface)] text-[var(--conflict)]",
        error:
          "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]",
      },
      announcement: {
        none: "",
        polite: "",
        assertive: "",
      },
      variant: {
        default: "",
        destructive: "",
      },
    },
    defaultVariants: {
      tone: "info",
      announcement: "assertive",
      variant: "default",
    },
  }
);

type AlertProps = React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    tone?: AlertTone;
    announcement?: AlertAnnouncement;
  };

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, tone, announcement = "assertive", variant, ...props },
  ref
) {
  const resolvedTone = tone ?? (variant === "destructive" ? "error" : "info");
  const role =
    announcement === "assertive"
      ? "alert"
      : announcement === "polite"
        ? "status"
        : undefined;

  return (
    <div
      ref={ref}
      {...props}
      data-slot="alert"
      data-tone={resolvedTone}
      data-announcement={announcement}
      role={role}
      aria-live={announcement === "none" ? undefined : announcement}
      className={cn(
        alertVariants({ tone: resolvedTone, announcement, variant }),
        className
      )}
    />
  );
});
Alert.displayName = "Alert";

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
