"use client";

import Link from "next/link";

import { isPermitted } from "@/lib/sections";
import { AppShell } from "@/lib/app-shell";
import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { EmptyState } from "@/lib/empty-state";
import { QrCode } from "@/lib/qr-code";

import styles from "./profile.module.css";

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.chevron}
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path d="m7 4 5 6-5 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ProfileContent() {
  const { bootstrap, signOut } = useApp();
  const profile = bootstrap.profile;

  if (!profile.name && !profile.username) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <span>{COPY.sections.profile}</span>
        </header>
        <div className={styles.intro}>
          <h1>{COPY.profile.title}</h1>
          <p>{COPY.profile.subtitle}</p>
        </div>
        <EmptyState title={COPY.empty.title} message={COPY.profile.qrEmpty} />
      </div>
    );
  }

  const displayName = profile.name || profile.username;
  const hasQrCode = Boolean(profile.qrCodeString);
  const isActive = /^(active|enabled|有效|已啟用)$/i.test(profile.status.trim());
  const statusText = isActive ? COPY.profile.statusValid : profile.status;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span>{COPY.sections.profile}</span>
      </div>

      <div className={styles.intro}>
        <h1>{COPY.profile.title}</h1>
        <p>{COPY.profile.subtitle}</p>
      </div>

      <article className={styles.qrCard} aria-labelledby="profile-qr-title">
        <span className={styles.badge}>{COPY.profile.qrBadge}</span>
        {hasQrCode ? (
          <QrCode
            value={profile.qrCodeString}
            label={COPY.profile.qrCode}
            className={styles.qrDisplay}
          />
        ) : (
          <div className={styles.emptyQr}>
            <EmptyState
              title={COPY.profile.qrEmpty}
              message={COPY.profile.qrEmptyHint}
            />
          </div>
        )}
        <h2 id="profile-qr-title">{displayName}</h2>
        <p className={styles.statusText}>
          <span className={styles.statusBadge}>{statusText}</span>
        </p>
      </article>

      <section className={styles.detailsCard} aria-labelledby="profile-details-title">
        <details className={styles.details}>
          <summary>
            <span id="profile-details-title">{COPY.profile.accountDetails}</span>
            <ChevronIcon />
          </summary>
          <dl className={styles.detailList}>
            <div className={styles.detailRow}>
              <dt>{COPY.profile.username}</dt>
              <dd>{profile.username}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.profile.phone}</dt>
              <dd>{profile.phone}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.profile.role}</dt>
              <dd>{profile.role}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.profile.status}</dt>
              <dd>{profile.status}</dd>
            </div>
          </dl>
        </details>
      </section>

      <section className={styles.actions} aria-labelledby="profile-settings-title">
        <h2 id="profile-settings-title">{COPY.profile.settingsTitle}</h2>
        <div className={styles.actionList}>
          <Link href="/profile/settings" className={styles.actionRow}>
            <span>
              <span className={styles.actionTitle}>{COPY.profile.accountSettings}</span>
              <span className={styles.actionDescription}>
                {COPY.profile.accountSettingsHint}
              </span>
            </span>
            <ChevronIcon />
          </Link>
          {isPermitted(bootstrap.sections, "management") ? (
            <Link
              href="/management?module=settings"
              className={styles.actionRow}
            >
              <span>
                <span className={styles.actionTitle}>{COPY.profile.settingsEntry}</span>
                <span className={styles.actionDescription}>
                  {COPY.profile.settingsEntryHint}
                </span>
              </span>
              <ChevronIcon />
            </Link>
          ) : null}
          <button type="button" className={styles.actionRow} onClick={signOut}>
            <span className={styles.logoutTitle}>{COPY.profile.logout}</span>
            <ChevronIcon />
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}