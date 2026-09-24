"use client";

import { Bell, Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/app-context";
import { AttentionPanel, EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import type { AttentionData } from "@/lib/attention-panel";
import { COPY } from "@/lib/copy";
import { getManagementAccess } from "@/lib/programs/program-api";
import type { ProgramsManagementAccess } from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { ScreenIconButton } from "@/lib/screen-foundations";
import { useAsyncResource } from "@/lib/use-async-resource";

type ProgramsAccessState =
  | { kind: "loading" }
  | { kind: "ready"; projection: ProgramsManagementAccess }
  | { kind: "error" };

function navigateProgramsMode(
  event: MouseEvent<HTMLAnchorElement>,
  href: string
): void {
  const target = event.currentTarget.getAttribute("target");
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (target !== null && target !== "" && target !== "_self") ||
    event.currentTarget.hasAttribute("download")
  ) {
    return;
  }

  event.preventDefault();
  window.history.pushState(
    { efccSection: "programs" },
    "",
    `${href}${window.location.hash}`
  );
}

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
  const isPrograms =
    pathname === "/programs" || pathname.startsWith("/programs/");
  const currentMode =
    searchParams.get("mode") === "management" ? "management" : "participant";
  const modeHref = buildProgramsHref({
    mode: currentMode === "management" ? "participant" : "management",
    programId:
      currentMode === "management" && searchParams.has("task")
        ? null
        : (searchParams.get("program") ?? searchParams.get("programId")),
    departmentId: searchParams.get("department"),
  });
  const programsRouteKey = `${pathname}?${searchParams.toString()}`;
  const { state: programsAccess, run: loadProgramsAccess } = useAsyncResource<
    ProgramsManagementAccess,
    ProgramsAccessState
  >(
    () => getManagementAccess(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (projection) => ({ kind: "ready", projection }),
      onError: () => ({ kind: "error" }),
    },
    [programsRouteKey]
  );
  const [visibleProgramsAccess, setVisibleProgramsAccess] =
    useState<ProgramsManagementAccess | null>(null);
  useEffect(() => {
    if (!isPrograms) {
      setVisibleProgramsAccess(null);
      return;
    }
    if (programsAccess.kind === "ready") {
      setVisibleProgramsAccess(programsAccess.projection);
    } else if (programsAccess.kind === "error") {
      setVisibleProgramsAccess(null);
    }
  }, [isPrograms, programsAccess]);
  useEffect(() => {
    if (!isPrograms) {
      return;
    }
    const request = { cancelled: false };
    void loadProgramsAccess(request);
    return () => {
      request.cancelled = true;
    };
  }, [isPrograms, loadProgramsAccess]);

  if (isScanner) {
    return null;
  }

  const isManagement = bootstrap.navigation.some(
    (section) => section.key === "management"
  );
  const showModeControl =
    isPrograms && visibleProgramsAccess?.hasManagementCapability === true;
  const showProgramsNotification =
    showModeControl && currentMode === "management";
  const programsNotificationHref =
    "/programs?mode=management&task=notifications";
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
              tone="soft"
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
              <Link
                href={modeHref}
                onClick={(event) => navigateProgramsMode(event, modeHref)}
              >
                {currentMode === "management" ? (
                  <UserRound aria-hidden="true" />
                ) : (
                  <Briefcase aria-hidden="true" />
                )}
              </Link>
            </ScreenIconButton>
          ) : null}

          {showProgramsNotification ? (
            <ScreenIconButton
              asChild
              aria-label={COPY.programs.notificationBellTitle}
              title={COPY.programs.notificationBellTitle}
              className="relative"
            >
              <Link
                href={programsNotificationHref}
                onClick={(event) =>
                  navigateProgramsMode(event, programsNotificationHref)
                }
              >
                <Bell aria-hidden="true" />
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
