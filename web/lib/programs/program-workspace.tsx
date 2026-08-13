"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  assistedEnroll,
  createEvent,
  decideEnrollmentRequest,
  getManagementProgram,
  listEnrollmentRequests,
  listEnrollmentSnapshot,
  listEnrollments,
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
import { ProgramSettings } from "./program-settings";

import { ProgramForm } from "./program-form";
import { EventDetail, hkWallInputToIso } from "./event-detail";
import { MemberPicker } from "./member-picker";
import type { ProgramsTask } from "./programs-intent";
import { LeadersPanel } from "./programs-leaders-panel";
import { useAsyncResource } from "./use-async-resource";

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
  onEdit,
}: {
  program: Program;
  department: Department | null;
  summary: SummaryState;
  onEdit: () => void;
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
        <div className={styles.workspaceActions}>
          {program.capabilities.manage && (
            <button className={styles.button} type="button" onClick={onEdit}>
              {COPY.programs.editProgram}
            </button>
          )}
        </div>
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

type EventsState =
  | { kind: "loading" }
  | { kind: "ready"; events: ProgramEvent[] }
  | { kind: "error"; message: string };

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
  const { state, run, retry } = useAsyncResource<ProgramEvent[], EventsState>(
    async () => {
      const { events } = await listEvents(programId);
      return events;
    },
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (events) => ({ kind: "ready", events }),
      onError: (error) => {
        if (redirectToLoginIfRequired(error)) {
          return null;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        return {
          kind: "error",
          message:
            error instanceof RpcError
              ? errorCopyFor(code, error.problem.detail)
              : COPY.error.networkError,
        };
      },
    },
    [programId]
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void run();
  }, [run]);

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
              className={`${styles.ruleForm} ${styles.eventCreateForm}`}
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
              <div className={styles.formActions}>
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
            onClick={retry}
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

type ParticipantTab = "pending" | "active" | "history";
type ParticipantFailure = "forbidden" | "stale" | "conflict" | "server";

type ParticipantsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      requests: EnrollmentRequest[];
      enrollments: Enrollment[];
    }
  | {
      kind: "error";
      failure: ParticipantFailure;
      message: string;
    };

function participantIssue(error: unknown): {
  failure: ParticipantFailure;
  message: string;
} {
  const code = error instanceof RpcError ? error.problem.code : undefined;
  if (code === "FORBIDDEN") {
    return {
      failure: "forbidden",
      message: COPY.programs.workspaceParticipantsForbidden,
    };
  }
  if (code === "STALE") {
    return {
      failure: "stale",
      message: COPY.programs.workspaceParticipantsStale,
    };
  }
  if (code === "CONFLICT" || code === "ENROLLMENT_DUPLICATE") {
    return {
      failure: "conflict",
      message:
        code === "ENROLLMENT_DUPLICATE"
          ? `${COPY.programs.workspaceParticipantsConflict} ${COPY.programs.enrollmentDuplicate}`
          : COPY.programs.workspaceParticipantsConflict,
    };
  }
  return {
    failure: "server",
    message:
      error instanceof RpcError
        ? errorCopyFor(code, error.problem.detail)
        : COPY.error.networkError,
  };
}

function requestStatusLabel(status: EnrollmentRequest["status"]): string {
  if (status === "Pending") {
    return COPY.programs.requestPending;
  }
  if (status === "Approved") {
    return COPY.programs.requestApproved;
  }
  if (status === "Rejected") {
    return COPY.programs.requestRejected;
  }
  return COPY.programs.requestWithdrawn;
}

const ParticipantsTask = ({
  programId,
  canManage,
  enrollmentMode,
}: {
  programId: string;
  canManage: boolean;
  enrollmentMode: Program["enrollment_mode"];
}) => {
  const { state, run, retry } = useAsyncResource<
    { requests: EnrollmentRequest[]; enrollments: Enrollment[] },
    ParticipantsState
  >(
    async () => listEnrollmentSnapshot(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ requests, enrollments }) => ({
        kind: "ready",
        requests,
        enrollments,
      }),
      onError: (error) => {
        if (redirectToLoginIfRequired(error)) {
          return null;
        }
        return { kind: "error", ...participantIssue(error) };
      },
    },
    [programId]
  );
  const [refreshSuccess, setRefreshSuccess] = useState<string>(
    COPY.programs.decisionMade
  );
  const [tab, setTab] = useState<ParticipantTab>("pending");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingAction, setRefreshingAction] = useState<string | null>(null);
  const [assistedBusy, setAssistedBusy] = useState(false);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  // Most recent successful snapshot: a failed refresh after a successful
  // mutation keeps the queue rendered from the last-known data instead of
  // ejecting the operator into the full-panel error state.
  const lastReadyRef = useRef<Extract<ParticipantsState, { kind: "ready" }> | null>(
    null
  );

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    if (state.kind === "ready") {
      lastReadyRef.current = state;
    }
  }, [state]);

  useEffect(() => {
    if (refreshingAction === null || state.kind === "loading") {
      return;
    }
    if (state.kind === "ready") {
      setNotice(refreshSuccess);
      announce(refreshSuccess);
    } else {
      setNotice(null);
    }
    setRefreshingAction(null);
  }, [refreshSuccess, refreshingAction, state]);

  const queue = useMemo(() => {
    const snapshot =
      state.kind === "ready"
        ? state
        : state.kind === "error" && lastReadyRef.current
          ? lastReadyRef.current
          : null;
    if (snapshot === null) {
      return null;
    }
    const active = snapshot.enrollments.filter(
      ({ status }) => status === "Active"
    );
    // Every enrollment row (Active or Cancelled) tells the Approved
    // request's story once; an Approved request stays out of history as
    // long as ANY linked enrollment row exists.
    const enrolledRequestIds = new Set(
      snapshot.enrollments.flatMap(({ request_id }) =>
        request_id ? [request_id] : []
      )
    );
    const pending = snapshot.requests.filter(
      ({ status }) => status === "Pending"
    );
    const historyRequests = snapshot.requests.filter(
      ({ status, request_id }) =>
        status !== "Pending" &&
        !(status === "Approved" && enrolledRequestIds.has(request_id))
    );
    const historyEnrollments = snapshot.enrollments.filter(
      ({ status }) => status === "Cancelled"
    );
    return {
      pending,
      active,
      historyRequests,
      historyEnrollments,
      counts: {
        pending: pending.length,
        active: active.length,
        history: historyRequests.length + historyEnrollments.length,
      },
    };
  }, [state]);

  const handleDecision = async (
    request: EnrollmentRequest,
    action: "Approved" | "Rejected"
  ) => {
    setBusyRequestId(request.request_id);
    setNotice(null);
    setActionErrors((current) => {
      const next = { ...current };
      delete next[request.request_id];
      return next;
    });
    try {
      await decideEnrollmentRequest(
        programId,
        request.request_id,
        action,
        notes[request.request_id],
        request.request_version
      );
      setRefreshSuccess(COPY.programs.decisionMade);
      setRefreshingAction(request.request_id);
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const issue = participantIssue(error);
      setActionErrors((current) => ({
        ...current,
        [request.request_id]: issue.message,
      }));
      announce(issue.message);
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleAssisted = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const memberUserId = String(
      new FormData(event.currentTarget).get("member_user_id") ?? ""
    ).trim();
    if (!memberUserId) {
      setAssistedError(COPY.programs.memberSearchHint);
      return;
    }
    setAssistedBusy(true);
    setAssistedError(null);
    setNotice(null);
    try {
      await assistedEnroll(programId, memberUserId);
      setRefreshSuccess(COPY.programs.assistedSubmitted);
      setRefreshingAction("assisted");
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const issue = participantIssue(error);
      setAssistedError(issue.message);
      announce(issue.message);
    } finally {
      setAssistedBusy(false);
    }
  };

  const renderPending = () => {
    if (queue === null || queue.pending.length === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsPendingEmpty}
        </p>
      );
    }
    return (
      <ul className={styles.workspaceTaskList} aria-label={COPY.programs.requests}>
        {queue.pending.map((request) => {
          const member =
            request.member_name ??
            request.member_username ??
            request.member_user_id;
          return (
            <li
              key={request.request_id}
              className={styles.workspaceTaskRow}
              aria-busy={busyRequestId === request.request_id}
            >
              <strong>{member}</strong>
              <span>{requestStatusLabel(request.status)}</span>
              <span>{formatEventTime(request.submitted_at)}</span>
              {canManage && (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.decisionNote}
                    </span>
                    <input
                      className={styles.input}
                      type="text"
                      value={notes[request.request_id] ?? ""}
                      aria-label={COPY.programs.decisionNote}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request.request_id]: event.target.value,
                        }))
                      }
                      disabled={busyRequestId !== null}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.successOutline}
                    onClick={() => void handleDecision(request, "Approved")}
                    disabled={busyRequestId !== null}
                  >
                    {COPY.programs.approve}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerOutline}
                    onClick={() => void handleDecision(request, "Rejected")}
                    disabled={busyRequestId !== null}
                  >
                    {COPY.programs.reject}
                  </button>
                </>
              )}
              {actionErrors[request.request_id] && (
                <output className={styles.panelError} role="alert">
                  {actionErrors[request.request_id]}
                </output>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const renderActive = () => {
    if (queue === null || queue.active.length === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsActiveEmpty}
        </p>
      );
    }
    return (
      <ul
        className={styles.workspaceTaskList}
        aria-label={COPY.programs.workspaceActiveParticipants}
      >
        {queue.active.map((enrollment) => {
          const request = state.kind === "ready"
            ? state.requests.find(
                ({ request_id }) => request_id === enrollment.request_id
              )
            : undefined;
          return (
            <li key={enrollment.enrollment_id} className={styles.workspaceTaskRow}>
              <strong>
                {enrollment.member_name ??
                  enrollment.member_username ??
                  enrollment.member_user_id}
              </strong>
              <span>{COPY.programs.enrollmentActive}</span>
              {request && <span>{requestStatusLabel(request.status)}</span>}
              <span>{formatEventTime(enrollment.enrolled_at)}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderHistory = () => {
    if (queue === null || queue.counts.history === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsHistoryEmpty}
        </p>
      );
    }
    return (
      <ul className={styles.workspaceTaskList} aria-label={COPY.programs.enrollmentHistory}>
        {queue.historyRequests.map((request) => (
          <li key={`request-${request.request_id}`} className={styles.workspaceTaskRow}>
            <strong>
              {request.member_name ??
                request.member_username ??
                request.member_user_id}
            </strong>
            <span>{requestStatusLabel(request.status)}</span>
            {request.decision_note && <span>{request.decision_note}</span>}
            <span>{formatEventTime(request.decided_at ?? request.submitted_at)}</span>
          </li>
        ))}
        {queue.historyEnrollments.map((enrollment) => (
          <li
            key={`enrollment-${enrollment.enrollment_id}`}
            className={styles.workspaceTaskRow}
          >
            <strong>
              {enrollment.member_name ??
                enrollment.member_username ??
                enrollment.member_user_id}
            </strong>
            <span>{COPY.programs.enrollmentCancelled}</span>
            <span>{formatEventTime(enrollment.cancelled_at ?? enrollment.enrolled_at)}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-participants-title"
      aria-busy={state.kind === "loading"}
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
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {state.kind === "error" && lastReadyRef.current !== null && (
        <output className={styles.panelNotice}>
          {COPY.programs.workspaceParticipantsRefreshFailed}
        </output>
      )}
      {canManage && enrollmentMode === "ManagerOnly" && (
        <form className={styles.ruleForm} onSubmit={handleAssisted}>
          <MemberPicker
            programId={programId}
            name="member_user_id"
            label={COPY.programs.memberId}
            placeholder={COPY.programs.memberIdPlaceholder}
            excludeEnrolled
          />
          <button
            type="submit"
            className={styles.actionButton}
            disabled={assistedBusy || busyRequestId !== null}
          >
            {assistedBusy ? COPY.programs.submitting : COPY.programs.assistedEnroll}
          </button>
          {assistedError !== null && (
            <output className={styles.panelError} role="alert">
              {assistedError}
            </output>
          )}
        </form>
      )}
      {state.kind === "loading" && (
        <output aria-busy="true">
          {COPY.programs.workspaceTaskParticipantsLoading}
        </output>
      )}
      {state.kind === "error" && lastReadyRef.current === null && (
        <div className={styles.boundaryError} role="alert">
          <p>{state.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => {
              setActionErrors({});
              retry();
            }}
          >
            {COPY.programs.workspaceTaskParticipantsRetry}
          </button>
        </div>
      )}
      {queue !== null && (
        <>
          <div className={styles.workspaceActions}>
            <div role="tablist" aria-label={COPY.programs.workspaceTaskParticipants}>
              {(
                [
                  ["pending", COPY.programs.workspacePendingRequests, queue.counts.pending],
                  ["active", COPY.programs.workspaceActiveParticipants, queue.counts.active],
                  ["history", COPY.programs.enrollmentHistory, queue.counts.history],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`participants-${value}-tab`}
                  aria-selected={tab === value}
                  aria-controls={`participants-${value}-panel`}
                  className={styles.taskButton}
                  onClick={() => setTab(value)}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setActionErrors({});
                setNotice(null);
                setRefreshSuccess(COPY.programs.workspaceParticipantsRefreshSuccess);
                setRefreshingAction("refresh");
                void run();
              }}
            >
              {COPY.programs.workspaceParticipantsRefresh}
            </button>
          </div>
          {queue.counts.pending + queue.counts.active + queue.counts.history === 0 && (
            <p className={styles.programDetailMuted}>
              {COPY.programs.workspaceTaskParticipantsEmpty}
            </p>
          )}
          <section
            id={`participants-${tab}-panel`}
            role="tabpanel"
            aria-labelledby={`participants-${tab}-tab`}
          >
            {tab === "pending"
              ? renderPending()
              : tab === "active"
                ? renderActive()
                : renderHistory()}
          </section>
        </>
      )}
    </section>
  );
};

const SettingsTask = ({
  program,
  modules,
  onTaskChange,
}: {
  program: Program;
  modules: readonly DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null) => void;
}) => (
  <>
    <ProgramSettings
      program={program}
      eventsEnabled={hasModule(modules, "events")}
      attendanceEnabled={hasModule(modules, "attendance")}
      onTaskChange={onTaskChange}
    />
    {(program.capabilities.manage || program.capabilities.leader_assign) && (
      <LeadersPanel
        program={program}
        canManage={program.capabilities.leader_assign}
      />
    )}
  </>
);
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
      <ParticipantsTask
        programId={program.program_id}
        canManage={program.capabilities.manage}
        enrollmentMode={program.enrollment_mode}
      />
    ) : (
      <TaskUnavailable task={task} />
    );
  }
  return (
    <SettingsTask
      program={program}
      modules={modules}
      onTaskChange={onTaskChange}
    />
  );
};

export const ProgramWorkspace = ({
  programId,
  task,
  eventId,
  onBack,
  onTaskChange,
  onEventChange,
}: ProgramWorkspaceProps) => {
  const [summary, setSummary] = useState<SummaryState>(() => initialSummary());
  const [editing, setEditing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { state, run: loadWorkspace, retry } = useAsyncResource<
    { program: Program; department: Department | null; modules: DepartmentModule[] },
    WorkspaceState
  >(
    async () => getManagementProgram(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ program, department, modules }) => ({
        kind: "ready",
        program,
        department,
        modules,
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
    if (state.kind !== "ready" || task !== undefined) {
      return;
    }
    void loadSummary(state.modules);
  }, [loadSummary, state, task]);

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
        onTaskChange={(nextTask) => {
          setEditing(false);
          onTaskChange(nextTask);
        }}
      />

      {editing ? (
        <ProgramForm
          initial={state.program}
          onSaved={() => {
            setEditing(false);
            void loadWorkspace();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : task && task === "events" && eventId ? (
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
          onEdit={() => setEditing(true)}
        />
      )}
    </section>
  );
};
