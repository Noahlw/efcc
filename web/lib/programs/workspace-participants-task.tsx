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
  decideEnrollmentRequest,
  listEnrollmentSnapshot,
} from "@/lib/programs/program-api";
import type { Enrollment, EnrollmentRequest } from "@/lib/programs/program-api";
import { MemberPicker } from "./member-picker";

import {
  formatEventTime,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";
import { useAsyncResource } from "./use-async-resource";

import styles from "@/app/programs/programs.module.css";

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

export const ParticipantsTask = () => {
  const { program, attention, onAttentionRefresh } =
    useWorkspaceTaskContext();
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
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingAction, setRefreshingAction] = useState<string | null>(null);
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

  const pendingAttentionCount = attention?.programs.find(
    ({ program_id }) => program_id === programId
  )?.pending_enrollment_count;

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
                      disabled={busyRequestId !== null}
                    />
                  </label>
                  <Button
                    type="button"
                    className={styles.successOutline}
                    onClick={() => void handleDecision(request, "Approved")}
                    disabled={busyRequestId !== null}
                  >
                    {COPY.programs.approve}
                  </Button>
                  <Button
                    type="button"
                    className={styles.dangerOutline}
                    onClick={() => void handleDecision(request, "Rejected")}
                    disabled={busyRequestId !== null}
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
            >
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
            disabled={assistedBusy || busyRequestId !== null}
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
                      pendingAttentionCount ?? queue.counts.pending,
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
            <Button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setActionErrors({});
                setNotice(null);
                setRefreshSuccess(
                  COPY.programs.workspaceParticipantsRefreshSuccess
                );
                setRefreshingAction("refresh");
                void run();
              }}
            >
              {COPY.programs.workspaceParticipantsRefresh}
            </Button>
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
