"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loginUser, logoutUser, restoreApp, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { clearSession, loadSession, saveSession } from "@/lib/session";

function ProfileView({
  bootstrap,
  onLogout,
  loggingOut,
}: {
  bootstrap: Bootstrap;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const p = bootstrap.profile;
  return (
    <main
      style={{
        maxWidth: 600,
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "1.5rem" }}>{COPY.profile.title}</h1>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.75rem 1rem",
        }}
      >
        <dt>{COPY.profile.name}</dt>
        <dd>{p.name}</dd>
        <dt>{COPY.profile.username}</dt>
        <dd>{p.username}</dd>
        <dt>{COPY.profile.phone}</dt>
        <dd>{p.phone}</dd>
        <dt>{COPY.profile.role}</dt>
        <dd>{p.role}</dd>
        <dt>{COPY.profile.status}</dt>
        <dd>{p.status}</dd>
        <dt>{COPY.profile.qrCode}</dt>
        <dd
          style={{
            fontFamily: "monospace",
            fontSize: "0.8rem",
            wordBreak: "break-all",
          }}
        >
          {p.qrCodeString}
        </dd>
      </dl>
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        style={{ padding: "0.75rem", minHeight: 44, fontSize: "1rem" }}
      >
        {loggingOut ? COPY.login.submitting : COPY.logout.submit}
      </button>
    </main>
  );
}

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "RESTORING" }
  | { kind: "AUTHENTICATING" }
  | { kind: "READY"; bootstrap: Bootstrap }
  | { kind: "ERROR"; error: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Centralised expiry path: clear session, abort in-flight RPCs, return to Login. */
  const handleExpiry = useCallback((message: string) => {
    clearSession();
    abortRef.current?.abort();
    abortRef.current = null;
    setNotice(message);
    setView({ kind: "SIGNED_OUT" });
  }, []);

  // On mount, restore any stored session.
  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      clearSession();
      return;
    }

    setView({ kind: "RESTORING" });

    const controller = new AbortController();
    abortRef.current = controller;

    restoreApp(stored, { signal: controller.signal })
      .then((bootstrap) => {
        if (controller.signal.aborted) return;
        setView({ kind: "READY", bootstrap });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
          handleExpiry(COPY.restore.expired);
        } else {
          clearSession();
          setView({ kind: "SIGNED_OUT" });
        }
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleExpiry is stable; effect runs once on mount
  }, []);

  const handleLogout = useCallback(async () => {
    const stored = loadSession();
    if (!stored) {
      clearSession();
      setView({ kind: "SIGNED_OUT" });
      return;
    }

    setLoggingOut(true);

    let failed = false;
    try {
      await logoutUser(stored);
    } catch {
      failed = true;
    }

    clearSession();
    abortRef.current?.abort();
    abortRef.current = null;
    setLoggingOut(false);
    if (failed) {
      setNotice(COPY.logout.error);
    }
    setView({ kind: "SIGNED_OUT" });
  }, []);

  const handleLogin = useCallback(async () => {
    setView({ kind: "AUTHENTICATING" });
    setNotice(null);
    try {
      const bootstrap = await loginUser(username, pin);
      saveSession({
        userId: bootstrap.session.userId,
        sessionId: bootstrap.session.sessionId,
        sessionToken: bootstrap.session.sessionToken,
      });
      setView({ kind: "READY", bootstrap });
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? error.problem.detail || COPY.login.error
          : COPY.login.networkError;
      setView({ kind: "ERROR", error: msg });
      clearSession();
    }
  }, [username, pin]);

  if (view.kind === "RESTORING") {
    return (
      <main
        style={{
          maxWidth: 400,
          margin: "4rem auto",
          padding: "0 1rem",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        <p>{COPY.restore.loading}</p>
      </main>
    );
  }

  if (view.kind === "READY") {
    return (
      <ProfileView
        bootstrap={view.bootstrap}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />
    );
  }

  const busy = view.kind === "AUTHENTICATING";

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "1.5rem" }}>{COPY.login.title}</h1>
      {notice && (
        <p role="alert" style={{ color: "#b00020", marginBottom: "1rem" }}>
          {notice}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) {
            handleLogin();
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label>
          {COPY.login.usernameLabel}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "0.5rem",
            }}
            autoComplete="username"
          />
        </label>
        <label>
          {COPY.login.pinLabel}
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={busy}
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "0.5rem",
            }}
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "0.75rem", minHeight: 44, fontSize: "1rem" }}
        >
          {busy ? COPY.login.submitting : COPY.login.submit}
        </button>
      </form>
      {view.kind === "ERROR" && (
        <p role="alert" style={{ color: "#b00020", marginTop: "1rem" }}>
          {view.error}
        </p>
      )}
    </main>
  );
}