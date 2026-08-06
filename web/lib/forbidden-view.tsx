"use client";

import Link from "next/link";

import { COPY } from "@/lib/copy";

import styles from "./auth-shell.module.css";

/**
 * Forbidden / error-403 state (matrix S13). Alert block + secondary action
 * `返回個人檔案` routed to a safe section. Used by `GuardedSection` for
 * unauthorized (absent) sections and by the shell for a FORBIDDEN restore.
 */
export function ForbiddenView({ safeHref }: { safeHref: string }) {
  return (
    <main className={styles.state}>
      <div className={styles.alert} role="alert">
        {COPY.error.forbidden}
      </div>
      <Link className={styles.btnSecondary} href={safeHref}>
        {COPY.nav.backToProfile}
      </Link>
    </main>
  );
}