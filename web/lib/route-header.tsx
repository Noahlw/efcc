"use client";

import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface RouteHeaderProps {
  title: string;
  lead?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
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
 * Shared route-level composition. Route owners retain copy, state and
 * actions; this seam only standardizes the optional Back affordance, heading,
 * lead, status/action slots and caller-owned heading focus.
 */
export const RouteHeader = ({
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
}: RouteHeaderProps) => {
  const handleBackClick: React.MouseEventHandler<HTMLAnchorElement> = (
    event
  ) => {
    onBack?.(event);
    if (
      event.defaultPrevented ||
      !backReplace ||
      !backHref ||
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

  const hasActions = Boolean(status || action);

  return (
    <header className={cn("grid gap-[0.7rem]", className)} data-route-header>
      {backHref && backLabel ? (
        <Link
          className="inline-flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded-[8px] px-2 text-[var(--ink-muted)] no-underline outline-none hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
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
          <span className="min-w-0 wrap-anywhere">{backLabel}</span>
        </Link>
      ) : null}
      <div
        className="flex min-w-0 items-start justify-between gap-4 max-[799px]:flex-col"
        data-route-header-main
      >
        <div className="min-w-0">
          <h1
            className="m-0 wrap-anywhere text-[clamp(1.75rem,5vw,2.35rem)] font-extrabold tracking-[-0.03em] text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          {lead ? (
            <p className="m-0 mt-[0.35rem] max-w-[65ch] wrap-anywhere text-[var(--ink-muted)] leading-[1.55]">
              {lead}
            </p>
          ) : null}
        </div>
        {hasActions && (
          <div
            className="flex shrink-0 items-center gap-2 max-[799px]:w-full max-[799px]:flex-wrap"
            data-route-header-actions
          >
            {status}
            {action}
          </div>
        )}
      </div>
    </header>
  );
};
