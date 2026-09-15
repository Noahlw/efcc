"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

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

import { EventDetail } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsTask } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";
import {
  hasModule,
  redirectToLoginIfRequired,
  useWorkspaceRouteContext,
} from "./workspace-context";
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
  /** NTF-01 (#256): fresh server-shaped attention counts from the shell. */
  attention?: ManagementAttention | null;
  onAttentionRefresh?: () => void;
  /** Compact route-level action rendered in the shared ScreenHeader. */
  headerAction?: ReactNode;
  onBack: () => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
  /** Opens the shared focused attendance roster for an exact Event. */
  onOpenAttendance?: (eventId: string) => void;
  /** EVT-01 (#251): navigate the Event deep link; null returns to the list. */
  onEventChange?: (eventId: string | null) => void;
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
  created = false,
  attention = null,
  onAttentionRefresh = () => {},
  headerAction,
  onBack,
  onTaskChange,
  onOpenAttendance,
  onEventChange,
}: ProgramWorkspaceProps) => {
  const { departmentId, hash } = useWorkspaceRouteContext();
  const [summary, setSummary] = useState<WorkspaceSummaryState>(() =>
    initialSummary()
  );
  const [settingsEditorFocused, setSettingsEditorFocused] = useState(false);
  const [settingsEditorDirty, setSettingsEditorDirty] = useState(false);
  const [settingsNavigationBlocked, setSettingsNavigationBlocked] =
    useState(false);
  const [eventDraftDirty, setEventDraftDirty] = useState(false);
  const [eventNavigationBlocked, setEventNavigationBlocked] = useState(false);
  const handleEventDraftDirtyChange = useCallback((dirty: boolean) => {
    setEventDraftDirty(dirty);
    if (!dirty) {
      setEventNavigationBlocked(false);
    }
  }, []);
  const createdFlash = created && !task;
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(
    createdFlash ? COPY.programs.programCreatedNotice : null
  );
  const [workspaceFreshness, setWorkspaceFreshness] = useState<
    "fresh" | "refreshing" | "stale"
  >("fresh");
  const [workspaceMutationBlocked, setWorkspaceMutationBlocked] =
    useState(false);
  const mounted = useRef(true);
  const summaryRequestId = useRef(0);
  const workspaceRefreshSequence = useRef(0);
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
    if (task !== "settings") {
      setSettingsEditorFocused(false);
      setSettingsEditorDirty(false);
      setSettingsNavigationBlocked(false);
    }
  }, [task]);
  useEffect(() => {
    setWorkspaceMutationBlocked(false);
  }, [eventId, programId, task]);

  useEffect(() => {
    if (task !== "events" || !eventDraftDirty) {
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
      setEventNavigationBlocked(true);
      announce(COPY.programs.eventCreateUnsaved);
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
  }, [eventDraftDirty, task]);
  const focusedSettingsEditor = task === "settings" && settingsEditorFocused;
  const {
    state,
    run: loadWorkspace,
    refresh: refreshWorkspaceResource,
    retry,
  } = useAsyncResource<
    {
      program: Program;
      department: Department | null;
      modules: DepartmentModule[];
      cockpit?: ManagementCockpitView | null;
    },
    WorkspaceState
  >(
    async () => getManagementProgram(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ program, department, modules, cockpit }) => ({
        kind: "ready",
        program,
        department,
        modules,
        cockpit,
      }),
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
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
    const sequence = ++workspaceRefreshSequence.current;
    setWorkspaceFreshness("refreshing");
    try {
      const refreshed = await refreshWorkspaceResource();
      if (mounted.current && workspaceRefreshSequence.current === sequence) {
        // A superseded response is not evidence that the displayed workspace
        // became fresh; settle it as stale so Retry Refresh remains available.
        setWorkspaceFreshness(refreshed === undefined ? "stale" : "fresh");
      }
      return refreshed?.program;
    } catch (error) {
      if (mounted.current && workspaceRefreshSequence.current === sequence) {
        setWorkspaceFreshness("stale");
      }
      throw error;
    }
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
    if (settingsEditorFocused && settingsEditorDirty) {
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (eventDraftDirty) {
      setEventNavigationBlocked(true);
      announce(COPY.programs.eventCreateUnsaved);
      return;
    }
    if (focusedSchedule) {
      onTaskChange("events");
      return;
    }
    onBack();
  };
  const handleWorkspaceTaskChange = (
    nextTask: ProgramsTask | null,
    nextEventId?: string | null
  ) => {
    if (workspaceMutationBlocked) {
      announce(COPY.programs.programTransportAmbiguous);
      return;
    }
    if (settingsEditorFocused && settingsEditorDirty) {
      setSettingsNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    if (eventDraftDirty) {
      setEventNavigationBlocked(true);
      announce(COPY.programs.eventCreateUnsaved);
      return;
    }
    if (nextEventId === undefined) {
      onTaskChange(nextTask);
    } else {
      onTaskChange(nextTask, nextEventId);
    }
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
            task: focusedSchedule ? "events" : null,
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
      {eventNavigationBlocked && eventDraftDirty && (
        <output
          className="block rounded-[var(--screen-radius-control)] border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] p-3 text-sm text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
          data-testid="program-event-draft-navigation-blocked"
        >
          {COPY.programs.eventCreateUnsaved}
        </output>
      )}
      {!focusedSchedule && (
        <WorkspaceNavigation
          programId={programId}
          task={task}
          modules={state.modules}
          departmentId={departmentId}
          hash={hash}
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
          canManage={workspaceProgram.capabilities.manage}
          departmentId={departmentId}
          hash={hash}
          backHref={buildProgramsHref({
            mode: "management",
            programId,
            departmentId,
            task: "events",
            hash,
          })}
          onAttentionRefresh={onAttentionRefresh}
          onWorkspaceRefresh={refreshAuthoritativeWorkspace}
          onMutationBlockChange={setWorkspaceMutationBlocked}
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
          onAttentionRefresh={onAttentionRefresh}
          onWorkspaceRefresh={refreshAuthoritativeWorkspace}
          onMutationBlockChange={setWorkspaceMutationBlocked}
          workspaceFreshness={workspaceFreshness}
          onTaskChange={handleWorkspaceTaskChange}
          onOpenEvent={onEventChange ? (id) => onEventChange(id) : undefined}
          onSettingsFocusChange={setSettingsEditorFocused}
          onSettingsDirtyChange={setSettingsEditorDirty}
          onWorkspaceDirtyChange={handleEventDraftDirtyChange}
          settingsNavigationBlocked={settingsNavigationBlocked}
          onSettingsNavigationBlocked={setSettingsNavigationBlocked}
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
