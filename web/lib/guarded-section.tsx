"use client";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { RecoveryView } from "@/lib/recovery-view";
import { firstSection, getSection } from "@/lib/sections";

/**
 * Section authorization gate for the cookie-only boundary.
 *
 * ponytail: the per-section `authorizedNavigate` server RPC carried a client
 * session that no longer exists under the AUTH-04 cookie model, and
 * server-authoritative Section visibility is CF0-04's ticket (non-goal for
 * #164). For this slice the gate is presence-only: a section listed in the
 * shell's `sections[]` renders, anything else renders the forbidden view.
 * CF0-04 re-adds the server authorization seam here.
 */
export function GuardedSection({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: React.ReactNode;
}) {
  const { bootstrap } = useApp();
  const section = getSection(bootstrap.sections, sectionKey);

  if (!section) {
    return (
      <RecoveryView
        message={COPY.error.forbidden}
        safeHref={`/${firstSection(bootstrap.sections)}`}
      />
    );
  }

  return children;
}
