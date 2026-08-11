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
  scheduleRules: ParticipantScheduleRule[];
  events: ParticipantEventSummary[];
  onRefresh: () => Promise<void>;
}

type HistoryItem = {
  id: string;
  label: string;
  at: string;
};

function errorMessage(error: unknown): string {
  return error instanceof RpcError
    ? errorCopyFor(error.problem.code, error.problem.detail)
    : COPY.error.networkError;
}

function requestStatusLabel(
  status: ParticipantEnrollmentRequest["status"]
): string | null {
  switch (status) {
    case "Pending":
      return COPY.programs.requestPending;
    case "Rejected":
      return COPY.programs.requestRejected;
    case "Withdrawn":
      return COPY.programs.requestWithdrawn;
    case "Approved":
      return null;
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
  scheduleRules,
  events,
  onRefresh,
}: ParticipantEnrollmentProps) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successCopy: string) => {
      setBusy(true);
      setNotice(null);
      setActionError(null);
      try {
        await action();
        await onRefresh();
        if (!mounted.current) {
          return;
        }
        setNotice(successCopy);
        announce(successCopy);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = errorMessage(error);
        setActionError(message);
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
    enrollment !== null &&
    program.lifecycle === "Active" &&
    program.enrollment_mode === "MemberRequest" &&
    activeEnrollment === null &&
    pendingRequest === null &&
    latestRequest?.status !== "Approved";
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
                at: request.submitted_at,
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
  const handleWithdraw = () => {
    if (!pendingRequest) {
      return;
    }
    void runAction(
      () =>
        withdrawEnrollmentRequest(
          program.program_id,
          pendingRequest.request_id
        ),
      COPY.programs.requestWithdrawnNotice
    );
  };
  const handleCancel = () => {
    if (!activeEnrollment) {
      return;
    }
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
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {actionError !== null && (
        <output className={styles.panelError} role="alert">
          {actionError}
        </output>
      )}
      <h3 id="program-enrollment-title" className={styles.panelHeading}>
        {COPY.programs.enrollment}
      </h3>

      {activeEnrollment ? (
        <>
          <p className={styles.emptyLine}>{COPY.programs.enrollmentActive}</p>
          <p className={styles.programDetailMuted}>
            {COPY.programs.enrollmentActiveHint}
          </p>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy}
            onClick={handleCancel}
          >
            {busy ? COPY.programs.submitting : COPY.programs.cancelEnrollment}
          </button>
        </>
      ) : pendingRequest ? (
        <>
          <p className={styles.emptyLine}>{COPY.programs.requestPending}</p>
          <p className={styles.programDetailMuted}>
            {COPY.programs.requestPendingHint}
          </p>
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={handleWithdraw}
          >
            {busy ? COPY.programs.submitting : COPY.programs.withdrawRequest}
          </button>
        </>
      ) : program.lifecycle !== "Active" ? (
        <p className={styles.emptyLine}>{closedCopy(program.lifecycle)}</p>
      ) : program.enrollment_mode === "ManagerOnly" ? (
        <p className={styles.emptyLine}>{COPY.programs.managerOnlyNote}</p>
      ) : enrollment === null ? (
        <p className={styles.emptyLine}>
          {COPY.programs.enrollmentIneligibleNote}
        </p>
      ) : latestRequest?.status === "Rejected" ? (
        <>
          <p className={styles.emptyLine}>{COPY.programs.requestRejected}</p>
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
          <p className={styles.emptyLine}>{COPY.programs.requestWithdrawn}</p>
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
      ) : latestRequest?.status === "Approved" ? (
        <p className={styles.emptyLine}>
          {COPY.programs.enrollmentUnavailableNote}
        </p>
      ) : cancelledEnrollment ? (
        <>
          <p className={styles.emptyLine}>
            {COPY.programs.enrollmentCancelled}
          </p>
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
      ) : (
        <button
          type="button"
          className={styles.actionButton}
          disabled={busy}
          onClick={handleRequest}
        >
          {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
        </button>
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
