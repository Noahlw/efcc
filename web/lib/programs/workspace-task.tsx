"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";

import type {
  DepartmentModule,
  ManagementCockpitView,
  Program,
  ProgramEvent,
} from "./program-api";
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

import styles from "@/app/programs/programs.module.css";

export type WorkspaceSummaryRead<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "unavailable"; message: string };

export interface WorkspaceSummaryState {
  events: WorkspaceSummaryRead<ProgramEvent[]>;
  pendingRequests: WorkspaceSummaryRead<number>;
  activeParticipants: WorkspaceSummaryRead<number>;
}

export const WorkspaceNavigation = ({
  programId,
  task,
  modules,
  onTaskChange,
}: {
  programId: string;
  task?: ProgramsTask;
  modules: readonly DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
}) => {
  const tasks: ProgramsTask[] = [
    ...(hasModule(modules, "events") ? ["events" as const] : []),
    ...(hasModule(modules, "enrollment") ? ["participants" as const] : []),
    "settings",
  ];
  return (
    <nav
      className={styles.workspaceTasks}
      aria-label={COPY.programs.workspaceTaskLabel}
    >
      <a
        className={styles.workspaceTaskLink}
        aria-current={task === undefined ? "page" : undefined}
        href={`/programs?mode=management&program=${encodeURIComponent(programId)}`}
        onClick={(event) => {
          event.preventDefault();
          onTaskChange(null);
        }}
      >
        {COPY.programs.workspaceTitle}
      </a>
      {tasks.map((value) => (
        <a
          key={value}
          className={styles.workspaceTaskLink}
          aria-current={task === value ? "page" : undefined}
          href={`/programs?mode=management&program=${encodeURIComponent(programId)}&task=${value}`}
          onClick={(event) => {
            event.preventDefault();
            onTaskChange(value);
          }}
        >
          {taskLabel(value)}
        </a>
      ))}
    </nav>
  );
};

// oxlint-disable-next-line eslint/complexity -- overview keeps the existing task summary branches local
export const WorkspaceOverview = ({
  program,
  cockpit,
  summary,
  onOpenFacts,
  onTaskChange,
}: {
  program: Program;
  cockpit?: ManagementCockpitView | null;
  summary: WorkspaceSummaryState;
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
      {nextEvent && (
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
          <div
            className={styles.workspaceTaskRow}
            style={{ display: "grid", gap: "12px" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div>
                <strong style={{ fontSize: "1.05rem" }}>
                  {nextEvent.title || nextEvent.name || program.name}
                </strong>
                <p
                  className={styles.programDetailMuted}
                  style={{ margin: "4px 0" }}
                >
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
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                    {nextEvent.checked_in_count}/{nextEvent.roster_count}
                  </span>
                  <br />
                  <span
                    className={styles.programDetailMuted}
                    style={{ fontSize: "0.8125rem" }}
                  >
                    {COPY.programs.cockpitCheckedIn}
                  </span>
                </div>
              )}
            </div>
            <Button
              className={styles.button}
              type="button"
              style={{ width: "100%" }}
              onClick={() => {
                onTaskChange("participants", nextEvent.event_id);
              }}
            >
              {COPY.programs.cockpitManageRoster}
            </Button>
          </div>
        </section>
      )}

      {/* 營運 / 每週工作 (2-up grid tiles) */}
      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-cockpit-operations"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <h4
            id="programs-cockpit-operations"
            className={styles.workspaceHeading}
          >
            {COPY.programs.cockpitOperations}
          </h4>
          <span
            className={styles.programDetailMuted}
            style={{ fontSize: "0.8125rem" }}
          >
            {COPY.programs.cockpitWeeklyWork}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "10px",
          }}
        >
          <Button
            type="button"
            className={`${styles.directoryCard} min-w-0 whitespace-normal`}
            style={{ textAlign: "left", minHeight: "100px", padding: "16px" }}
            onClick={() => onTaskChange("events")}
          >
            <strong className={styles.directoryCardTitle}>
              {COPY.programs.cockpitEventsTile}
            </strong>
            <span
              className={styles.directoryCardMeta}
              style={{ marginTop: "8px" }}
            >
              {COPY.programs.cockpitEventsCount.replace(
                "{count}",
                String(eventsCount)
              )}
            </span>
          </Button>
          <Button
            type="button"
            className={`${styles.directoryCard} min-w-0 whitespace-normal`}
            style={{ textAlign: "left", minHeight: "100px", padding: "16px" }}
            onClick={() => onTaskChange("participants")}
          >
            <strong className={styles.directoryCardTitle}>
              {COPY.programs.cockpitParticipantsTile}
            </strong>
            <span
              className={styles.directoryCardMeta}
              style={{ marginTop: "8px" }}
            >
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
          </Button>
        </div>
      </section>

      {/* 其他 / 低頻設定 (quiet rows) */}
      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-cockpit-others"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <h4 id="programs-cockpit-others" className={styles.workspaceHeading}>
            {COPY.programs.cockpitOthers}
          </h4>
          <span
            className={styles.programDetailMuted}
            style={{ fontSize: "0.8125rem" }}
          >
            {COPY.programs.cockpitLowFrequency}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <Button
            type="button"
            className={`${styles.workspaceTaskRow} min-w-0 h-auto min-h-[44px] whitespace-normal [overflow-wrap:anywhere] [&>div]:min-w-0`}
            style={{
              border: "none",
              borderRadius: 0,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              background: "transparent",
            }}
            onClick={onOpenFacts}
          >
            <div>
              <span style={{ fontWeight: 600, display: "block" }}>
                {COPY.programs.cockpitCourseFacts}
              </span>
              <span
                className={styles.programDetailMuted}
                style={{
                  fontSize: "0.8125rem",
                  marginTop: "2px",
                  display: "block",
                }}
              >
                {COPY.programs.cockpitCourseFactsHint}
              </span>
            </div>
          </Button>
          <Button
            type="button"
            className={`${styles.workspaceTaskRow} min-w-0 h-auto min-h-[44px] whitespace-normal [overflow-wrap:anywhere] [&>div]:min-w-0`}
            style={{
              border: "none",
              borderTop: "1px solid var(--line)",
              borderRadius: 0,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              background: "transparent",
            }}
            onClick={() => onTaskChange("settings")}
          >
            <div>
              <span style={{ fontWeight: 600, display: "block" }}>
                {COPY.programs.cockpitSettings}
              </span>
              <span
                className={styles.programDetailMuted}
                style={{
                  fontSize: "0.8125rem",
                  marginTop: "2px",
                  display: "block",
                }}
              >
                {COPY.programs.workspaceTaskSettingsLead}
              </span>
            </div>
          </Button>
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
  onAttentionRefresh,
  onTaskChange,
  onOpenEvent,
}: WorkspaceTaskProps) => {
  const value: WorkspaceTaskContextValue = {
    program,
    modules,
    attention,
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
