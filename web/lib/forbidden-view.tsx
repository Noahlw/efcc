"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";

/**
 * Forbidden / error-403 state (matrix S13). Alert block + secondary action
 * `返回個人檔案` routed to a safe section. Used by `GuardedSection` for
 * unauthorized (absent) sections and by the shell for a FORBIDDEN restore.
 */
export const ForbiddenView = ({
  safeHref,
  onSignOut,
}: {
  safeHref: string;
  onSignOut?: () => void;
}) => (
  <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-[2rem_clamp(1rem,4vw,2rem)] text-center bg-[var(--surface)] text-[var(--ink)]">
    <Alert variant="destructive" className="w-full max-w-[480px] mx-auto">
      {COPY.error.forbidden}
    </Alert>
    {onSignOut && (
      <Button
        type="button"
        onClick={onSignOut}
        className="min-h-11 rounded-[8px] bg-[var(--accent)] px-6 text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
      >
        {COPY.logout.forbiddenAction}
      </Button>
    )}
    <Button
      asChild
      variant="outline"
      className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-transparent px-6 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
    >
      <Link href={safeHref}>{COPY.nav.backToProfile}</Link>
    </Button>
  </main>
);
