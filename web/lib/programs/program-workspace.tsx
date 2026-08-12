"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  createEvent,
  getManagementProgram,
  listEnrollments,
  listEnrollmentRequests,
  listEvents,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  Enrollment,
  EnrollmentRequest,
  Program,
  ProgramEvent,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { EventDetail, hkWallInputToIso } from "./event-detail";
import type { ProgramsTask } from "./programs-intent";

import styles from "@/app/programs/programs.module.css";

export interface ProgramWorkspaceProps {
  programId: string;
  task?: ProgramsTask;
  /** EVT-01 (#251): management Event deep link under the events task. */
  eventId?: string | null;
  onBack: () => void;
  onTaskChange: (task: ProgramsTask | null) => void;
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
    }
  | {
      kind: "error";
      failure: "forbidden" | "unavailable" | "recoverable";
      message: string;
    };

type SummaryRead<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "unavailable"; message: string };

interface SummaryState {
  events: SummaryRead<ProgramEvent[]>;
  pendingRequests: SummaryRead<number>;
  activeParticipants: SummaryRead<number>;
}
function hasModule(
  modules: readonly DepartmentModule[],
  moduleKey: DepartmentModule["module_key"]
): boolean {
  return modules.some(
    ({ module_key, enabled }) => module_key === moduleKey && enabled === 1
  );
}

function initialSummary(
  modules: readonly DepartmentModule[] = []
): SummaryState {
  return {
    events: hasModule(modules, "events")
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
    pendingRequests: hasModule(modules, "enrollment")
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
    activeParticipants: hasModule(modules, "enrollment")
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
  };
}

function redirectToLoginIfRequired(error: unknown): boolean {
  if (!(error instanceof RpcError) || error.problem.code !== "AUTH_REQUIRED") {
    return false;
  }
  rememberDeepLink(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.assign("/");
  return true;
}
async function readSummary<TInput, TValue>(
  operation: Promise<TInput>,
  project: (input: TInput) => TValue
): Promise<SummaryRead<TValue>> {
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
function unavailableSummary<T>(message: string): SummaryRead<T> {
  return { status: "unavailable", message };
}

function formatEventTime(value: string): string {
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

function lifecycleLabel(value: Program["lifecycle"]): string {
  return value === "Active"
    ? COPY.programs.filterActive
    : value === "Draft"
      ? COPY.programs.filterDraft
      : COPY.programs.filterArchived;
}

function behaviorLabel(value: Program["behavior_type"]): string {
  return value === "Recurring"
    ? COPY.programs.detailBehaviorRecurring
    : COPY.programs.detailBehaviorOneOff;
}

function discoverabilityLabel(value: Program["discoverability"]): string {
  return value === "Listed"
    ? COPY.programs.discoverabilityListed
    : COPY.programs.discoverabilityUnlisted;
}

function enrollmentLabel(value: Program["enrollment_mode"]): string {
  return value === "MemberRequest"
    ? COPY.programs.detailParticipationMemberRequest
    : COPY.programs.detailParticipationManagerOnly;
}

function taskLabel(task: ProgramsTask): string {
  return task === "events"
    ? COPY.programs.workspaceTaskEvents
    : task === "participants"
      ? COPY.programs.workspaceTaskParticipants
      : COPY.programs.workspaceTaskSettings;
}

const WorkspaceNavigation = ({
  programId,
  task,
  modules,
  onTaskChange,
}: {
  programId: string;
  task?: ProgramsTask;
  modules: DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null) => void;
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

const WorkspaceOverview = ({
  program,
  department,
  summary,
}: {
  program: Program;
  department: Department | null;
  summary: SummaryState;
}) => {
  const eventRead =
    summary.events.status === "ready" ? summary.events.value : null;
  const nearestEvent = useMemo(
    () =>
      eventRead?.find(
        ({ status, starts_at }) =>
          status === "Active" && new Date(starts_at).getTime() >= Date.now()
      ) ?? eventRead?.find(({ status }) => status === "Active"),
    [eventRead]
  );
  const attentionReads = [summary.pendingRequests, summary.activeParticipants];
  const attentionReady = attentionReads.every(
    (read): read is { status: "ready"; value: number } =>
      read.status === "ready"
  );

  return (
    <>
      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-workspace-identity"
      >
        <h4
          id="programs-workspace-identity"
          className={styles.workspaceHeading}
        >
          {COPY.programs.workspaceIdentity}
        </h4>
        {program.description ? (
          <p className={styles.programDetailDescription}>
            {program.description}
          </p>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.programDescriptionEmpty}
          </p>
        )}
        <dl className={styles.workspaceFacts}>
          <div>
            <dt>{COPY.programs.workspaceDepartment}</dt>
            <dd>{department?.name ?? COPY.programs.workspaceDepartment}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceBehavior}</dt>
            <dd>{behaviorLabel(program.behavior_type)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceLifecycle}</dt>
            <dd>{lifecycleLabel(program.lifecycle)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceDiscoverability}</dt>
            <dd>{discoverabilityLabel(program.discoverability)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceEnrollmentMode}</dt>
            <dd>{enrollmentLabel(program.enrollment_mode)}</dd>
          </div>
          {program.category && (
            <div>
              <dt>{COPY.programs.workspaceCategory}</dt>
              <dd>{program.category}</dd>
            </div>
          )}
        </dl>
      </section>

      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-workspace-event"
      >
        <h4 id="programs-workspace-event" className={styles.workspaceHeading}>
          {COPY.programs.workspaceNearestEvent}
        </h4>
        {summary.events.status === "loading" ? (
          <output aria-busy="true">
            {COPY.programs.workspaceSummaryLoading}
          </output>
        ) : summary.events.status === "unavailable" ? (
          <output className={styles.programDetailMuted} aria-live="polite">
            {summary.events.message}
          </output>
        ) : nearestEvent ? (
          <p className={styles.workspaceEventSummary}>
            <strong>{formatEventTime(nearestEvent.starts_at)}</strong>
            <span>
              {nearestEvent.source === "SCHEDULE"
                ? COPY.programs.eventScheduleSource
                : COPY.programs.eventManualSource}
            </span>
          </p>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.workspaceNearestEventNone}
          </p>
        )}
      </section>

      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-workspace-attention"
      >
        <h4
          id="programs-workspace-attention"
          className={styles.workspaceHeading}
        >
          {COPY.programs.workspaceAttention}
        </h4>
        <dl className={styles.workspaceAttention}>
          {summary.pendingRequests.status === "ready" && (
            <div>
              <dt>{COPY.programs.workspacePendingRequests}</dt>
              <dd>{summary.pendingRequests.value}</dd>
            </div>
          )}
          {summary.activeParticipants.status === "ready" && (
            <div>
              <dt>{COPY.programs.workspaceActiveParticipants}</dt>
              <dd>{summary.activeParticipants.value}</dd>
            </div>
          )}
        </dl>
        {attentionReads.some((read) => read.status === "loading") && (
          <output aria-busy="true">
            {COPY.programs.workspaceSummaryLoading}
          </output>
        )}
        {attentionReads.some((read) => read.status === "unavailable") && (
          <output className={styles.programDetailMuted} aria-live="polite">
            {COPY.programs.workspaceSummaryUnavailable}
          </output>
        )}
        {attentionReady &&
          attentionReads[0].value === 0 &&
          attentionReads[1].value === 0 && (
            <p className={styles.programDetailMuted}>
              {COPY.programs.workspaceNoAttention}
            </p>
          )}
      </section>
    </>
  );
};

const EventsTask = ({
  programId,
  canManage,
  onOpenEvent,
}: {
  programId: string;
  canManage: boolean;
  /** EVT-01 (#251): deep link into the Event operational detail screen. */
  onOpenEvent?: (eventId: string) => void;
}) => {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; events: ProgramEvent[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    setState({ kind: "loading" });
    try {
      const { events } = await listEvents(programId);
      if (requestId.current !== currentRequest) {
        return;
      }
      setState({ kind: "ready", events });
    } catch (error) {
      if (requestId.current !== currentRequest) {
        return;
      }
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const code = error instanceof RpcError ? error.problem.code : undefined;
      setState({
        kind: "error",
        message:
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError,
      });
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const startsAt = hkWallInputToIso(String(form.get("starts_at") ?? ""));
    const endsAt = hkWallInputToIso(String(form.get("ends_at") ?? ""));
    const opensAt = hkWallInputToIso(String(form.get("opens_at") ?? ""));
    const closesAt = hkWallInputToIso(String(form.get("closes_at") ?? ""));
    if (!startsAt || !endsAt || !opensAt || !closesAt) {
      const message = errorCopyFor("VALIDATION");
      setCreateError(message);
      announce(message);
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { event } = await createEvent(programId, {
        name: String(form.get("name") ?? "").trim() || null,
        location: String(form.get("location") ?? "").trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        check_in_window_opens_at: opensAt,
        check_in_window_closes_at: closesAt,
      });
      announce(COPY.programs.eventCreatedNotice);
      setCreateOpen(false);
      onOpenEvent?.(event.event_id);
    } catch (error: unknown) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setCreateError(message);
      announce(message);
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-events-title"
    >
      <h4
        id="programs-workspace-events-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskEvents}
      </h4>
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskEventsLead}
      </p>
      {canManage && (
        <>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(null);
            }}
          >
            {COPY.programs.eventCreate}
          </button>
          {createOpen && (
            <form
              className={styles.ruleForm}
              aria-labelledby="programs-workspace-event-create-title"
              onSubmit={submitCreate}
            >
              <h5
                id="programs-workspace-event-create-title"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.eventCreateTitle}
              </h5>
              {createError !== null && (
                <output className={styles.panelError} role="alert">
                  {createError}
                </output>
              )}
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventName}</span>
                <input
                  type="text"
                  name="name"
                  placeholder={COPY.programs.eventNamePlaceholder}
                  aria-label={COPY.programs.eventName}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventLocation}</span>
                <input
                  type="text"
                  name="location"
                  placeholder={COPY.programs.eventLocationPlaceholder}
                  aria-label={COPY.programs.eventLocation}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventStart}</span>
                <input
                  type="datetime-local"
                  name="starts_at"
                  required
                  aria-label={COPY.programs.eventStart}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventEnd}</span>
                <input
                  type="datetime-local"
                  name="ends_at"
                  required
                  aria-label={COPY.programs.eventEnd}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventCheckInWindowOpensAt}</span>
                <input
                  type="datetime-local"
                  name="opens_at"
                  required
                  aria-label={COPY.programs.eventCheckInWindowOpensAt}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventCheckInWindowClosesAt}</span>
                <input
                  type="datetime-local"
                  name="closes_at"
                  required
                  aria-label={COPY.programs.eventCheckInWindowClosesAt}
                />
              </label>
              <div className={styles.confirmRow}>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={createBusy}
                >
                  {COPY.programs.eventCreateSubmit}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={createBusy}
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateError(null);
                  }}
                >
                  {COPY.programs.eventCreateCancel}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {state.kind === "loading" && (
        <output aria-busy="true">
          {COPY.programs.workspaceTaskEventsLoading}
        </output>
      )}
      {state.kind === "error" && (
        <div className={styles.boundaryError} role="alert">
          <p>{state.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => void load()}
          >
            {COPY.programs.workspaceTaskEventsRetry}
          </button>
        </div>
      )}
      {state.kind === "ready" && state.events.length === 0 && (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceTaskEventsEmpty}
        </p>
      )}
      {state.kind === "ready" && state.events.length > 0 && (
        <ul
          className={styles.workspaceTaskList}
          aria-label={COPY.programs.workspaceTaskEvents}
        >
          {state.events.map((event) => (
            <li key={event.event_id} className={styles.workspaceTaskRow}>
              <strong>{formatEventTime(event.starts_at)}</strong>
              <span>
                {event.status === "Active"
                  ? COPY.programs.eventActive
                  : COPY.programs.eventCancelled}
              </span>
              <span>
                {event.source === "SCHEDULE"
                  ? COPY.programs.eventScheduleSource
                  : COPY.programs.eventManualSource}
              </span>
              {event.availability !== undefined &&
                event.availability !== "Active" && (
                  <span className={styles.eventCancelled}>
                    {COPY.programs.eventUnavailable}
                  </span>
                )}
              {onOpenEvent && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => onOpenEvent(event.event_id)}
                >
                  {COPY.programs.eventDetailOpen}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const ParticipantsTask = ({ programId }: { programId: string }) => {
  const [state, setState] = useState<
    | { kind: "loading" }
    | {
        kind: "ready";
        requests: EnrollmentRequest[];
        enrollments: Enrollment[];
      }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    setState({ kind: "loading" });
    try {
      const [{ requests }, { enrollments }] = await Promise.all([
        listEnrollmentRequests(programId),
        listEnrollments(programId),
      ]);
      if (requestId.current !== currentRequest) {
        return;
      }
      setState({ kind: "ready", requests, enrollments });
    } catch (error) {
      if (requestId.current !== currentRequest) {
        return;
      }
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const code = error instanceof RpcError ? error.problem.code : undefined;
      setState({
        kind: "error",
        message:
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError,
      });
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-participants-title"
    >
      <h4
        id="programs-workspace-participants-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskParticipants}
      </h4>
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskParticipantsLead}
      </p>
      {state.kind === "loading" && (
        <output aria-busy="true">
          {COPY.programs.workspaceTaskParticipantsLoading}
        </output>
      )}
      {state.kind === "error" && (
        <div className={styles.boundaryError} role="alert">
          <p>{state.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => void load()}
          >
            {COPY.programs.workspaceTaskParticipantsRetry}
          </button>
        </div>
      )}
      {state.kind === "ready" &&
        state.requests.length === 0 &&
        state.enrollments.length === 0 && (
          <p className={styles.programDetailMuted}>
            {COPY.programs.workspaceTaskParticipantsEmpty}
          </p>
        )}
      {state.kind === "ready" &&
        (state.requests.length > 0 || state.enrollments.length > 0) && (
          <div className={styles.workspaceParticipantGroups}>
            <section aria-labelledby="programs-workspace-pending-title">
              <h5
                id="programs-workspace-pending-title"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.workspacePendingRequests}
              </h5>
              {state.requests.filter(({ status }) => status === "Pending")
                .length === 0 ? (
                <p className={styles.programDetailMuted}>
                  {COPY.programs.workspaceTaskParticipantsEmpty}
                </p>
              ) : (
                <ul className={styles.workspaceTaskList}>
                  {state.requests
                    .filter(({ status }) => status === "Pending")
                    .map((request) => (
                      <li
                        key={request.request_id}
                        className={styles.workspaceTaskRow}
                      >
                        <strong>
                          {request.member_name ??
                            request.member_username ??
                            request.member_user_id}
                        </strong>
                        <span>{request.status}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="programs-workspace-active-title">
              <h5
                id="programs-workspace-active-title"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.workspaceActiveParticipants}
              </h5>
              {state.enrollments.filter(({ status }) => status === "Active")
                .length === 0 ? (
                <p className={styles.programDetailMuted}>
                  {COPY.programs.workspaceTaskParticipantsEmpty}
                </p>
              ) : (
                <ul className={styles.workspaceTaskList}>
                  {state.enrollments
                    .filter(({ status }) => status === "Active")
                    .map((enrollment) => (
                      <li
                        key={enrollment.enrollment_id}
                        className={styles.workspaceTaskRow}
                      >
                        <strong>
                          {enrollment.member_name ??
                            enrollment.member_username ??
                            enrollment.member_user_id}
                        </strong>
                        <span>{enrollment.status}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        )}
    </section>
  );
};

const SettingsTask = ({
  program,
  onTaskChange,
}: {
  program: Program;
  onTaskChange: (task: ProgramsTask | null) => void;
}) => {
  const capabilities: string[] = [];
  if (program.capabilities.manage) {
    capabilities.push(COPY.programs.workspaceCapabilityManage);
  }
  if (program.capabilities.publish) {
    capabilities.push(COPY.programs.workspaceCapabilityPublish);
  }
  if (program.capabilities.leader_assign) {
    capabilities.push(COPY.programs.workspaceCapabilityLeaderAssign);
  }

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-settings-title"
    >
      <h4
        id="programs-workspace-settings-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskSettings}
      </h4>
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskSettingsLead}
      </p>
      <dl className={styles.workspaceFacts}>
        <div>
          <dt>{COPY.programs.programName}</dt>
          <dd>{program.name}</dd>
        </div>
        <div>
          <dt>{COPY.programs.workspaceBehavior}</dt>
          <dd>{behaviorLabel(program.behavior_type)}</dd>
        </div>
        <div>
          <dt>{COPY.programs.workspaceLifecycle}</dt>
          <dd>{lifecycleLabel(program.lifecycle)}</dd>
        </div>
        <div>
          <dt>{COPY.programs.workspaceDiscoverability}</dt>
          <dd>{discoverabilityLabel(program.discoverability)}</dd>
        </div>
        <div>
          <dt>{COPY.programs.workspaceEnrollmentMode}</dt>
          <dd>{enrollmentLabel(program.enrollment_mode)}</dd>
        </div>
      </dl>
      <section aria-labelledby="programs-workspace-settings-capabilities">
        <h5
          id="programs-workspace-settings-capabilities"
          className={styles.workspaceSubheading}
        >
          {COPY.programs.workspaceTaskSettingsCapabilities}
        </h5>
        {capabilities.length === 0 ? (
          <p className={styles.programDetailMuted}>
            {COPY.programs.workspaceTaskSettingsNoCapabilities}
          </p>
        ) : (
          <ul className={styles.workspaceTaskList}>
            {capabilities.map((capability) => (
              <li key={capability} className={styles.workspaceTaskRow}>
                <span>{capability}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <button
        className={styles.programDetailBack}
        type="button"
        onClick={() => onTaskChange(null)}
      >
        {COPY.programs.backToOverview}
      </button>
    </section>
  );
};
const TaskUnavailable = ({ task }: { task: ProgramsTask }) => (
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
const WorkspaceTask = ({
  program,
  task,
  modules,
  onTaskChange,
  onOpenEvent,
}: {
  program: Program;
  task: ProgramsTask;
  modules: readonly DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null) => void;
  onOpenEvent?: (eventId: string) => void;
}) => {
  if (task === "events") {
    return hasModule(modules, "events") ? (
      <EventsTask
        programId={program.program_id}
        canManage={program.capabilities.manage}
        onOpenEvent={onOpenEvent}
      />
    ) : (
      <TaskUnavailable task={task} />
    );
  }
  if (task === "participants") {
    return hasModule(modules, "enrollment") ? (
      <ParticipantsTask programId={program.program_id} />
    ) : (
      <TaskUnavailable task={task} />
    );
  }
  return <SettingsTask program={program} onTaskChange={onTaskChange} />;
};

export const ProgramWorkspace = ({
  programId,
  task,
  eventId,
  onBack,
  onTaskChange,
  onEventChange,
}: ProgramWorkspaceProps) => {
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [summary, setSummary] = useState<SummaryState>(() => initialSummary());
  const mounted = useRef(true);
  const workspaceRequestId = useRef(0);
  const retryFocusPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadWorkspace = useCallback(async () => {
    workspaceRequestId.current += 1;
    const currentRequest = workspaceRequestId.current;
    setState({ kind: "loading" });
    announce(COPY.programs.workspaceLoading);
    try {
      const { program, department, modules } =
        await getManagementProgram(programId);
      if (!mounted.current || workspaceRequestId.current !== currentRequest) {
        return;
      }
      setState({ kind: "ready", program, department, modules });
      announce(program.name);
    } catch (error) {
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        window.location.assign("/");
        return;
      }
      if (!mounted.current || workspaceRequestId.current !== currentRequest) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "FORBIDDEN") {
        setState({
          kind: "error",
          failure: "forbidden",
          message: COPY.programs.workspaceUnavailableHint,
        });
        announce(COPY.programs.workspaceForbidden);
        return;
      }
      if (
        error instanceof RpcError &&
        (error.problem.code === "NOT_FOUND" || error.problem.status === 404)
      ) {
        setState({
          kind: "error",
          failure: "unavailable",
          message: COPY.programs.workspaceUnavailableHint,
        });
        announce(COPY.programs.workspaceUnavailable);
        return;
      }
      const code = error instanceof RpcError ? error.problem.code : undefined;
      const message =
        error instanceof RpcError
          ? errorCopyFor(code, error.problem.detail)
          : COPY.error.networkError;
      setState({ kind: "error", failure: "recoverable", message });
      announce(message);
    }
  }, [programId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!retryFocusPending.current || state.kind !== "error") {
      return;
    }
    const panel = document.querySelector<HTMLElement>(
      "#programs-workspace-state"
    );
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  const loadSummary = useCallback(
    async (modules: readonly DepartmentModule[]) => {
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
      if (!mounted.current) {
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

  useEffect(() => {
    if (state.kind !== "ready") {
      return;
    }
    void loadSummary(state.modules);
  }, [loadSummary, state]);

  const retry = () => {
    retryFocusPending.current = true;
    void loadWorkspace();
  };

  if (state.kind === "loading") {
    return (
      <output
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryState}
        aria-busy="true"
      >
        {COPY.programs.workspaceLoading}
      </output>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryError}
        role="alert"
      >
        <h3 className={styles.boundaryTitle}>
          {state.failure === "forbidden"
            ? COPY.programs.workspaceForbidden
            : state.failure === "unavailable"
              ? COPY.programs.workspaceUnavailable
              : COPY.programs.workspaceLoadError}
        </h3>
        <p>{state.message}</p>
        <div className={styles.workspaceActions}>
          <button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.workspaceRetry}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onBack}
          >
            {COPY.programs.workspaceBack}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.managementWorkspace}
      aria-labelledby="programs-workspace-title"
    >
      <button
        className={styles.programDetailBack}
        type="button"
        onClick={onBack}
      >
        {COPY.programs.workspaceBack}
      </button>
      <header className={styles.workspaceHeader}>
        <p className={styles.programDetailEyebrow}>
          {state.department
            ? `${state.department.name} · ${state.department.code}`
            : COPY.programs.workspaceDepartment}
        </p>
        <h3 id="programs-workspace-title" className={styles.boundaryTitle}>
          {state.program.name}
        </h3>
        <p className={styles.boundaryLead}>{COPY.programs.workspaceLead}</p>
      </header>

      <WorkspaceNavigation
        programId={programId}
        task={task}
        modules={state.modules}
        onTaskChange={onTaskChange}
      />

      {task && task === "events" && eventId ? (
        <EventDetail
          programId={programId}
          eventId={eventId}
          canManage={state.program.capabilities.manage}
          onBack={() => onEventChange?.(null)}
        />
      ) : task ? (
        <WorkspaceTask
          program={state.program}
          task={task}
          modules={state.modules}
          onTaskChange={onTaskChange}
          onOpenEvent={(id) => onEventChange?.(id)}
        />
      ) : (
        <WorkspaceOverview
          program={state.program}
          department={state.department}
          summary={summary}
        />
      )}
    </section>
  );
};
