"use client";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { BackIcon } from "./settings-ui";

const focusVisibleOutline =
  "focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!";
const actionSurfaceFocus =
  "[&_:is(button,a,input,select,textarea):focus-visible]:outline-[3px]! [&_:is(button,a,input,select,textarea):focus-visible]:outline-[var(--focus)]! [&_:is(button,a,input,select,textarea):focus-visible]:outline-offset-[3px]!";
const headerActionFocus =
  "[&_:is(button,a):focus-visible]:outline-[3px]! [&_:is(button,a):focus-visible]:outline-[var(--focus)]! [&_:is(button,a):focus-visible]:outline-offset-[3px]!";

export const actionSurfaceVariants = cva(
  `static isolate grid min-h-11 w-full min-w-0 max-h-[min(48dvh,420px)] gap-[var(--space-3)] mt-[var(--space-4)] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border bg-[var(--surface-raised)] p-[var(--space-3)] pb-[calc(var(--space-3)+env(safe-area-inset-bottom,0px))] text-sm shadow-[var(--shadow-dock)] scroll-mb-[calc(84px+env(safe-area-inset-bottom,0px))] data-disabled:opacity-70 ${actionSurfaceFocus}`,
  {
    variants: {
      state: {
        dirty: "border-input",
        selection: "border-input",
        review: "border-ring",
        save: "border-primary",
        busy: "border-input",
        failure: "border-[var(--error-border)] bg-[var(--error-surface)]",
        conflict: "border-[var(--error-border)] bg-[var(--error-surface)]",
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

export const ActionSurface = ({
  busy = false,
  children,
  className,
  disabled = false,
  label,
  state = "selection",
  ...props
}: ActionSurfaceProps) => {
  const isBusy = busy || state === "busy";
  return (
    <section
      {...props}
      aria-busy={isBusy}
      aria-label={label}
      className={cn(actionSurfaceVariants({ state, className }))}
      data-disabled={disabled || undefined}
      data-slot="action-surface"
      data-state={state}
    >
      {children}
    </section>
  );
};

export function safeManagementReturnHref(
  value: string | null,
  fallback: string
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  try {
    const candidate = new URL(value, "https://efcc.internal");
    const path = candidate.pathname;
    if (
      path !== "/management" &&
      !path.startsWith("/management/") &&
      path !== "/programs" &&
      !path.startsWith("/programs/")
    ) {
      return fallback;
    }
    return `${path}${candidate.search}${candidate.hash}`;
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
  <header className="grid gap-[0.7rem]">
    <Link
      className={cn(
        "inline-flex w-fit min-h-[44px] items-center gap-[0.3rem] text-[var(--ink-muted)] no-underline",
        focusVisibleOutline
      )}
      href={backHref}
      onClick={onBackClick}
    >
      <BackIcon />
      <span>{backLabel}</span>
    </Link>
    <div className="flex min-w-0 items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className="m-0 wrap-anywhere text-[clamp(1.75rem,5vw,2.35rem)] tracking-[-0.03em]"
          id={titleId}
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
        >
          {title}
        </h1>
        <p className="m-0 mt-[0.35rem] max-w-[65ch] text-[var(--ink-muted)] leading-[1.55]">
          {lead}
        </p>
      </div>
      {action && (
        <div className={cn("flex-none", headerActionFocus)}>{action}</div>
      )}
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
    className="shell:fixed shell:right-4 shell:bottom-4 shell:left-auto shell:z-[25] shell:min-w-[360px]"
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
  const openerRef = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  );
  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    if (opener?.isConnected) {
      opener.focus();
    }
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    return restoreFocus;
  }, [restoreFocus]);

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <SheetContent
        aria-label={label}
        className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[18px] border border-[var(--line)] bg-[var(--surface-raised)] p-[1.2rem] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-[var(--ink)] sm:inset-x-auto sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:h-auto sm:w-[min(640px,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
        side="bottom"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only p-0">
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription>選擇篩選條件後套用。</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button
            aria-label={`關閉${label}`}
            className="absolute top-2 right-2 size-11 rounded-full bg-[var(--surface)] text-[var(--ink)]"
            ref={closeRef}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </SheetClose>
        {children}
      </SheetContent>
    </Sheet>
  );
};
