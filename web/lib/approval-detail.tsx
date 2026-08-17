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

export function ApprovalDetail({ requestId }: { requestId: string }) {
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
