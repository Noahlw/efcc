"use client";

import {
  CalendarDays,
  ChevronRight,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { MouseEventHandler, ReactNode } from "react";

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

type WorkspaceNextEvent = ManagementCockpitView["next_event"];

function summaryStateText(read: WorkspaceSummaryRead<unknown>): string {
  if (read.status === "loading") {
    return COPY.programs.workspaceSummaryLoading;
  }

  return read.status === "unavailable" ? read.message : "";
}

const SummaryMetric = ({
  label,
  read,
}: {
  label: string;
  read: WorkspaceSummaryRead<number>;
}) => (
  <div
    className="grid min-w-0 gap-0.5 py-3"
    aria-busy={read.status === "loading"}
  >
    <strong className="text-[22px] leading-7 tracking-[-0.03em]">
      {summaryValue(read)}
    </strong>
    <span className="min-w-0 wrap-anywhere text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
      {label}
    </span>
    {read.status !== "ready" && (
      <span className="min-w-0 wrap-anywhere text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
        {summaryStateText(read)}
      </span>
    )}
  </div>
);

function availableEvent(event: ProgramEvent): boolean {
  return event.status === "Active" && event.availability !== "Inactive";
}

function openCheckInEvent(event: ProgramEvent, now = Date.now()): boolean {
  const opensAt = Date.parse(event.check_in_window_opens_at ?? "");
  const closesAt = Date.parse(event.check_in_window_closes_at ?? "");
  return (
    Number.isFinite(opensAt) &&
    Number.isFinite(closesAt) &&
    now >= opensAt &&
    now <= closesAt
  );
}

function summaryReadAsNumber<T>(
  read: WorkspaceSummaryRead<T>,
  project: (value: T) => number
): WorkspaceSummaryRead<number> {
  if (read.status === "ready") {
    return { status: "ready", value: project(read.value) };
  }
  return read;
}

function fallbackNextEvent(
  read: WorkspaceSummaryRead<ProgramEvent[]>,
  program: Program
): WorkspaceSummaryRead<WorkspaceNextEvent> {
  if (read.status !== "ready") {
    return read;
  }

  const activeEvents = read.value.filter(availableEvent);
  const openEvents = activeEvents
    .filter((event) => openCheckInEvent(event))
    .sort(
      (left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at)
    );
  const futureEvents = activeEvents
    .filter((event) => {
      const startsAt = Date.parse(event.starts_at);
      return Number.isFinite(startsAt) && startsAt >= Date.now();
    })
    .sort(
      (left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at)
    );
  const event = openEvents[0] ?? futureEvents[0] ?? activeEvents[0];
  if (!event) {
    return { status: "ready", value: null };
  }

  return {
    status: "ready",
    value: {
      event_id: event.event_id,
      program_id: program.program_id,
      title: event.name ?? null,
      name: event.name ?? null,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: event.location ?? null,
      source: event.source,
      is_recurring:
        program.behavior_type === "Recurring" || event.source === "SCHEDULE",
      checked_in_count: 0,
      roster_count: 0,
    },
  };
}

function retryAction(onRetry: (() => void) | undefined) {
  return onRetry ? (
    <Button
      className="w-fit whitespace-normal"
      type="button"
      onClick={onRetry}
      variant="outline"
    >
      {COPY.programs.workspaceRetry}
    </Button>
  ) : undefined;
}

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
  onTaskChange,
  onOpenAttendance,
  onSummaryRetry,
}: {
  program: Program;
  cockpit?: ManagementCockpitView | null;
  summary: WorkspaceSummaryState;
  departmentId?: string | null;
  hash?: string | null;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
  /** Open the shared focused attendance roster for the next Event. */
  onOpenAttendance?: (eventId: string) => void;
  onSummaryRetry?: () => void;
}) => {
  const nextEventRead = useMemo(() => {
    if (cockpit === undefined) {
      return fallbackNextEvent(summary.events, program);
    }
    if (cockpit === null) {
      return {
        status: "unavailable",
        message: COPY.programs.workspaceSummaryUnavailable,
      } satisfies WorkspaceSummaryRead<WorkspaceNextEvent>;
    }
    if (cockpit.program_id !== program.program_id) {
      return {
        status: "unavailable",
        message: COPY.programs.workspaceSummaryUnavailable,
      } satisfies WorkspaceSummaryRead<WorkspaceNextEvent>;
    }
    return {
      status: "ready",
      value: cockpit.next_event,
    } satisfies WorkspaceSummaryRead<WorkspaceNextEvent>;
  }, [cockpit, program, summary.events]);

  const eventsCountRead = useMemo(() => {
    if (cockpit === undefined) {
      return summaryReadAsNumber(
        summary.events,
        (events) => events.filter(availableEvent).length
      );
    }
    if (cockpit === null || cockpit.program_id !== program.program_id) {
      return {
        status: "unavailable",
        message: COPY.programs.workspaceSummaryUnavailable,
      } satisfies WorkspaceSummaryRead<number>;
    }
    return {
      status: "ready",
      value: cockpit.active_event_count,
    } satisfies WorkspaceSummaryRead<number>;
  }, [cockpit, program.program_id, summary.events]);

  const pendingCountRead = useMemo(() => {
    if (cockpit === undefined) {
      return summary.pendingRequests;
    }
    if (cockpit === null || cockpit.program_id !== program.program_id) {
      return {
        status: "unavailable",
        message: COPY.programs.workspaceSummaryUnavailable,
      } satisfies WorkspaceSummaryRead<number>;
    }
    return {
      status: "ready",
      value: cockpit.pending_enrollment_count,
    } satisfies WorkspaceSummaryRead<number>;
  }, [cockpit, program.program_id, summary.pendingRequests]);

  const nextEvent =
    nextEventRead.status === "ready" ? nextEventRead.value : null;
  const openEventChoices =
    cockpit?.program_id === program.program_id
      ? (cockpit.open_events ?? [])
      : [];
  const summaryNeedsRetry = [
    summary.activeParticipants,
    eventsCountRead,
    pendingCountRead,
    nextEventRead,
  ].some(
    (read) =>
      read.status === "unavailable" &&
      read.message !== COPY.programs.workspaceTaskUnavailable
  );
  const nextEventOwnsRetry =
    program.capabilities.manage && nextEventRead.status !== "ready";

  return (
    <div className="grid min-w-0">
      <ScreenSection title={COPY.programs.cockpitSummary}>
        <div className="grid grid-cols-2 border-y border-[var(--screen-line)]">
          <SummaryMetric
            label={COPY.programs.cockpitActiveParticipants}
            read={summary.activeParticipants}
          />
          <div className="min-w-0 border-l border-[var(--screen-line)] pl-4">
            <SummaryMetric
              label={COPY.programs.cockpitPendingRequests}
              read={pendingCountRead}
            />
          </div>
        </div>
        {summaryNeedsRetry && !nextEventOwnsRetry && (
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)] pt-3">
            <span className="min-w-0 wrap-anywhere text-sm text-[var(--screen-muted)]">
              {COPY.programs.workspaceSummaryUnavailable}
            </span>
            {retryAction(onSummaryRetry)}
          </div>
        )}
      </ScreenSection>

      {program.capabilities.manage &&
        (nextEventRead.status !== "ready" || nextEvent !== null) && (
          <ScreenSection
            title={
              openEventChoices.length > 1
                ? COPY.programs.cockpitOpenMeetings
                : COPY.programs.cockpitNextMeeting
            }
            action={
              nextEventRead.status === "ready" ? (
                <ScreenStatus tone="info">
                  {COPY.programs.cockpitUpcomingStatus}
                </ScreenStatus>
              ) : undefined
            }
          >
            {nextEventRead.status === "ready" && nextEvent ? (
              openEventChoices.length > 1 ? (
                <ScreenRowList>
                  <p className="m-0 px-3 pb-2 text-sm text-[var(--screen-muted)]">
                    {COPY.programs.cockpitChooseMeeting}
                  </p>
                  {openEventChoices.map((openEvent) => (
                    <ScreenRow asChild key={openEvent.event_id}>
                      <Link
                        href={buildProgramsHref({
                          mode: "management",
                          programId: program.program_id,
                          departmentId,
                          task: "events",
                          eventId: openEvent.event_id,
                          hash,
                        })}
                        onClick={(event) => {
                          if (onOpenAttendance) {
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
                            onOpenAttendance(openEvent.event_id);
                            return;
                          }
                          taskLinkClick(
                            onTaskChange,
                            "events",
                            openEvent.event_id
                          )(event);
                        }}
                      >
                        <ScreenRowMain>
                          <ScreenRowTitle>
                            {openEvent.title || openEvent.name || program.name}
                          </ScreenRowTitle>
                          <ScreenRowMeta>
                            {formatEventTime(openEvent.starts_at)}
                            {openEvent.location
                              ? ` · ${openEvent.location}`
                              : ""}
                          </ScreenRowMeta>
                        </ScreenRowMain>
                        <ScreenRowTrailing>
                          <Chevron />
                        </ScreenRowTrailing>
                      </Link>
                    </ScreenRow>
                  ))}
                </ScreenRowList>
              ) : (
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
                      href={
                        onOpenAttendance
                          ? `/events?eventId=${encodeURIComponent(nextEvent.event_id)}`
                          : buildProgramsHref({
                              mode: "management",
                              programId: program.program_id,
                              departmentId,
                              task: "events",
                              eventId: nextEvent.event_id,
                              hash,
                            })
                      }
                      onClick={(event) => {
                        if (!onOpenAttendance) {
                          taskLinkClick(
                            onTaskChange,
                            "events",
                            nextEvent.event_id
                          )(event);
                          return;
                        }
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
                        onOpenAttendance(nextEvent.event_id);
                      }}
                    >
                      {COPY.programs.cockpitManageRoster}
                    </Link>
                  </Button>
                </ScreenCard>
              )
            ) : (
              <ScreenState
                kind={nextEventRead.status === "loading" ? "loading" : "error"}
                title={
                  nextEventRead.status === "loading"
                    ? COPY.programs.workspaceSummaryLoading
                    : COPY.programs.workspaceSummaryUnavailable
                }
                description={
                  nextEventRead.status === "unavailable"
                    ? nextEventRead.message
                    : undefined
                }
                action={
                  nextEventRead.status === "unavailable"
                    ? retryAction(onSummaryRetry)
                    : undefined
                }
              />
            )}
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
                        summaryValue(eventsCountRead)
                      )}
                    </span>
                    {eventsCountRead.status !== "ready" && (
                      <span className="min-w-0 wrap-anywhere text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                        {summaryStateText(eventsCountRead)}
                      </span>
                    )}
                  </div>
                </Link>
              </ScreenTaskSurface>
              <ScreenTaskSurface asChild>
                <Link
                  href={buildProgramsHref({
                    mode: "management",
                    programId: program.program_id,
                    departmentId,
                    task: "events",
                    hash: "#create-event",
                  })}
                >
                  <Plus
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-accent)]"
                    strokeWidth={1.8}
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="min-w-0 wrap-anywhere text-[length:var(--screen-body-size)] leading-[21px]">
                      {COPY.programs.cockpitAddEvent}
                    </strong>
                    <span className="min-w-0 wrap-anywhere text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                      {COPY.programs.cockpitAddEventHint}
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
                      {pendingCountRead.status === "ready" &&
                      pendingCountRead.value > 0 ? (
                        <ScreenStatus tone="pending">
                          {COPY.programs.cockpitPendingLabel.replace(
                            "{count}",
                            String(pendingCountRead.value)
                          )}
                        </ScreenStatus>
                      ) : pendingCountRead.status === "ready" ? (
                        <span>{COPY.programs.cockpitNoPending}</span>
                      ) : (
                        <span className="min-w-0 wrap-anywhere">
                          {summaryValue(pendingCountRead)} ·{" "}
                          {summaryStateText(pendingCountRead)}
                        </span>
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
          {program.capabilities.manage && (
            <ScreenRow asChild density="settings">
              <Link
                href={buildProgramsHref({
                  mode: "management",
                  programId: program.program_id,
                  departmentId,
                  task: "schedule",
                  hash,
                })}
                onClick={taskLinkClick(onTaskChange, "schedule")}
              >
                <CalendarDays
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                  strokeWidth={1.8}
                />
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {COPY.programs.workspaceTaskSchedule}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {COPY.programs.schedulePageLead}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenRowTrailing>
                  <Chevron />
                </ScreenRowTrailing>
              </Link>
            </ScreenRow>
          )}
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
  /** Let a focused Settings editor take ownership of the route header. */
  onSettingsFocusChange?: (focused: boolean) => void;
  /** Let the workspace protect route navigation from focused Settings drafts. */
  onSettingsDirtyChange?: (dirty: boolean) => void;
  /** Protect navigation while the Events task owns an unsaved create draft. */
  onWorkspaceDirtyChange?: (dirty: boolean) => void;
  /** Surface the shared Settings navigation-blocked guidance. */
  settingsNavigationBlocked?: boolean;
  onSettingsNavigationBlocked?: (blocked: boolean) => void;
  /** Keep the route-owned utility action with whichever header is visible. */
  headerAction?: ReactNode;
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
  onWorkspaceRefresh,
  onMutationBlockChange,
  workspaceFreshness,
  onTaskChange,
  onOpenEvent,
  onSettingsFocusChange,
  onSettingsDirtyChange,
  onWorkspaceDirtyChange,
  settingsNavigationBlocked,
  onSettingsNavigationBlocked,
  headerAction,
}: WorkspaceTaskProps) => {
  const value: WorkspaceTaskContextValue = {
    program,
    modules,
    attention,
    departmentId,
    hash,
    onAttentionRefresh,
    onWorkspaceRefresh,
    onMutationBlockChange,
    workspaceFreshness,
    onTaskChange,
    onOpenEvent,
    onWorkspaceDirtyChange,
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
        <SettingsTask
          onFocusChange={onSettingsFocusChange}
          onDirtyChange={onSettingsDirtyChange}
          navigationBlocked={settingsNavigationBlocked}
          onNavigationBlocked={onSettingsNavigationBlocked}
          headerAction={headerAction}
        />
      ) : task === "schedule" ? (
        <ScheduleTask />
      ) : (
        <TaskUnavailable task={task} />
      )}
    </WorkspaceTaskProvider>
  );
};
