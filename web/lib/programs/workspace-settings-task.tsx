"use client";

import { useCallback, useEffect, useState } from "react";
import type { MouseEventHandler, ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { ScreenHeader } from "@/lib/screen-foundations";

import {
  isUnknownMutationWriteOutcome,
  listScheduleExceptions,
  listScheduleRules,
  updateProgram,
} from "./program-api";
import type { Program, ScheduleException, ScheduleRule } from "./program-api";
import { ProgramSettings, SettingsHub } from "./program-settings";
import type { ProgramSettingsSection } from "./program-settings";
import { buildProgramsHref, parseProgramsIntent } from "./programs-intent";
import type {
  ProgramsScheduleOrigin,
  ProgramsScheduleEditor,
  ProgramsSettingsSection,
  ProgramsTask,
} from "./programs-intent";
import {
  hkTodayWallDate,
  hkWallDateTimeLabel,
  previewOccurrencesForRule,
} from "./recurrence";
import { hasModule, useWorkspaceTaskContext } from "./workspace-context";

type ScheduleHubState =
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "ready";
      rules: ScheduleRule[];
      exceptions: Record<string, ScheduleException[]>;
    };

export type SettingsNavigationRequest =
  | { kind: "back" }
  | { kind: "workspace-back" }
  | { kind: "history-back" }
  | {
      kind: "route";
      task: ProgramsTask | null;
      eventId?: string | null;
      scheduleOrigin?: ProgramsScheduleOrigin;
      scheduleEditor?: ProgramsScheduleEditor | null;
      scheduleRuleId?: string | null;
      settingsSection?: ProgramsSettingsSection | null;
    }
  | { kind: "href"; href: string };

// oxlint-disable-next-line eslint/complexity -- this is the single Settings route boundary.
export const SettingsTask = ({
  onFocusChange,
  onDirtyChange,
  navigationBlocked = false,
  onNavigationBlocked,
  onNavigationRequest,
  settingsDraftDiscardSignal,
  headerAction,
}: {
  onFocusChange?: (focused: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  navigationBlocked?: boolean;
  onNavigationBlocked?: (blocked: boolean) => void;
  onNavigationRequest?: (request: SettingsNavigationRequest) => void;
  settingsDraftDiscardSignal?: number;
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
    notificationState,
    workspaceFreshness,
    settingsNavigationAllowedRef,
    settingsSection: routeSection,
    onSettingsSectionChange,
  } = useWorkspaceTaskContext();
  const [localSection, setLocalSection] =
    useState<ProgramSettingsSection | null>(null);
  const section = routeSection ?? localSection;
  useEffect(() => {
    if (onSettingsSectionChange && routeSection === undefined) {
      setLocalSection(null);
    }
  }, [onSettingsSectionChange, routeSection]);
  const [focusedDirty, setFocusedDirty] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveRefreshPending, setArchiveRefreshPending] = useState(false);
  const [archiveCommitted, setArchiveCommitted] = useState(false);
  const [scheduleHubState, setScheduleHubState] = useState<ScheduleHubState>({
    kind: "loading",
  });
  useEffect(() => {
    onFocusChange?.(section !== null);
  }, [onFocusChange, section]);
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
    scheduleOrigin: "settings",
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
  const blockNavigation = useCallback(
    (request: SettingsNavigationRequest) => {
      onNavigationRequest?.(request);
      onNavigationBlocked?.(true);
      announce(COPY.programs.settingsUnsaved);
    },
    [onNavigationBlocked, onNavigationRequest]
  );

  const applyArchiveReadback = useCallback((refreshed: Program): boolean => {
    if (refreshed.lifecycle === "Archived") {
      setArchiveCommitted(true);
      setArchiveRefreshPending(false);
      setArchiveError(null);
      setArchiveMessage(COPY.programs.settingsArchiveSaved);
      announce(COPY.programs.settingsArchiveSaved);
      return true;
    }
    if (refreshed.lifecycle === "Active") {
      setArchiveCommitted(false);
      setArchiveRefreshPending(false);
      setArchiveError(COPY.programs.settingsArchiveNotApplied);
      setArchiveMessage(null);
      announce(COPY.programs.settingsArchiveNotApplied);
      return true;
    }
    return false;
  }, []);

  const reconcileArchiveOutcome = useCallback(async (): Promise<boolean> => {
    if (!onWorkspaceRefresh) {
      return false;
    }
    try {
      const refreshed = await onWorkspaceRefresh();
      return refreshed !== undefined && applyArchiveReadback(refreshed);
    } catch {
      return false;
    }
  }, [applyArchiveReadback, onWorkspaceRefresh]);

  const archiveProgram = useCallback(async () => {
    if (
      archiveBusy ||
      archiveCommitted ||
      workspaceFreshness !== "fresh" ||
      !program.capabilities.manage ||
      program.lifecycle !== "Active"
    ) {
      return;
    }
    setArchiveBusy(true);
    setArchiveMessage(null);
    setArchiveError(null);
    setArchiveRefreshPending(false);
    try {
      await updateProgram(program.program_id, { lifecycle: "Archived" });
      setArchiveCommitted(true);
      let refreshed: Program | void | undefined;
      if (onWorkspaceRefresh) {
        try {
          refreshed = await onWorkspaceRefresh();
        } catch {
          refreshed = undefined;
        }
      }
      const refreshPending =
        onWorkspaceRefresh !== undefined &&
        (refreshed === undefined || !applyArchiveReadback(refreshed));
      setArchiveRefreshPending(refreshPending);
      if (refreshPending) {
        const message = COPY.programs.workspaceSavedStale;
        setArchiveMessage(message);
        announce(message);
      }
    } catch (error) {
      if (isUnknownMutationWriteOutcome(error)) {
        setArchiveCommitted(true);
        setArchiveRefreshPending(true);
        setArchiveMessage(COPY.programs.programTransportAmbiguous);
        announce(COPY.programs.programTransportAmbiguous);
        await reconcileArchiveOutcome();
        return;
      }
      const message = errorMessage(error);
      setArchiveError(message);
      announce(message);
    } finally {
      setArchiveBusy(false);
    }
  }, [
    archiveBusy,
    applyArchiveReadback,
    archiveCommitted,
    onWorkspaceRefresh,
    program,
    reconcileArchiveOutcome,
    workspaceFreshness,
  ]);

  const retryArchiveRefresh = useCallback(async () => {
    if (!onWorkspaceRefresh || !archiveCommitted) {
      return;
    }
    setArchiveError(null);
    try {
      const reconciled = await reconcileArchiveOutcome();
      if (!reconciled) {
        setArchiveCommitted(true);
        setArchiveRefreshPending(true);
        setArchiveMessage(COPY.programs.workspaceSavedStale);
        announce(COPY.programs.workspaceSavedStale);
      }
    } catch {
      setArchiveCommitted(true);
      setArchiveRefreshPending(true);
      setArchiveMessage(COPY.programs.workspaceSavedStale);
      announce(COPY.programs.workspaceSavedStale);
    }
  }, [archiveCommitted, onWorkspaceRefresh, reconcileArchiveOutcome]);

  useEffect(() => {
    const scheduleEnabled =
      program.capabilities.manage &&
      program.behavior_type === "Recurring" &&
      hasModule(modules, "events");
    if (section !== null || !scheduleEnabled) {
      return;
    }
    let active = true;
    setScheduleHubState({ kind: "loading" });
    void (async () => {
      try {
        const { rules } = await listScheduleRules(program.program_id);
        const exceptionEntries = await Promise.all(
          rules.map(async (rule) => {
            const { exceptions } = await listScheduleExceptions(
              program.program_id,
              rule.rule_id
            );
            return [rule.rule_id, exceptions] as const;
          })
        );
        if (active) {
          setScheduleHubState({
            kind: "ready",
            rules,
            exceptions: Object.fromEntries(exceptionEntries),
          });
        }
      } catch {
        if (active) {
          setScheduleHubState({ kind: "error" });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    modules,
    program.behavior_type,
    program.capabilities.manage,
    program.program_id,
    section,
  ]);

  const scheduleCurrentValue =
    scheduleHubState.kind === "loading"
      ? COPY.programs.settingsHubCurrentLoading
      : scheduleHubState.kind === "error"
        ? COPY.programs.settingsHubCurrentError
        : (() => {
            const activeRules = scheduleHubState.rules.filter(
              (rule) =>
                rule.retired_at === null || rule.retired_at === undefined
            );
            const nextOccurrence = activeRules
              .flatMap((rule) =>
                previewOccurrencesForRule(
                  rule,
                  hkTodayWallDate(),
                  366,
                  scheduleHubState.exceptions[rule.rule_id] ?? []
                )
              )
              .find((occurrence) => occurrence.skip_reason === null);
            return `規則 ${activeRules.length} 條 · ${
              nextOccurrence
                ? `下一次 ${hkWallDateTimeLabel(nextOccurrence.starts_at)}`
                : COPY.programs.settingsHubNoUpcoming
            }`;
          })();
  const notificationCurrentValue =
    notificationState?.kind === "ready"
      ? (() => {
          const items = notificationState.notifications.items.filter(
            ({ program_id }) => program_id === program.program_id
          );
          const unreadCount = items.filter(({ read }) => !read).length;
          return notificationState.notifications.has_more
            ? `未讀 ${unreadCount} · 至少 ${items.length} 項 · 還有更多`
            : `未讀 ${unreadCount} · 共 ${items.length} 項`;
        })()
      : notificationState?.kind === "loading"
        ? COPY.programs.settingsHubCurrentLoading
        : COPY.programs.settingsHubCurrentError;

  useEffect(() => {
    if (!focusedDirty) {
      return;
    }

    // eslint-disable-next-line eslint/complexity -- this is the single dirty-route interception boundary.
    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (
        settingsNavigationAllowedRef?.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const { target } = event;
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
      const routeIntent =
        nextUrl.pathname === "/programs"
          ? parseProgramsIntent(`${nextUrl.search}${nextUrl.hash}`)
          : null;
      if (
        routeIntent &&
        !routeIntent.malformed &&
        routeIntent.mode === "management" &&
        routeIntent.programId === program.program_id
      ) {
        blockNavigation({
          kind: "route",
          task: routeIntent.task ?? null,
          ...(routeIntent.eventId === undefined
            ? {}
            : { eventId: routeIntent.eventId }),
          ...(routeIntent.scheduleOrigin === undefined
            ? {}
            : { scheduleOrigin: routeIntent.scheduleOrigin }),
          ...(routeIntent.scheduleEditor === undefined
            ? {}
            : { scheduleEditor: routeIntent.scheduleEditor }),
          ...(routeIntent.scheduleRuleId === undefined
            ? {}
            : { scheduleRuleId: routeIntent.scheduleRuleId }),
          ...(routeIntent.settingsSection === undefined
            ? {}
            : { settingsSection: routeIntent.settingsSection }),
        });
      } else {
        blockNavigation({ kind: "href", href: nextUrl.href });
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (settingsNavigationAllowedRef?.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    blockNavigation,
    focusedDirty,
    program.program_id,
    settingsNavigationAllowedRef,
  ]);

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
      blockNavigation({ kind: "back" });
      return;
    }
    event.preventDefault();
    onFocusChange?.(false);
    handleDirtyChange(false);
    setLocalSection(null);
    onSettingsSectionChange?.(null);
  };

  const handleSectionSelect = (nextSection: ProgramSettingsSection) => {
    onFocusChange?.(true);
    handleDirtyChange(false);
    setLocalSection(nextSection);
    onSettingsSectionChange?.(nextSection);
  };

  return section === null ? (
    <>
      {archiveMessage !== null && (
        <Alert tone="success">{archiveMessage}</Alert>
      )}
      {archiveError !== null && (
        <Alert variant="destructive">{archiveError}</Alert>
      )}
      {archiveRefreshPending && (
        <Alert tone="warning" announcement="polite">
          <span>{COPY.programs.workspaceSavedStale}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void retryArchiveRefresh()}
          >
            {COPY.programs.workspaceRetryRefresh}
          </Button>
        </Alert>
      )}
      <SettingsHub
        program={program}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onSelect={handleSectionSelect}
        accessHref={accessAvailable ? accessHref : undefined}
        scheduleHref={scheduleHref}
        notificationsHref={notificationsHref}
        scheduleCurrentValue={scheduleCurrentValue}
        notificationCurrentValue={notificationCurrentValue}
        onArchive={archiveProgram}
        archiveBusy={archiveBusy}
        archiveDisabled={archiveCommitted || workspaceFreshness !== "fresh"}
      />
    </>
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
        settingsDraftDiscardSignal={settingsDraftDiscardSignal}
        showHeading={false}
      />
    </section>
  );
};
