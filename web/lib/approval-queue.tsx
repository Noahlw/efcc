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

type QueueState =
  | { kind: "loading" }
  | { kind: "ready"; registrations: PendingRegistration[] }
  | { kind: "error"; message: string };

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.75rem 0.875rem",
  borderBottom: "1px solid var(--line, #d6dcde)",
  fontSize: "0.875rem",
  color: "var(--ink-muted)",
};
const tdStyle: React.CSSProperties = {
  padding: "0.875rem",
  borderBottom: "1px solid var(--line, #d6dcde)",
  fontSize: "0.9375rem",
  verticalAlign: "top",
};

function formatSubmittedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-Hant", { hour12: false });
}

/**
 * Teacher/Admin approval queue (AUTH-05 #163). Client-side protected surface:
 * lists Pending registration requests via GET /api/v1/auth/registrations and
 * resolves each via approve/reject. Unauthenticated (401) or non-Admin/Teacher
 * (403) callers see an error message; the guarded routes themselves are
 * enforced by the Worker's role check.
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
      const message =
        err instanceof RegistrationApiError
          ? registrationErrorCopy(err.code)
          : QUEUE_COPY.networkError;
      setNotice(message);
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 0.375rem",
              fontSize: "1.5rem",
              fontWeight: 900,
              color: "var(--ink)",
            }}
          >
            {QUEUE_COPY.pageTitle}
          </h1>
          {state.kind === "ready" ? (
            <span
              role="status"
            style={{
                display: "inline-block",
                marginTop: "0.25rem",
                padding: "0.25rem 0.6rem",
            borderRadius: 12,
                background: "var(--surface-raised)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontSize: "0.82rem",
            fontWeight: 700,
            }}
          >
              {state.registrations.length} {QUEUE_COPY.pendingCount}
            </span>
          ) : (
            <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--ink-muted)" }}>
            {QUEUE_COPY.pageLead}
          </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            minHeight: 44,
            padding: "0 1rem",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            background: "transparent",
            color: "var(--ink)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {QUEUE_COPY.refresh}
        </button>
      </div>

      {notice && (
        <p
          role="status"
          style={{
            margin: "0 0 1rem",
            padding: "0.75rem 0.875rem",
            borderRadius: 10,
            background: "rgba(156, 48, 44, 0.09)",
            color: "var(--accent-deep)",
            fontSize: "0.9375rem",
          }}
        >
          {notice}
        </p>
      )}

      {state.kind === "loading" && <p style={{ color: "var(--ink-muted)" }}>{QUEUE_COPY.loading}</p>}

      {state.kind === "error" && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "1rem",
            borderRadius: 12,
            background: "rgba(156, 48, 44, 0.09)",
            color: "var(--accent-deep)",
            fontSize: "0.9375rem",
            lineHeight: 1.6,
          }}
        >
          {state.message}
        </p>
      )}

      {state.kind === "ready" &&
        (state.registrations.length === 0 ? (
          <p role="status" style={{ color: "var(--ink-muted)" }}>{QUEUE_COPY.empty}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "var(--surface-raised)",
                border: "1px solid var(--line)",
                borderRadius: 12,
              }}
            >
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>
                    {QUEUE_COPY.name}
                  </th>
                  <th scope="col" style={thStyle}>
                    {QUEUE_COPY.username}
                  </th>
                  <th scope="col" style={thStyle}>
                    {QUEUE_COPY.phone}
                  </th>
                  <th scope="col" style={thStyle}>
                    {QUEUE_COPY.submittedAt}
                  </th>
                  <th scope="col" style={thStyle}>
                    {QUEUE_COPY.role}
                  </th>
                  <th scope="col" style={thStyle}>
                    <span className="sr-only">{QUEUE_COPY.pageTitle}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.registrations.map((item) => {
                  const busy = busyId === item.requestId;
                  return (
                    <tr key={item.requestId}>
                      <td style={tdStyle}>{item.name}</td>
                      <td style={tdStyle}>{item.username}</td>
                      <td style={tdStyle}>{item.phone ?? "—"}</td>
                      <td style={tdStyle}>{formatSubmittedAt(item.submittedAt)}</td>
                      <td style={tdStyle}>{item.role}</td>
                      <td style={tdStyle}>
                        <div className="stack-phone">
                        <button
                          type="button"
                          disabled={busy || busyId !== null}
                          onClick={() => void handleDecision(item, "approve")}
                          style={{
                            minHeight: 44,
                            padding: "0 1rem",
                            border: "none",
                            borderRadius: 8,
                            background: "#15803d",
                            color: "#fff",
                            fontSize: "0.875rem",
                            fontWeight: 700,
                            fontFamily: "inherit",
                            cursor: busyId !== null ? "default" : "pointer",
                            opacity: busyId !== null ? 0.6 : 1,
                          }}
                        >
                          {busy ? QUEUE_COPY.approving : QUEUE_COPY.approve}
                        </button>
                        <button
                          type="button"
                          disabled={busy || busyId !== null}
                          onClick={() => void handleDecision(item, "reject")}
                          style={{
                            minHeight: 44,
                            padding: "0 1rem",
                            border: "1px solid var(--line-strong)",
                            borderRadius: 8,
                            background: "transparent",
                            color: "var(--ink)",
                            fontSize: "0.875rem",
                            fontWeight: 700,
                            fontFamily: "inherit",
                            cursor: busyId !== null ? "default" : "pointer",
                            opacity: busyId !== null ? 0.6 : 1,
                          }}
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

      <div style={{ marginTop: "2rem" }}>
        <Link
          href="/"
          style={{ color: "var(--accent-deep)", fontWeight: 700, textDecoration: "underline" }}
        >
          {QUEUE_COPY.backToHome}
        </Link>
      </div>
    </div>
  );
}