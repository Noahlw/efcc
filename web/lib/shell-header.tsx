"use client";

import { Bell, Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/app-context";
import { AttentionPanel, EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import type { AttentionData } from "@/lib/attention-panel";
import { COPY } from "@/lib/copy";
import { ScreenIconButton } from "@/lib/screen-foundations";

export const ShellHeader = ({
  attentionData = EMPTY_ATTENTION_DATA,
}: {
  attentionData?: AttentionData;
}) => {
  const { bootstrap } = useApp();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const isPrograms =
    pathname === "/programs" || pathname.startsWith("/programs/");
  const currentMode =
    searchParams.get("mode") === "management" ? "management" : "participant";
  const modeHref =
    currentMode === "management" ? "/programs" : "/programs?mode=management";
  const showModeControl = isPrograms && isManagement;
  const unreadNoticeCount = attentionData.notices.filter(
    (notice) => notice.unread
  ).length;
  const attentionCount = attentionData.pendingItems.length + unreadNoticeCount;

  return (
    <>
      <header
        data-shell-header
        data-screen-foundation="shell-header"
        className="shell-top shrink-0"
      >
        <div className="brand min-w-0" aria-label={COPY.shell.shortMark}>
          {COPY.shell.shortMark}
        </div>

        <div className="shell-actions">
          {showModeControl ? (
            <ScreenIconButton
              asChild
              aria-label={
                currentMode === "management"
                  ? COPY.programs.enterParticipant
                  : COPY.programs.enterManagement
              }
              title={
                currentMode === "management"
                  ? COPY.programs.enterParticipant
                  : COPY.programs.enterManagement
              }
            >
              <Link href={modeHref}>
                {currentMode === "management" ? (
                  <UserRound aria-hidden="true" />
                ) : (
                  <Briefcase aria-hidden="true" />
                )}
              </Link>
            </ScreenIconButton>
          ) : null}

          {isManagement && !isPrograms ? (
            <ScreenIconButton
              ref={bellRef}
              type="button"
              className="relative border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--accent)]"
              aria-label={COPY.attention.bellLabel(attentionCount)}
              aria-haspopup="dialog"
              aria-expanded={attentionOpen}
              onClick={() => setAttentionOpenPath(pathname)}
            >
              <Bell aria-hidden="true" />
              <Badge
                variant="default"
                className="absolute -top-[0.2rem] -right-[0.2rem] min-w-[1.15rem] h-[1.15rem] leading-none"
                aria-hidden="true"
              >
                {attentionCount}
              </Badge>
            </ScreenIconButton>
          ) : null}
        </div>
      </header>

      {!isPrograms && (
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
