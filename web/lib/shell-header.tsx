"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { AttentionPanel, EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import type { AttentionData } from "@/lib/attention-panel";
import { COPY } from "@/lib/copy";

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
  const [attentionOpenPath, setAttentionOpenPath] = useState<string | null>(
    null
  );
  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    previousPathnameRef.current = pathname;
    setAttentionOpenPath(null);
  }, [pathname]);
  const attentionOpen =
    previousPathnameRef.current === pathname && attentionOpenPath === pathname;
  const bellRef = useRef<HTMLButtonElement>(null);

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
  const identityLabel =
    Array.isArray(bootstrap?.profile?.identities) &&
    bootstrap.profile.identities.length > 0
      ? bootstrap.profile.identities.map((entry) => entry.label).join("、")
      : "會友基礎";
  const unreadNoticeCount = attentionData.notices.filter(
    (notice) => notice.unread
  ).length;
  const attentionCount = attentionData.pendingItems.length + unreadNoticeCount;

  return (
    <>
      <header
        data-shell-header
        className="shrink-0 flex items-center justify-between gap-4 py-3 px-[clamp(1rem,3vw,1.5rem)] bg-[var(--surface-raised)] border-b border-[var(--line)]"
      >
        <div className="flex items-center gap-[0.65rem] min-w-0">
          {isManagement ? (
            <>
              <span className="shrink-0 text-[var(--accent)] text-base font-[850] tracking-[-0.02em]">
                {COPY.shell.shortMark}
              </span>
              <div className="flex flex-col items-start gap-[0.1rem] min-w-0 p-[0.3rem_0.55rem] rounded-[var(--radius-sm,8px)] text-left">
                <span className="overflow-hidden max-w-[min(28vw,220px)] text-[var(--ink)] text-[0.9rem] font-extrabold truncate">
                  {displayName}
                </span>
                <span className="text-[var(--ink-muted)] text-xs font-[650] whitespace-nowrap">
                  {identityLabel}
                </span>
              </div>
            </>
          ) : (
            <span className="text-base font-extrabold tracking-[-0.01em] text-[var(--ink)] truncate">
              {pathname === "/home" ? COPY.shell.shortMark : sectionTitle}
            </span>
          )}
        </div>

        {isManagement && pathname !== "/programs" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              ref={bellRef}
              type="button"
              variant="ghost"
              size="icon"
              className="relative size-11 rounded-full border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--accent)]"
              aria-label={COPY.attention.bellLabel(attentionCount)}
              aria-haspopup="dialog"
              aria-expanded={attentionOpen}
              onClick={() => setAttentionOpenPath(pathname)}
            >
              <BellIcon />
              <Badge
                variant="default"
                className="absolute -top-[0.2rem] -right-[0.2rem] min-w-[1.15rem] h-[1.15rem] leading-none"
                aria-hidden="true"
              >
                {attentionCount}
              </Badge>
            </Button>
          </div>
        ) : null}
      </header>

      {pathname !== "/programs" && (
        <AttentionPanel
          open={attentionOpen}
          onClose={() => setAttentionOpenPath(null)}
          data={attentionData}
          onCloseAutoFocus={() => bellRef.current?.focus()}
        />
      )}
    </>
  );
};
