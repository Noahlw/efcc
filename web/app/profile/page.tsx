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
import { cn } from "@/lib/utils";

const scopeKindLabels = {
  Global: "全域",
  Department: "部門",
  Program: "課程",
} as const;

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={cn(
      "block size-5 shrink-0 fill-none stroke-[var(--ink-muted)] stroke-2 [stroke-linecap:round] [stroke-linejoin:round]",
      className
    )}
    viewBox="0 0 20 20"
    focusable="false"
  >
    <path d="m8 5 7 7-7 7" />
  </svg>
);

const ProfileContent = () => {
  const { bootstrap, signOut } = useApp();
  const [returnToScanner, setReturnToScanner] = useState(false);
  const { profile } = bootstrap;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnToScanner(
      params.get("from") === "scanner" && [...params.keys()].length === 1
    );
  }, []);

  if (!profile.name && !profile.username) {
    return (
      <div className="mx-auto w-full max-w-[680px] min-w-0 px-4 pb-8 text-[var(--ink)] min-[481px]:px-6">
        <header className="flex h-[72px] items-center font-semibold">
          {COPY.sections.profile}
        </header>
        {returnToScanner && (
          <Button
            asChild
            variant="link"
            className="min-h-11 rounded-[8px] px-0 font-bold text-[var(--accent-deep)] hover:text-[var(--accent)]"
          >
            <Link href="/scanner">{COPY.attendance.backToScan}</Link>
          </Button>
        )}
        <div className="py-2 pb-5">
          <h1 className="wrap-anywhere text-[clamp(1.72rem,6vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em]">
            {COPY.profile.title}
          </h1>
          <p className="mt-2 wrap-anywhere text-[0.96rem] leading-[1.6] text-[var(--ink-muted)]">
            {COPY.profile.subtitle}
          </p>
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
  const identities = profile.identities ?? [];

  return (
    <div className="mx-auto w-full max-w-[680px] min-w-0 px-4 pb-8 text-[var(--ink)] min-[481px]:px-6">
      <header className="flex h-[72px] items-center font-semibold">
        {COPY.sections.profile}
      </header>

      {returnToScanner && (
        <Button
          asChild
          variant="link"
          className="min-h-11 rounded-[8px] px-0 font-bold text-[var(--accent-deep)] hover:text-[var(--accent)]"
        >
          <Link href="/scanner">{COPY.attendance.backToScan}</Link>
        </Button>
      )}
      <div className="py-2 pb-5">
        <h1 className="wrap-anywhere text-[clamp(1.72rem,6vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em]">
          {COPY.profile.title}
        </h1>
        <p className="mt-2 wrap-anywhere text-[0.96rem] leading-[1.6] text-[var(--ink-muted)]">
          {COPY.profile.subtitle}
        </p>
      </div>

      <Card
        className="min-w-0 gap-0 overflow-visible rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center shadow-none ring-0 max-[799px]:p-5"
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
            className="mx-auto my-4 grid aspect-square w-[min(220px,72vw)] place-items-center overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 text-[var(--ink-muted)] [&>span]:grid [&>span]:h-full [&>span]:w-full [&>span]:place-items-center [&>span]:text-center [&>span]:font-mono [&>span]:text-[0.72rem] [&>span]:leading-[1.6] [&>span]:whitespace-pre-line [&_svg]:block [&_svg]:size-full"
          />
        ) : (
          <div className="min-w-0">
            <EmptyState
              title={COPY.profile.qrEmpty}
              message={COPY.profile.qrEmptyHint}
            />
          </div>
        )}
        <h2
          id="profile-qr-title"
          className="wrap-anywhere text-[1.42rem] font-semibold leading-tight tracking-[-0.02em]"
        >
          {displayName}
        </h2>
        <p className="mt-3">
          <Badge
            variant="outline"
            role="status"
            aria-label={statusText}
            data-profile-status={isActive ? "active" : "inactive"}
            className={`min-h-7 rounded-full px-2.5 ${
              isActive
                ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
                : "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
            }`}
          >
            {statusText}
          </Badge>
        </p>
      </Card>

      <Card
        className="mt-3 min-w-0 gap-0 overflow-visible rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-none ring-0 max-[799px]:p-4"
        role="region"
        aria-labelledby="profile-details-title"
      >
        <details className="group min-w-0">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">
            <span id="profile-details-title" className="min-w-0 wrap-anywhere">
              {COPY.profile.accountDetails}
            </span>
            <ChevronIcon className="transition-transform motion-reduce:transition-none group-open:rotate-90" />
          </summary>
          <dl className="grid min-w-0 gap-3 pt-3">
            <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-[0.9rem]">
              <dt className="text-[var(--ink-muted)]">
                {COPY.profile.username}
              </dt>
              <dd className="m-0 min-w-0 wrap-anywhere font-medium">
                {profile.username}
              </dd>
            </div>
            <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-[0.9rem]">
              <dt className="text-[var(--ink-muted)]">{COPY.profile.status}</dt>
              <dd className="m-0 min-w-0 wrap-anywhere font-medium">
                {profile.status}
              </dd>
            </div>
          </dl>
        </details>
      </Card>

      {identities.length > 0 && (
        <Card
          className="mt-3 min-w-0 gap-0 overflow-visible rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-none ring-0 max-[799px]:p-4"
          role="region"
          aria-labelledby="profile-identities-title"
        >
          <h2
            id="profile-identities-title"
            className="wrap-anywhere text-[1.1rem] font-semibold"
          >
            身份組
          </h2>
          <ul className="mt-3 grid min-w-0 gap-2.5">
            {identities.map((identity) => (
              <li
                className="grid min-w-0 gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3"
                key={`${identity.label}:${identity.scopeKind}:${identity.scopeLabel ?? ""}`}
              >
                <span className="min-w-0 wrap-anywhere font-semibold">
                  {identity.label}
                </span>
                <span
                  className="min-w-0 wrap-anywhere text-[0.84rem] text-[var(--ink-muted)]"
                  data-scope-kind={identity.scopeKind}
                >
                  {scopeKindLabels[identity.scopeKind]}（{identity.scopeKind}）
                  {identity.scopeLabel ? ` · ${identity.scopeLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section
        className="mt-[26px] min-w-0"
        aria-labelledby="profile-settings-title"
      >
        <h2
          id="profile-settings-title"
          className="mb-3 wrap-anywhere text-[1.1rem] font-semibold"
        >
          {COPY.profile.settingsTitle}
        </h2>
        <div className="grid min-w-0 gap-3">
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-[72px] w-full min-w-0 justify-between whitespace-normal rounded-[10px] border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 text-left text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <Link href="/profile/settings">
              <span className="grid min-w-0">
                <span className="min-w-0 wrap-anywhere font-semibold">
                  {COPY.profile.accountSettings}
                </span>
                <span className="mt-1 wrap-anywhere text-[0.86rem] text-[var(--ink-muted)]">
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
              className="h-auto min-h-[72px] w-full min-w-0 justify-between whitespace-normal rounded-[10px] border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 text-left text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              <Link href="/management?module=settings">
                <span className="grid min-w-0">
                  <span className="min-w-0 wrap-anywhere font-semibold">
                    {COPY.profile.settingsEntry}
                  </span>
                  <span className="mt-1 wrap-anywhere text-[0.86rem] text-[var(--ink-muted)]">
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
            className="h-auto min-h-[72px] w-full min-w-0 justify-between whitespace-normal rounded-[10px] border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 text-left text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            onClick={signOut}
          >
            <span className="min-w-0 wrap-anywhere font-semibold text-[var(--error)]">
              {COPY.profile.logout}
            </span>
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
