"use client";

import { AppShell } from "@/lib/app-shell";
import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { EmptyState } from "@/lib/empty-state";

import { AccountSettings } from "./account-settings";
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

  const avatarChar = Array.from(p.name || "恩")[0] ?? "恩";
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
          <div
            className={styles.qrSquare}
            role="img"
            aria-label={COPY.profile.qrCode}
          >
            <span className={styles.qrText}>{p.qrCodeString}</span>
          </div>
        ) : (
          <EmptyState title={COPY.profile.qrCode} message={COPY.profile.qrEmpty} />
        )}
      </div>

      <AccountSettings />
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