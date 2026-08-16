import Link from "next/link";

import styles from "./management-settings.module.css";

export function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.backIcon}
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.chevron}
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path d="m8 5 7 7-7 7" />
    </svg>
  );
}

export function SettingsBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link href={href} className={styles.back}>
      <BackIcon />
      <span>{label}</span>
    </Link>
  );
}

type SettingsRowProps = {
  label: string;
  description?: string;
  href?: string;
  showChevron?: boolean;
};

export function SettingsRow({
  label,
  description,
  href,
  showChevron = Boolean(href),
}: SettingsRowProps) {
  const content = (
    <>
      <span className={styles.rowCopy}>
        <span className={styles.rowLabel}>{label}</span>
        {description && (
          <span className={styles.rowDescription}>{description}</span>
        )}
      </span>
      {showChevron && <ChevronIcon />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${styles.row} ${styles.rowLink}`}>
        {content}
      </Link>
    );
  }

  return <div className={styles.row}>{content}</div>;
}

export function SettingsDetailCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.detailCard}>{children}</div>;
}

export function SettingsDetailList({
  children,
  separated = false,
}: {
  children: React.ReactNode;
  separated?: boolean;
}) {
  return (
    <div
      className={`${styles.detailList} ${separated ? styles.detailListSeparated : ""}`}
    >
      {children}
    </div>
  );
}

export function SettingsDetailRow({
  label,
  description,
  value,
  enabled = false,
}: {
  label: string;
  description: string;
  value: string;
  enabled?: boolean;
}) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.rowCopy}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowDescription}>{description}</span>
      </span>
      <span className={`${styles.pill} ${enabled ? styles.enabled : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function SettingsPill({ children }: { children: React.ReactNode }) {
  return <span className={styles.pill}>{children}</span>;
}
