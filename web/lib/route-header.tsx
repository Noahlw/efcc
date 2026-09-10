"use client";

import * as React from "react";

import { ScreenHeader } from "@/lib/screen-foundations";

export interface RouteHeaderProps {
  title: string;
  lead?: string;
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
export const RouteHeader = (props: RouteHeaderProps) => (
  <ScreenHeader {...props} />
);
