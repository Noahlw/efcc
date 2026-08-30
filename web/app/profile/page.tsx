"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { EmptyState } from "@/lib/empty-state";
import { QrCode } from "@/lib/qr-code";
import { isPermitted } from "@/lib/sections";

import styles from "./profile.module.css";

const ChevronIcon = () => (
  <svg
    aria-hidden="true"
    className={styles.chevron}
    viewBox="0 0 20 20"
    focusable="false"
  >
    <path
      d="m7 4 5 6-5 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  </svg>
);
const ProfileContent = () => {
  const { bootstrap, signOut } = useApp();
  const [returnToScanner, setReturnToScanner] = useState(false);
  const { profile } = bootstrap;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnToScanner(params.get("from") === "scanner");
  }, []);

  if (!profile.name && !profile.username) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <span>{COPY.sections.profile}</span>
        </header>
        {returnToScanner && (
          <Button
            asChild
            variant="link"
            className={`${styles.backLink} min-h-11 rounded-[8px] px-0 text-[var(--accent-deep)] font-bold hover:text-[var(--accent)]`}
          >
            <Link href="/scanner">{COPY.attendance.backToScan}</Link>
          </Button>
        )}
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
  const isActive = /^(?:active|enabled|有效|已啟用)$/iu.test(
    profile.status.trim()
  );
  const statusText = isActive ? COPY.profile.statusValid : profile.status;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span>{COPY.sections.profile}</span>
      </div>

      {returnToScanner && (
        <Button
          asChild
          variant="link"
          className={`${styles.backLink} min-h-11 rounded-[8px] px-0 text-[var(--accent-deep)] font-bold hover:text-[var(--accent)]`}
        >
          <Link href="/scanner">{COPY.attendance.backToScan}</Link>
        </Button>
      )}
      <div className={styles.intro}>
        <h1>{COPY.profile.title}</h1>
        <p>{COPY.profile.subtitle}</p>
      </div>

      <Card
        className={`${styles.qrCard} gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] shadow-none ring-0`}
        role="article"
        aria-labelledby="profile-qr-title"
      >
        <Badge
          variant="outline"
          className="min-h-7 rounded-full border-[var(--line)] bg-[var(--surface-raised)] px-2.5 text-[var(--ink-muted)]"
        >
          {COPY.profile.qrBadge}
        </Badge>
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
          <Badge
            variant="outline"
            className="min-h-7 rounded-full border-[var(--success-border)] bg-[var(--success-surface)] px-2.5 text-[var(--success)]"
          >
            {statusText}
          </Badge>
        </p>
      </Card>

      <Card
        className={`${styles.detailsCard} gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] shadow-none ring-0`}
        role="region"
        aria-labelledby="profile-details-title"
      >
        <details className={styles.details}>
          <summary>
            <span id="profile-details-title">
              {COPY.profile.accountDetails}
            </span>
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
              <dd>{profile.systemRole ?? "會友"}</dd>
            </div>
            {profile.identities && profile.identities.length > 0 && (
              <div className={styles.detailRow}>
                <dt>身份組</dt>
                <dd>
                  {profile.identities
                    .map((identity) =>
                      identity.scopeLabel
                        ? `${identity.label}（${identity.scopeLabel}）`
                        : identity.label
                    )
                    .join("、")}
                </dd>
              </div>
            )}
            <div className={styles.detailRow}>
              <dt>{COPY.profile.status}</dt>
              <dd>{profile.status}</dd>
            </div>
          </dl>
        </details>
      </Card>

      <section
        className={styles.actions}
        aria-labelledby="profile-settings-title"
      >
        <h2 id="profile-settings-title">{COPY.profile.settingsTitle}</h2>
        <div className={styles.actionList}>
          <Button
            asChild
            variant="outline"
            className={`${styles.actionRow} whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`}
          >
            <Link href="/profile/settings">
              <span>
                <span className={styles.actionTitle}>
                  {COPY.profile.accountSettings}
                </span>
                <span className={styles.actionDescription}>
                  {COPY.profile.accountSettingsHint}
                </span>
              </span>
              <ChevronIcon />
            </Link>
          </Button>
          {isPermitted(bootstrap.sections, "management") ? (
            <Button
              asChild
              variant="outline"
              className={`${styles.actionRow} whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`}
            >
              <Link href="/management?module=settings">
                <span>
                  <span className={styles.actionTitle}>
                    {COPY.profile.settingsEntry}
                  </span>
                  <span className={styles.actionDescription}>
                    {COPY.profile.settingsEntryHint}
                  </span>
                </span>
                <ChevronIcon />
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={`${styles.actionRow} whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`}
            onClick={signOut}
          >
            <span className={styles.logoutTitle}>{COPY.profile.logout}</span>
            <ChevronIcon />
          </Button>
        </div>
      </section>
    </div>
  );
};

const ProfilePage = () => (
  <AppShell>
    <ProfileContent />
  </AppShell>
);

export default ProfilePage;
