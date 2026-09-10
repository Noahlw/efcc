"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  ScreenEditor,
  ScreenField,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenSection,
  ScreenState,
  ScreenStatus,
  ScreenTab,
  ScreenTabs,
} from "@/lib/screen-foundations";

import { MemberPicker } from "./member-picker";
import { useAsyncResource } from "./use-async-resource";
import {
  formatEventTime,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

type ParticipantTab = "pending" | "active" | "history";
type ParticipantFailure = "forbidden" | "stale" | "conflict" | "server";
interface CancelRetry {
  enrollmentId: string;
  idempotencyKey: string;
}

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
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const addParticipantWasOpenRef = useRef(false);
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
    if (addParticipantWasOpenRef.current && !addParticipantOpen) {
      document
        .querySelector<HTMLElement>("#programs-add-participant-trigger")
        ?.focus();
    }
    addParticipantWasOpenRef.current = addParticipantOpen;
  }, [addParticipantOpen]);
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
      setAddParticipantOpen(false);
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
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.pending} />
      );
    }
    return (
      <ScreenRowList aria-label={COPY.programs.requests}>
        <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
          {queue.pending.map((request) => {
            const member =
              request.member_name ??
              request.member_username ??
              request.member_user_id;
            return (
              <li key={request.request_id} className="min-w-0">
                <ScreenRow
                  className="items-start flex-wrap"
                  aria-busy={busyRequestId === request.request_id}
                >
                  <ScreenRowMain className="basis-full">
                    <ScreenRowTitle>{member}</ScreenRowTitle>
                    <ScreenRowMeta>
                      <ScreenStatus tone="pending">
                        {requestStatusLabel(request.status)}
                      </ScreenStatus>
                      <span className="ml-2">
                        {formatEventTime(request.submitted_at)}
                      </span>
                    </ScreenRowMeta>
                  </ScreenRowMain>
                  {canManage && (
                    <div className="flex min-w-0 basis-full flex-wrap items-end gap-[var(--screen-utility-gap)]">
                      <ScreenField
                        className="min-w-[min(100%,18rem)] flex-1"
                        htmlFor={`participants-note-${request.request_id}`}
                        label={COPY.programs.decisionNote}
                      >
                        <Input
                          id={`participants-note-${request.request_id}`}
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="text"
                          value={notes[request.request_id] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [request.request_id]: event.target.value,
                            }))
                          }
                          disabled={mutationBusy}
                        />
                      </ScreenField>
                      <Button
                        type="button"
                        className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                        variant="outline"
                        onClick={() => void handleDecision(request, "Approved")}
                        disabled={mutationBusy}
                      >
                        {COPY.programs.approve}
                      </Button>
                      <Button
                        type="button"
                        className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                        variant="outline"
                        onClick={() => void handleDecision(request, "Rejected")}
                        disabled={mutationBusy}
                      >
                        {COPY.programs.reject}
                      </Button>
                    </div>
                  )}
                  {actionErrors[request.request_id] && (
                    <Alert className="basis-full" variant="destructive">
                      {actionErrors[request.request_id]}
                    </Alert>
                  )}
                </ScreenRow>
              </li>
            );
          })}
        </ul>
      </ScreenRowList>
    );
  };

  const renderActive = () => {
    if (queue === null || queue.active.length === 0) {
      return (
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.active} />
      );
    }
    return (
      <ScreenRowList>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
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
              <li key={enrollment.enrollment_id} className="min-w-0">
                <ScreenRow
                  className="items-start flex-wrap"
                  aria-busy={busyEnrollmentId === enrollment.enrollment_id}
                >
                  <ScreenRowMain>
                    <ScreenRowTitle>
                      {enrollment.member_name ??
                        enrollment.member_username ??
                        enrollment.member_user_id}
                    </ScreenRowTitle>
                    <ScreenRowMeta>
                      <ScreenStatus tone="success">
                        {COPY.programs.enrollmentActive}
                      </ScreenStatus>
                      {request && (
                        <span className="ml-2">
                          {requestStatusLabel(request.status)}
                        </span>
                      )}
                      <span className="ml-2">
                        {formatEventTime(enrollment.enrolled_at)}
                      </span>
                    </ScreenRowMeta>
                  </ScreenRowMain>
                  {canManage && (
                    <div className="flex min-w-0 basis-full flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      <Button
                        type="button"
                        className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                        variant="outline"
                        onClick={() => void handleCancelEnrollment(enrollment)}
                        disabled={
                          mutationBusy ||
                          cancelRetry?.enrollmentId === enrollment.enrollment_id
                        }
                      >
                        {COPY.programs.cancelEnrollment}
                      </Button>
                    </div>
                  )}
                  {actionErrors[enrollment.enrollment_id] && (
                    <Alert className="basis-full" variant="destructive">
                      {actionErrors[enrollment.enrollment_id]}
                      {cancelRetry?.enrollmentId ===
                        enrollment.enrollment_id && (
                        <Button
                          type="button"
                          className="mt-2 w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                          variant="outline"
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
                </ScreenRow>
              </li>
            );
          })}
        </ul>
      </ScreenRowList>
    );
  };

  const renderHistory = () => {
    if (queue === null || queue.counts.history === 0) {
      return (
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.history} />
      );
    }
    return (
      <ScreenRowList>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
          aria-label={COPY.programs.enrollmentHistory}
        >
          {queue.historyRequests.map((request) => (
            <li key={`request-${request.request_id}`} className="min-w-0">
              <ScreenRow>
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {request.member_name ??
                      request.member_username ??
                      request.member_user_id}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {request.decision_note ??
                      formatEventTime(
                        request.decided_at ?? request.submitted_at
                      )}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenStatus
                  tone={request.status === "Rejected" ? "danger" : "neutral"}
                >
                  {requestStatusLabel(request.status)}
                </ScreenStatus>
              </ScreenRow>
            </li>
          ))}
          {queue.historyEnrollments.map((enrollment) => (
            <li
              key={`enrollment-${enrollment.enrollment_id}`}
              className="min-w-0"
            >
              <ScreenRow>
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {enrollment.member_name ??
                      enrollment.member_username ??
                      enrollment.member_user_id}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {formatEventTime(
                      enrollment.cancelled_at ?? enrollment.enrolled_at
                    )}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenStatus tone="neutral">
                  {COPY.programs.enrollmentCancelled}
                </ScreenStatus>
              </ScreenRow>
            </li>
          ))}
        </ul>
      </ScreenRowList>
    );
  };

  return (
    <ScreenSection
      title={COPY.programs.workspaceTaskParticipants}
      headingId="programs-workspace-participants-title"
      aria-busy={state.kind === "loading"}
      action={
        canManage ? (
          <Button
            id="programs-add-participant-trigger"
            type="button"
            className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
            onClick={() => {
              setAssistedError(null);
              setAddParticipantOpen(true);
            }}
          >
            {COPY.programs.workspaceParticipantsAdd}
          </Button>
        ) : undefined
      }
    >
      <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.workspaceTaskParticipantsLead}
      </p>
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          {notice}
        </Alert>
      )}
      {state.kind === "error" && lastReadyRef.current !== null && (
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          <Alert tone="warning" announcement="polite">
            {COPY.programs.workspaceParticipantsRefreshFailed}
          </Alert>
          <Button
            className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
            variant="outline"
            type="button"
            onClick={refreshParticipants}
          >
            {COPY.programs.workspaceParticipantsRefresh}
          </Button>
        </div>
      )}
      <Sheet open={addParticipantOpen} onOpenChange={setAddParticipantOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-[var(--screen-radius-sheet)] border-[var(--screen-line)] bg-[var(--screen-surface)] p-0 text-[var(--screen-ink)] shadow-[var(--screen-shadow-sheet)]"
        >
          <SheetHeader className="relative border-b border-[var(--screen-line)] px-[var(--screen-gutter)] py-3">
            <SheetTitle className="pr-12 text-xl font-bold text-[var(--screen-ink)]">
              {COPY.programs.workspaceParticipantsAdd}
            </SheetTitle>
            <SheetDescription className="text-[var(--screen-muted)]">
              {COPY.programs.assistedEnrollAck}
            </SheetDescription>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                aria-label={COPY.attention.close}
              >
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </SheetHeader>
          <ScreenEditor
            className="gap-4 overflow-y-auto px-[var(--screen-gutter)] py-4"
            onSubmit={handleAssisted}
          >
            <MemberPicker
              programId={programId}
              name="member_user_id"
              label={COPY.programs.memberId}
              placeholder={COPY.programs.memberIdPlaceholder}
              excludeEnrolled
            />
            {assistedError !== null && (
              <Alert variant="destructive">{assistedError}</Alert>
            )}
            <SheetFooter className="grid grid-cols-[1fr_1.2fr] gap-[var(--screen-utility-gap)] p-0">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                >
                  {COPY.attention.close}
                </Button>
              </SheetClose>
              <Button
                type="submit"
                className="bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                disabled={mutationBusy}
              >
                {assistedBusy
                  ? COPY.programs.submitting
                  : COPY.programs.assistedEnroll}
              </Button>
            </SheetFooter>
          </ScreenEditor>
        </SheetContent>
      </Sheet>
      {state.kind === "loading" && (
        <ScreenLoadingRows
          label={COPY.programs.workspaceTaskParticipantsLoading}
        />
      )}
      {state.kind === "error" && lastReadyRef.current === null && (
        <ScreenState
          kind={state.failure === "forbidden" ? "forbidden" : "error"}
          title={state.message}
          action={
            <Button
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              variant="outline"
              type="button"
              onClick={() => {
                setActionErrors({});
                retry();
              }}
            >
              {COPY.programs.workspaceTaskParticipantsRetry}
            </Button>
          }
        />
      )}
      {queue !== null && (
        <>
          <ScreenTabs aria-label={COPY.programs.workspaceTaskParticipants}>
            {(
              [
                ["pending", COPY.programs.tabsPending, queue.counts.pending],
                ["active", COPY.programs.tabsActive, queue.counts.active],
                ["history", COPY.programs.tabsHistory, queue.counts.history],
              ] as const
            ).map(([value, label, count]) => (
              <ScreenTab
                key={value}
                id={`participants-${value}-tab`}
                role="tab"
                aria-controls={`participants-${value}-panel`}
                aria-selected={tab === value}
                selected={tab === value}
                onClick={() => setTab(value)}
              >
                {label} ({count})
              </ScreenTab>
            ))}
          </ScreenTabs>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-[var(--screen-utility-gap)]">
            {state.kind !== "error" && (
              <Button
                type="button"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                onClick={refreshParticipants}
                disabled={mutationBusy}
              >
                {COPY.programs.workspaceParticipantsRefresh}
              </Button>
            )}
          </div>
          {queue.counts.pending + queue.counts.active + queue.counts.history ===
            0 && (
            <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
              {COPY.programs.workspaceTaskParticipantsEmpty}
            </p>
          )}
          <section
            id={`participants-${tab}-panel`}
            role="tabpanel"
            aria-labelledby={`participants-${tab}-tab`}
            tabIndex={0}
          >
            {tab === "pending"
              ? renderPending()
              : tab === "active"
                ? renderActive()
                : renderHistory()}
          </section>
        </>
      )}
    </ScreenSection>
  );
};
