"use client";

/**
 * PROTOTYPE (issue #129 / #142) - THROWAWAY. Not the real app shell.
 *
 * Smoke-path UI exercising all four shell actions (login, restore,
 * logout, guarded navigation) through the Worker + interim dispatcher.
 * #142 AC10 requires this path to exist; the real shell lands under
 * CF0-02 (#143).
 *
 * Pointer: https://github.com/Noahlw/efcc/issues/129
 *           https://github.com/Noahlw/efcc/issues/142
 * Delete this route once the real login/shell work lands.
 */

import { useState } from "react";

import {
  authorizedNavigate,
  loginUser,
  logoutUser,
  restoreApp,
  RpcError,
} from "@/lib/api";
import type { Bootstrap, Session } from "@/lib/api";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "loggedIn"; bootstrap: Bootstrap; session: Session }
  | { kind: "restored"; bootstrap: Bootstrap; session: Session }
  | {
      kind: "loggedOut";
      message: string;
    }
  | {
      kind: "authorized";
      sectionKey: string;
      session: Session;
    }
  | {
      kind: "error";
      label: string;
      problem: { code?: string; detail?: string; status?: number };
    };

function toErrorState(err: unknown, label: string): ViewState {
  if (err instanceof RpcError) {
    return {
      kind: "error",
      label,
      problem: {
        code: err.problem.code,
        detail: err.problem.detail,
        status: err.problem.status,
      },
    };
  }
  return {
    kind: "error",
    label,
    problem: { detail: err instanceof Error ? err.message : String(err) },
  };
}

function renderState(state: ViewState) {
  switch (state.kind) {
    case "idle": {
      return <p>準備就緒。點擊「1. Login」開始。</p>;
    }
    case "loading": {
      return <p>{state.label}</p>;
    }
    case "loggedIn":
    case "restored": {
      return (
        <div>
          <p style={{ color: "green" }}>
            ✓ {state.kind === "loggedIn" ? "登入成功" : "工作階段還原成功"} -{" "}
            {state.bootstrap.profile.name} ({state.bootstrap.profile.role})
          </p>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              {
                sessionId: state.session.sessionId,
                sections: state.bootstrap.sections.map((s) => s.key),
              },
              null,
              2
            )}
          </pre>
        </div>
      );
    }
    case "loggedOut": {
      return <p style={{ color: "#666" }}>{state.message}</p>;
    }
    case "authorized": {
      return (
        <p style={{ color: "green" }}>
          ✓ authorizedNavigate({state.sectionKey}) succeeded - session
          authorized
        </p>
      );
    }
    case "error": {
      // Recoverable error: the shell stays mounted, state visible,
      // no blank document - the ADR-0018 Problem Details fields are
      // shown directly, proving the client parses them correctly.
      return (
        <div>
          <p style={{ color: "#b00020" }}>
            ✗ {state.label}失敗 (Recoverable - shell still mounted)
          </p>
          <dl style={{ fontSize: 13 }}>
            <dt>HTTP status</dt>
            <dd>{state.problem.status ?? "n/a"}</dd>
            <dt>code</dt>
            <dd>{state.problem.code ?? "n/a"}</dd>
            <dt>detail</dt>
            <dd>{state.problem.detail ?? "n/a"}</dd>
          </dl>
        </div>
      );
    }
    default: {
      return null;
    }
  }
}

export default function Prototype129Page() {
  const [state, setState] = useState<ViewState>({ kind: "idle" });
  // No default credentials - AGENTS.md: never hardcode credentials in UI.
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const isAuthenticated =
    state.kind === "loggedIn" || state.kind === "restored";

  async function handleLogin() {
    setState({ kind: "loading", label: "登入中…" });
    try {
      const bootstrap = await loginUser(username, pin);
      setState({ kind: "loggedIn", bootstrap, session: bootstrap.session });
    } catch (error) {
      setState(toErrorState(error, "登入"));
    }
  }

  async function handleRestore(session: Session) {
    setState({ kind: "loading", label: "還原工作階段中…" });
    try {
      const bootstrap = await restoreApp(session);
      setState({ kind: "restored", bootstrap, session: bootstrap.session });
    } catch (error) {
      setState(toErrorState(error, "還原工作階段"));
    }
  }

  async function handleRestoreWithGarbageToken() {
    // Proves the recoverable-error path deliberately, without needing
    // to wait for a real session to expire.
    setState({ kind: "loading", label: "還原工作階段中…" });
    try {
      const bootstrap = await restoreApp({
        userId: "GC-0000-0000",
        sessionId: "not-a-real-session",
        sessionToken: "not-a-real-token",
      });
      setState({ kind: "restored", bootstrap, session: bootstrap.session });
    } catch (error) {
      setState(toErrorState(error, "還原工作階段"));
    }
  }

  async function handleLogout(session: Session) {
    setState({ kind: "loading", label: "登出中…" });
    try {
      await logoutUser(session);
      setState({ kind: "loggedOut", message: "已登出。" });
    } catch (error) {
      setState(toErrorState(error, "登出"));
    }
  }

  async function handleAuthorizedNavigate(
    session: Session,
    sectionKey: string
  ) {
    setState({ kind: "loading", label: `授權檢查 (${sectionKey})…` });
    try {
      await authorizedNavigate(session, sectionKey);
      setState({ kind: "authorized", sectionKey, session });
    } catch (error) {
      setState(toErrorState(error, `授權檢查 (${sectionKey})`));
    }
  }

  return (
    <main
      style={{
        fontFamily: "sans-serif",
        maxWidth: 640,
        margin: "2rem auto",
        padding: "0 1rem",
      }}
    >
      <h1>
        {"Prototype #129 - Next.js shell -> Cloudflare proxy -> Apps Script"}
      </h1>
      <p style={{ color: "#666" }}>
        Throwaway. Proves the round trip only. Not the real login UI.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <label>
          Username{" "}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label style={{ marginLeft: "1rem" }}>
          PIN <input value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={handleLogin}
            disabled={state.kind === "loading"}
          >
            1. Login via proxy
          </button>{" "}
          <button
            type="button"
            onClick={() =>
              isAuthenticated ? handleRestore(state.session) : undefined
            }
            disabled={!isAuthenticated}
          >
            2. Restore with real session
          </button>{" "}
          <button
            type="button"
            onClick={handleRestoreWithGarbageToken}
            disabled={state.kind === "loading"}
          >
            3. Restore with garbage token (prove recoverable error)
          </button>
        </div>
        {isAuthenticated && (
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => handleLogout(state.session)}>
              4. Logout
            </button>{" "}
            <button
              type="button"
              onClick={() => handleAuthorizedNavigate(state.session, "scanner")}
            >
              5. Guarded nav (scanner)
            </button>
          </div>
        )}
      </section>

      <output
        style={{
          display: "block",
          marginTop: "1.5rem",
          padding: "1rem",
          border: "1px solid #ccc",
          borderRadius: 8,
          minHeight: 120,
        }}
        aria-live="polite"
      >
        {renderState(state)}
      </output>
    </main>
  );
}
