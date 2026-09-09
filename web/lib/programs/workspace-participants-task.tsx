"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  assistedEnroll,
  cancelEnrollment,
  decideEnrollmentRequest,
  listEnrollmentSnapshot,
} from "@/lib/programs/program-api";
import type { Enrollment, EnrollmentRequest } from "@/lib/programs/program-api";

import { MemberPicker } from "./member-picker";
import { useAsyncResource } from "./use-async-resource";
import {
  formatEventTime,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

const styles = {
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  workspaceTaskList: "m-0 grid min-w-0 list-none gap-2 p-0",
  workspaceTaskRow:
    "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-3 [overflow-wrap:anywhere]",
  field: "grid min-w-0 gap-1.5",
  fieldLabel: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  input:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  successOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] px-4 py-2 text-[var(--success)] whitespace-normal",
  dangerOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--error-border)] bg-transparent px-4 py-2 text-[var(--error)] whitespace-normal",
  panelError:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  workspaceTask: "grid min-w-0 gap-4",
  workspaceHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  panelNotice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  ruleForm:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4",
  actionButton:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  boundaryError:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-[var(--error)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  workspaceActions: "flex min-w-0 flex-wrap items-center gap-3",
  taskButton:
    "min-h-11 min-w-11 rounded-lg border border-[var(--line-strong)] bg-transparent px-3 py-2 text-[var(--ink)] whitespace-normal",
  secondaryButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
} as const;

type ParticipantTab = "pending" | "active" | "history";
type ParticipantFailure = "forbidden" | "stale" | "conflict" | "server";
type CancelRetry = {
  enrollmentId: string;
  idempotencyKey: string;
};

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
function isAmbiguousCancelError(error: unknown): boolean {
  if (!(error instanceof RpcError)) {
    return true;
  }
  return (
    error.problem.status === 0 ||
    error.problem.code === "NETWORK_ERROR" ||
    error.problem.code === "MALFORMED_RESPONSE" ||
    error.problem.code === "MALFORMED_REQUEST" ||
    error.problem.code === "UNAVAILABLE"
  );
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

export const ParticipantsTask = () => {
  const { program, onAttentionRefresh } = useWorkspaceTaskContext();
  const programId = program.program_id;
  const canManage = program.capabilities.manage;
  const { state, run, retry } = useAsyncResource<
    { requests: EnrollmentRequest[]; enrollments: Enrollment[] },
    ParticipantsState
  >(
    () => listEnrollmentSnapshot(programId),
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
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingAction, setRefreshingAction] = useState<string | null>(null);
  const [cancelRetry, setCancelRetry] = useState<CancelRetry | null>(null);
  const [assistedBusy, setAssistedBusy] = useState(false);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  // Most recent successful snapshot: a failed refresh after a successful
  // mutation keeps the queue rendered from the last-known data instead of
  // ejecting the operator into the full-panel error state.
  const lastReadyRef = useRef<Extract<
    ParticipantsState,
    { kind: "ready" }
  > | null>(null);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    if (state.kind === "ready") {
      lastReadyRef.current = state;
    }
  }, [state]);
  const mutationBusy =
    busyRequestId !== null ||
    busyEnrollmentId !== null ||
    assistedBusy ||
    refreshingAction !== null;

  useEffect(() => {
    if (refreshingAction === null || state.kind === "loading") {
      return;
    }
    if (state.kind === "ready") {
      setCancelRetry(null);
      setNotice(refreshSuccess);
      announce(refreshSuccess);
      setRefreshingAction(null);
    } else {
      setNotice(null);
    }
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
      const { [request.request_id]: _, ...next } = current;
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
      onAttentionRefresh();
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
  const handleCancelEnrollment = async (
    enrollment: Enrollment,
    retryKey?: string
  ) => {
    const idempotencyKey =
      retryKey ??
      (cancelRetry?.enrollmentId === enrollment.enrollment_id
        ? cancelRetry.idempotencyKey
        : crypto.randomUUID());
    setCancelRetry({
      enrollmentId: enrollment.enrollment_id,
      idempotencyKey,
    });
    setBusyEnrollmentId(enrollment.enrollment_id);
    setNotice(null);
    setActionErrors((current) => {
      const { [enrollment.enrollment_id]: _, ...next } = current;
      return next;
    });
    try {
      await cancelEnrollment(
        programId,
        enrollment.enrollment_id,
        idempotencyKey
      );
      onAttentionRefresh();
      setRefreshSuccess(COPY.programs.enrollmentCancelledNotice);
      setRefreshingAction(enrollment.enrollment_id);
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        setCancelRetry(null);
        return;
      }
      if (!isAmbiguousCancelError(error)) {
        setCancelRetry(null);
      }
      const issue = participantIssue(error);
      setActionErrors((current) => ({
        ...current,
        [enrollment.enrollment_id]: issue.message,
      }));
      announce(issue.message);
    } finally {
      setBusyEnrollmentId(null);
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
      onAttentionRefresh();
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
  const refreshParticipants = () => {
    setActionErrors({});
    setNotice(null);
    setRefreshSuccess(COPY.programs.workspaceParticipantsRefreshSuccess);
    setRefreshingAction("refresh");
    void run();
  };

  const renderPending = () => {
    if (queue === null || queue.pending.length === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.tabsEmpty.pending}
        </p>
      );
    }
    return (
      <ul
        className={styles.workspaceTaskList}
        aria-label={COPY.programs.requests}
      >
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
                    <Input
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
                      disabled={mutationBusy}
                    />
                  </label>
                  <Button
                    type="button"
                    className={styles.successOutline}
                    onClick={() => void handleDecision(request, "Approved")}
                    disabled={mutationBusy}
                  >
                    {COPY.programs.approve}
                  </Button>
                  <Button
                    type="button"
                    className={styles.dangerOutline}
                    onClick={() => void handleDecision(request, "Rejected")}
                    disabled={mutationBusy}
                  >
                    {COPY.programs.reject}
                  </Button>
                </>
              )}
              {actionErrors[request.request_id] && (
                <Alert className={styles.panelError} variant="destructive">
                  {actionErrors[request.request_id]}
                </Alert>
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
          {COPY.programs.tabsEmpty.active}
        </p>
      );
    }
    return (
      <ul
        className={styles.workspaceTaskList}
        aria-label={COPY.programs.workspaceActiveParticipants}
      >
        {queue.active.map((enrollment) => {
          const request =
            state.kind === "ready"
              ? state.requests.find(
                  ({ request_id }) => request_id === enrollment.request_id
                )
              : undefined;
          return (
            <li
              key={enrollment.enrollment_id}
              className={styles.workspaceTaskRow}
              aria-busy={busyEnrollmentId === enrollment.enrollment_id}
            >
              <strong>
                {enrollment.member_name ??
                  enrollment.member_username ??
                  enrollment.member_user_id}
              </strong>
              <span>{COPY.programs.enrollmentActive}</span>
              {request && <span>{requestStatusLabel(request.status)}</span>}
              <span>{formatEventTime(enrollment.enrolled_at)}</span>
              {canManage && (
                <Button
                  type="button"
                  className={styles.dangerOutline}
                  onClick={() => void handleCancelEnrollment(enrollment)}
                  disabled={
                    mutationBusy ||
                    cancelRetry?.enrollmentId === enrollment.enrollment_id
                  }
                >
                  {COPY.programs.cancelEnrollment}
                </Button>
              )}
              {actionErrors[enrollment.enrollment_id] && (
                <Alert className={styles.panelError} variant="destructive">
                  {actionErrors[enrollment.enrollment_id]}
                  {cancelRetry?.enrollmentId === enrollment.enrollment_id && (
                    <Button
                      type="button"
                      className={styles.retry}
                      onClick={() =>
                        void handleCancelEnrollment(
                          enrollment,
                          cancelRetry.idempotencyKey
                        )
                      }
                      disabled={mutationBusy}
                    >
                      {COPY.error.retry}
                    </Button>
                  )}
                </Alert>
              )}
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
          {COPY.programs.tabsEmpty.history}
        </p>
      );
    }
    return (
      <ul
        className={styles.workspaceTaskList}
        aria-label={COPY.programs.enrollmentHistory}
      >
        {queue.historyRequests.map((request) => (
          <li
            key={`request-${request.request_id}`}
            className={styles.workspaceTaskRow}
          >
            <strong>
              {request.member_name ??
                request.member_username ??
                request.member_user_id}
            </strong>
            <span>{requestStatusLabel(request.status)}</span>
            {request.decision_note && <span>{request.decision_note}</span>}
            <span>
              {formatEventTime(request.decided_at ?? request.submitted_at)}
            </span>
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
            <span>
              {formatEventTime(
                enrollment.cancelled_at ?? enrollment.enrolled_at
              )}
            </span>
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
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {state.kind === "error" && lastReadyRef.current !== null && (
        <div className={styles.workspaceActions}>
          <output className={styles.panelNotice}>
            {COPY.programs.workspaceParticipantsRefreshFailed}
          </output>
          <Button
            className={styles.retry}
            type="button"
            onClick={refreshParticipants}
          >
            {COPY.programs.workspaceParticipantsRefresh}
          </Button>
        </div>
      )}
      {canManage && (
        <form className={styles.ruleForm} onSubmit={handleAssisted}>
          <p className={styles.programDetailMuted}>
            {COPY.programs.assistedEnrollAck}
          </p>
          <MemberPicker
            programId={programId}
            name="member_user_id"
            label={COPY.programs.memberId}
            placeholder={COPY.programs.memberIdPlaceholder}
            excludeEnrolled
          />
          <Button
            type="submit"
            className={styles.actionButton}
            disabled={mutationBusy}
          >
            {assistedBusy
              ? COPY.programs.submitting
              : COPY.programs.assistedEnroll}
          </Button>
          {assistedError !== null && (
            <Alert className={styles.panelError} variant="destructive">
              {assistedError}
            </Alert>
          )}
        </form>
      )}
      {state.kind === "loading" && (
        <>
          <output aria-busy="true">
            {COPY.programs.workspaceTaskParticipantsLoading}
          </output>
          <Skeleton className="h-8 w-full" aria-hidden="true" />
        </>
      )}
      {state.kind === "error" && lastReadyRef.current === null && (
        <Alert className={styles.boundaryError} variant="destructive">
          <p>{state.message}</p>
          <Button
            className={styles.retry}
            type="button"
            onClick={() => {
              setActionErrors({});
              retry();
            }}
          >
            {COPY.programs.workspaceTaskParticipantsRetry}
          </Button>
        </Alert>
      )}
      {queue !== null && (
        <>
          <div className={styles.workspaceActions}>
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as ParticipantTab)}
            >
              <TabsList
                className={styles.taskButton}
                variant="line"
                aria-label={COPY.programs.workspaceTaskParticipants}
              >
                {(
                  [
                    [
                      "pending",
                      COPY.programs.tabsPending,
                      queue.counts.pending,
                    ],
                    ["active", COPY.programs.tabsActive, queue.counts.active],
                    [
                      "history",
                      COPY.programs.tabsHistory,
                      queue.counts.history,
                    ],
                  ] as const
                ).map(([value, label, count]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    id={`participants-${value}-tab`}
                    aria-controls={`participants-${value}-panel`}
                    className={styles.taskButton}
                  >
                    {label} ({count})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {state.kind !== "error" && (
              <Button
                type="button"
                className={styles.secondaryButton}
                onClick={refreshParticipants}
                disabled={mutationBusy}
              >
                {COPY.programs.workspaceParticipantsRefresh}
              </Button>
            )}
          </div>
          {queue.counts.pending + queue.counts.active + queue.counts.history ===
            0 && (
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
