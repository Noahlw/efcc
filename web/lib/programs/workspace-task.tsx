"use client";

import { CalendarDays, ChevronRight, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { MouseEventHandler } from "react";

import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";
import {
  ScreenCard,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStatus,
  ScreenTab,
  ScreenTabs,
  ScreenTaskGrid,
  ScreenTaskSurface,
} from "@/lib/screen-foundations";

import type {
  DepartmentModule,
  ManagementCockpitView,
  Program,
  ProgramEvent,
} from "./program-api";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsTask } from "./programs-intent";
import {
  formatEventTime,
  hasModule,
  taskLabel,
  WorkspaceTaskProvider,
} from "./workspace-context";
import type { WorkspaceTaskContextValue } from "./workspace-context";
import { EventsTask } from "./workspace-events-task";
import { ParticipantsTask } from "./workspace-participants-task";
import { ScheduleTask } from "./workspace-schedule-task";
import { SettingsTask } from "./workspace-settings-task";

export type WorkspaceSummaryRead<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "unavailable"; message: string };

export interface WorkspaceSummaryState {
  events: WorkspaceSummaryRead<ProgramEvent[]>;
  pendingRequests: WorkspaceSummaryRead<number>;
  activeParticipants: WorkspaceSummaryRead<number>;
}

function labelForWorkspaceTask(value: ProgramsTask): string {
  return value === "settings"
    ? COPY.programs.workspaceSettingsTab
    : taskLabel(value);
}

function taskLinkClick(
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void,
  nextTask: ProgramsTask | null,
  eventId?: string | null
): MouseEventHandler<HTMLAnchorElement> {
  return (event) => {
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
    event.preventDefault();
    if (eventId === undefined) {
      onTaskChange(nextTask);
    } else {
      onTaskChange(nextTask, eventId);
    }
  };
}

export const WorkspaceNavigation = ({
  programId,
  task,
  modules,
  departmentId,
  hash,
  canManage = true,
  canAccessSettings = canManage,
  onTaskChange,
}: {
  programId: string;
  task?: ProgramsTask;
  modules: readonly DepartmentModule[];
  departmentId?: string | null;
  hash?: string | null;
  canManage?: boolean;
  canAccessSettings?: boolean;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
}) => {
  const tasks: ProgramsTask[] = [
    ...(canManage && hasModule(modules, "events") ? ["events" as const] : []),
    ...(canManage && hasModule(modules, "enrollment")
      ? ["participants" as const]
      : []),
    ...(canAccessSettings ? ["settings" as const] : []),
  ];
  return (
    <ScreenTabs
      aria-label={COPY.programs.workspaceTaskLabel}
      data-testid="programs-workspace-tabs"
    >
      <ScreenTab asChild selected={task === undefined}>
        <Link
          href={buildProgramsHref({
            mode: "management",
            programId,
            departmentId,
            hash,
          })}
          onClick={taskLinkClick(onTaskChange, null)}
        >
          {COPY.programs.workspaceOverviewTab}
        </Link>
      </ScreenTab>
      {tasks.map((value) => (
        <ScreenTab asChild key={value} selected={task === value}>
          <Link
            href={buildProgramsHref({
              mode: "management",
              programId,
              departmentId,
              task: value,
              hash,
            })}
            onClick={taskLinkClick(onTaskChange, value)}
          >
            {labelForWorkspaceTask(value)}
          </Link>
        </ScreenTab>
      ))}
    </ScreenTabs>
  );
};

const summaryValue = (read: WorkspaceSummaryRead<number>): string =>
  read.status === "ready" ? String(read.value) : "—";

const Chevron = () => (
  <ChevronRight
    aria-hidden="true"
    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
    strokeWidth={1.8}
  />
);

// oxlint-disable-next-line eslint/complexity -- overview keeps the existing task summary branches local
export const WorkspaceOverview = ({
  program,
  cockpit,
  summary,
  departmentId,
  hash,
  onOpenFacts,
  onTaskChange,
}: {
  program: Program;
  cockpit?: ManagementCockpitView | null;
  summary: WorkspaceSummaryState;
  departmentId?: string | null;
  hash?: string | null;
  onOpenFacts: () => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
}) => {
  const eventRead =
    summary.events.status === "ready" ? summary.events.value : null;
  const fallbackNearestEvent = useMemo(
    () =>
      eventRead?.find(
        ({ status, starts_at }) =>
          status === "Active" && new Date(starts_at).getTime() >= Date.now()
      ) ?? eventRead?.find(({ status }) => status === "Active"),
    [eventRead]
  );

  const nextEvent =
    cockpit === undefined
      ? fallbackNearestEvent
        ? {
            event_id: fallbackNearestEvent.event_id,
            program_id: program.program_id,
            title: null,
            name: null,
            starts_at: fallbackNearestEvent.starts_at,
            ends_at: fallbackNearestEvent.ends_at,
            location: null,
            source: fallbackNearestEvent.source,
            is_recurring: program.behavior_type === "Recurring",
            checked_in_count: 0,
            roster_count: 0,
          }
        : null
      : cockpit?.next_event;
  const eventsCount =
    cockpit === undefined
      ? summary.events.status === "ready"
        ? summary.events.value.filter((e) => e.status === "Active").length
        : 0
      : (cockpit?.active_event_count ?? 0);

  const pendingCount =
    cockpit === undefined
      ? summary.pendingRequests.status === "ready"
        ? summary.pendingRequests.value
        : 0
      : (cockpit?.pending_enrollment_count ?? 0);

  return (
    <div className="grid min-w-0">
      <ScreenSection title={COPY.programs.cockpitSummary}>
        <div className="grid grid-cols-2 border-y border-[var(--screen-line)]">
          <div className="grid gap-0.5 py-3">
            <strong className="text-[22px] leading-7 tracking-[-0.03em]">
              {summaryValue(summary.activeParticipants)}
            </strong>
            <span className="text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
              {COPY.programs.cockpitActiveParticipants}
            </span>
          </div>
          <div className="grid gap-0.5 border-l border-[var(--screen-line)] py-3 pl-4">
            <strong className="text-[22px] leading-7 tracking-[-0.03em]">
              {summaryValue(summary.pendingRequests)}
            </strong>
            <span className="text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
              {COPY.programs.cockpitPendingRequests}
            </span>
          </div>
        </div>
      </ScreenSection>

      {program.capabilities.manage && nextEvent && (
        <ScreenSection
          title={COPY.programs.cockpitNextMeeting}
          action={
            <ScreenStatus tone="info">
              {COPY.programs.cockpitUpcomingStatus}
            </ScreenStatus>
          }
        >
          <ScreenCard tone="emphasis">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 min-w-0 wrap-anywhere text-base font-bold leading-[22px]">
                  {nextEvent.title || nextEvent.name || program.name}
                </h3>
                <p className="m-0 mt-0.5 min-w-0 wrap-anywhere text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                  {formatEventTime(nextEvent.starts_at)}
                  {nextEvent.location ? ` · ${nextEvent.location}` : ""}
                </p>
                {(nextEvent.is_recurring ||
                  nextEvent.source === "SCHEDULE") && (
                  <ScreenStatus className="mt-1" tone="accent">
                    {COPY.programs.cockpitAutoScheduled}
                  </ScreenStatus>
                )}
              </div>
              {(nextEvent.checked_in_count > 0 ||
                nextEvent.roster_count > 0) && (
                <div className="shrink-0 text-right">
                  <strong className="text-base font-bold">
                    {nextEvent.checked_in_count}/{nextEvent.roster_count}
                  </strong>
                  <span className="block text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                    {COPY.programs.cockpitCheckedIn}
                  </span>
                </div>
              )}
            </div>
            <Button
              asChild
              className="min-h-[var(--screen-touch-target)] w-full rounded-[var(--screen-radius-control)] bg-[var(--screen-accent)] px-4 py-2 text-white hover:bg-[var(--screen-accent-deep)]"
            >
              <Link
                href={buildProgramsHref({
                  mode: "management",
                  programId: program.program_id,
                  departmentId,
                  task: "participants",
                  eventId: nextEvent.event_id,
                  hash,
                })}
                onClick={taskLinkClick(
                  onTaskChange,
                  "participants",
                  nextEvent.event_id
                )}
              >
                {COPY.programs.cockpitManageRoster}
              </Link>
            </Button>
          </ScreenCard>
        </ScreenSection>
      )}

      <ScreenSection
        title={COPY.programs.cockpitOperations}
        action={
          <span className="text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
            {COPY.programs.cockpitWeeklyWork}
          </span>
        }
      >
        <ScreenTaskGrid>
          {program.capabilities.manage && (
            <>
              <ScreenTaskSurface asChild>
                <Link
                  href={buildProgramsHref({
                    mode: "management",
                    programId: program.program_id,
                    departmentId,
                    task: "events",
                    hash,
                  })}
                  onClick={taskLinkClick(onTaskChange, "events")}
                >
                  <CalendarDays
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-accent)]"
                    strokeWidth={1.8}
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="min-w-0 wrap-anywhere text-[length:var(--screen-body-size)] leading-[21px]">
                      {COPY.programs.cockpitEventsTile}
                    </strong>
                    <span className="min-w-0 wrap-anywhere text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                      {COPY.programs.cockpitEventsCount.replace(
                        "{count}",
                        String(eventsCount)
                      )}
                    </span>
                  </div>
                </Link>
              </ScreenTaskSurface>
              <ScreenTaskSurface asChild>
                <Link
                  href={buildProgramsHref({
                    mode: "management",
                    programId: program.program_id,
                    departmentId,
                    task: "participants",
                    hash,
                  })}
                  onClick={taskLinkClick(onTaskChange, "participants")}
                >
                  <Users
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-accent)]"
                    strokeWidth={1.8}
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="min-w-0 wrap-anywhere text-[length:var(--screen-body-size)] leading-[21px]">
                      {COPY.programs.cockpitParticipantsTile}
                    </strong>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                      {pendingCount > 0 ? (
                        <ScreenStatus tone="pending">
                          {COPY.programs.cockpitPendingLabel.replace(
                            "{count}",
                            String(pendingCount)
                          )}
                        </ScreenStatus>
                      ) : (
                        <span>{COPY.programs.cockpitNoPending}</span>
                      )}
                    </span>
                  </div>
                </Link>
              </ScreenTaskSurface>
            </>
          )}
        </ScreenTaskGrid>
      </ScreenSection>

      <ScreenSection
        title={COPY.programs.cockpitOthers}
        action={
          <span className="text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
            {COPY.programs.cockpitLowFrequency}
          </span>
        }
      >
        <ScreenRowList>
          <ScreenRow asChild density="settings">
            <Button
              className="rounded-none border-0 bg-transparent px-0 text-left hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
              type="button"
              onClick={onOpenFacts}
            >
              <Settings
                aria-hidden="true"
                className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                strokeWidth={1.8}
              />
              <ScreenRowMain>
                <ScreenRowTitle>
                  {COPY.programs.cockpitCourseFacts}
                </ScreenRowTitle>
                <ScreenRowMeta>
                  {COPY.programs.cockpitCourseFactsHint}
                </ScreenRowMeta>
              </ScreenRowMain>
              <ScreenRowTrailing>
                <Chevron />
              </ScreenRowTrailing>
            </Button>
          </ScreenRow>
          {(program.capabilities.manage ||
            program.capabilities.leader_assign) && (
            <ScreenRow asChild density="settings">
              <Link
                href={buildProgramsHref({
                  mode: "management",
                  programId: program.program_id,
                  departmentId,
                  task: "settings",
                  hash,
                })}
                onClick={taskLinkClick(onTaskChange, "settings")}
              >
                <Settings
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                  strokeWidth={1.8}
                />
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {COPY.programs.cockpitSettings}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {COPY.programs.workspaceTaskSettingsLead}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenRowTrailing>
                  <Chevron />
                </ScreenRowTrailing>
              </Link>
            </ScreenRow>
          )}
        </ScreenRowList>
      </ScreenSection>
    </div>
  );
};

export interface WorkspaceTaskProps extends WorkspaceTaskContextValue {
  task: ProgramsTask;
}

export const TaskUnavailable = ({ task }: { task: ProgramsTask }) => (
  <ScreenSection title={taskLabel(task)}>
    <ScreenState
      kind="not-found"
      title={COPY.programs.workspaceTaskUnavailable}
    />
  </ScreenSection>
);

export const WorkspaceTask = ({
  task,
  program,
  modules,
  attention,
  departmentId,
  hash,
  onAttentionRefresh,
  onTaskChange,
  onOpenEvent,
}: WorkspaceTaskProps) => {
  const value: WorkspaceTaskContextValue = {
    program,
    modules,
    attention,
    departmentId,
    hash,
    onAttentionRefresh,
    onTaskChange,
    onOpenEvent,
  };

  return (
    <WorkspaceTaskProvider value={value}>
      {task === "events" ? (
        hasModule(modules, "events") ? (
          <EventsTask />
        ) : (
          <TaskUnavailable task={task} />
        )
      ) : task === "participants" ? (
        hasModule(modules, "enrollment") ? (
          <ParticipantsTask />
        ) : (
          <TaskUnavailable task={task} />
        )
      ) : task === "settings" ? (
        <SettingsTask />
      ) : task === "schedule" ? (
        <ScheduleTask />
      ) : (
        <TaskUnavailable task={task} />
      )}
    </WorkspaceTaskProvider>
  );
};
