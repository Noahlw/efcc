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
    setBusyId(item.requestId);
    setNotice(null);
    try {
      await decideRegistration(item.requestId, decision);
      if (!mounted.current) return;
      announce(QUEUE_COPY.done);
      setNotice(QUEUE_COPY.done);
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
        <p role="status" className={styles.notice}>
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
                          >
                            {busy ? QUEUE_COPY.approving : QUEUE_COPY.approve}
                          </button>
                          <button
                            type="button"
                            disabled={busy || busyId !== null}
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