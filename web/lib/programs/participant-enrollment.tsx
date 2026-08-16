"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  cancelEnrollment,
  submitEnrollmentRequest,
  withdrawEnrollmentRequest,
} from "@/lib/programs/program-api";
import type {
  ParticipantEnrollmentAccess,
  ParticipantEnrollmentRequest,
  ParticipantEnrollmentSnapshot,
  ParticipantEventSummary,
  ParticipantScheduleRule,
  ProgramSummary,
} from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

export interface ParticipantEnrollmentProps {
  program: ProgramSummary;
  enrollment: ParticipantEnrollmentSnapshot | null;
  enrollmentAccess: ParticipantEnrollmentAccess;
  scheduleRules: ParticipantScheduleRule[];
  events: ParticipantEventSummary[];
  onRefresh: () => Promise<void>;
}

interface HistoryItem {
  id: string;
  label: string;
  at: string;
}

type ConfirmingAction = "withdraw" | "cancel";

interface EnrollmentOutcome {
  tone: "success" | "error";
  message: string;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof RpcError)) {
    return COPY.error.networkError;
  }
  if (
    error.problem.code === "VALIDATION" &&
    error.problem.detail?.includes("does not accept enrollment mode")
  ) {
    return COPY.programs.enrollmentUnavailableNote;
  }
  return errorCopyFor(error.problem.code, error.problem.detail);
}

function requestStatusLabel(
  status: ParticipantEnrollmentRequest["status"]
): string | null {
  switch (status) {
    case "Pending": {
      return COPY.programs.requestPending;
    }
    case "Rejected": {
      return COPY.programs.requestRejected;
    }
    case "Withdrawn": {
      return COPY.programs.requestWithdrawn;
    }
    case "Approved":
    default: {
      return null;
    }
  }
}

function closedCopy(lifecycle: ProgramSummary["lifecycle"]): string {
  return lifecycle === "Archived"
    ? COPY.programs.enrollmentArchivedNote
    : COPY.programs.enrollmentDraftNote;
}

export const ParticipantEnrollment = ({
  program,
  enrollment,
  enrollmentAccess,
  scheduleRules,
  events,
  onRefresh,
}: ParticipantEnrollmentProps) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EnrollmentOutcome | null>(null);
  const [confirmingAction, setConfirmingAction] =
    useState<ConfirmingAction | null>(null);
  const mounted = useRef(true);
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (confirmingAction !== null) {
      confirmationRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingAction]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successCopy: string) => {
      setBusy(true);
      setOutcome(null);
      try {
        await action();
        await onRefresh();
        if (!mounted.current) {
          return;
        }
        setOutcome({ tone: "success", message: successCopy });
        announce(successCopy);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = errorMessage(error);
        setOutcome({ tone: "error", message });
        announce(message);
        try {
          await onRefresh();
        } catch {
          // Keep the primary action error visible if reconciliation also fails.
        }
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [onRefresh]
  );

  const activeEnrollment = useMemo(
    () =>
      enrollment?.enrollments.find((item) => item.status === "Active") ?? null,
    [enrollment]
  );
  const pendingRequest = useMemo(
    () =>
      enrollment?.requests.find((item) => item.status === "Pending") ?? null,
    [enrollment]
  );
  const latestRequest = useMemo(
    () =>
      enrollment?.requests
        .toSorted((a, b) => b.submitted_at.localeCompare(a.submitted_at))
        .at(0) ?? null,
    [enrollment]
  );
  const cancelledEnrollment = useMemo(
    () =>
      enrollment?.enrollments.find((item) => item.status === "Cancelled") ??
      null,
    [enrollment]
  );
  const canRequest =
    enrollmentAccess === "Eligible" &&
    enrollment !== null &&
    program.lifecycle === "Active" &&
    program.enrollment_mode === "MemberRequest" &&
    activeEnrollment === null &&
    pendingRequest === null &&
    (latestRequest?.status !== "Approved" || cancelledEnrollment !== null);
  const showScheduleAdvisory =
    canRequest && (scheduleRules.length > 0 || events.length > 0);

  const history = useMemo<HistoryItem[]>(() => {
    if (!enrollment) {
      return [];
    }
    return [
      ...enrollment.requests.flatMap((request) => {
        const label = requestStatusLabel(request.status);
        return label === null
          ? []
          : [
              {
                id: `request-${request.request_id}`,
                label,
                at: request.decided_at ?? request.submitted_at,
              },
            ];
      }),
      ...enrollment.enrollments.map((item) => ({
        id: `enrollment-${item.enrollment_id}`,
        label:
          item.status === "Active"
            ? COPY.programs.enrollmentActive
            : COPY.programs.enrollmentCancelled,
        at: item.cancelled_at ?? item.enrolled_at,
      })),
    ].toSorted((a, b) => b.at.localeCompare(a.at));
  }, [enrollment]);

  const handleRequest = () => {
    void runAction(
      () => submitEnrollmentRequest(program.program_id),
      COPY.programs.requestSubmitted
    );
  };
  const beginWithdraw = () => {
    if (!pendingRequest || busy) {
      return;
    }
    setOutcome(null);
    setConfirmingAction("withdraw");
  };
  const confirmWithdraw = () => {
    if (!pendingRequest) {
      return;
    }
    setConfirmingAction(null);
    void runAction(
      () =>
        withdrawEnrollmentRequest(
          program.program_id,
          pendingRequest.request_id
        ),
      COPY.programs.requestWithdrawnNotice
    );
  };
  const beginCancel = () => {
    if (!activeEnrollment || busy) {
      return;
    }
    setOutcome(null);
    setConfirmingAction("cancel");
  };
  const confirmCancel = () => {
    if (!activeEnrollment) {
      return;
    }
    setConfirmingAction(null);
    void runAction(
      () =>
        cancelEnrollment(program.program_id, activeEnrollment.enrollment_id),
      COPY.programs.enrollmentCancelledNotice
    );
  };

  return (
    <section
      className={styles.eventsPanel}
      aria-labelledby="program-enrollment-title"
      aria-busy={busy}
    >
      {outcome !== null && (
        <output
          className={styles.enrollmentStatus}
          data-tone={outcome.tone}
          role={outcome.tone === "error" ? "alert" : undefined}
          aria-live={outcome.tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {outcome.message}
        </output>
      )}
      <h3 id="program-enrollment-title" className={styles.panelHeading}>
        {COPY.programs.enrollment}
      </h3>

      {activeEnrollment ? (
        <>
          <output
            className={styles.enrollmentStatus}
            data-tone="success"
            aria-live="polite"
            aria-atomic="true"
          >
            {COPY.programs.enrollmentActive}
          </output>
          <p className={styles.programDetailMuted}>
            {COPY.programs.enrollmentActiveHint}
          </p>
          {confirmingAction === "cancel" ? (
            <div
              ref={confirmationRef}
              className={styles.confirmRow}
              role="alert"
              aria-label={COPY.programs.confirmCancelEnrollment}
            >
              <span>{COPY.programs.confirmCancelEnrollment}</span>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={busy}
                onClick={confirmCancel}
              >
                {COPY.programs.confirmCancelEnrollmentAction}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => setConfirmingAction(null)}
              >
                {COPY.programs.cancelEnrollmentConfirmation}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={beginCancel}
            >
              {busy ? COPY.programs.submitting : COPY.programs.cancelEnrollment}
            </button>
          )}
        </>
      ) : pendingRequest ? (
        <>
          <output
            className={styles.enrollmentStatus}
            data-tone="pending"
            aria-live="polite"
            aria-atomic="true"
          >
            {COPY.programs.requestPending}
          </output>
          <p className={styles.programDetailMuted}>
            {COPY.programs.requestPendingHint}
          </p>
          {confirmingAction === "withdraw" ? (
            <div
              ref={confirmationRef}
              className={styles.confirmRow}
              role="alert"
              aria-label={COPY.programs.confirmWithdrawRequest}
            >
              <span>{COPY.programs.confirmWithdrawRequest}</span>
              <button
                type="button"
                className={styles.actionButton}
                disabled={busy}
                onClick={confirmWithdraw}
              >
                {COPY.programs.confirmWithdrawRequestAction}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => setConfirmingAction(null)}
              >
                {COPY.programs.cancelEnrollmentConfirmation}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy}
              onClick={beginWithdraw}
            >
              {busy ? COPY.programs.submitting : COPY.programs.withdrawRequest}
            </button>
          )}
        </>
      ) : program.lifecycle === "Active" ? (
        enrollmentAccess === "Unavailable" ? (
          <p className={styles.emptyLine}>
            {COPY.programs.enrollmentUnavailableNote}
          </p>
        ) : program.enrollment_mode === "ManagerOnly" ? (
          <p className={styles.emptyLine}>{COPY.programs.managerOnlyNote}</p>
        ) : enrollment === null ? (
          <p className={styles.emptyLine}>
            {COPY.programs.enrollmentIneligibleNote}
          </p>
        ) : latestRequest?.status === "Rejected" ? (
          <>
            <output
              className={styles.enrollmentStatus}
              data-tone="error"
              aria-live="polite"
            >
              {COPY.programs.requestRejected}
            </output>
            <p className={styles.programDetailMuted}>
              {COPY.programs.requestRejectedHint}
            </p>
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy}
              onClick={handleRequest}
            >
              {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
            </button>
          </>
        ) : latestRequest?.status === "Withdrawn" ? (
          <>
            <output
              className={styles.enrollmentStatus}
              data-tone="info"
              aria-live="polite"
            >
              {COPY.programs.requestWithdrawn}
            </output>
            <p className={styles.programDetailMuted}>
              {COPY.programs.requestWithdrawnHint}
            </p>
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy}
              onClick={handleRequest}
            >
              {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
            </button>
          </>
        ) : cancelledEnrollment ? (
          <>
            <output
              className={styles.enrollmentStatus}
              data-tone="info"
              aria-live="polite"
            >
              {COPY.programs.enrollmentCancelled}
            </output>
            <p className={styles.programDetailMuted}>
              {COPY.programs.enrollmentCancelledHint}
            </p>
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy}
              onClick={handleRequest}
            >
              {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
            </button>
          </>
        ) : latestRequest?.status === "Approved" ? (
          <output
            className={styles.enrollmentStatus}
            data-tone="info"
            aria-live="polite"
          >
            {COPY.programs.enrollmentUnavailableNote}
          </output>
        ) : (
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={handleRequest}
          >
            {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
          </button>
        )
      ) : (
        <p className={styles.emptyLine}>{closedCopy(program.lifecycle)}</p>
      )}

      {showScheduleAdvisory && (
        <p className={styles.programDetailMuted}>
          {COPY.programs.enrollmentScheduleAdvisory}
        </p>
      )}

      {history.length > 0 && (
        <ul
          className={styles.eventList}
          aria-label={COPY.programs.enrollmentHistory}
        >
          {history.map((item) => (
            <li key={item.id} className={styles.eventRow}>
              <span className={styles.eventDate}>{item.label}</span>
              <time className={styles.eventSource} dateTime={item.at}>
                {hkWallLabel(item.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
