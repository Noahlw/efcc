"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { BackIcon } from "./settings-ui";

import styles from "./management-action-framework.module.css";

export function safeManagementReturnHref(
  value: string | null,
  fallback: string
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  try {
    const candidate = new URL(value, "https://efcc.internal");
    if (
      candidate.pathname !== "/management" &&
      !candidate.pathname.startsWith("/management/")
    ) {
      return fallback;
    }
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

export const ManagementPageHeader = ({
  action,
  backHref,
  backLabel,
  lead,
  title,
}: {
  action?: ReactNode;
  backHref: string;
  backLabel: string;
  lead: string;
  title: string;
}) => (
  <header className={styles.header}>
    <Link className={styles.back} href={backHref}>
      <BackIcon />
      <span>{backLabel}</span>
    </Link>
    <div className={styles.titleRow}>
      <div>
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  </header>
);

export const ManagementStickyActionBar = ({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) => (
  <section aria-label={label} className={styles.stickyBar}>
    {children}
  </section>
);

export const ManagementFilterSheet = ({
  children,
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} role="presentation">
      <dialog aria-label={label} className={styles.sheet} open>
        <button
          aria-label={`關閉${label}`}
          className={styles.close}
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          ×
        </button>
        {children}
      </dialog>
    </div>
  );
};
