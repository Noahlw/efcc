"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  decideRegistration,
  fetchRegistrationDetail,
  RegistrationApiError,
  type Decision,
  type RegistrationDetail,
} from "@/lib/registration-client";
import { QUEUE_COPY, registrationErrorCopy } from "@/lib/registration-copy";

import { clearApprovalSelection } from "./approval-queue";
import styles from "./approval-detail.module.css";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; registration: RegistrationDetail }
  | { kind: "error"; message: string }
  | { kind: "forbidden" };

type DecisionBusy = Decision | null;

function statusCopy(status: RegistrationDetail["status"]): string {
  switch (status) {
    case "Active":
      return COPY.approvals.statusApproved;
    case "Rejected":
      return COPY.approvals.statusRejected;
    default:
      return COPY.approvals.statusPending;
  }
}

function statusClass(status: RegistrationDetail["status"]): string {
  switch (status) {
    case "Active":
      return styles.statusApproved;
    case "Rejected":
      return styles.statusRejected;
    default:
      return styles.statusPending;
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

function LegacyApprovalDetail({ requestId }: { requestId: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [busy, setBusy] = useState<DecisionBusy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setNoteError(false);
    try {
      const registration = await fetchRegistrationDetail(requestId);
      if (mounted.current) setState({ kind: "ready", registration });
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof RegistrationApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      setState({ kind: "error", message: errorCopy(error) });
    }
  }, [requestId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (state.kind === "ready") headingRef.current?.focus();
  }, [state.kind]);

  const handleDecision = async (decision: Decision) => {
    if (busy || state.kind !== "ready" || state.registration.status !== "Pending") {
      return;
    }

    const decisionNote = note.trim();
    if (decision === "reject" && !decisionNote) {
      setNoteError(true);
      announce(COPY.approvals.rejectionNoteRequired);
      return;
    }

    setBusy(decision);
    setNotice(null);
    setNoteError(false);
    try {
      await decideRegistration(
        requestId,
        decision,
        decision === "reject" ? decisionNote : undefined
      );
      if (!mounted.current) return;
      announce(COPY.approvals.decisionMade);
      setNotice(COPY.approvals.decisionMade);
      await load();
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof RegistrationApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      setNotice(errorCopy(error));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const backHref = "/management?module=approvals";

  if (state.kind === "forbidden") {
    return (
      <section className={styles.page} aria-labelledby="approval-detail-title">
        <h1 id="approval-detail-title" className={styles.title} tabIndex={-1}>
          {COPY.approvals.approvalDetailTitle}
        </h1>
        <p role="alert" className={styles.error}>
          {COPY.error.forbidden}
        </p>
        <Link href={backHref} className={styles.back}>
          {COPY.approvals.backToApprovals}
        </Link>
      </section>
    );
  }

  return (
    <section
      className={styles.page}
      aria-labelledby="approval-detail-title"
      aria-busy={state.kind === "loading" || busy !== null}
    >
      <header className={styles.header}>
        <Link href={backHref} className={styles.back}>
          {COPY.approvals.backToApprovals}
        </Link>
        <h1
          id="approval-detail-title"
          ref={headingRef}
          className={styles.title}
          tabIndex={-1}
        >
          {COPY.approvals.approvalDetailTitle}
        </h1>
      </header>

      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}

      {state.kind === "loading" && (
        <p role="status" aria-live="polite" className={styles.loading}>
          {COPY.approvals.loading}
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <div className={styles.card}>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.applicantName}</span>
              <span className={styles.value}>{state.registration.name}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.applicantContact}</span>
              <span className={styles.value}>
                <span>{state.registration.username}</span>
                {state.registration.phone && (
                  <span>{state.registration.phone}</span>
                )}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.status}</span>
              <span className={`${styles.status} ${statusClass(state.registration.status)}`}>
                {statusCopy(state.registration.status)}
              </span>
            </div>
            {state.registration.decisionNote && (
              <div className={styles.detailRow}>
                <span className={styles.label}>{COPY.approvals.decisionNote}</span>
                <span className={styles.value}>{state.registration.decisionNote}</span>
              </div>
            )}
          </div>

          {state.registration.status === "Pending" ? (
            <div className={styles.actions}>
              <div className={styles.noteField}>
                <label htmlFor="approval-decision-note" className={styles.label}>
                  {COPY.approvals.decisionNote}
                </label>
                <textarea
                  id="approval-decision-note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (event.target.value.trim()) setNoteError(false);
                  }}
                  className={styles.textarea}
                  aria-invalid={noteError}
                  aria-describedby={noteError ? "approval-note-error" : undefined}
                  placeholder={COPY.approvals.decisionNotePlaceholder}
                  required
                />
                {noteError && (
                  <p id="approval-note-error" className={styles.fieldError} role="alert">
                    {COPY.approvals.rejectionNoteRequired}
                  </p>
                )}
              </div>
              <div className={styles.actionButtons}>
                <button
                  type="button"
                  className={styles.approve}
                  disabled={busy !== null}
                  aria-busy={busy === "approve"}
                  onClick={() => void handleDecision("approve")}
                >
                  {busy === "approve" ? COPY.approvals.approving : COPY.approvals.approve}
                </button>
                <button
                  type="button"
                  className={styles.reject}
                  disabled={busy !== null}
                  aria-busy={busy === "reject"}
                  onClick={() => void handleDecision("reject")}
                >
                  {busy === "reject" ? COPY.approvals.rejecting : COPY.approvals.reject}
                </button>
              </div>
            </div>
          ) : (
            <p role="status" className={styles.readOnly}>
              {COPY.approvals.decisionMade}
            </p>
          )}
        </>
      )}
    </section>
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
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const returningToQueue = useRef(false);

  const closeConfirmation = useCallback(() => {
    setConfirmKind(null);
    setNote("");
    setNoteError(false);
    queueMicrotask(() => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    });
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const registration = await fetchRegistrationDetail(requestId);
      if (mounted.current) setState({ kind: "ready", registration });
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof RegistrationApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      setState({ kind: "error", message: errorCopy(error) });
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
      if (!returningToQueue.current) clearApprovalSelection();
    };
  }, [load]);

  useEffect(() => {
    if (state.kind === "ready") headingRef.current?.focus();
    if (state.kind === "error") errorRef.current?.focus();
    if (state.kind === "forbidden") headingRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmKind === null) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    if (confirmKind === "reject") {
      noteRef.current?.focus();
    } else {
      dialog.querySelector<HTMLButtonElement>("[data-confirm-dismiss]")?.focus();
    }
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeConfirmation();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [confirmKind]);

  const commitDecision = useCallback(
    async (decision: Decision, decisionNote?: string) => {
      if (busy || state.kind !== "ready" || state.registration.status !== "Pending") {
        return;
      }
      setBusy(decision);
      setNotice(null);
      try {
        await decideRegistration(requestId, decision, decisionNote);
        if (!mounted.current) return;
        announce(COPY.approvals.decisionMade);
        setNotice(COPY.approvals.decisionMade);
        await load();
      } catch (error) {
        if (!mounted.current) return;
        const message = errorCopy(error);
        setNotice(message);
        announce(message);
      } finally {
        if (mounted.current) setBusy(null);
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
    if (confirmKind === null) return;
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

  if (state.kind === "forbidden") {
    return (
      <section className={styles.page} aria-labelledby="approval-detail-title">
        <h1
          id="approval-detail-title"
          ref={headingRef}
          className={styles.title}
          tabIndex={-1}
        >
          {COPY.approvals.approvalDetailTitle}
        </h1>
        <p role="alert" className={styles.error} ref={errorRef} tabIndex={-1}>
          {COPY.error.forbidden}
        </p>
        <Link
          href={backHref}
          className={styles.back}
          onClick={() => {
            returningToQueue.current = true;
          }}
        >
          {COPY.approvals.backToApprovals}
        </Link>
      </section>
    );
  }

  return (
    <section
      className={styles.page}
      aria-labelledby="approval-detail-title"
      aria-busy={state.kind === "loading" || busy !== null}
    >
      <header className={styles.header}>
        <Link
          href={backHref}
          className={styles.back}
          onClick={() => {
            returningToQueue.current = true;
          }}
        >
          {COPY.approvals.backToApprovals}
        </Link>
        <h1
          id="approval-detail-title"
          ref={headingRef}
          className={styles.title}
          tabIndex={-1}
        >
          {COPY.approvals.approvalDetailTitle}
        </h1>
      </header>

      <p
        role="status"
        aria-live="polite"
        className={
          notice
            ? styles.notice
            : state.kind === "loading"
              ? styles.loading
              : styles.liveRegion
        }
      >
        {notice ?? (state.kind === "loading" ? COPY.approvals.loading : "")}
      </p>

      {state.kind === "error" && (
        <p
          role="alert"
          aria-live="assertive"
          className={styles.error}
          ref={errorRef}
          tabIndex={-1}
        >
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <div className={styles.card}>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.applicantName}</span>
              <span className={styles.value}>{state.registration.name}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>{COPY.approvals.applicantContact}</span>
              <span className={styles.value}>
                <span>{state.registration.username}</span>
                {state.registration.phone && <span>{state.registration.phone}</span>}
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
                <span className={styles.label}>{COPY.approvals.decisionNote}</span>
                <span className={styles.value}>{state.registration.decisionNote}</span>
              </div>
            )}
          </div>

          {state.registration.status === "Pending" ? (
            <div className={styles.actions} aria-label="申請處理操作">
              <p className={styles.actionHint}>
                請先核對申請人資料，確認後才會更新狀態。
              </p>
              <div className={styles.actionButtons}>
                <button
                  type="button"
                  className={styles.approve}
                  disabled={busy !== null}
                  aria-busy={busy === "approve"}
                  onClick={() => beginConfirmation("approve")}
                >
                  {COPY.approvals.approve}
                </button>
                <button
                  type="button"
                  className={styles.reject}
                  disabled={busy !== null}
                  aria-busy={busy === "reject"}
                  onClick={() => beginConfirmation("reject")}
                >
                  {COPY.approvals.reject}
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.readOnly}>
              <span>{COPY.approvals.decisionMade}</span>{" "}
              <span>{DETAIL_UI_COPY.readOnly}</span>
            </p>
          )}
        </>
      )}

      {confirmKind !== null && state.kind === "ready" && (
        <dialog
          ref={dialogRef}
          className={styles.confirmDialog}
          aria-modal="true"
          aria-labelledby="approval-detail-confirm-title"
          aria-describedby="approval-detail-confirm-body"
        >
          <div className={styles.confirmSurface}>
            <h2 id="approval-detail-confirm-title">
              {confirmKind === "approve"
                ? DETAIL_UI_COPY.confirmTitleApprove
                : DETAIL_UI_COPY.confirmTitleReject}
            </h2>
            <p id="approval-detail-confirm-body">
              {confirmKind === "approve"
                ? `${state.registration.name} · ${DETAIL_UI_COPY.confirmBodyApprove}`
                : `${state.registration.name} · ${DETAIL_UI_COPY.confirmBodyReject}`}
            </p>
            {confirmKind === "reject" && (
              <div className={styles.noteField}>
                <label htmlFor="approval-detail-note" className={styles.label}>
                  {COPY.approvals.decisionNote}
                </label>
                <textarea
                  ref={noteRef}
                  id="approval-detail-note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (event.target.value.trim()) setNoteError(false);
                  }}
                  className={styles.textarea}
                  aria-invalid={noteError}
                  aria-describedby={noteError ? "approval-detail-note-error" : undefined}
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
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                data-confirm-dismiss
                onClick={closeConfirmation}
              >
                {DETAIL_UI_COPY.confirmCancel}
              </button>
              <button
                type="button"
                className={
                  confirmKind === "approve" ? styles.approve : styles.reject
                }
                onClick={acceptConfirmation}
                disabled={busy !== null}
                aria-busy={busy !== null}
              >
                {confirmKind === "approve"
                  ? DETAIL_UI_COPY.confirmApprove
                  : DETAIL_UI_COPY.confirmReject}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
