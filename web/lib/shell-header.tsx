"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { AttentionPanel, EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import type { AttentionData } from "@/lib/attention-panel";
import { COPY } from "@/lib/copy";

import styles from "./auth-shell.module.css";

const BellIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="21"
    height="21"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
  >
    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10 21h4" />
  </svg>
);

export const ShellHeader = ({
  attentionData = EMPTY_ATTENTION_DATA,
}: {
  attentionData?: AttentionData;
}) => {
  const { bootstrap } = useApp();
  const pathname = usePathname();
  const [attentionOpen, setAttentionOpen] = useState(false);

  const isScanner = pathname === "/scanner" || pathname.startsWith("/scanner/");
  if (isScanner) {
    return null;
  }

  const isManagement = bootstrap.navigation.some(
    (section) => section.key === "management"
  );
  // Sub-pages reached via a link (not a nav-dock item) still want a
  // contextual header title instead of falling back to the org short mark.
  const NON_DOCK_SECTION_TITLES: Record<string, string> = {
    messages: COPY.home.churchNews,
  };
  const currentSection = pathname.replace(/^\//u, "").split("/")[0] || "home";
  const sectionTitle =
    bootstrap.navigation.find((section) => section.key === currentSection)
      ?.label ??
    NON_DOCK_SECTION_TITLES[currentSection] ??
    COPY.shell.shortMark;
  const displayName = bootstrap.profile.name || bootstrap.profile.username;
  const roleLabel =
    COPY.shell.roleLabels[
      bootstrap.profile.role as keyof typeof COPY.shell.roleLabels
    ] ?? bootstrap.profile.role;
  const unreadNoticeCount = attentionData.notices.filter(
    (notice) => notice.unread
  ).length;
  const attentionCount = attentionData.pendingItems.length + unreadNoticeCount;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          {isManagement ? (
            <>
              <span className={styles.shortMark}>{COPY.shell.shortMark}</span>
              <div className={styles.identityBlock}>
                <span className={styles.identityName}>{displayName}</span>
                <span className={styles.identityRole}>{roleLabel}</span>
              </div>
            </>
          ) : (
            <span className={styles.title}>
              {pathname === "/home" ? COPY.shell.shortMark : sectionTitle}
            </span>
          )}
        </div>

        {isManagement ? (
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`${styles.bell} size-11 rounded-full border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--accent)]`}
              aria-label={COPY.attention.bellLabel(attentionCount)}
              aria-haspopup="dialog"
              aria-expanded={attentionOpen}
              onClick={() => setAttentionOpen(true)}
            >
              <BellIcon />
              <Badge
                variant="default"
                className={styles.bellBadge}
                aria-hidden="true"
              >
                {attentionCount}
              </Badge>
            </Button>
          </div>
        ) : null}
      </header>

      <AttentionPanel
        open={attentionOpen}
        onClose={() => setAttentionOpen(false)}
        data={attentionData}
      />
    </>
  );
};
