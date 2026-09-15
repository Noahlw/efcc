"use client";

import { useCallback, useEffect, useState } from "react";
import type { MouseEventHandler, ReactNode } from "react";

import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { ScreenHeader } from "@/lib/screen-foundations";

import { ProgramSettings, SettingsHub } from "./program-settings";
import type { ProgramSettingsSection } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import { hasModule, useWorkspaceTaskContext } from "./workspace-context";

export const SettingsTask = ({
  onFocusChange,
  onDirtyChange,
  navigationBlocked = false,
  onNavigationBlocked,
  headerAction,
}: {
  onFocusChange?: (focused: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  navigationBlocked?: boolean;
  onNavigationBlocked?: (blocked: boolean) => void;
  headerAction?: ReactNode;
} = {}) => {
  const {
    program,
    modules,
    onTaskChange,
    onWorkspaceRefresh,
    onMutationBlockChange,
    departmentId,
    hash,
  } = useWorkspaceTaskContext();
  const [section, setSection] = useState<ProgramSettingsSection | null>(null);
  const [focusedDirty, setFocusedDirty] = useState(false);
  const returnHref = buildProgramsHref({
    mode: "management",
    programId: program.program_id,
    departmentId,
    task: "settings",
    hash,
  });

  const accessAvailable =
    (program.capabilities.manage || program.capabilities.leader_assign) &&
    program.capabilities.role_read === true &&
    (program.capabilities.role_assign === true ||
      program.capabilities.role_revoke === true);
  const accessHref = `/management?module=accounts&scopeKind=Program&scopeId=${encodeURIComponent(program.program_id)}&view=access&return=${encodeURIComponent(returnHref)}`;
  const scheduleHref = buildProgramsHref({
    mode: "management",
    programId: program.program_id,
    departmentId,
    task: "schedule",
    hash,
  });
  const notificationsHref = buildProgramsHref({
    mode: "management",
    departmentId,
    task: "notifications",
    hash,
  });

  const focusedTitle =
    section === "basics"
      ? COPY.programs.settingsBasics
      : section === "publishing"
        ? COPY.programs.settingsPublishing
        : section === "enrollment"
          ? COPY.programs.settingsEnrollment
          : section === "attendance"
            ? COPY.programs.settingsAttendance
            : COPY.programs.schedulePageTitle;
  const focusedLead =
    section === "basics"
      ? COPY.programs.settingsBasicsLead
      : section === "publishing"
        ? COPY.programs.settingsPublishingLead
        : section === "enrollment"
          ? COPY.programs.settingsEnrollmentLead
          : section === "attendance"
            ? COPY.programs.settingsAttendanceLead
            : COPY.programs.schedulePageLead;
  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      setFocusedDirty(dirty);
      if (!dirty) {
        onNavigationBlocked?.(false);
      }
      onDirtyChange?.(dirty);
    },
    [onDirtyChange, onNavigationBlocked]
  );
  const blockNavigation = useCallback(() => {
    onNavigationBlocked?.(true);
    announce(COPY.programs.settingsUnsaved);
  }, [onNavigationBlocked]);

  useEffect(() => {
    if (!focusedDirty) {
      return;
    }

    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const rawHref = anchor.getAttribute("href");
      if (rawHref?.startsWith("#")) {
        return;
      }
      if (anchor.hasAttribute("download")) {
        return;
      }
      const anchorTarget = anchor.getAttribute("target");
      if (
        anchorTarget !== null &&
        anchorTarget !== "" &&
        anchorTarget.toLowerCase() !== "_self"
      ) {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (
        (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") ||
        nextUrl.origin !== currentUrl.origin ||
        (nextUrl.pathname === currentUrl.pathname &&
          nextUrl.search === currentUrl.search &&
          nextUrl.hash !== currentUrl.hash)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      blockNavigation();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [blockNavigation, focusedDirty]);

  const handleFocusedBack: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (focusedDirty) {
      event.preventDefault();
      blockNavigation();
      return;
    }
    event.preventDefault();
    onFocusChange?.(false);
    handleDirtyChange(false);
    setSection(null);
  };

  const handleSectionSelect = (nextSection: ProgramSettingsSection) => {
    onFocusChange?.(true);
    handleDirtyChange(false);
    setSection(nextSection);
  };

  return section === null ? (
    <SettingsHub
      program={program}
      eventsEnabled={hasModule(modules, "events")}
      attendanceEnabled={hasModule(modules, "attendance")}
      onSelect={handleSectionSelect}
      accessHref={accessAvailable ? accessHref : undefined}
      scheduleHref={scheduleHref}
      notificationsHref={notificationsHref}
    />
  ) : (
    <section
      className="grid min-w-0 gap-[var(--screen-section-gap)]"
      aria-labelledby="program-settings-focused-title"
    >
      <ScreenHeader
        level="child"
        title={focusedTitle}
        lead={focusedLead}
        headingId="program-settings-focused-title"
        backHref={returnHref}
        backLabel={COPY.programs.settingsBackToHub}
        backReplace
        onBack={handleFocusedBack}
        action={headerAction}
      />
      <ProgramSettings
        program={program}
        section={section}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onTaskChange={onTaskChange}
        onDirtyChange={handleDirtyChange}
        navigationBlocked={navigationBlocked}
        onReload={onWorkspaceRefresh}
        onMutationBlockChange={onMutationBlockChange}
        showHeading={false}
      />
    </section>
  );
};
