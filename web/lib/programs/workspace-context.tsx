"use client";

import { createContext, useContext } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { HK_UTC_OFFSET_MINUTES } from "@/lib/programs/recurrence";
import { rememberDeepLink } from "@/lib/session";

import type {
  DepartmentModule,
  ManagementAttention,
  Program,
} from "./program-api";
import type { ProgramsTask } from "./programs-intent";

export interface WorkspaceTaskContextValue {
  program: Program;
  modules: readonly DepartmentModule[];
  attention: ManagementAttention | null;
  onAttentionRefresh: () => void;
  onTaskChange: (
    task: ProgramsTask | null,
    eventId?: string | null
  ) => void;
  onOpenEvent?: (eventId: string) => void;
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
      : task === "settings"
        ? COPY.programs.workspaceTaskSettings
        : COPY.programs.workspaceTaskNotifications;
}
