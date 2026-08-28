"use client";
import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

import { BackIcon } from "./settings-ui";

import styles from "./management-action-framework.module.css";

export const actionSurfaceVariants = cva(
  "relative isolate w-full min-w-0 rounded-xl border text-sm",
  {
    variants: {
      state: {
        dirty: "border-input",
        selection: "border-input",
        review: "border-ring",
        save: "border-primary",
        busy: "border-input",
        failure: "border-destructive bg-destructive/10",
        conflict: "border-destructive bg-destructive/10",
      },
    },
    defaultVariants: {
      state: "selection",
    },
  }
);

export type ActionSurfaceState = NonNullable<
  VariantProps<typeof actionSurfaceVariants>["state"]
>;

export type ActionSurfaceProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "aria-label"
> & {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  state?: ActionSurfaceState;
  busy?: boolean;
};

export function ActionSurface({
  busy = false,
  children,
  className,
  disabled = false,
  label,
  state = "selection",
  ...props
}: ActionSurfaceProps) {
  const isBusy = busy || state === "busy";
  return (
    <section
      {...props}
      aria-busy={isBusy}
      aria-disabled={disabled || undefined}
      aria-label={label}
      className={cn(actionSurfaceVariants({ state, className }), styles.actionSurface)}
      data-disabled={disabled || undefined}
      data-slot="action-surface"
      data-state={state}
    >
      {children}
    </section>
  );
}


export function safeManagementReturnHref(
  value: string | null,
  fallback: string
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  try {
    const candidate = new URL(value, "https://efcc.internal");
    if (
      candidate.pathname !== "/management" &&
      !candidate.pathname.startsWith("/management/")
    ) {
      return fallback;
    }
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

export const ManagementPageHeader = ({
  action,
  backHref,
  backLabel,
  lead,
  titleId,
  title,
  titleRef,
  onBackClick,
}: {
  action?: ReactNode;
  backHref: string;
  backLabel: string;
  lead: string;
  titleId?: string;
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
  onBackClick?: () => void;
}) => (
  <header className={styles.header}>
    <Link className={styles.back} href={backHref} onClick={onBackClick}>
      <BackIcon />
      <span>{backLabel}</span>
    </Link>
    <div className={styles.titleRow}>
      <div>
        <h1 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
          {title}
        </h1>
        <p>{lead}</p>
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  </header>
);

export const ManagementStickyActionBar = ({
  children,
  label,
  state = "selection",
  busy = false,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  state?: ActionSurfaceState;
  busy?: boolean;
  disabled?: boolean;
}) => (
  <ActionSurface
    busy={busy}
    className={styles.stickyBar}
    disabled={disabled}
    label={label}
    state={state}
  >
    {children}
  </ActionSurface>
);

export const ManagementFilterSheet = ({
  children,
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} role="presentation">
      <dialog aria-label={label} className={styles.sheet} open>
        <button
          aria-label={`關閉${label}`}
          className={styles.close}
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          ×
        </button>
        {children}
      </dialog>
    </div>
  );
};
