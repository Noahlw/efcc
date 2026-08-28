"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { announce as announceToLiveRegion } from "@/lib/live-region";
import { cn } from "@/lib/utils";

export type FeedPresentationState =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "detail";

export interface FeedAnnouncement {
  key: string | number;
  message: string;
}

const feedPresentationVariants = cva(
  "w-full min-w-0 focus-visible:ring-3 focus-visible:ring-[var(--focus)]",
  {
    variants: {
      layout: {
        flow: "block",
        stacked: "grid gap-5",
      },
    },
    defaultVariants: {
      layout: "flow",
    },
  }
);

type FeedPresentationVariants = VariantProps<typeof feedPresentationVariants>;

export interface FeedPresentationProps extends FeedPresentationVariants {
  state: FeedPresentationState;
  list: ReactNode;
  detail?: ReactNode;
  loading: ReactNode;
  error: ReactNode;
  empty: ReactNode;
  status?: ReactNode;
  /**
   * Announce transitions that do not already render an assertive visible
   * status. Alert slots remain the owner for visible error messages.
   */
  announcement?: FeedAnnouncement;
  /** The route may restore focus to its own trigger; otherwise the feed root is used. */
  focusTargetRef?: RefObject<HTMLElement | null>;
  /** Override only for isolated consumers; production defaults to the global polite region. */
  onAnnounce?: (message: string) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

/**
 * Presentation-only feed state composition. Adapters own requests, URLs,
 * read state, permissions, and actions; this seam owns state semantics,
 * focus transfer, and the single polite announcement owner.
 */
export function FeedPresentation({
  state,
  list,
  detail,
  loading,
  error,
  empty,
  status,
  announcement,
  focusTargetRef,
  onAnnounce = announceToLiveRegion,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  layout,
}: FeedPresentationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastAnnouncementKey = useRef<string | number | null>(null);

  useEffect(() => {
    if (!announcement || announcement.key === lastAnnouncementKey.current) {
      return;
    }
    lastAnnouncementKey.current = announcement.key;
    onAnnounce(announcement.message);
  }, [announcement, onAnnounce]);

  useEffect(() => {
    const target = focusTargetRef?.current ?? rootRef.current;
    target?.focus();
  }, [focusTargetRef, state]);

  const content =
    state === "loading"
      ? loading
      : state === "error"
        ? error
        : state === "empty"
          ? empty
          : state === "detail"
            ? detail
: list;

  return (
    <div
      ref={rootRef}
      id={id}
      className={cn(feedPresentationVariants({ layout, className }))}
      data-feed-state={state}
      data-feed-announcement-owner="global-live-region"
      aria-busy={state === "loading" ? "true" : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      role={ariaLabel || ariaLabelledBy ? "region" : undefined}
      tabIndex={-1}
    >
      {status}
      {content}
    </div>
  );
}

export { feedPresentationVariants };
