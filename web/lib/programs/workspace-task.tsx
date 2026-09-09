"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { MouseEventHandler } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";

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
import { SettingsTask } from "./workspace-settings-task";

const styles = {
  workspaceTasks:
    "flex min-w-0 flex-wrap gap-2 border-b border-[var(--line)] pb-3",
  workspaceTaskLink:
    "inline-flex min-h-11 min-w-11 items-center rounded-lg border border-transparent px-3 py-2 text-sm text-[var(--ink-muted)] whitespace-normal hover:border-[var(--line-strong)] hover:bg-[var(--surface)] aria-[current=page]:border-[var(--accent)] aria-[current=page]:text-[var(--accent)]",
  workspaceSection: "grid min-w-0 gap-4",
  workspaceSubheading:
    "m-0 text-base font-bold leading-6 [overflow-wrap:anywhere]",
  workspaceTaskRow:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 [overflow-wrap:anywhere]",
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  badge: "w-fit shrink-0 rounded-full whitespace-normal",
  badgeActive: "border-transparent bg-[var(--accent)] text-white",
  button:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  workspaceHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  directoryCard:
    "group flex h-auto min-h-11 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-left whitespace-normal transition-colors hover:border-[var(--accent)] [overflow-wrap:anywhere]",
  directoryCardTitle:
    "block min-w-0 text-base font-extrabold leading-6 whitespace-normal [overflow-wrap:anywhere]",
  directoryCardMeta:
    "flex min-w-0 flex-wrap items-center gap-2 text-sm leading-6 text-[var(--ink-muted)] whitespace-normal [overflow-wrap:anywhere]",
  workspaceTask: "grid min-w-0 gap-4",
} as const;

export type WorkspaceSummaryRead<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "unavailable"; message: string };

export interface WorkspaceSummaryState {
  events: WorkspaceSummaryRead<ProgramEvent[]>;
  pendingRequests: WorkspaceSummaryRead<number>;
  activeParticipants: WorkspaceSummaryRead<number>;
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
    <nav
      className={styles.workspaceTasks}
      aria-label={COPY.programs.workspaceTaskLabel}
    >
      <Link
        className={styles.workspaceTaskLink}
        aria-current={task === undefined ? "page" : undefined}
        href={buildProgramsHref({
          mode: "management",
          programId,
          departmentId,
          hash,
        })}
        onClick={taskLinkClick(onTaskChange, null)}
      >
        {COPY.programs.workspaceTitle}
      </Link>
      {tasks.map((value) => (
        <Link
          key={value}
          className={styles.workspaceTaskLink}
          aria-current={task === value ? "page" : undefined}
          href={buildProgramsHref({
            mode: "management",
            programId,
            departmentId,
            task: value,
            hash,
          })}
          onClick={taskLinkClick(onTaskChange, value)}
        >
          {taskLabel(value)}
        </Link>
      ))}
    </nav>
  );
};

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
    <>
      {/* 下一聚會 block (omitted entirely when no upcoming meeting — cwShowNextBlock) */}
      {program.capabilities.manage && nextEvent && (
        <section
          className={styles.workspaceSection}
          aria-labelledby="programs-cockpit-next-meeting"
        >
          <div
            id="programs-cockpit-next-meeting"
            className={styles.workspaceSubheading}
          >
            {COPY.programs.cockpitNextMeeting}
          </div>
          <div className={`${styles.workspaceTaskRow} grid gap-3`}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-base font-bold">
                  {nextEvent.title || nextEvent.name || program.name}
                </strong>
                <p className={`${styles.programDetailMuted} mt-1`}>
                  {formatEventTime(nextEvent.starts_at)}
                  {nextEvent.location ? ` · ${nextEvent.location}` : ""}
                </p>
                {(nextEvent.is_recurring ||
                  nextEvent.source === "SCHEDULE") && (
                  <span className={`${styles.badge} ${styles.badgeActive}`}>
                    {COPY.programs.cockpitAutoScheduled}
                  </span>
                )}
              </div>
              {(nextEvent.checked_in_count > 0 ||
                nextEvent.roster_count > 0) && (
                <div className="text-right">
                  <span className="text-base font-bold">
                    {nextEvent.checked_in_count}/{nextEvent.roster_count}
                  </span>
                  <br />
                  <span className={`${styles.programDetailMuted} text-xs`}>
                    {COPY.programs.cockpitCheckedIn}
                  </span>
                </div>
              )}
            </div>
            <Button asChild className={`${styles.button} w-full`}>
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
          </div>
        </section>
      )}

      {/* 營運 / 每週工作 (2-up grid tiles) */}
      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-cockpit-operations"
      >
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
          <h4
            id="programs-cockpit-operations"
            className={styles.workspaceHeading}
          >
            {COPY.programs.cockpitOperations}
          </h4>
          <span className={`${styles.programDetailMuted} text-xs`}>
            {COPY.programs.cockpitWeeklyWork}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {program.capabilities.manage && (
            <>
              <Button
                asChild
                className={`${styles.directoryCard} min-h-[100px] min-w-0 whitespace-normal p-4 text-left`}
              >
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
                  <strong className={styles.directoryCardTitle}>
                    {COPY.programs.cockpitEventsTile}
                  </strong>
                  <span className={`${styles.directoryCardMeta} mt-2`}>
                    {COPY.programs.cockpitEventsCount.replace(
                      "{count}",
                      String(eventsCount)
                    )}
                  </span>
                </Link>
              </Button>
              <Button
                asChild
                className={`${styles.directoryCard} min-h-[100px] min-w-0 whitespace-normal p-4 text-left`}
              >
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
                  <strong className={styles.directoryCardTitle}>
                    {COPY.programs.cockpitParticipantsTile}
                  </strong>
                  <span className={`${styles.directoryCardMeta} mt-2`}>
                    {pendingCount > 0 ? (
                      <Badge variant="secondary">
                        {COPY.programs.cockpitPendingLabel.replace(
                          "{count}",
                          String(pendingCount)
                        )}
                      </Badge>
                    ) : (
                      <span>{COPY.programs.cockpitNoPending}</span>
                    )}
                  </span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {/* 其他 / 低頻設定 (quiet rows) */}
      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-cockpit-others"
      >
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
          <h4 id="programs-cockpit-others" className={styles.workspaceHeading}>
            {COPY.programs.cockpitOthers}
          </h4>
          <span className={`${styles.programDetailMuted} text-xs`}>
            {COPY.programs.cockpitLowFrequency}
          </span>
        </div>
        <div className="grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <Button
            type="button"
            className={`${styles.workspaceTaskRow} min-h-11 min-w-0 whitespace-normal rounded-none border-0 text-left`}
            onClick={onOpenFacts}
          >
            <div>
              <span className="block font-semibold">
                {COPY.programs.cockpitCourseFacts}
              </span>
              <span
                className={`${styles.programDetailMuted} mt-0.5 block text-xs`}
              >
                {COPY.programs.cockpitCourseFactsHint}
              </span>
            </div>
          </Button>
          {(program.capabilities.manage ||
            program.capabilities.leader_assign) && (
            <Button
              asChild
              className={`${styles.workspaceTaskRow} min-h-11 min-w-0 whitespace-normal rounded-none border-x-0 border-b-0 border-t border-t-[var(--line)] text-left`}
            >
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
                <span className="block font-semibold">
                  {COPY.programs.cockpitSettings}
                </span>
                <span
                  className={`${styles.programDetailMuted} mt-0.5 block text-xs`}
                >
                  {COPY.programs.workspaceTaskSettingsLead}
                </span>
              </Link>
            </Button>
          )}
        </div>
      </section>
    </>
  );
};

export interface WorkspaceTaskProps extends WorkspaceTaskContextValue {
  task: ProgramsTask;
}

export const TaskUnavailable = ({ task }: { task: ProgramsTask }) => (
  <section
    className={styles.workspaceTask}
    aria-labelledby="programs-workspace-task-unavailable"
  >
    <h4
      id="programs-workspace-task-unavailable"
      className={styles.workspaceHeading}
    >
      {taskLabel(task)}
    </h4>
    <output className={styles.programDetailMuted} aria-live="polite">
      {COPY.programs.workspaceTaskUnavailable}
    </output>
  </section>
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
      ) : (
        <TaskUnavailable task={task} />
      )}
    </WorkspaceTaskProvider>
  );
};
