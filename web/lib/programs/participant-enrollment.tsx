"use client";

import { cva } from "class-variance-authority";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import {
  cancelEnrollment,
  submitEnrollmentRequest,
  withdrawEnrollmentRequest,
} from "@/lib/programs/program-api";
import type {
  ParticipantEnrollmentAccess,
  ParticipantEnrollmentSnapshot,
  ParticipantEventSummary,
  ParticipantScheduleRule,
  ProgramSummary,
} from "@/lib/programs/program-api";
import { cn } from "@/lib/utils";

export interface ParticipantEnrollmentProps {
  program: ProgramSummary;
  enrollment: ParticipantEnrollmentSnapshot | null;
  enrollmentAccess: ParticipantEnrollmentAccess;
  scheduleRules: ParticipantScheduleRule[];
  events: ParticipantEventSummary[];
  showEventDetailAdvisory?: boolean;
  onRefresh: () => Promise<void>;
}

type ConfirmKind = "withdraw" | "cancel";
type RetryAction =
  | {
      kind: "request";
      idempotencyKey: string;
      previousRequestIds: readonly string[];
      uncertain?: boolean;
    }
  | {
      kind: "withdraw";
      requestId: string;
      idempotencyKey: string;
      uncertain?: boolean;
    }
  | {
      kind: "cancel";
      enrollmentId: string;
      idempotencyKey: string;
      uncertain?: boolean;
    }
  | { kind: "refresh"; successCopy: string };
type MutationRetryAction = Exclude<RetryAction, { kind: "refresh" }>;
function idempotencyKey(): string {
  return crypto.randomUUID();
}

const enrollmentPanelVariants = cva(
  "grid min-w-0 gap-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--ink)]"
);

const actionSurfaceVariants = cva(
  "mt-3 grid min-w-0 rounded-[1.125rem] bg-[var(--surface-raised)] p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]"
);

const enrollmentActionVariants = cva(
  "h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold",
  {
    variants: {
      tone: {
        primary: "",
        caution:
          "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)] hover:border-[var(--pending)] hover:bg-[var(--pending-surface)] hover:text-[var(--pending)]",
      },
    },
    defaultVariants: { tone: "primary" },
  }
);

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

function isAmbiguousMutationError(error: unknown): boolean {
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
function isDuplicateMutationError(error: unknown): boolean {
  if (!(error instanceof RpcError)) {
    return false;
  }
  return (
    error.problem.code === "CONFLICT" ||
    error.problem.code === "ENROLLMENT_DUPLICATE"
  );
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
  disabled: boolean;
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
  disabled,
  onRequest,
  onBeginConfirm,
}: EnrollmentActionProps) => {
  const copyClass =
    "m-0 min-w-0 wrap-anywhere text-sm leading-[1.6] text-[var(--ink-muted)]";
  if (program.lifecycle === "Archived") {
    return <p className={copyClass}>{COPY.programs.archivedNote}</p>;
  }
  if (enrollmentAccess === "Unavailable") {
    return (
      <p className={copyClass}>{COPY.programs.enrollmentUnavailableNote}</p>
    );
  }
  if (program.enrollment_mode === "ManagerOnly") {
    return <p className={copyClass}>{COPY.programs.managerOnlyNote}</p>;
  }
  if (program.lifecycle === "Draft") {
    return <p className={copyClass}>{COPY.programs.enrollmentDraftNote}</p>;
  }
  if (activeEnrollment) {
    return (
      <>
        <p className={copyClass}>{COPY.programs.enrollmentActive}</p>
        <p className={copyClass}>{COPY.programs.enrollmentActiveHint}</p>
        <div
          className={cn(actionSurfaceVariants())}
          data-enrollment-action-surface
        >
          <Button
            type="button"
            variant="outline"
            className={cn(enrollmentActionVariants({ tone: "caution" }))}
            disabled={disabled}
            onClick={() => onBeginConfirm("cancel")}
          >
            {busy ? COPY.programs.withdrawing : COPY.programs.cancelEnrollment}
          </Button>
        </div>
      </>
    );
  }
  if (pendingRequest) {
    return (
      <>
        <p className={copyClass}>{COPY.programs.requestPending}</p>
        <p className={copyClass}>{COPY.programs.requestPendingHint}</p>
        <div
          className={cn(actionSurfaceVariants())}
          data-enrollment-action-surface
        >
          <Button
            type="button"
            variant="outline"
            className={cn(enrollmentActionVariants({ tone: "caution" }))}
            disabled={disabled}
            onClick={() => onBeginConfirm("withdraw")}
          >
            {busy ? COPY.programs.withdrawing : COPY.programs.withdrawRequest}
          </Button>
        </div>
      </>
    );
  }
  if (enrollmentAccess === "Ineligible") {
    return (
      <p className={copyClass}>{COPY.programs.enrollmentIneligibleNote}</p>
    );
  }
  switch (latestRequest?.status) {
    case "Rejected": {
      return (
        <>
          <p className={copyClass}>{COPY.programs.requestRejected}</p>
          <p className={copyClass}>{COPY.programs.requestRejectedHint}</p>
          <div
            className={cn(actionSurfaceVariants())}
            data-enrollment-action-surface
          >
            <Button
              type="button"
              className={cn(enrollmentActionVariants({ tone: "primary" }))}
              disabled={disabled}
              onClick={onRequest}
            >
              {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
            </Button>
          </div>
        </>
      );
    }
    case "Withdrawn": {
      return (
        <>
          <p className={copyClass}>{COPY.programs.requestWithdrawn}</p>
          <p className={copyClass}>{COPY.programs.requestWithdrawnHint}</p>
          <div
            className={cn(actionSurfaceVariants())}
            data-enrollment-action-surface
          >
            <Button
              type="button"
              className={cn(enrollmentActionVariants({ tone: "primary" }))}
              disabled={disabled}
              onClick={onRequest}
            >
              {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
            </Button>
          </div>
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
        <p className={copyClass}>{COPY.programs.enrollmentCancelled}</p>
        <p className={copyClass}>{COPY.programs.enrollmentCancelledHint}</p>
        <div
          className={cn(actionSurfaceVariants())}
          data-enrollment-action-surface
        >
          <Button
            type="button"
            className={cn(enrollmentActionVariants({ tone: "primary" }))}
            disabled={disabled}
            onClick={onRequest}
          >
            {busy ? COPY.programs.submitting : COPY.programs.reEnroll}
          </Button>
        </div>
      </>
    );
  }
  if (latestRequest?.status === "Approved") {
    return (
      <p className={copyClass}>{COPY.programs.enrollmentUnavailableNote}</p>
    );
  }
  return (
    <div className={cn(actionSurfaceVariants())} data-enrollment-action-surface>
      <Button
        type="button"
        className={cn(enrollmentActionVariants({ tone: "primary" }))}
        disabled={disabled}
        onClick={onRequest}
      >
        {busy ? COPY.programs.submitting : COPY.programs.enroll}
      </Button>
    </div>
  );
};

export const ParticipantEnrollment = ({
  program,
  enrollment,
  enrollmentAccess,
  scheduleRules,
  events,
  showEventDetailAdvisory = false,
  onRefresh,
}: ParticipantEnrollmentProps) => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const mounted = useRef(true);
  const successCopyRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLOutputElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Focus errors are set while the acting button is disabled/mid-flight,
    // which drops keyboard focus to document.body once it re-enables --
    // move focus to the visible alert instead of leaving it stranded.
    if (actionError !== null) {
      errorRef.current?.focus();
    }
  }, [actionError]);

  const showOfflineError = useCallback(() => {
    const message = COPY.programs.enrollmentOfflineError;
    setActionError(message);
    setNotice(null);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmKind(null);
    queueMicrotask(() => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    });
  }, []);
  const runAction = useCallback(
    async (
      action: () => Promise<unknown>,
      successCopy: string,
      retry: MutationRetryAction
    ) => {
      if (busy) {
        return;
      }
      successCopyRef.current = successCopy;
      setRetryAction(retry);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        showOfflineError();
        return;
      }
      setBusy(true);
      setNotice(null);
      setActionError(null);
      try {
        try {
          await action();
        } catch (error) {
          if (!mounted.current) {
            return;
          }
          setActionError(errorMessage(error));
          if (
            error instanceof RpcError &&
            error.problem.code === "AUTH_REQUIRED"
          ) {
            try {
              await onRefresh();
            } catch {
              // Route-owned refresh handles the authentication handoff.
            }
            return;
          }
          const shouldReconcile =
            isAmbiguousMutationError(error) ||
            (retry.uncertain === true && isDuplicateMutationError(error));
          if (shouldReconcile) {
            setRetryAction({ ...retry, uncertain: true });
            try {
              await onRefresh();
            } catch {
              // Keep the mutation retryable when reconciliation also fails.
            }
          }
          return;
        }

        if (!mounted.current) {
          return;
        }
        // The mutation has committed. A failed reconciliation must retry the
        // read, never replay the write against an already-applied request.
        setRetryAction({ kind: "refresh", successCopy });
        try {
          await onRefresh();
        } catch (error) {
          if (!mounted.current) {
            return;
          }
          setActionError(errorMessage(error));
          return;
        }
        if (!mounted.current) {
          return;
        }
        setRetryAction(null);
        successCopyRef.current = null;
        setNotice(successCopy);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [busy, onRefresh, showOfflineError]
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
  useEffect(() => {
    if (!actionError || !retryAction || retryAction.kind === "refresh") {
      return;
    }
    const mutationSettled =
      retryAction.kind === "request"
        ? (enrollment?.requests.some(
            (request) =>
              !retryAction.previousRequestIds.includes(request.request_id) &&
              (request.status === "Pending" || request.status === "Approved")
          ) ?? false)
        : retryAction.kind === "withdraw"
          ? (enrollment?.requests.some(
              (request) =>
                request.request_id === retryAction.requestId &&
                request.status === "Withdrawn"
            ) ?? false)
          : (enrollment?.enrollments.some(
              (item) =>
                item.enrollment_id === retryAction.enrollmentId &&
                item.status === "Cancelled"
            ) ?? false);
    if (mutationSettled) {
      const successCopy = successCopyRef.current;
      successCopyRef.current = null;
      setActionError(null);
      setRetryAction(null);
      if (successCopy !== null) {
        setNotice(successCopy);
      }
    }
  }, [actionError, enrollment, latestRequest, pendingRequest, retryAction]);
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
    if (busy) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineRetry =
        kind === "withdraw" && pendingRequest
          ? {
              kind: "withdraw" as const,
              requestId: pendingRequest.request_id,
              idempotencyKey: idempotencyKey(),
            }
          : kind === "cancel" && activeEnrollment
            ? {
                kind: "cancel" as const,
                enrollmentId: activeEnrollment.enrollment_id,
                idempotencyKey: idempotencyKey(),
              }
            : null;
      setRetryAction(offlineRetry);
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
    const key = idempotencyKey();
    const previousRequestIds =
      enrollment?.requests.map(({ request_id }) => request_id) ?? [];
    void runAction(
      () => submitEnrollmentRequest(program.program_id, key),
      COPY.programs.requestSubmitted,
      { kind: "request", idempotencyKey: key, previousRequestIds }
    );
  };

  const acceptConfirmation = () => {
    const kind = confirmKind;
    const retry = retryAction;
    closeConfirm();
    if (kind === "withdraw" && pendingRequest) {
      const sameRetry =
        retry?.kind === "withdraw" &&
        retry.requestId === pendingRequest.request_id;
      const key = sameRetry ? retry.idempotencyKey : idempotencyKey();
      void runAction(
        () =>
          withdrawEnrollmentRequest(
            program.program_id,
            pendingRequest.request_id,
            key
          ),
        COPY.programs.requestWithdrawnNotice,
        {
          kind: "withdraw",
          requestId: pendingRequest.request_id,
          idempotencyKey: key,
          uncertain: sameRetry ? retry.uncertain : undefined,
        }
      );
    } else if (kind === "cancel" && activeEnrollment) {
      const sameRetry =
        retry?.kind === "cancel" &&
        retry.enrollmentId === activeEnrollment.enrollment_id;
      const key = sameRetry ? retry.idempotencyKey : idempotencyKey();
      void runAction(
        () =>
          cancelEnrollment(
            program.program_id,
            activeEnrollment.enrollment_id,
            key
          ),
        COPY.programs.enrollmentCancelledNotice,
        {
          kind: "cancel",
          enrollmentId: activeEnrollment.enrollment_id,
          idempotencyKey: key,
          uncertain: sameRetry ? retry.uncertain : undefined,
        }
      );
    } else if (kind !== null) {
      // Server state changed while the confirm dialog was open (e.g. the
      // request/enrollment this confirm targeted no longer exists) --
      // reconcile the UI instead of silently no-opping.
      void onRefresh().catch((error: unknown) => {
        if (mounted.current) {
          setActionError(errorMessage(error));
        }
      });
    }
  };

  const retryLastAction = () => {
    const retry = retryAction;
    if (!retry) {
      return;
    }
    if (retry.kind === "refresh") {
      if (busy) {
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        showOfflineError();
        return;
      }
      setBusy(true);
      setNotice(null);
      setActionError(null);
      void (async () => {
        try {
          await onRefresh();
          if (!mounted.current) {
            return;
          }
          setRetryAction(null);
          setNotice(retry.successCopy);
        } catch (error) {
          if (mounted.current) {
            setActionError(errorMessage(error));
          }
        } finally {
          if (mounted.current) {
            setBusy(false);
          }
        }
      })();
      return;
    }
    if (retry.kind === "request") {
      void runAction(
        () => submitEnrollmentRequest(program.program_id, retry.idempotencyKey),
        COPY.programs.requestSubmitted,
        retry
      );
      return;
    }
    if (
      (retry.kind === "withdraw" || retry.kind === "cancel") &&
      typeof navigator !== "undefined" &&
      !navigator.onLine
    ) {
      showOfflineError();
      return;
    }
    if (retry.kind === "withdraw" || retry.kind === "cancel") {
      beginConfirm(retry.kind);
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
  const actionDisabled = busy || (actionError !== null && retryAction !== null);
  return (
    <section
      className={cn(enrollmentPanelVariants())}
      aria-labelledby="program-enrollment-title"
      aria-busy={busy}
      data-enrollment-panel
    >
      {notice !== null && (
        <output
          className="min-w-0 wrap-anywhere text-sm font-semibold text-[var(--success)]"
          role="status"
          data-enrollment-notice
        >
          {notice}
        </output>
      )}
      {actionError !== null && (
        <Alert
          className="grid min-w-0 gap-2 border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
          variant="destructive"
        >
          <output
            ref={errorRef}
            tabIndex={-1}
            className="min-w-0 wrap-anywhere leading-[1.5]"
          >
            {actionError}
          </output>
          {retryAction && (
            <Button
              className="h-auto min-h-11 w-full whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:w-fit"
              variant="outline"
              type="button"
              data-enrollment-retry
              onClick={retryLastAction}
            >
              {COPY.error.retry}
            </Button>
          )}
        </Alert>
      )}
      <h3
        id="program-enrollment-title"
        className="m-0 wrap-anywhere text-sm font-bold tracking-[0.04em] text-[var(--ink-muted)]"
      >
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
        disabled={actionDisabled}
        onRequest={handleRequest}
        onBeginConfirm={beginConfirm}
      />

      {showScheduleAdvisory && (
        <p className="m-0 min-w-0 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
          {COPY.programs.enrollmentScheduleAdvisory}
        </p>
      )}

      {showEventDetailAdvisory && canRequest && (
        <p className="m-0 min-w-0 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
          {COPY.programs.enrollmentEventDetailAdvisory}
        </p>
      )}

      <AlertDialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeConfirm();
          }
        }}
      >
        <AlertDialogContent
          className="min-w-0 max-w-[32rem] border-[var(--line-strong)] bg-[var(--surface-raised)] p-5"
          data-confirm-dialog
          aria-labelledby="participant-confirm-title"
          aria-describedby="participant-confirm-body"
        >
          <AlertDialogHeader className="min-w-0 gap-2">
            <AlertDialogTitle
              className="min-w-0 wrap-anywhere text-lg font-extrabold text-[var(--ink)]"
              id="participant-confirm-title"
            >
              {confirmationTitle}
            </AlertDialogTitle>
            <AlertDialogDescription
              className="min-w-0 wrap-anywhere text-sm leading-[1.6] text-[var(--ink-muted)]"
              id="participant-confirm-body"
            >
              {confirmationBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex min-w-0 flex-wrap gap-2 max-[799px]:flex-col-reverse [&>*]:h-auto [&>*]:min-h-11 [&>*]:w-full [&>*]:whitespace-normal sm:[&>*]:w-fit">
            <AlertDialogCancel
              className="min-h-[44px] min-w-[44px] px-4 py-3 text-base font-bold"
              data-confirm-dismiss
              onClick={closeConfirm}
            >
              {COPY.programs.cancelRevoke}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className={cn(
                enrollmentActionVariants({ tone: "caution" }),
                "min-h-[44px] px-4 py-3"
              )}
              data-confirm-action
              data-tone="caution"
              onClick={acceptConfirmation}
            >
              {confirmationAccept}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
