"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";

import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";

import styles from "./auth-shell.module.css";

/**
 * Transient network-error recovery state (matrix S14): alert block + primary
 * `重試連接` action + secondary route home. Announces the message for screen
 * readers and moves focus in so the state is immediately reachable.
 */
export function RecoveryView({
  message,
  safeHref,
  onRetry,
}: {
  message: string;
  safeHref: string;
  onRetry?: () => void;
}) {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveRef.current?.focus();
    announce(message);
  }, [message]);

  return (
    <main className={styles.state} ref={liveRef} tabIndex={-1}>
      <div className={styles.alert} role="alert">
        {message}
      </div>
      {onRetry && (
        <button type="button" className={styles.btnPrimary} onClick={onRetry}>
          {COPY.error.retry}
        </button>
      )}
      <Link className={styles.btnSecondary} href={safeHref}>
        {COPY.nav.backToHome}
      </Link>
    </main>
  );
}