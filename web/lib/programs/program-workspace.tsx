"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getManagementProgram,
  listEnrollmentRequests,
  listEnrollments,
  listEvents,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  ManagementAttention,
  ManagementCockpitView,
  Program,
  ProgramEvent,
} from "@/lib/programs/program-api";
import {
  ScreenHeader,
  ScreenLoadingRows,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { applyAuthoritativeRevision } from "./authoritative-revision";
import { clearEventCreateDraft } from "./event-create-draft";
import { EventDetail } from "./event-detail";
import { clearManagementDraft, listManagementDrafts } from "./management-draft";
import { readWorkspaceMutationRecovery } from "./mutation-recovery";
import {
  clearProgramSettingsDrafts,
  isProgramSettingsDraftAction,
  SETTINGS_DRAFT_ACTION,
} from "./program-settings";
import { buildProgramsHref, parseProgramsIntent } from "./programs-intent";
import type {
  ManagementEventAction,
  ProgramsEventFilter,
  ProgramsParticipantTab,
  ProgramsScheduleEditor,
  ProgramsScheduleOrigin,
  ProgramsSettingsSection,
  ProgramsTask,
} from "./programs-intent";
import type { ManagementNotificationState } from "./programs-notifications";
import { rememberWorkspaceScroll } from "./programs-scroll";
import { useAsyncResource } from "./use-async-resource";
import {
  clearAuthenticatedProgramsRecovery,
  hasModule,
  redirectToLoginIfRequired,
  useWorkspaceRouteContext,
} from "./workspace-context";
import type { SettingsNavigationRequest } from "./workspace-settings-task";
import {
  TaskUnavailable,
  WorkspaceNavigation,
  WorkspaceOverview,
  WorkspaceTask,
  type WorkspaceSummaryRead,
  type WorkspaceSummaryState,
} from "./workspace-task";

export interface ProgramWorkspaceProps {
  programId: string;
  task?: ProgramsTask;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  /** EVT-01 (#251): management Event deep link under the events or participants task. */
  eventId?: string | null;
  eventAction?: ManagementEventAction;
  /** NTF-01 (#256): fresh server-shaped attention counts from the shell. */
  attention?: ManagementAttention | null;
  notificationState?: ManagementNotificationState;
  onAttentionRefresh?: () => void;
  /** Compact route-level action rendered in the shared ScreenHeader. */
  headerAction?: ReactNode;
  onBack: () => void;
  onTaskChange: (
    task: ProgramsTask | null,
    eventId?: string | null,
    scheduleOrigin?: ProgramsScheduleOrigin,
    scheduleEditor?: ProgramsScheduleEditor | null,
    scheduleRuleId?: string | null
  ) => void;
  /** Opens the shared focused attendance roster for an exact Event. */
  onOpenAttendance?: (eventId: string) => void;
  /** EVT-01 (#251): navigate the Event deep link; null returns to the list. */
  onEventChange?: (
    eventId: string | null,
    eventAction?: ManagementEventAction
  ) => void;
  eventFilter?: ProgramsEventFilter;
  onEventFilterChange?: (filter: ProgramsEventFilter) => void;
  participantTab?: ProgramsParticipantTab;
  participantQuery?: string;
  onParticipantTabChange?: (tab: ProgramsParticipantTab) => void;
  onParticipantQueryChange?: (query: string) => void;
  settingsSection?: ProgramsSettingsSection;
  onSettingsSectionChange?: (section: ProgramsSettingsSection | null) => void;
  scheduleOrigin?: ProgramsScheduleOrigin;
  scheduleEditor?: ProgramsScheduleEditor;
  scheduleRuleId?: string;
  onScheduleEditorChange?: (
    editor: ProgramsScheduleEditor | null,
    ruleId?: string | null
  ) => void;
}

interface WorkspaceResource {
  program: Program;
  department: Department | null;
  modules: DepartmentModule[];
  cockpit?: ManagementCockpitView | null;
}

type WorkspaceState =
  | { kind: "loading" }
  | {
      kind: "ready";
      program: Program;
      department: Department | null;
      modules: DepartmentModule[];
      cockpit?: ManagementCockpitView | null;
    }
  | {
      kind: "error";
      failure: "forbidden" | "unavailable" | "recoverable";
      message: string;
    };

type EventDraftNavigation =
  | { kind: "back" }
  | {
      kind: "task";
      task: ProgramsTask | null;
      eventId?: string | null;
      scheduleOrigin?: ProgramsScheduleOrigin;
    }
  | { kind: "href"; href: string };

type ScheduleRecoveryOwner =
  | { kind: "preview"; focusKey: string }
  | {
      kind: "editor";
      editor: ProgramsScheduleEditor;
      ruleId: string | null;
    }
  | { kind: "settings"; section: ProgramsSettingsSection | null };

interface ScheduleDraftRecovery {
  hasDrafts: boolean;
  firstOwner: ScheduleRecoveryOwner | null;
}

function readScheduleDraftRecovery(programId: string): ScheduleDraftRecovery {
  let firstOwner: ScheduleRecoveryOwner | null = null;
  const drafts = listManagementDrafts<unknown>(programId);
  const remember = (owner: ScheduleRecoveryOwner) => {
    if (firstOwner === null) {
      firstOwner = owner;
    }
  };

  for (const { action } of drafts) {
    if (!isProgramSettingsDraftAction(action)) {
      continue;
    }
    if (action === SETTINGS_DRAFT_ACTION.basics) {
      remember({ kind: "settings", section: "basics" });
      continue;
    }
    if (action === SETTINGS_DRAFT_ACTION.publishing) {
      remember({ kind: "settings", section: "publishing" });
      continue;
    }
    if (action === SETTINGS_DRAFT_ACTION.enrollment) {
      remember({ kind: "settings", section: "enrollment" });
      continue;
    }
    if (action === SETTINGS_DRAFT_ACTION.attendance) {
      remember({ kind: "settings", section: "attendance" });
      continue;
    }
    if (action === SETTINGS_DRAFT_ACTION.newRule) {
      remember({ kind: "editor", editor: "new-rule", ruleId: null });
      continue;
    }
    const rulePrefix = `${SETTINGS_DRAFT_ACTION.rule}:`;
    if (action.startsWith(rulePrefix)) {
      remember({
        kind: "editor",
        editor: "edit-rule",
        ruleId: action.slice(rulePrefix.length),
      });
      continue;
    }
    const exceptionPrefix = `${SETTINGS_DRAFT_ACTION.exception}:`;
    if (action.startsWith(exceptionPrefix)) {
      const key = action.slice(exceptionPrefix.length);
      if (key.includes(":")) {
        remember({ kind: "preview", focusKey: key });
      } else {
        remember({ kind: "editor", editor: "new-exception", ruleId: key });
      }
      continue;
    }
  }

  return { hasDrafts: firstOwner !== null, firstOwner };
}

function settingsNavigationForUrl(
  nextUrl: URL,
  programId: string
): SettingsNavigationRequest {
  const routeIntent =
    nextUrl.pathname === "/programs"
      ? parseProgramsIntent(`${nextUrl.search}${nextUrl.hash}`)
      : null;
  if (
    routeIntent &&
    !routeIntent.malformed &&
    routeIntent.mode === "management" &&
    routeIntent.programId === programId &&
    routeIntent.eventAction === undefined &&
    routeIntent.departmentSettingsId === undefined
  ) {
    return {
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
    };
  }
  return { kind: "href", href: nextUrl.href };
}

function initialSummary(
  modules?: readonly DepartmentModule[]
): WorkspaceSummaryState {
  const modulesKnown = modules !== undefined;
  const available = (moduleKey: DepartmentModule["module_key"]) =>
    modulesKnown && hasModule(modules, moduleKey);
  const unavailable = (moduleKey: DepartmentModule["module_key"]) =>
    available(moduleKey)
      ? { status: "loading" as const }
      : modulesKnown
        ? {
            status: "unavailable" as const,
            message: COPY.programs.workspaceTaskUnavailable,
          }
        : { status: "loading" as const };

  return {
    events: unavailable("events"),
    pendingRequests: unavailable("enrollment"),
    activeParticipants: unavailable("enrollment"),
  };
}

async function readSummary<TInput, TValue>(
  operation: Promise<TInput>,
  project: (input: TInput) => TValue
): Promise<WorkspaceSummaryRead<TValue>> {
  try {
    return { status: "ready", value: project(await operation) };
  } catch (error) {
    if (redirectToLoginIfRequired(error)) {
      return {
        status: "unavailable",
        message: COPY.nav.unauthorized,
      };
    }
    return {
      status: "unavailable",
      message:
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.programs.workspaceSummaryUnavailable,
    };
  }
}
function unavailableSummary<T>(message: string): WorkspaceSummaryRead<T> {
  return { status: "unavailable", message };
}

function lifecycleLabel(value: Program["lifecycle"]): string {
  return value === "Active"
    ? COPY.programs.lifecycleActive
    : value === "Draft"
      ? COPY.programs.lifecycleDraft
      : COPY.programs.lifecycleArchived;
}

function lifecycleTone(value: Program["lifecycle"]): "success" | "neutral" {
  return value === "Active" ? "success" : "neutral";
}

function behaviorLabel(value: Program["behavior_type"]): string {
  return value === "Recurring"
    ? COPY.programs.detailBehaviorRecurring
    : COPY.programs.detailBehaviorOneOff;
}

export const ProgramWorkspace = ({
  programId,
  task,
  eventId,
  eventAction,
  created = false,
  attention = null,
  notificationState,
  onAttentionRefresh = () => {},
  headerAction,
  onBack,
  onTaskChange,
  onOpenAttendance,
  onEventChange,
  eventFilter,
  onEventFilterChange,
  participantTab,
  participantQuery,
  onParticipantTabChange,
  onParticipantQueryChange,
  settingsSection,
  onSettingsSectionChange,
  scheduleOrigin,
  scheduleEditor,
  scheduleRuleId,
  onScheduleEditorChange,
}: ProgramWorkspaceProps) => {
  const { departmentId, hash } = useWorkspaceRouteContext();
  const [summary, setSummary] = useState<WorkspaceSummaryState>(() =>
    initialSummary()
  );
  const [settingsEditorFocused, setSettingsEditorFocused] = useState(false);
  const [settingsEditorDirty, setSettingsEditorDirty] = useState(false);
  const [settingsNavigationBlocked, setSettingsNavigationBlocked] =
    useState(false);
  const [scheduleDraftDiscardSignal, setScheduleDraftDiscardSignal] =
    useState(0);
  const [settingsDraftDiscardSignal, setSettingsDraftDiscardSignal] =
    useState(0);
  const [scheduleDraftFocusKey, setScheduleDraftFocusKey] = useState<
    string | null
  >(null);
  const [scheduleSettingsSection, setScheduleSettingsSection] =
    useState<ProgramsSettingsSection | null>(null);
  const [managementDraftVersion, setManagementDraftVersion] = useState(0);
  const [pendingSettingsNavigation, setPendingSettingsNavigation] =
    useState<SettingsNavigationRequest | null>(null);
  const [settingsRecoveryDestination, setSettingsRecoveryDestination] =
    useState<SettingsNavigationRequest | null>(null);
  const allowSettingsNavigation = useRef(false);
  const [eventDraftDirty, setEventDraftDirty] = useState(false);
  const [eventEditDirty, setEventEditDirty] = useState(false);
  const [eventNavigationBlocked, setEventNavigationBlocked] = useState(false);
  const [pendingEventDraftNavigation, setPendingEventDraftNavigation] =
    useState<EventDraftNavigation | null>(null);
  const scheduleDraftRecovery = useMemo(
    () => readScheduleDraftRecovery(programId),
    [managementDraftVersion, programId]
  );
  const workspaceSettingsDirty =
    settingsEditorDirty || scheduleDraftRecovery.hasDrafts;
  const handleEventDraftDirtyChange = useCallback(
    (dirty: boolean) => {
      setEventDraftDirty(dirty);
      if (!dirty && !eventEditDirty) {
        setEventNavigationBlocked(false);
        setPendingEventDraftNavigation(null);
      }
    },
    [eventEditDirty]
  );
  const handleEventEditDirtyChange = useCallback(
    (dirty: boolean) => {
      setEventEditDirty(dirty);
      if (!dirty && !eventDraftDirty) {
        setEventNavigationBlocked(false);
        setPendingEventDraftNavigation(null);
      }
    },
    [eventDraftDirty]
  );
  const handleSettingsDirtyStateChange = useCallback((dirty: boolean) => {
    setSettingsEditorDirty(dirty);
    setManagementDraftVersion((version) => version + 1);
  }, []);
  const handleSettingsNavigationRequest = useCallback(
    (request: SettingsNavigationRequest) => {
      setPendingSettingsNavigation(request);
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
    },
    []
  );
  const createdFlash = created && !task;
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(
    createdFlash ? COPY.programs.programCreatedNotice : null
  );
  const [workspaceFreshness, setWorkspaceFreshness] = useState<
    "fresh" | "refreshing" | "stale"
  >("fresh");
  const [workspaceMutationBlocked, setWorkspaceMutationBlocked] = useState(
    () => {
      const recovery = readWorkspaceMutationRecovery();
      return (
        task === "events" &&
        ((recovery?.surface === "event" &&
          recovery.programId === programId &&
          recovery.eventId === eventId) ||
          (recovery?.surface === "events" && recovery.programId === programId))
      );
    }
  );
  const allowEventDraftLeave = useRef(false);
  const allowSettingsHistoryBack = useRef(false);
  const mounted = useRef(true);
  const summaryRequestId = useRef(0);
  const workspaceRefreshQueue = useRef(Promise.resolve());
  const authoritativeWorkspace = useRef<{
    programId: string;
    resource: WorkspaceResource;
  } | null>(null);
  // `useAsyncResource` returns the wire payload after toReady runs. Keep a
  // separate decision bit so callers cannot mistake a revision-rejected
  // payload for a fresh workspace.
  const workspaceReadAccepted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setWorkspaceNotice(
      created && !task ? COPY.programs.programCreatedNotice : null
    );
  }, [created, programId, task]);
  useEffect(() => {
    if (task !== "settings" && task !== "schedule") {
      setSettingsEditorFocused(false);
      setSettingsEditorDirty(false);
      setSettingsNavigationBlocked(false);
      setPendingSettingsNavigation(null);
    }
  }, [task]);
  useEffect(() => {
    if (workspaceSettingsDirty) {
      return;
    }
    allowSettingsHistoryBack.current = false;
    setScheduleDraftFocusKey(null);
    setSettingsRecoveryDestination(null);
  }, [workspaceSettingsDirty]);
  useEffect(() => {
    if (!workspaceMutationBlocked) {
      return;
    }
    allowSettingsHistoryBack.current = false;
    allowSettingsNavigation.current = false;
  }, [workspaceMutationBlocked]);
  useEffect(() => {
    const settingsDirtyOnEvents = task === "events" && workspaceSettingsDirty;
    const guardActive =
      workspaceMutationBlocked ||
      settingsDirtyOnEvents ||
      (task === "events" && (eventDraftDirty || eventEditDirty));
    if (!guardActive) {
      return;
    }
    const blockedHref = window.location.href;
    const guardToken = crypto.randomUUID();
    const guardedState = {
      ...(typeof window.history.state === "object" &&
      window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {}),
      efccProgramWorkspaceMutationGuard: guardToken,
    };
    window.history.pushState(guardedState, "", blockedHref);
    const announceBlocked = () => {
      announce(
        workspaceMutationBlocked
          ? COPY.programs.programTransportAmbiguous
          : workspaceSettingsDirty
            ? COPY.programs.settingsUnsaved
            : eventEditDirty
              ? COPY.programs.eventEditUnsaved
              : COPY.programs.eventCreateUnsaved
      );
    };
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
      const { target } = event;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const rawHref = anchor.getAttribute("href");
      if (
        rawHref?.startsWith("#") ||
        anchor.hasAttribute("download") ||
        (anchor.getAttribute("target") ?? "").toLowerCase() === "_blank"
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
      if (workspaceMutationBlocked) {
        event.stopImmediatePropagation();
        announceBlocked();
        return;
      }
      if (workspaceSettingsDirty) {
        setPendingSettingsNavigation(
          settingsNavigationForUrl(nextUrl, programId)
        );
        setSettingsNavigationBlocked(true);
        announceBlocked();
        return;
      }
      const routeIntent =
        nextUrl.pathname === "/programs"
          ? parseProgramsIntent(`${nextUrl.search}${nextUrl.hash}`)
          : null;
      if (
        routeIntent &&
        !routeIntent.malformed &&
        routeIntent.mode === "management" &&
        routeIntent.programId === programId &&
        routeIntent.eventAction === undefined &&
        routeIntent.departmentSettingsId === undefined
      ) {
        setPendingEventDraftNavigation({
          kind: "task",
          task: routeIntent.task ?? null,
          ...(routeIntent.eventId === undefined
            ? {}
            : { eventId: routeIntent.eventId }),
          ...(routeIntent.scheduleOrigin === undefined
            ? {}
            : { scheduleOrigin: routeIntent.scheduleOrigin }),
        });
      } else {
        setPendingEventDraftNavigation({ kind: "href", href: nextUrl.href });
      }
      setEventNavigationBlocked(true);
      announceBlocked();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (workspaceMutationBlocked) {
        event.preventDefault();
        event.returnValue = "";
        return;
      }
      if (allowEventDraftLeave.current || allowSettingsNavigation.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePopState = (event: PopStateEvent) => {
      if (workspaceMutationBlocked) {
        allowSettingsHistoryBack.current = false;
        window.history.pushState(guardedState, "", blockedHref);
        event.stopImmediatePropagation();
        announceBlocked();
        return;
      }
      if (allowSettingsHistoryBack.current) {
        allowSettingsHistoryBack.current = false;
        return;
      }
      window.history.pushState(guardedState, "", blockedHref);
      if (!workspaceMutationBlocked) {
        if (workspaceSettingsDirty) {
          setPendingSettingsNavigation({ kind: "history-back" });
          setSettingsNavigationBlocked(true);
        } else {
          setPendingEventDraftNavigation(
            eventId
              ? { kind: "task", task: "events" }
              : task === "schedule"
                ? { kind: "task", task: "events" }
                : { kind: "back" }
          );
          setEventNavigationBlocked(true);
        }
      }
      announceBlocked();
    };
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      if (
        window.location.href === blockedHref &&
        (window.history.state as Record<string, unknown> | null)
          ?.efccProgramWorkspaceMutationGuard === guardToken
      ) {
        window.history.back();
      }
    };
  }, [
    eventDraftDirty,
    eventEditDirty,
    eventId,
    programId,
    workspaceSettingsDirty,
    task,
    workspaceMutationBlocked,
  ]);
  useEffect(() => {
    if (!workspaceSettingsDirty || task === "events") {
      return;
    }
    const restoringHistory = { current: false };
    const handlePopState = () => {
      if (allowSettingsHistoryBack.current) {
        allowSettingsHistoryBack.current = false;
        return;
      }
      if (restoringHistory.current) {
        restoringHistory.current = false;
        return;
      }
      restoringHistory.current = true;
      window.history.forward();
      setPendingSettingsNavigation({ kind: "history-back" });
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [task, workspaceSettingsDirty]);
  useEffect(() => {
    // RP2.1: the dirty union guards every Program leave path. Focus only
    // decides whether the child Settings route owns the interception.
    if (
      !workspaceSettingsDirty ||
      (task !== "schedule" && settingsEditorFocused)
    ) {
      return;
    }
    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (
        allowSettingsNavigation.current ||
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
      const href = anchor.getAttribute("href");
      if (
        href?.startsWith("#") ||
        anchor.hasAttribute("download") ||
        (anchor.getAttribute("target") ?? "").toLowerCase() === "_blank"
      ) {
        return;
      }
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (
        (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") ||
        nextUrl.origin !== currentUrl.origin
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingSettingsNavigation(
        settingsNavigationForUrl(nextUrl, programId)
      );
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowSettingsNavigation.current) {
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
  }, [programId, settingsEditorFocused, task, workspaceSettingsDirty]);
  const focusedSettingsEditor =
    (task === "settings" || task === "schedule") && settingsEditorFocused;
  const {
    state,
    run: loadWorkspace,
    refresh: refreshWorkspaceResource,
    retry,
  } = useAsyncResource<WorkspaceResource, WorkspaceState>(
    async () => getManagementProgram(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (next) => {
        const previous =
          authoritativeWorkspace.current?.programId === programId
            ? authoritativeWorkspace.current.resource
            : null;
        const authoritativeProgram =
          applyAuthoritativeRevision(next.program, previous?.program ?? null) ??
          next.program;
        const authoritativeCockpit =
          next.cockpit === undefined
            ? previous?.cockpit
            : next.cockpit === null
              ? (previous?.cockpit ?? null)
              : (applyAuthoritativeRevision(
                  next.cockpit,
                  previous?.cockpit ?? null
                ) ?? next.cockpit);
        workspaceReadAccepted.current =
          previous === null ||
          (authoritativeProgram === next.program &&
            authoritativeCockpit === next.cockpit);
        const resource = {
          ...next,
          program: authoritativeProgram,
          ...(authoritativeCockpit === undefined
            ? {}
            : { cockpit: authoritativeCockpit }),
        };
        authoritativeWorkspace.current = { programId, resource };
        return { kind: "ready", ...resource };
      },
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          clearAuthenticatedProgramsRecovery();
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          window.location.assign("/");
          return null;
        }
        if (error instanceof RpcError && error.problem.code === "FORBIDDEN") {
          announce(COPY.programs.workspaceForbidden);
          return {
            kind: "error",
            failure: "forbidden",
            message: COPY.programs.workspaceUnavailableHint,
          };
        }
        if (
          error instanceof RpcError &&
          (error.problem.code === "NOT_FOUND" || error.problem.status === 404)
        ) {
          announce(COPY.programs.workspaceUnavailable);
          return {
            kind: "error",
            failure: "unavailable",
            message: COPY.programs.workspaceUnavailableHint,
          };
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return { kind: "error", failure: "recoverable", message };
      },
      announceLoading: COPY.programs.workspaceLoading,
      announceReady: ({ program }) => program.name,
      focusTarget: "#programs-workspace-state",
    },
    [programId]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const refreshAuthoritativeWorkspace = useCallback(async () => {
    const previousRefresh = workspaceRefreshQueue.current;
    const currentRefresh = (async () => {
      await previousRefresh;
      setWorkspaceFreshness("refreshing");
      try {
        workspaceReadAccepted.current = false;
        const refreshed = await refreshWorkspaceResource();
        const accepted =
          refreshed !== undefined && workspaceReadAccepted.current;
        if (mounted.current) {
          setWorkspaceFreshness(accepted ? "fresh" : "stale");
        }
        return accepted ? refreshed?.program : undefined;
      } catch (error) {
        if (mounted.current) {
          setWorkspaceFreshness("stale");
        }
        throw error;
      }
    })();
    workspaceRefreshQueue.current = (async () => {
      try {
        await currentRefresh;
      } catch (error) {
        void error;
      }
    })();
    return currentRefresh;
  }, [refreshWorkspaceResource]);

  const retryWorkspaceRefresh = useCallback(async () => {
    try {
      await refreshAuthoritativeWorkspace();
    } catch (error) {
      // The refresh owner has already recorded the stale state and recovery copy.
      void error;
    }
  }, [refreshAuthoritativeWorkspace]);

  const loadSummary = useCallback(
    async (modules: readonly DepartmentModule[]) => {
      const requestId = ++summaryRequestId.current;
      const events = hasModule(modules, "events")
        ? readSummary(listEvents(programId), ({ events: value }) => value)
        : Promise.resolve(
            unavailableSummary<ProgramEvent[]>(
              COPY.programs.workspaceTaskUnavailable
            )
          );
      const pendingRequests = hasModule(modules, "enrollment")
        ? readSummary(
            listEnrollmentRequests(programId),
            ({ requests }) =>
              requests.filter(({ status }) => status === "Pending").length
          )
        : Promise.resolve(
            unavailableSummary<number>(COPY.programs.workspaceTaskUnavailable)
          );
      const activeParticipants = hasModule(modules, "enrollment")
        ? readSummary(
            listEnrollments(programId),
            ({ enrollments }) =>
              enrollments.filter(({ status }) => status === "Active").length
          )
        : Promise.resolve(
            unavailableSummary<number>(COPY.programs.workspaceTaskUnavailable)
          );
      setSummary(initialSummary(modules));
      const [eventRead, pendingRead, activeRead] = await Promise.all([
        events,
        pendingRequests,
        activeParticipants,
      ]);
      if (!mounted.current || summaryRequestId.current !== requestId) {
        return;
      }
      setSummary({
        events: eventRead,
        pendingRequests: pendingRead,
        activeParticipants: activeRead,
      });
    },
    [programId]
  );

  const retrySummary = useCallback(() => {
    if (state.kind !== "ready") {
      return;
    }
    if (
      state.cockpit === null ||
      (state.cockpit && state.cockpit.program_id !== programId)
    ) {
      retry();
      return;
    }
    void loadSummary(state.modules);
  }, [loadSummary, programId, retry, state]);

  useEffect(() => {
    if (state.kind !== "ready" || task !== undefined) {
      return;
    }
    void loadSummary(state.modules);
  }, [loadSummary, state, task]);
  if (state.kind === "loading") {
    return (
      <ScreenLoadingRows
        id="programs-workspace-state"
        tabIndex={-1}
        label={COPY.programs.workspaceLoading}
        density="collection"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ScreenState
        id="programs-workspace-state"
        tabIndex={-1}
        kind={state.failure === "forbidden" ? "forbidden" : "error"}
        title={
          <h2 className="m-0 wrap-anywhere text-base font-bold">
            {state.failure === "forbidden"
              ? COPY.programs.workspaceForbidden
              : state.failure === "unavailable"
                ? COPY.programs.workspaceUnavailable
                : COPY.programs.workspaceLoadError}
          </h2>
        }
        description={state.message}
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              className="w-fit bg-[var(--screen-accent)] text-white whitespace-normal hover:bg-[var(--screen-accent-deep)]"
              type="button"
              onClick={retry}
            >
              {COPY.programs.workspaceRetry}
            </Button>
            <Button
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
              type="button"
              onClick={onBack}
            >
              {COPY.programs.workspaceBack}
            </Button>
          </div>
        }
      />
    );
  }
  const workspaceProgram = state.program;
  const canAccessSettings =
    workspaceProgram.capabilities.manage ||
    workspaceProgram.capabilities.leader_assign;
  const canRenderTask =
    task === "settings"
      ? canAccessSettings
      : workspaceProgram.capabilities.manage;
  const focusedSchedule = task === "schedule";

  const continueEventDraftEditing = () => {
    setPendingEventDraftNavigation(null);
    setEventNavigationBlocked(false);
  };

  const continueSettingsEditing = () => {
    if (workspaceMutationBlocked) {
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    const { firstOwner } = scheduleDraftRecovery;
    const pending = pendingSettingsNavigation;
    if (pending !== null) {
      setSettingsRecoveryDestination((destination) => destination ?? pending);
    }
    setScheduleDraftFocusKey(
      firstOwner?.kind === "preview" ? firstOwner.focusKey : null
    );
    setPendingSettingsNavigation(null);
    if (firstOwner?.kind === "settings") {
      setScheduleSettingsSection(firstOwner.section);
      onSettingsSectionChange?.(null);
      onScheduleEditorChange?.(null, null);
      if (task !== "schedule") {
        permitOneWorkspaceNavigation();
        navigateWorkspaceTask("schedule", undefined, "settings");
      }
    } else if (task !== "schedule" && firstOwner?.kind === "preview") {
      setScheduleSettingsSection(null);
      onSettingsSectionChange?.(null);
      onScheduleEditorChange?.(null, null);
      permitOneWorkspaceNavigation();
      navigateWorkspaceTask("schedule", undefined, "settings");
    } else if (task !== "schedule" && firstOwner?.kind === "editor") {
      setScheduleSettingsSection(null);
      onSettingsSectionChange?.(null);
      permitOneWorkspaceNavigation();
      navigateWorkspaceTask(
        "schedule",
        undefined,
        "settings",
        firstOwner.editor,
        firstOwner.ruleId
      );
    }
  };

  const permitOneWorkspaceNavigation = () => {
    allowSettingsNavigation.current = true;
    queueMicrotask(() => {
      allowSettingsNavigation.current = false;
    });
  };

  const navigateWorkspaceTask = (
    nextTask: ProgramsTask | null,
    nextEventId?: string | null,
    nextScheduleOrigin?: ProgramsScheduleOrigin,
    nextScheduleEditor?: ProgramsScheduleEditor | null,
    nextScheduleRuleId?: string | null
  ) => {
    if (task === "participants" && nextTask !== "participants") {
      rememberWorkspaceScroll(`${programId}:participants`);
    }
    if (nextScheduleEditor !== undefined || nextScheduleRuleId !== undefined) {
      onTaskChange(
        nextTask,
        nextEventId,
        nextScheduleOrigin,
        nextScheduleEditor,
        nextScheduleRuleId
      );
      return;
    }
    if (nextScheduleOrigin !== undefined) {
      onTaskChange(nextTask, nextEventId, nextScheduleOrigin);
      return;
    }
    if (nextEventId === undefined) {
      onTaskChange(nextTask);
      return;
    }
    onTaskChange(nextTask, nextEventId);
  };

  const discardSettingsAndLeave = () => {
    if (workspaceMutationBlocked) {
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    const pending = settingsRecoveryDestination ?? pendingSettingsNavigation;
    if (pending === null) {
      return;
    }
    clearProgramSettingsDrafts(programId);
    setSettingsDraftDiscardSignal((signal) => signal + 1);
    setManagementDraftVersion((version) => version + 1);
    // RP2.1: Discard on the focused Schedule route also drops the panel's
    // in-memory inline drafts via the discard signal (session alone is not
    // enough: the panel would rewrite them from stale state).
    if (task === "schedule") {
      setScheduleDraftDiscardSignal((signal) => signal + 1);
    }
    setPendingSettingsNavigation(null);
    setSettingsRecoveryDestination(null);
    setScheduleSettingsSection(null);
    setSettingsNavigationBlocked(false);
    setSettingsEditorFocused(false);
    setSettingsEditorDirty(false);
    if (pending.kind === "history-back") {
      allowSettingsHistoryBack.current = true;
      window.history.back();
      return;
    }
    if (pending.kind === "back") {
      onSettingsSectionChange?.(null);
      return;
    }
    if (pending.kind === "workspace-back") {
      if (focusedSchedule) {
        onTaskChange(scheduleOrigin === "settings" ? "settings" : "events");
      } else {
        onBack();
      }
      return;
    }
    if (pending.kind === "route") {
      if (pending.task === "settings") {
        setSettingsEditorFocused(false);
        setSettingsEditorDirty(false);
        onSettingsSectionChange?.(pending.settingsSection ?? null);
        return;
      }
      if (pending.task === "schedule") {
        onScheduleEditorChange?.(
          pending.scheduleEditor ?? null,
          pending.scheduleRuleId ?? null
        );
      }
      onSettingsSectionChange?.(null);
      setSettingsEditorFocused(false);
      setSettingsEditorDirty(false);
      permitOneWorkspaceNavigation();
      navigateWorkspaceTask(
        pending.task,
        pending.eventId,
        pending.scheduleOrigin,
        pending.scheduleEditor,
        pending.scheduleRuleId
      );
      return;
    }
    allowSettingsNavigation.current = true;
    window.location.assign(pending.href);
  };

  const discardEventDraftAndLeave = () => {
    if (workspaceMutationBlocked) {
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    const pending = pendingEventDraftNavigation;
    if (pending === null) {
      return;
    }
    clearEventCreateDraft(programId);
    if (eventId) {
      clearManagementDraft(eventId, "event-edit");
    }
    setPendingEventDraftNavigation(null);
    setEventNavigationBlocked(false);
    setEventDraftDirty(false);
    setEventEditDirty(false);
    if (pending.kind === "href") {
      allowEventDraftLeave.current = true;
      window.location.assign(pending.href);
      return;
    }
    if (pending.kind === "back") {
      if (focusedSchedule) {
        onTaskChange("events");
      } else {
        onBack();
      }
      return;
    }
    if (pending.eventId === undefined && pending.scheduleOrigin === undefined) {
      permitOneWorkspaceNavigation();
      navigateWorkspaceTask(pending.task);
      return;
    }
    permitOneWorkspaceNavigation();
    navigateWorkspaceTask(
      pending.task,
      pending.eventId,
      pending.scheduleOrigin
    );
  };

  const handleWorkspaceBack = (event: MouseEvent<HTMLAnchorElement>) => {
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
    if (workspaceMutationBlocked) {
      event.preventDefault();
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    event.preventDefault();
    // RP2.1: workspace dirty is the union of Settings dirty and inline
    // 調整 dirty. On the focused Schedule route the union alone blocks Back
    // (focus only picks which header renders the link); elsewhere the
    // focused-editor gate applies. A clean Settings editor must not drop an
    // inline dirty draft.
    if (
      workspaceSettingsDirty &&
      (task !== "settings" || !settingsEditorFocused)
    ) {
      setPendingSettingsNavigation({ kind: "workspace-back" });
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (settingsEditorFocused && settingsEditorDirty) {
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (eventDraftDirty || eventEditDirty) {
      setPendingEventDraftNavigation(
        eventId ? { kind: "task", task: "events" } : { kind: "back" }
      );
      setEventNavigationBlocked(true);
      announce(
        eventEditDirty
          ? COPY.programs.eventEditUnsaved
          : COPY.programs.eventCreateUnsaved
      );
      return;
    }
    if (focusedSchedule) {
      onTaskChange(scheduleOrigin === "settings" ? "settings" : "events");
      return;
    }
    if (task === "participants") {
      rememberWorkspaceScroll(`${programId}:participants`);
    }
    onBack();
  };
  const handleWorkspaceTaskChange = (
    nextTask: ProgramsTask | null,
    nextEventId?: string | null,
    nextScheduleOrigin?: ProgramsScheduleOrigin,
    nextScheduleEditor?: ProgramsScheduleEditor | null,
    nextScheduleRuleId?: string | null
  ) => {
    if (workspaceMutationBlocked) {
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    if (allowSettingsNavigation.current) {
      allowSettingsNavigation.current = false;
      navigateWorkspaceTask(
        nextTask,
        nextEventId,
        nextScheduleOrigin,
        nextScheduleEditor,
        nextScheduleRuleId
      );
      return;
    }
    if (
      workspaceSettingsDirty &&
      (task !== "settings" || !settingsEditorFocused)
    ) {
      setPendingSettingsNavigation({
        kind: "route",
        task: nextTask,
        ...(nextEventId === undefined ? {} : { eventId: nextEventId }),
        ...(nextScheduleOrigin === undefined
          ? {}
          : { scheduleOrigin: nextScheduleOrigin }),
        ...(nextScheduleEditor === undefined
          ? {}
          : { scheduleEditor: nextScheduleEditor }),
        ...(nextScheduleRuleId === undefined
          ? {}
          : { scheduleRuleId: nextScheduleRuleId }),
      });
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (settingsEditorFocused && settingsEditorDirty) {
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (eventDraftDirty || eventEditDirty) {
      setPendingEventDraftNavigation({
        kind: "task",
        task: nextTask,
        ...(nextEventId === undefined ? {} : { eventId: nextEventId }),
        ...(nextScheduleOrigin === undefined
          ? {}
          : { scheduleOrigin: nextScheduleOrigin }),
      });
      setEventNavigationBlocked(true);
      announce(
        eventEditDirty
          ? COPY.programs.eventEditUnsaved
          : COPY.programs.eventCreateUnsaved
      );
      return;
    }
    navigateWorkspaceTask(
      nextTask,
      nextEventId,
      nextScheduleOrigin,
      nextScheduleEditor,
      nextScheduleRuleId
    );
  };
  return (
    <section
      className="grid min-w-0"
      aria-labelledby={
        focusedSettingsEditor ? undefined : "programs-workspace-title"
      }
    >
      {!focusedSettingsEditor && (
        <ScreenHeader
          headingId="programs-workspace-title"
          level="root"
          title={
            focusedSchedule
              ? COPY.programs.schedulePageTitle
              : workspaceProgram.name
          }
          lead={
            <>
              <span>
                {focusedSchedule
                  ? `${workspaceProgram.name} · ${state.department?.name ?? COPY.programs.workspaceDepartment}`
                  : state.department
                    ? `${state.department.name} · ${state.department.code}`
                    : COPY.programs.workspaceDepartment}
              </span>
              {!focusedSchedule && (
                <span aria-hidden="true">
                  {` · ${behaviorLabel(workspaceProgram.behavior_type)}`}
                </span>
              )}
            </>
          }
          backHref={buildProgramsHref({
            mode: "management",
            programId: focusedSchedule ? programId : null,
            departmentId,
            task: focusedSchedule
              ? scheduleOrigin === "settings"
                ? "settings"
                : "events"
              : null,
            eventFilter: focusedSchedule ? undefined : eventFilter,
            settingsSection: focusedSchedule ? undefined : settingsSection,
            hash,
          })}
          backLabel={COPY.programs.workspaceBack}
          onBack={handleWorkspaceBack}
          status={
            focusedSchedule ? undefined : (
              <ScreenStatus tone={lifecycleTone(workspaceProgram.lifecycle)}>
                {lifecycleLabel(workspaceProgram.lifecycle)}
              </ScreenStatus>
            )
          }
          action={headerAction}
        />
      )}

      {workspaceNotice !== null && (
        <output
          className="block rounded-[var(--screen-radius-control)] border border-[var(--screen-success)] bg-[var(--screen-success-surface)] p-3 text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
        >
          {workspaceNotice}
        </output>
      )}
      {workspaceFreshness !== "fresh" && (
        <output
          className="flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--screen-radius-control)] border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] p-3 text-sm text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
          aria-busy={workspaceFreshness === "refreshing"}
          data-testid="program-workspace-freshness"
        >
          <span>
            {workspaceFreshness === "refreshing"
              ? COPY.programs.workspaceRefreshing
              : COPY.programs.workspaceSavedStale}
          </span>
          {workspaceFreshness === "stale" && (
            <Button
              type="button"
              variant="outline"
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              onClick={() => void retryWorkspaceRefresh()}
            >
              {COPY.programs.workspaceRetryRefresh}
            </Button>
          )}
        </output>
      )}
      {eventNavigationBlocked && (eventDraftDirty || eventEditDirty) && (
        <output
          className="block rounded-[var(--screen-radius-control)] border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] p-3 text-sm text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
          data-testid="program-event-draft-navigation-blocked"
        >
          {eventEditDirty
            ? COPY.programs.eventEditUnsaved
            : COPY.programs.eventCreateUnsaved}
        </output>
      )}
      <AlertDialog
        open={pendingEventDraftNavigation !== null}
        onOpenChange={(open) => {
          if (!open) {
            continueEventDraftEditing();
          }
        }}
      >
        <AlertDialogContent className="min-w-0 max-w-[32rem]">
          <AlertDialogHeader className="min-w-0 gap-2">
            <AlertDialogTitle className="min-w-0 wrap-anywhere text-lg font-extrabold text-[var(--screen-ink)]">
              {eventEditDirty
                ? COPY.programs.eventEditLeaveTitle
                : COPY.programs.eventCreateLeaveTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 wrap-anywhere text-sm leading-[var(--screen-body-leading)] text-[var(--screen-muted)]">
              {eventEditDirty
                ? COPY.programs.eventEditLeaveDescription
                : COPY.programs.eventCreateLeaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex min-w-0 flex-wrap gap-2 max-[799px]:flex-col-reverse [&>*]:h-auto [&>*]:min-h-11 [&>*]:w-full [&>*]:whitespace-normal sm:[&>*]:w-fit">
            <AlertDialogCancel
              className="min-h-[var(--screen-touch-target)] border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-4 py-3 text-base font-bold text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
              onClick={continueEventDraftEditing}
            >
              {COPY.programs.eventCreateContinueEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-[var(--screen-touch-target)] px-4 py-3"
              onClick={discardEventDraftAndLeave}
            >
              {COPY.programs.eventCreateDiscardAndLeave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingSettingsNavigation !== null}
        onOpenChange={(open) => {
          if (!open) {
            continueSettingsEditing();
          }
        }}
      >
        <AlertDialogContent className="min-w-0 max-w-[32rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.settingsLeaveTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.settingsLeaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={continueSettingsEditing}>
              {COPY.programs.settingsContinueEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={discardSettingsAndLeave}
            >
              {COPY.programs.settingsDiscardAndLeave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!focusedSchedule && (
        <WorkspaceNavigation
          programId={programId}
          task={task}
          modules={state.modules}
          departmentId={departmentId}
          hash={hash}
          eventFilter={eventFilter}
          participantTab={participantTab}
          participantQuery={participantQuery}
          settingsSection={settingsSection}
          canManage={workspaceProgram.capabilities.manage}
          canAccessSettings={canAccessSettings}
          onTaskChange={handleWorkspaceTaskChange}
        />
      )}

      {task &&
      task === "events" &&
      eventId &&
      workspaceProgram.capabilities.manage ? (
        <EventDetail
          programId={programId}
          eventId={eventId}
          eventAction={eventAction}
          canManage={workspaceProgram.capabilities.manage}
          departmentId={departmentId}
          hash={hash}
          backHref={buildProgramsHref({
            mode: "management",
            programId,
            departmentId,
            task: "events",
            eventFilter,
            hash,
          })}
          onAttentionRefresh={onAttentionRefresh}
          onWorkspaceRefresh={refreshAuthoritativeWorkspace}
          onMutationBlockChange={setWorkspaceMutationBlocked}
          onDirtyChange={handleEventEditDirtyChange}
          onBack={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              !onEventChange
            ) {
              return;
            }
            if (workspaceMutationBlocked) {
              event.preventDefault();
              announce(COPY.programs.programTransportAmbiguous);
              return;
            }
            if (eventEditDirty) {
              event.preventDefault();
              setPendingEventDraftNavigation({ kind: "task", task: "events" });
              setEventNavigationBlocked(true);
              announce(COPY.programs.eventEditUnsaved);
              return;
            }
            event.preventDefault();
            onEventChange(null);
          }}
        />
      ) : task && canRenderTask ? (
        <WorkspaceTask
          program={workspaceProgram}
          task={task}
          modules={state.modules}
          departmentId={departmentId}
          hash={hash}
          attention={attention}
          cockpit={state.cockpit}
          notificationState={notificationState}
          onAttentionRefresh={onAttentionRefresh}
          onWorkspaceRefresh={refreshAuthoritativeWorkspace}
          onMutationBlockChange={setWorkspaceMutationBlocked}
          workspaceFreshness={workspaceFreshness}
          onTaskChange={handleWorkspaceTaskChange}
          onOpenEvent={
            onEventChange
              ? (id, action) =>
                  action === undefined
                    ? onEventChange(id)
                    : onEventChange(id, action)
              : undefined
          }
          onOpenAttendance={onOpenAttendance}
          eventFilter={eventFilter}
          onEventFilterChange={onEventFilterChange}
          participantTab={participantTab}
          participantQuery={participantQuery}
          onParticipantTabChange={onParticipantTabChange}
          onParticipantQueryChange={onParticipantQueryChange}
          settingsSection={settingsSection}
          onSettingsSectionChange={onSettingsSectionChange}
          scheduleOrigin={scheduleOrigin}
          scheduleEditor={scheduleEditor}
          scheduleRuleId={scheduleRuleId}
          onScheduleEditorChange={onScheduleEditorChange}
          onSettingsFocusChange={setSettingsEditorFocused}
          onSettingsDirtyChange={handleSettingsDirtyStateChange}
          onWorkspaceDirtyChange={handleEventDraftDirtyChange}
          onFocusedTaskFocusChange={setSettingsEditorFocused}
          onFocusedTaskDirtyChange={handleSettingsDirtyStateChange}
          scheduleDraftDiscardSignal={scheduleDraftDiscardSignal}
          scheduleDraftFocusKey={scheduleDraftFocusKey}
          scheduleSettingsSection={scheduleSettingsSection}
          settingsDraftDiscardSignal={settingsDraftDiscardSignal}
          settingsNavigationBlocked={settingsNavigationBlocked}
          onSettingsNavigationBlocked={setSettingsNavigationBlocked}
          onSettingsNavigationRequest={handleSettingsNavigationRequest}
          settingsNavigationAllowedRef={allowSettingsNavigation}
          headerAction={headerAction}
        />
      ) : task ? (
        <TaskUnavailable task={task} />
      ) : (
        <WorkspaceOverview
          program={workspaceProgram}
          cockpit={state.cockpit}
          summary={summary}
          departmentId={departmentId}
          hash={hash}
          onTaskChange={handleWorkspaceTaskChange}
          onOpenAttendance={onOpenAttendance}
          onSummaryRetry={retrySummary}
        />
      )}
    </section>
  );
};
