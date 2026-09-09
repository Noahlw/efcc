"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the accessible status role contract */

/**
 * Empty-data state (matrix S12): centered layout, high-contrast text,
 * screen-reader readable via an explicit status region. Reusable by any
 * authenticated data view (e.g. section pages with no rows).
 */
export const EmptyState = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <div
    className="flex flex-col items-center gap-3 text-[var(--ink-muted)]"
    role="status"
  >
    <span
      className="flex size-10 items-center justify-center rounded-full border-2 border-[var(--line-strong)] text-[1.1rem] font-extrabold text-[var(--ink-muted)]"
      aria-hidden="true"
    >
      —
    </span>
    <span className="text-[1.35rem] font-extrabold text-[var(--ink)]">
      {title}
    </span>
    <span>{message}</span>
  </div>
);
