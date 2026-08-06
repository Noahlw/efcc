"use client";

import styles from "./auth-shell.module.css";

/**
 * Empty-data state (matrix S12): centered layout, high-contrast text,
 * screen-reader readable via an explicit status region. Reusable by any
 * authenticated data view (e.g. section pages with no rows).
 */
export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className={styles.empty} role="status">
      <span className={styles.emptyIcon} aria-hidden="true">
        —
      </span>
      <span className={styles.emptyTitle}>{title}</span>
      <span>{message}</span>
    </div>
  );
}