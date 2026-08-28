"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActionSurface,
  ManagementPageHeader,
} from "@/app/management/management-action-framework";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { decideRegistration, fetchRegistrationDetail, RegistrationApiError } from '@/lib/registration-client';
import type { Decision, RegistrationDetail } from '@/lib/registration-client';
import { QUEUE_COPY, registrationErrorCopy } from "@/lib/registration-copy";

import { clearApprovalSelection } from "./approval-queue";

import styles from "./approval-detail.module.css";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; registration: RegistrationDetail }
  | { kind: "error"; message: string }
  | { kind: "forbidden" };

type DecisionBusy = Decision | null;
type NoticeKind = "success" | "error";

function statusCopy(status: RegistrationDetail["status"]): string {
  switch (status) {
    case "Active": {
      return COPY.approvals.statusApproved;
    }
    case "Rejected": {
      return COPY.approvals.statusRejected;
    }
    default: {
      return COPY.approvals.statusPending;
    }
  }
}

function statusClass(status: RegistrationDetail["status"]): string {
  switch (status) {
    case "Active": {
      return styles.statusApproved;
    }
    case "Rejected": {
      return styles.statusRejected;
    }
    default: {
      return styles.statusPending;
    }
  }
}

function errorCopy(error: unknown): string {
  if (error instanceof RegistrationApiError) {
    return registrationErrorCopy(error.code, error.message);
  }
  return QUEUE_COPY.networkError;
}

function detailRoleLabel(role: string): string {
  return (
    COPY.shell.roleLabels[role as keyof typeof COPY.shell.roleLabels] ?? role
  );
}

type ConfirmKind = Decision | null;

const DETAIL_UI_COPY = {
  confirmTitleApprove: "確認核准申請",
  confirmTitleReject: "確認拒絕申請",
  confirmBodyApprove: "核准後會建立 1 個 Active Account。",
  confirmBodyReject: "拒絕此申請後會保留處理紀錄。",
  confirmCancel: "取消",
  confirmApprove: "確認核准",
  confirmReject: "確認拒絕",
  submittedAt: "提交時間",
  readOnly: "此申請已處理，資料只供查看。",
} as const;

function detailFormatSubmittedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-Hant", {
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

// oxlint-disable-next-line eslint/complexity -- this component owns the detail, confirmation, and read-only states.
export function ApprovalDetail({ requestId }: { requestId: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [busy, setBusy] = useState<DecisionBusy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("success");
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const returningToQueue = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeConfirmation = useCallback(() => {
    setConfirmKind(null);
    setNote("");
    setNoteError(false);
    const target = previousFocusRef.current;
    if (target) {
      queueMicrotask(() => {
        target.focus();
        previousFocusRef.current = null;
      });
    }
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    announce(COPY.approvals.loading);
    try {
      const registration = await fetchRegistrationDetail(requestId);
      if (mounted.current) {setState({ kind: "ready", registration });}
    } catch (error) {
      if (!mounted.current) {return;}
      if (
        error instanceof RegistrationApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      const message = errorCopy(error);
      setState({ kind: "error", message });
      announce(message);
    }
  }, [requestId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const onPopState = () => {
      returningToQueue.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", onPopState);
      if (!returningToQueue.current) {clearApprovalSelection();}
    };
  }, [load]);

  useEffect(() => {
    if (state.kind === "ready") {headingRef.current?.focus();}
    if (state.kind === "error") {errorRef.current?.focus();}
    if (state.kind === "forbidden") {headingRef.current?.focus();}
  }, [state]);

  const commitDecision = useCallback(
    async (decision: Decision, decisionNote?: string) => {
      if (
        busy ||
        state.kind !== "ready" ||
        state.registration.status !== "Pending"
      ) {
        return;
      }
      setBusy(decision);
      setNotice(null);
      try {
        await decideRegistration(requestId, decision, decisionNote);
        if (!mounted.current) {return;}
        announce(COPY.approvals.decisionMade);
        setNotice(COPY.approvals.decisionMade);
        setNoticeKind("success");
        await load();
      } catch (error) {
        if (!mounted.current) {return;}
        if (
          error instanceof RegistrationApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          setState({ kind: "forbidden" });
          return;
        }
        const message = errorCopy(error);
        setNotice(message);
        setNoticeKind("error");
        announce(message);
      } finally {
        if (mounted.current) {setBusy(null);}
      }
    },
    [busy, load, requestId, state]
  );

  const beginConfirmation = (decision: Decision) => {
    if (
      busy ||
      state.kind !== "ready" ||
      state.registration.status !== "Pending"
    ) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setNotice(null);
    setNote("");
    setNoteError(false);
    setConfirmKind(decision);
  };

  const acceptConfirmation = () => {
    if (confirmKind === null) {return;}
    const decision = confirmKind;
    if (decision === "reject" && !note.trim()) {
      setNoteError(true);
      announce(COPY.approvals.rejectionNoteRequired);
      queueMicrotask(() => noteRef.current?.focus());
      return;
    }
    const decisionNote = decision === "reject" ? note.trim() : undefined;
    closeConfirmation();
    void commitDecision(decision, decisionNote);
  };

  const backHref = "/management?module=approvals";
  const actionSurfaceState =
    busy === null
      ? noticeKind === "error" && notice
        ? notice === QUEUE_COPY.conflict
          ? "conflict"
          : "failure"
        : "save"
      : "busy";

  if (state.kind === "forbidden") {
    return (
      <section className={styles.page} aria-labelledby="approval-detail-title">
        <ManagementPageHeader
          backHref={backHref}
          backLabel={COPY.approvals.backToApprovals}
          lead={COPY.approvals.approvalsLead}
          title={COPY.approvals.approvalDetailTitle}
          titleId="approval-detail-title"
          titleRef={headingRef}
          onBackClick={() => {
            returningToQueue.current = true;
          }}
        />
        <p role="alert" className={styles.error} ref={errorRef} tabIndex={-1}>
          {COPY.error.forbidden}
        </p>
      </section>
    );
  }

  return (
    <section
      className={styles.page}
      aria-labelledby="approval-detail-title"
      aria-busy={state.kind === "loading" || busy !== null}
    >
      <ManagementPageHeader
        backHref={backHref}
        backLabel={COPY.approvals.backToApprovals}
        lead={COPY.approvals.approvalsLead}
        title={COPY.approvals.approvalDetailTitle}
        titleId="approval-detail-title"
        titleRef={headingRef}
        onBackClick={() => {
          returningToQueue.current = true;
        }}
      />

      <p
        role={noticeKind === "error" && notice ? "alert" : "status"}
        aria-live={noticeKind === "error" && notice ? "assertive" : "polite"}
        className={
          notice
            ? noticeKind === "error"
              ? styles.noticeError
              : styles.notice
            : state.kind === "loading"
              ? styles.loading
              : styles.liveRegion
        }
      >
        {notice ?? (state.kind === "loading" ? COPY.approvals.loading : "")}
      </p>

      {state.kind === "error" && (
        <div className={styles.error}>
          <p role="alert" aria-live="assertive" ref={errorRef} tabIndex={-1}>
            {state.message}
          </p>
          <Button
            type="button"
            className={`${styles.retry} min-h-11`}
            onClick={() => void load()}
            size="lg"
            variant="outline"
          >
            重試連接
          </Button>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <div className={styles.card}>
            <div className={styles.detailRow}>
              <span className={styles.label}>
                {COPY.approvals.applicantName}
              </span>
              <span className={styles.value}>{state.registration.name}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>
                {COPY.approvals.applicantContact}
              </span>
              <span className={styles.value}>
                <span>{state.registration.username}</span>
                {state.registration.phone && (
                  <span>{state.registration.phone}</span>
                )}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>角色</span>
              <span className={styles.value}>
                {detailRoleLabel(state.registration.role)}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>{DETAIL_UI_COPY.submittedAt}</span>
              <span className={styles.value}>
                {detailFormatSubmittedAt(state.registration.submittedAt)}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.status}</span>
              <span
                className={`${styles.status} ${statusClass(state.registration.status)}`}
              >
                {statusCopy(state.registration.status)}
              </span>
            </div>
            {state.registration.decisionNote && (
              <div className={styles.detailRow}>
                <span className={styles.label}>
                  {COPY.approvals.decisionNote}
                </span>
                <span className={styles.value}>
                  {state.registration.decisionNote}
                </span>
              </div>
            )}
          </div>

          {state.registration.status === "Pending" ? (
            <AlertDialog
              open={confirmKind !== null}
              onOpenChange={(open) => {
                if (!open) {closeConfirmation();}
              }}
            >
              <ActionSurface
                busy={busy !== null}
                disabled={busy !== null}
                label="申請處理操作"
                state={actionSurfaceState}
              >
                <p className={styles.actionHint}>
                  請先核對申請人資料，確認後才會更新狀態。
                </p>
                <div className={styles.actionButtons}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      className={`${styles.actionButton} min-h-11`}
                      disabled={busy !== null}
                      aria-busy={busy === "approve"}
                      aria-haspopup="dialog"
                      onClick={() => beginConfirmation("approve")}
                      size="lg"
                      variant="default"
                    >
                      {busy === "approve"
                        ? COPY.approvals.approving
                        : COPY.approvals.approve}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      className={`${styles.actionButton} min-h-11`}
                      disabled={busy !== null}
                      aria-busy={busy === "reject"}
                      aria-haspopup="dialog"
                      onClick={() => beginConfirmation("reject")}
                      size="lg"
                      variant="destructive"
                    >
                      {busy === "reject"
                        ? COPY.approvals.rejecting
                        : COPY.approvals.reject}
                    </Button>
                  </AlertDialogTrigger>
                </div>
              </ActionSurface>
              <AlertDialogContent
                className={styles.confirmDialog}
                aria-labelledby="approval-detail-confirm-title"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const target = previousFocusRef.current;
                  queueMicrotask(() => target?.focus());
                }}
                aria-describedby="approval-detail-confirm-body"
                onOpenAutoFocus={(event) => {
                  if (confirmKind === "reject") {
                    event.preventDefault();
                    queueMicrotask(() => noteRef.current?.focus());
                  }
                }}
              >
                <div className={styles.confirmSurface}>
                  <AlertDialogTitle id="approval-detail-confirm-title">
                    {confirmKind === "approve"
                      ? DETAIL_UI_COPY.confirmTitleApprove
                      : DETAIL_UI_COPY.confirmTitleReject}
                  </AlertDialogTitle>
                  <AlertDialogDescription id="approval-detail-confirm-body">
                    {confirmKind === "approve"
                      ? `${state.registration.name} · ${DETAIL_UI_COPY.confirmBodyApprove}`
                      : `${state.registration.name} · ${DETAIL_UI_COPY.confirmBodyReject}`}
                  </AlertDialogDescription>
                  {confirmKind === "reject" && (
                    <div className={styles.noteField}>
                      <label
                        htmlFor="approval-detail-note"
                        className={styles.label}
                      >
                        {COPY.approvals.decisionNote}
                      </label>
                      <Textarea
                        ref={noteRef}
                        id="approval-detail-note"
                        value={note}
                        onChange={(event) => {
                          setNote(event.target.value);
                          setNoteError(false);
                        }}
                        className={styles.textarea}
                        aria-invalid={noteError}
                        aria-describedby={
                          noteError ? "approval-detail-note-error" : undefined
                        }
                        placeholder={COPY.approvals.decisionNotePlaceholder}
                        required
                      />
                      {noteError && (
                        <p
                          id="approval-detail-note-error"
                          className={styles.fieldError}
                          role="alert"
                        >
                          {COPY.approvals.rejectionNoteRequired}
                        </p>
                      )}
                    </div>
                  )}
                  <AlertDialogFooter className={styles.confirmActions}>
                    <AlertDialogCancel onClick={closeConfirmation}>
                      {DETAIL_UI_COPY.confirmCancel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(event) => {
                        if (confirmKind === "reject" && !note.trim()) {
                          event.preventDefault();
                        }
                        acceptConfirmation();
                      }}
                      disabled={busy !== null}
                      aria-busy={busy !== null}
                    >
                      {confirmKind === "approve"
                        ? DETAIL_UI_COPY.confirmApprove
                        : DETAIL_UI_COPY.confirmReject}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <p className={styles.readOnly}>
              <span>{COPY.approvals.decisionMade}</span>{" "}
              <span>{DETAIL_UI_COPY.readOnly}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
