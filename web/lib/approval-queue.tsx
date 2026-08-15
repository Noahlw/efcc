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
 * lists Pending registration requests via GET /api/v1/auth/registrations,
 * exposes a safe detail view, and resolves approvals or note-backed
 * rejections. Unauthenticated (401) or non-Admin/Staff (403) callers see the
 * shared forbidden state; the guarded routes themselves are enforced by the
 * Worker's role check.
 */
export function ApprovalQueue() {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
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
          ? registrationErrorCopy(err.code, err.message)
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

  const selectedRegistration =
    state.kind === "ready"
      ? state.registrations.find((item) => item.requestId === selectedId) ??
        null
      : null;

  const openDetails = (item: PendingRegistration) => {
    if (selectedId !== item.requestId) {
      setRejectionNote("");
    }
    setSelectedId(item.requestId);
    setValidationError(null);
    setNotice(null);
  };

  const closeDetails = () => {
    setSelectedId(null);
    setValidationError(null);
  };

  const handleDecision = async (
    item: PendingRegistration,
    decision: Decision,
    rawNote = rejectionNote
  ) => {
    if (busyId) return;
    const note = rawNote.trim();
    if (decision === "reject" && !note) {
      setSelectedId(item.requestId);
      setValidationError(QUEUE_COPY.rejectionNoteRequired);
      return;
    }
    setBusyId(item.requestId);
    setNotice(null);
    setValidationError(null);
    try {
      await decideRegistration(
        item.requestId,
        decision,
        decision === "reject" ? note : undefined
      );
      if (!mounted.current) return;
      announce(QUEUE_COPY.done);
      setNotice(QUEUE_COPY.done);
      setNoticeKind("success");
      setSelectedId(null);
      setRejectionNote("");
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
          ? registrationErrorCopy(err.code, err.message)
          : QUEUE_COPY.networkError;
      setNotice(message);
      setNoticeKind("error");
    } finally {
      if (mounted.current) setBusyId(null);
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
                  return (
                    <tr key={item.requestId}>
                      <td className={styles.td}>{item.name}</td>
                      <td className={styles.td}>{item.username}</td>
                      <td className={styles.td}>{item.phone ?? "—"}</td>
                      <td className={styles.td}>
                        {formatSubmittedAt(item.submittedAt)}
                      </td>
                      <td className={styles.td}>{item.role}</td>
                      <td className={styles.td}>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            disabled={busy || busyId !== null}
                            onClick={() => void handleDecision(item, "approve")}
                            className={styles.approve}
                            aria-label={`${QUEUE_COPY.approve} ${item.role}`}
                          >
                            {busy ? QUEUE_COPY.approving : QUEUE_COPY.approve}
                          </button>
                          <button
                            type="button"
                            disabled={busy || busyId !== null}
                            onClick={() => openDetails(item)}
                            className={styles.secondary}
                            aria-label={`${QUEUE_COPY.details} ${item.name}`}
                          >
                            {QUEUE_COPY.details}
                          </button>
                          <button
                            type="button"
                            disabled={busy || busyId !== null}
                            onClick={() => openDetails(item)}
                            className={styles.reject}
                          >
                            {QUEUE_COPY.reject}
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

      {selectedRegistration && (
        <section
          className={styles.details}
          aria-labelledby="registration-details-title"
        >
          <h2 id="registration-details-title" className={styles.detailsTitle}>
            {QUEUE_COPY.detailsTitle}
          </h2>
          <dl className={styles.detailsList}>
            <div>
              <dt>{QUEUE_COPY.name}</dt>
              <dd>{selectedRegistration.name}</dd>
            </div>
            <div>
              <dt>{QUEUE_COPY.username}</dt>
              <dd>{selectedRegistration.username}</dd>
            </div>
            <div>
              <dt>{QUEUE_COPY.phone}</dt>
              <dd>{selectedRegistration.phone ?? "—"}</dd>
            </div>
            <div>
              <dt>{QUEUE_COPY.role}</dt>
              <dd>{selectedRegistration.role}</dd>
            </div>
            <div>
              <dt>{QUEUE_COPY.accountStatus}</dt>
              <dd>{selectedRegistration.accountStatus || QUEUE_COPY.pending}</dd>
            </div>
          </dl>
          <form
            className={styles.rejectionForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleDecision(selectedRegistration, "reject");
            }}
          >
            <label
              className={styles.rejectionLabel}
              htmlFor={`registration-rejection-note-${selectedRegistration.requestId}`}
            >
              {QUEUE_COPY.rejectionNoteLabel}
            </label>
            <textarea
              id={`registration-rejection-note-${selectedRegistration.requestId}`}
              className={styles.rejectionInput}
              value={rejectionNote}
              onChange={(event) => {
                setRejectionNote(event.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder={QUEUE_COPY.rejectionNotePlaceholder}
              aria-invalid={validationError ? "true" : undefined}
              aria-describedby={
                validationError
                  ? "registration-rejection-note-error"
                  : undefined
              }
              rows={4}
              autoFocus
            />
            {validationError && (
              <p
                id="registration-rejection-note-error"
                className={styles.validationError}
                role="alert"
              >
                {validationError}
              </p>
            )}
            <div className={styles.detailActions}>
              <button
                type="button"
                className={styles.approve}
                disabled={busyId !== null}
                onClick={() =>
                  void handleDecision(selectedRegistration, "approve")
                }
              >
                {busyId === selectedRegistration.requestId
                  ? QUEUE_COPY.approving
                  : QUEUE_COPY.approve}
              </button>
              <button
                type="submit"
                className={styles.reject}
                disabled={busyId !== null}
              >
                {busyId === selectedRegistration.requestId
                  ? QUEUE_COPY.rejecting
                  : QUEUE_COPY.confirmReject}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busyId !== null}
                onClick={closeDetails}
              >
                {QUEUE_COPY.cancelReject}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className={styles.backWrap}>
        <Link href="/" className={styles.back}>
          {QUEUE_COPY.backToHome}
        </Link>
      </div>
    </div>
  );
}