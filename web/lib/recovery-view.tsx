"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";

import styles from "./auth-shell.module.css";

/**
 * Transient network-error recovery state (matrix S14): alert block + primary
 * `重試連接` action + secondary route home. Announces the message for screen
 * readers and moves focus in so the state is immediately reachable.
 */
export const RecoveryView = ({
  message,
  safeHref,
  onRetry,
  safeLabel = COPY.nav.backToHome,
}: {
  message: string;
  safeHref: string;
  onRetry?: () => void;
  safeLabel?: string;
}) => {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveRef.current?.focus();
    announce(message);
  }, [message]);

  return (
    <main className={styles.state} ref={liveRef} tabIndex={-1}>
      <Alert variant="destructive" className={styles.alert}>
        {message}
      </Alert>
      {onRetry && (
        <Button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-[8px] bg-[var(--accent)] px-6 text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
        >
          {COPY.error.retry}
        </Button>
      )}
      <Button
        asChild
        variant="outline"
        className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-transparent px-6 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      >
        <Link href={safeHref}>{safeLabel}</Link>
      </Button>
    </main>
  );
};
