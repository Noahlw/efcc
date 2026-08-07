"use client";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

import styles from "./auth-shell.module.css";

/**
 * Authenticated shell header (matrix S15 `MockHeader`): official
 * full church title + 登出 control. Rendered as a flex-shrink:0 sibling of the
 * scrollable `.shell-content` outlet inside Ui01Shell's `.shell` flex column.
 */
export function ShellHeader() {
  const { signOut } = useApp();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.title}>{COPY.appFullName}</span>
      </div>
      <button type="button" className={styles.signOut} onClick={signOut}>
        {COPY.logout.submit}
      </button>
    </header>
  );
}