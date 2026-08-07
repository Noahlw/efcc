"use client";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

import styles from "./auth-shell.module.css";

/**
 * Squar-cut seal mark (恩) — the brand's carved-stamp identity (Spec 079 §1).
 * Structured as a replaceable slot ready for future official icon replacement.
 */
function SealSlot() {
  return (
    <span className={styles.seal} aria-hidden="true">
      恩
    </span>
  );
}

/**
 * Authenticated shell header (matrix S15 `MockHeader`): brand seal + official
 * full church title + 登出 control. Rendered as a flex-shrink:0 sibling of the
 * scrollable `.shell-content` outlet inside Ui01Shell's `.shell` flex column.
 */
export function ShellHeader() {
  const { signOut } = useApp();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <SealSlot />
        <span className={styles.title}>{COPY.appFullName}</span>
      </div>
      <button type="button" className={styles.signOut} onClick={signOut}>
        {COPY.logout.submit}
      </button>
    </header>
  );
}