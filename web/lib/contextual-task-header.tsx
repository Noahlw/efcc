"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

const contextualTaskHeaderVariants = cva("grid", {
  variants: {
    layout: {
      default: "gap-[0.7rem]",
      compact: "gap-1.5",
    },
  },
  defaultVariants: {
    layout: "default",
  },
});

type ContextualTaskHeaderVariants = VariantProps<
  typeof contextualTaskHeaderVariants
>;

export interface ContextualTaskHeaderProps extends ContextualTaskHeaderVariants {
  backHref: string;
  backLabel: string;
  title: string;
  lead: string;
  status?: React.ReactNode;
  action?: React.ReactNode;
  headingId?: string;
  /** A caller-owned heading ref for predictable focus after a state change. */
  headingRef?: React.Ref<HTMLHeadingElement>;
  /** Replace history when the caller is restoring an existing route. */
  backReplace?: boolean;
  /** Optional caller-owned interception for history-backed transitions. */
  onBack?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

/**
 * Shared header for authenticated task/detail surfaces. Domain routes retain
 * ownership of copy and actions; this seam only standardizes Back, heading,
 * lead, optional state/action slots, and a programmatic heading target.
 */
export const ContextualTaskHeader = ({
  backHref,
  backLabel,
  title,
  lead,
  status,
  action,
  headingId,
  headingRef,
  backReplace,
  onBack,
  className,
  layout,
}: ContextualTaskHeaderProps) => {
  const handleBackClick: React.MouseEventHandler<HTMLAnchorElement> = (
    event
  ) => {
    onBack?.(event);
    if (
      event.defaultPrevented ||
      !backReplace ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    // Next's same-route router cache can retain the current query/hash for
    // client-only route boundaries. A replace Back link must still land on
    // the exact canonical href supplied by its route owner.
    event.preventDefault();
    window.location.replace(backHref);
  };
  return (
    <header
      className={cn(contextualTaskHeaderVariants({ layout, className }))}
      data-contextual-task-header
    >
      <Link
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[8px] px-2 text-[var(--ink-muted)] no-underline outline-none hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        href={backHref}
        replace={backReplace}
        onClick={handleBackClick}
      >
        <svg
          aria-hidden="true"
          className="size-5 shrink-0"
          viewBox="0 0 20 20"
          focusable="false"
        >
          <path
            d="m12.5 4-5 6 5 6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span>{backLabel}</span>
      </Link>
      <div className="flex items-start justify-between gap-4 max-[799px]:flex-col">
        <div className="min-w-0">
          <h1
            className="m-0 text-[clamp(1.75rem,5vw,2.35rem)] font-extrabold tracking-[-0.03em] text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          <p className="m-0 mt-[0.35rem] max-w-[65ch] text-[var(--ink-muted)] leading-[1.55]">
            {lead}
          </p>
        </div>
        {(status || action) && (
          <div className="flex shrink-0 items-center gap-2 max-[799px]:w-full max-[799px]:flex-wrap">
            {status}
            {action}
          </div>
        )}
      </div>
    </header>
  );
};
