"use client";

import Link from "next/link";

import { AppShell } from "@/lib/app-shell";
import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { EmptyState } from "@/lib/empty-state";
import { QrCode } from "@/lib/qr-code";

import styles from "./profile.module.css";

function ProfileContent() {
  const { bootstrap } = useApp();
  const p = bootstrap.profile;

  // Defensive empty guard: a profile with no identity data renders the shared
  // empty state (S12) instead of a blank surface.
  if (!p.name && !p.username) {
    return (
      <div className={styles.page}>
        <EmptyState title={COPY.empty.title} message={COPY.profile.qrEmpty} />
      </div>
    );
  }

  const avatarChar = Array.from(p.name || p.username || "?")[0] ?? "?";
  const hasQr = Boolean(p.qrCodeString);

  return (
    <div className={styles.page}>
      <div className={styles.profileBar}>
        <div className={styles.avatar} aria-hidden="true">
          {avatarChar}
        </div>
        <div className={styles.profileMeta}>
          <span className={styles.profileName}>{p.name}</span>
          <span className={styles.profileUsername}>{p.username}</span>
          <span className={styles.roleTag}>{p.role}</span>
        </div>
      </div>

      <div className={styles.infoGrid}>
        <dl className={styles.infoCell}>
          <dt>{COPY.profile.phone}</dt>
          <dd>{p.phone}</dd>
        </dl>
        <dl className={styles.infoCell}>
          <dt>{COPY.profile.status}</dt>
          <dd>{p.status}</dd>
        </dl>
      </div>

      <div className={styles.qrCenter}>
        {hasQr ? (
          <QrCode
            value={p.qrCodeString}
            label={COPY.profile.qrCode}
            className={styles.qrSquare}
          />
        ) : (
          <EmptyState title={COPY.profile.qrCode} message={COPY.profile.qrEmpty} />
        )}
      </div>

      <Link href="/profile/settings" className={styles.settingsAction}>
        <span className={styles.settingsActionTitle}>
          {COPY.profile.accountSettings}
        </span>
        <span className={styles.settingsActionHint}>
          {COPY.profile.accountSettingsHint}
        </span>
      </Link>
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