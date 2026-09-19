"use client";

import { createContext, useContext } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { HK_UTC_OFFSET_MINUTES } from "@/lib/programs/recurrence";
import { rememberDeepLink } from "@/lib/session";

import type {
  DepartmentModule,
  ManagementAttention,
  ManagementCockpitView,
  Program,
} from "./program-api";
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

export interface WorkspaceRouteContextValue {
  departmentId: string | null;
  hash: string | null;
  directoryQuery?: string | null;
}

const WorkspaceRouteContext = createContext<WorkspaceRouteContextValue>({
  departmentId: null,
  hash: null,
});

export const WorkspaceRouteProvider = ({
  value,
  children,
}: {
  value: WorkspaceRouteContextValue;
  children: React.ReactNode;
}) => (
  <WorkspaceRouteContext.Provider value={value}>
    {children}
  </WorkspaceRouteContext.Provider>
);

export function useWorkspaceRouteContext(): WorkspaceRouteContextValue {
  return useContext(WorkspaceRouteContext);
}

export interface WorkspaceTaskContextValue {
  program: Program;
  modules: readonly DepartmentModule[];
  attention: ManagementAttention | null;
  cockpit?: ManagementCockpitView | null;
  notificationState?: ManagementNotificationState;
  /** Validated management directory context for non-intercepted Links. */
  departmentId?: string | null;
  hash?: string | null;
  /** Management directory search retained by workspace links. */
  directoryQuery?: string | null;
  onAttentionRefresh: () => void;
  /** Reload the route-owned workspace after an explicit Settings conflict action. */
  onWorkspaceRefresh?: () => void | Promise<Program | void>;
  /** Freshness of the single route-owned Program/cockpit resource. */
  workspaceFreshness?: "fresh" | "refreshing" | "stale";
  /** Block cross-task navigation while a write outcome is being reconciled. */
  onMutationBlockChange?: (blocked: boolean) => void;
  onTaskChange: (
    task: ProgramsTask | null,
    eventId?: string | null,
    scheduleOrigin?: ProgramsScheduleOrigin
  ) => void;
  onOpenEvent?: (eventId: string, eventAction?: ManagementEventAction) => void;
  /** Open the shared focused Attendance roster for an exact Event. */
  onOpenAttendance?: (eventId: string) => void;
  /** The active task has an unsaved local draft that the shell must protect. */
  onWorkspaceDirtyChange?: (dirty: boolean) => void;
  onFocusedTaskFocusChange?: (focused: boolean) => void;
  onFocusedTaskDirtyChange?: (dirty: boolean) => void;
  /** URL-owned Events filter and its replace-only updater. */
  eventFilter?: ProgramsEventFilter;
  onEventFilterChange?: (filter: ProgramsEventFilter) => void;
  /** URL-owned Participants tab/search and replace-only updaters. */
  participantTab?: ProgramsParticipantTab;
  participantQuery?: string;
  onParticipantTabChange?: (tab: ProgramsParticipantTab) => void;
  onParticipantQueryChange?: (query: string) => void;
  /** URL-owned focused Settings section. */
  settingsSection?: ProgramsSettingsSection;
  onSettingsSectionChange?: (section: ProgramsSettingsSection | null) => void;
  /** Origin used to enter the focused Schedule task. */
  scheduleOrigin?: ProgramsScheduleOrigin;
  scheduleEditor?: ProgramsScheduleEditor;
  scheduleRuleId?: string;
  onScheduleEditorChange?: (
    editor: ProgramsScheduleEditor | null,
    ruleId?: string | null
  ) => void;
  /** One-shot bypass for an already-confirmed external navigation. */
  settingsNavigationAllowedRef?: { current: boolean };
  /** Incremented when parent Back Discard must drop inline occurrence drafts. */
  scheduleDraftDiscardSignal?: number;
}

const WorkspaceTaskContext = createContext<WorkspaceTaskContextValue | null>(
  null
);

export const WorkspaceTaskProvider = ({
  value,
  children,
}: {
  value: WorkspaceTaskContextValue;
  children: React.ReactNode;
}) => (
  <WorkspaceTaskContext.Provider value={value}>
    {children}
  </WorkspaceTaskContext.Provider>
);

export function useWorkspaceTaskContext(): WorkspaceTaskContextValue {
  const value = useContext(WorkspaceTaskContext);
  if (!value) {
    throw new Error("Workspace task must render inside WorkspaceTaskProvider");
  }
  return value;
}

/**
 * A confirmed mutation must not become a false failure when its follow-up
 * workspace read is unavailable. ProgramWorkspace owns the stale indicator;
 * task-level callers only need a safe, non-rejecting invalidation boundary.
 */
export async function refreshWorkspaceAfterMutation(
  refresh?: () => void | Promise<Program | void>
): Promise<Program | void> {
  try {
    return await refresh?.();
  } catch (error) {
    void error;
    return undefined;
  }
}

export function hasModule(
  modules: readonly DepartmentModule[],
  moduleKey: DepartmentModule["module_key"]
): boolean {
  return modules.some(
    ({ module_key, enabled }) => module_key === moduleKey && enabled === 1
  );
}

export function redirectToLoginIfRequired(error: unknown): boolean {
  if (!(error instanceof RpcError) || error.problem.code !== "AUTH_REQUIRED") {
    return false;
  }
  rememberDeepLink(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.assign("/");
  return true;
}

export function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

export function eventWallParts(value: string): { date: string; time: string } {
  const shifted = new Date(
    new Date(value).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  );
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

export function taskLabel(task: ProgramsTask): string {
  return task === "events"
    ? COPY.programs.workspaceTaskEvents
    : task === "participants"
      ? COPY.programs.workspaceTaskParticipants
      : task === "schedule"
        ? COPY.programs.workspaceTaskSchedule
        : task === "settings"
          ? COPY.programs.workspaceTaskSettings
          : COPY.programs.workspaceTaskNotifications;
}
