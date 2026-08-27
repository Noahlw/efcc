"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { MemberPicker } from "@/lib/programs/member-picker";
import {
  assistedEnroll,
  cancelEnrollment,
  decideEnrollmentRequest,
  listEnrollmentRequests,
  listEnrollments,
  submitEnrollmentRequest,
  withdrawEnrollmentRequest,
} from "@/lib/programs/program-api";
import type {
  Enrollment,
  EnrollmentRequest,
  Program,
} from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

function errorMessage(err: unknown): string {
  return err instanceof RpcError
    ? errorCopyFor(err.problem.code)
    : COPY.error.networkError;
}

const REQUEST_STATUS_LABEL: Record<EnrollmentRequest["status"], string> = {
  Pending: COPY.programs.requestPending,
  Approved: COPY.programs.requestApproved,
  Rejected: COPY.programs.requestRejected,
  Withdrawn: COPY.programs.requestWithdrawn,
};

const ENROLLMENT_STATUS_LABEL: Record<Enrollment["status"], string> = {
  Active: COPY.programs.enrollmentActive,
  Cancelled: COPY.programs.enrollmentCancelled,
};

const RequestList = ({
  requests,
  canManage,
  currentUserId,
  busy,
  onDecide,
  onWithdraw,
}: {
  requests: EnrollmentRequest[] | null;
  canManage: boolean;
  currentUserId: string;
  busy: boolean;
  onDecide: (
    requestId: string
  ) => (event: React.FormEvent<HTMLFormElement>) => void;
  onWithdraw: (requestId: string) => void;
}) => (
  <ul className={styles.eventList} aria-label={COPY.programs.requests}>
    {requests === null ? (
      <li className={styles.emptyLine} aria-live="polite">
        {COPY.nav.loading}
      </li>
    ) : requests.length === 0 ? (
      <li className={styles.emptyLine}>{COPY.programs.noRequests}</li>
    ) : (
      requests.map((request) => (
        <li key={request.request_id} className={styles.eventRow}>
          <span className={styles.eventDate}>
            {request.member_name ?? request.member_user_id}
            {request.member_username ? ` (${request.member_username})` : ""}
          </span>
          <Badge className={styles.eventSource} variant="outline">
            {REQUEST_STATUS_LABEL[request.status]}
          </Badge>
          {canManage && request.status === "Pending" && (
            <form
              className={styles.cancelForm}
              onSubmit={onDecide(request.request_id)}
            >
              <Input
                type="text"
                name="decision_note"
                aria-label={COPY.programs.decisionNote}
              />
              <Button
                type="submit"
                name="action"
                value="Approved"
                disabled={busy}
                className={styles.actionButton}
              >
                {COPY.programs.approve}
              </Button>
              <Button
                type="submit"
                name="action"
                value="Rejected"
                disabled={busy}
                className={styles.actionButton}
              >
                {COPY.programs.reject}
              </Button>
            </form>
          )}
          {!canManage &&
            request.member_user_id === currentUserId &&
            request.status === "Pending" && (
              <Button
                type="button"
                disabled={busy}
                className={styles.actionButton}
                onClick={() => onWithdraw(request.request_id)}
              >
                {COPY.programs.withdrawRequest}
              </Button>
            )}
        </li>
      ))
    )}
  </ul>
);

const EnrollmentList = ({
  enrollments,
  canManage,
  currentUserId,
  busy,
  onCancel,
}: {
  enrollments: Enrollment[] | null;
  canManage: boolean;
  currentUserId: string;
  busy: boolean;
  onCancel: (enrollmentId: string) => void;
}) => (
  <ul className={styles.eventList} aria-label={COPY.programs.enrollments}>
    {enrollments === null ? (
      <li className={styles.emptyLine} aria-live="polite">
        {COPY.nav.loading}
      </li>
    ) : enrollments.length === 0 ? (
      <li className={styles.emptyLine}>{COPY.programs.noEnrollments}</li>
    ) : (
      enrollments.map((enrollment) => (
        <li key={enrollment.enrollment_id} className={styles.eventRow}>
          <span className={styles.eventDate}>
            {enrollment.member_name ?? enrollment.member_user_id}
            {enrollment.member_username
              ? ` (${enrollment.member_username})`
              : ""}
          </span>
          <Badge
            className={
              enrollment.status === "Cancelled"
                ? styles.eventCancelled
                : styles.eventActive
            }
            variant={enrollment.status === "Cancelled" ? "outline" : "default"}
          >
            {ENROLLMENT_STATUS_LABEL[enrollment.status]}
          </Badge>
          {(canManage || enrollment.member_user_id === currentUserId) &&
            enrollment.status === "Active" && (
              <Button
                type="button"
                disabled={busy}
                className={styles.actionButton}
                onClick={() => onCancel(enrollment.enrollment_id)}
              >
                {COPY.programs.cancelEnrollment}
              </Button>
            )}
        </li>
      ))
    )}
  </ul>
);

export const EnrollmentPanel = ({
  program,
  canManage,
  currentUserId,
}: {
  program: Program;
  canManage: boolean;
  currentUserId: string;
}) => {
  const [requests, setRequests] = useState<EnrollmentRequest[] | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const load = useCallback(async () => {
    setRequests(null);
    setEnrollments(null);
    setActionError(null);
    try {
      const [requestsResp, enrollmentsResp] = await Promise.all([
        listEnrollmentRequests(program.program_id),
        listEnrollments(program.program_id),
      ]);
      if (!mounted.current) {
        return;
      }
      setRequests(requestsResp.requests);
      setEnrollments(enrollmentsResp.enrollments);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
      setRequests([]);
      setEnrollments([]);
    }
  }, [program.program_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, successCopy: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        if (!mounted.current) {
          return;
        }
        await load();
        if (!mounted.current) {
          return;
        }
        setNotice(successCopy);
        announce(successCopy);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setActionError(errorMessage(error));
        announce(errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [load]
  );

  const handleRequest = () => {
    void runAction(
      () => submitEnrollmentRequest(program.program_id),
      COPY.programs.requestSubmitted
    );
  };

  const handleWithdraw = (requestId: string) => {
    void runAction(
      () => withdrawEnrollmentRequest(program.program_id, requestId),
      COPY.programs.requestWithdrawnNotice
    );
  };

  const handleDecide =
    (requestId: string) => (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submitter = (event.nativeEvent as SubmitEvent).submitter as
        | HTMLButtonElement
        | undefined;
      const action = submitter?.value === "Rejected" ? "Rejected" : "Approved";
      const note = String(form.get("decision_note") ?? "").trim();
      void runAction(
        () =>
          decideEnrollmentRequest(program.program_id, requestId, action, note),
        COPY.programs.decisionMade
      );
    };

  const handleAssisted = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const memberUserId = String(form.get("member_user_id") ?? "").trim();
    if (!memberUserId) {
      return;
    }
    void runAction(
      () => assistedEnroll(program.program_id, memberUserId),
      COPY.programs.assistedSubmitted
    );
  };

  const handleCancel = (enrollmentId: string) => {
    void runAction(
      () => cancelEnrollment(program.program_id, enrollmentId),
      COPY.programs.enrollmentCancelledNotice
    );
  };

  const ownActive = (enrollments ?? []).some(
    (e) => e.member_user_id === currentUserId && e.status === "Active"
  );
  const ownPending = (requests ?? []).some(
    (r) => r.member_user_id === currentUserId && r.status === "Pending"
  );
  const showRequestButton =
    program.enrollment_mode === "MemberRequest" &&
    !canManage &&
    !ownActive &&
    !ownPending;

  return (
    <section
      className={styles.eventsPanel}
      aria-label={COPY.programs.enrollment}
    >
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {actionError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {actionError}
        </Alert>
      )}

      <h3 className={styles.panelHeading}>{COPY.programs.enrollment}</h3>

      {!canManage && program.enrollment_mode === "ManagerOnly" && (
        <p className={styles.emptyLine}>{COPY.programs.managerOnlyNote}</p>
      )}

      {!canManage && ownActive && (
        <p className={styles.emptyLine}>{COPY.programs.selfEnrollmentNote}</p>
      )}

      {showRequestButton && (
        <Button
          type="button"
          className={styles.actionButton}
          disabled={busy}
          onClick={handleRequest}
        >
          {busy ? COPY.programs.submitting : COPY.programs.requestEnroll}
        </Button>
      )}

      {canManage && program.enrollment_mode === "ManagerOnly" && (
        <form className={styles.ruleForm} onSubmit={handleAssisted}>
          <MemberPicker
            programId={program.program_id}
            name="member_user_id"
            label={COPY.programs.memberId}
            placeholder={COPY.programs.memberIdPlaceholder}
          />
          <Button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.assistedEnroll}
          </Button>
        </form>
      )}

      <RequestList
        requests={requests}
        canManage={canManage}
        currentUserId={currentUserId}
        busy={busy}
        onDecide={handleDecide}
        onWithdraw={handleWithdraw}
      />

      <EnrollmentList
        enrollments={enrollments}
        canManage={canManage}
        currentUserId={currentUserId}
        busy={busy}
        onCancel={handleCancel}
      />
    </section>
  );
};
