"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
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

export interface HistoryItem {
  id: string;
  label: string;
  at: string;
}

type ConfirmKind = "withdraw" | "cancel";

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
    case "Approved": {
      return null;
    }
    default: {
      return null;
    }
  }
}

export function buildEnrollmentHistory(
  enrollment: ParticipantEnrollmentSnapshot | null
): HistoryItem[] {
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
}

interface EnrollmentActionProps {
  program: ProgramSummary;
  enrollmentAccess: ParticipantEnrollmentAccess;
  activeEnrollment: ParticipantEnrollmentSnapshot["enrollments"][number] | null;
  pendingRequest: ParticipantEnrollmentSnapshot["requests"][number] | null;
  latestRequest: ParticipantEnrollmentSnapshot["requests"][number] | null;
  cancelledEnrollment:
    | ParticipantEnrollmentSnapshot["enrollments"][number]
    | null;
  busy: boolean;
  onRequest: () => void;
  onBeginConfirm: (kind: ConfirmKind) => void;
}

const EnrollmentAction = ({
  program,
  enrollmentAccess,
  activeEnrollment,
  pendingRequest,
  latestRequest,
  cancelledEnrollment,
  busy,
  onRequest,
  onBeginConfirm,
}: EnrollmentActionProps) => {
  if (program.lifecycle === "Archived") {
    return <p className={styles.emptyLine}>{COPY.programs.archivedNote}</p>;
  }
  if (enrollmentAccess === "Unavailable") {
    return (
      <p className={styles.emptyLine}>
        {COPY.programs.enrollmentUnavailableNote}
      </p>
    );
  }
  if (program.enrollment_mode === "ManagerOnly") {
    return <p className={styles.emptyLine}>{COPY.programs.managerOnlyNote}</p>;
  }
  if (program.lifecycle === "Draft") {
    return (
      <p className={styles.emptyLine}>{COPY.programs.enrollmentDraftNote}</p>
    );
  }
  if (activeEnrollment) {
    return (
      <>
        <p className={styles.emptyLine}>{COPY.programs.enrollmentActive}</p>
        <p className={styles.programDetailMuted}>
          {COPY.programs.enrollmentActiveHint}
        </p>
        <div className={styles.stickyActionBar}>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy}
            onClick={() => onBeginConfirm("cancel")}
          >
            {busy ? COPY.programs.withdrawing : COPY.programs.cancelEnrollment}
          </button>
        </div>
      </>
    );
  }
  if (pendingRequest) {
    return (
      <>
        <p className={styles.emptyLine}>{COPY.programs.requestPending}</p>
        <p className={styles.programDetailMuted}>
          {COPY.programs.requestPendingHint}
        </p>
        <div className={styles.stickyActionBar}>
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={() => onBeginConfirm("withdraw")}
          >
            {busy ? COPY.programs.withdrawing : COPY.programs.withdrawRequest}
          </button>
        </div>
      </>
    );
  }
  if (enrollmentAccess === "Ineligible") {
    return (
      <p className={styles.emptyLine}>
        {COPY.programs.enrollmentIneligibleNote}
      </p>
    );
  }
  switch (latestRequest?.status) {
    case "Rejected": {
      return (
        <>
          <p className={styles.emptyLine}>{COPY.programs.requestRejected}</p>
          <p className={styles.programDetailMuted}>
            {COPY.programs.requestRejectedHint}
          </p>
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={onRequest}
          >
            {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
          </button>
        </>
      );
    }
    case "Withdrawn": {
      return (
        <>
          <p className={styles.emptyLine}>{COPY.programs.requestWithdrawn}</p>
          <p className={styles.programDetailMuted}>
            {COPY.programs.requestWithdrawnHint}
          </p>
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={onRequest}
          >
            {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
          </button>
        </>
      );
    }
    default: {
      break;
    }
  }
  if (cancelledEnrollment) {
    return (
      <>
        <p className={styles.emptyLine}>{COPY.programs.enrollmentCancelled}</p>
        <p className={styles.programDetailMuted}>
          {COPY.programs.enrollmentCancelledHint}
        </p>
        <button
          type="button"
          className={styles.actionButton}
          disabled={busy}
          onClick={onRequest}
        >
          {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
        </button>
      </>
    );
  }
  if (latestRequest?.status === "Approved") {
    return (
      <p className={styles.emptyLine}>
        {COPY.programs.enrollmentUnavailableNote}
      </p>
    );
  }
  return (
    <button
      type="button"
      className={styles.actionButton}
      disabled={busy}
      onClick={onRequest}
    >
      {busy ? COPY.programs.submitting : COPY.programs.enroll}
    </button>
  );
};

export const ParticipantEnrollment = ({
  program,
  enrollment,
  enrollmentAccess,
  scheduleRules,
  events,
  onRefresh,
}: ParticipantEnrollmentProps) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const mounted = useRef(true);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const showOfflineError = useCallback(() => {
    const message = COPY.programs.enrollmentOfflineError;
    setActionError(message);
    setNotice(null);
    announce(message);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmKind(null);
    queueMicrotask(() => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (confirmKind === null) {
      return;
    }
    const dismissButton = dialogRef.current?.querySelector<HTMLButtonElement>(
      "[data-confirm-dismiss]"
    );
    dismissButton?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirm();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeConfirm, confirmKind]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successCopy: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        showOfflineError();
        return;
      }
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
    [onRefresh, showOfflineError]
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
    program.lifecycle === "Active" &&
    program.enrollment_mode === "MemberRequest" &&
    activeEnrollment === null &&
    pendingRequest === null &&
    (latestRequest?.status !== "Approved" || cancelledEnrollment !== null);
  const showScheduleAdvisory =
    canRequest && (scheduleRules.length > 0 || events.length > 0);

  const beginConfirm = (kind: ConfirmKind) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showOfflineError();
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setNotice(null);
    setActionError(null);
    setConfirmKind(kind);
  };

  const handleRequest = () => {
    void runAction(
      () => submitEnrollmentRequest(program.program_id),
      COPY.programs.requestSubmitted
    );
  };

  const acceptConfirmation = () => {
    const kind = confirmKind;
    closeConfirm();
    if (kind === "withdraw" && pendingRequest) {
      void runAction(
        () =>
          withdrawEnrollmentRequest(
            program.program_id,
            pendingRequest.request_id
          ),
        COPY.programs.requestWithdrawnNotice
      );
    }
    if (kind === "cancel" && activeEnrollment) {
      void runAction(
        () =>
          cancelEnrollment(program.program_id, activeEnrollment.enrollment_id),
        COPY.programs.enrollmentCancelledNotice
      );
    }
  };

  const confirmationTitle =
    confirmKind === "withdraw"
      ? COPY.programs.withdrawConfirmTitle
      : COPY.programs.cancelConfirmTitle;
  const confirmationBody =
    confirmKind === "withdraw"
      ? COPY.programs.withdrawConfirmBody
      : COPY.programs.cancelConfirmBody;
  const confirmationAccept =
    confirmKind === "withdraw"
      ? COPY.programs.withdrawConfirmAccept
      : COPY.programs.cancelConfirmAccept;

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

      <EnrollmentAction
        program={program}
        enrollmentAccess={enrollmentAccess}
        activeEnrollment={activeEnrollment}
        pendingRequest={pendingRequest}
        latestRequest={latestRequest}
        cancelledEnrollment={cancelledEnrollment}
        busy={busy}
        onRequest={handleRequest}
        onBeginConfirm={beginConfirm}
      />

      {showScheduleAdvisory && (
        <p className={styles.programDetailMuted}>
          {COPY.programs.enrollmentScheduleAdvisory}
        </p>
      )}

      {confirmKind !== null && (
        <dialog
          open
          ref={dialogRef}
          className={styles.participantConfirm}
          aria-modal="true"
          aria-labelledby="participant-confirm-title"
          aria-describedby="participant-confirm-body"
        >
          <div className={styles.participantConfirmSurface}>
            <h4 id="participant-confirm-title">{confirmationTitle}</h4>
            <p id="participant-confirm-body">{confirmationBody}</p>
            <div className={styles.participantConfirmActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                data-confirm-dismiss
                onClick={closeConfirm}
              >
                {COPY.programs.cancelRevoke}
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={acceptConfirmation}
              >
                {confirmationAccept}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
};
