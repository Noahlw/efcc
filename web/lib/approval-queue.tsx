"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  decideRegistration,
  fetchPendingRegistrations,
  type Decision,
  type PendingRegistration,
  RegistrationApiError,
} from "@/lib/registration-client";
import { QUEUE_COPY, registrationErrorCopy } from "@/lib/registration-copy";
import { announce } from "@/lib/live-region";
import { COPY } from "@/lib/copy";

import styles from "./approval-queue.module.css";

type QueueState =
  | { kind: "loading" }
  | { kind: "ready"; registrations: PendingRegistration[] }
  | { kind: "error"; message: string }
  | { kind: "forbidden" };

function formatSubmittedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-Hant", {
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

/**
 * Staff/Admin approval queue (AUTH-05 #163). Client-side protected surface:
 * lists Pending registration requests via GET /api/v1/auth/registrations and
 * resolves each via approve/reject. Unauthenticated (401) or non-Admin/Staff
 * (403) callers see the shared forbidden state; the guarded routes themselves
 * are enforced by the Worker's role check.
 */
export function ApprovalQueue() {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectNoteError, setRejectNoteError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setRejectingId(null);
    setRejectNote("");
    setRejectNoteError(false);
    try {
      const registrations = await fetchPendingRegistrations();
      if (!mounted.current) return;
      setState({ kind: "ready", registrations });
    } catch (err) {
      if (!mounted.current) return;
      if (
        err instanceof RegistrationApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      const message =
        err instanceof RegistrationApiError
          ? registrationErrorCopy(err.code)
          : QUEUE_COPY.networkError;
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const handleDecision = async (item: PendingRegistration, decision: Decision) => {
    if (busyId) return;
    if (decision === "reject") {
      if (rejectingId !== item.requestId) {
        setRejectingId(item.requestId);
        setRejectNote("");
        setRejectNoteError(false);
        setNotice(null);
        return;
      }
      if (!rejectNote.trim()) {
        setRejectNoteError(true);
        announce(COPY.approvals.rejectionNoteRequired);
        return;
      }
    } else if (rejectingId) {
      return;
    }

    setBusyId(item.requestId);
    setNotice(null);
    try {
      await decideRegistration(
        item.requestId,
        decision,
        decision === "reject" ? rejectNote.trim() : undefined
      );
      if (!mounted.current) return;
      announce(QUEUE_COPY.done);
      setNotice(QUEUE_COPY.done);
      setNoticeKind("success");
      await load();
    } catch (err) {
      if (!mounted.current) return;
      if (
        err instanceof RegistrationApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      const message =
        err instanceof RegistrationApiError
          ? registrationErrorCopy(err.code)
          : QUEUE_COPY.networkError;
      setNotice(message);
      setNoticeKind("error");
    } finally {
      if (mounted.current) {
        setBusyId(null);
        if (decision === "reject") {
          setRejectingId(null);
          setRejectNote("");
          setRejectNoteError(false);
        }
      }
    }
  };

  if (state.kind === "forbidden") {
    return (
      <div className={styles.forbiddenState}>
        <p role="alert">{COPY.error.forbidden}</p>
        <Link href="/profile" className={styles.back}>
          {COPY.nav.backToProfile}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.queueHeader}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{QUEUE_COPY.pageTitle}</h1>
          {state.kind === "ready" ? (
            <span role="status" className={styles.count}>
              {state.registrations.length} {QUEUE_COPY.pendingCount}
            </span>
          ) : (
            <p className={styles.lead}>{QUEUE_COPY.pageLead}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className={styles.refresh}
        >
          {QUEUE_COPY.refresh}
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className={`${styles.notice} ${
            noticeKind === "success"
              ? styles.noticeSuccess
              : styles.noticeError
          }`}
        >
          {notice}
        </p>
      )}

      {state.kind === "loading" && (
        <p className={styles.loading} role="status" aria-live="polite">
          {QUEUE_COPY.loading}
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}

      {state.kind === "ready" &&
        (state.registrations.length === 0 ? (
          <p role="status" className={styles.empty}>
            {QUEUE_COPY.empty}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>
                    {QUEUE_COPY.name}
                  </th>
                  <th scope="col" className={styles.th}>
                    {QUEUE_COPY.username}
                  </th>
                  <th scope="col" className={styles.th}>
                    {QUEUE_COPY.phone}
                  </th>
                  <th scope="col" className={styles.th}>
                    {QUEUE_COPY.submittedAt}
                  </th>
                  <th scope="col" className={styles.th}>
                    {QUEUE_COPY.role}
                  </th>
                  <th scope="col" className={styles.th}>
                    <span className="sr-only">{QUEUE_COPY.pageTitle}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.registrations.map((item) => {
                  const busy = busyId === item.requestId;
                  const rejecting = rejectingId === item.requestId;
                  const actionsDisabled =
                    busyId !== null || (rejectingId !== null && !rejecting);
                  return (
                    <tr key={item.requestId}>
                      <td className={styles.td}>
                        <Link
                          href={`/management?module=approvals&request=${encodeURIComponent(item.requestId)}`}
                          className={styles.detailLink}
                          aria-label={`${COPY.approvals.openDetail} ${item.name}`}
                        >
                          {item.name}
                        </Link>
                      </td>
                      <td className={styles.td}>{item.username}</td>
                      <td className={styles.td}>{item.phone ?? "—"}</td>
                      <td className={styles.td}>
                        {formatSubmittedAt(item.submittedAt)}
                      </td>
                      <td className={styles.td}>{item.role}</td>
                      <td className={styles.td}>
                        <div className={styles.actions}>
                          {rejecting && (
                            <div className={styles.rejectNote}>
                              <label
                                htmlFor={`approval-queue-reject-note-${item.requestId}`}
                              >
                                {COPY.approvals.decisionNote}
                              </label>
                              <textarea
                                id={`approval-queue-reject-note-${item.requestId}`}
                                value={rejectNote}
                                onChange={(event) => {
                                  setRejectNote(event.target.value);
                                  if (event.target.value.trim()) {
                                    setRejectNoteError(false);
                                  }
                                }}
                                placeholder={COPY.approvals.decisionNotePlaceholder}
                                aria-invalid={rejectNoteError}
                                aria-describedby={
                                  rejectNoteError
                                    ? `approval-queue-reject-note-error-${item.requestId}`
                                    : undefined
                                }
                              />
                              {rejectNoteError && (
                                <p
                                  id={`approval-queue-reject-note-error-${item.requestId}`}
                                  className={styles.rejectNoteError}
                                  role="alert"
                                >
                                  {COPY.approvals.rejectionNoteRequired}
                                </p>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            disabled={busy || actionsDisabled || rejectingId !== null}
                            onClick={() => void handleDecision(item, "approve")}
                            className={styles.approve}
                            aria-label={`${QUEUE_COPY.approve} ${item.role}`}
                          >
                            {busy ? QUEUE_COPY.approving : QUEUE_COPY.approve}
                          </button>
                          <button
                            type="button"
                            disabled={busy || actionsDisabled}
                            onClick={() => void handleDecision(item, "reject")}
                            className={styles.reject}
                          >
                            {busy ? QUEUE_COPY.rejecting : QUEUE_COPY.reject}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      <div className={styles.backWrap}>
        <Link href="/" className={styles.back}>
          {QUEUE_COPY.backToHome}
        </Link>
      </div>
    </div>
  );
}