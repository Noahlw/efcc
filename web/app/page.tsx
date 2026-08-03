"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { loginUser, restoreApp, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { RecoveryView } from "@/lib/recovery-view";
import { firstSection } from "@/lib/sections";
import { clearSession, loadSession, saveSession } from "@/lib/session";

const DEEP_LINK_KEY = "efcc_deep_link";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "RESTORING" }
  | { kind: "AUTHENTICATING" }
  | { kind: "ERROR"; error: string }
  | { kind: "RECOVERABLE_ERROR"; error: string; retry: () => void };

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountRef = useRef(true);

  useEffect(
    () => () => {
      mountRef.current = false;
    },
    []
  );

  const handleExpiry = useCallback((message: string) => {
    clearSession();
    abortRef.current?.abort();
    abortRef.current = null;
    announce(message);
    setNotice(message);
    setView({ kind: "SIGNED_OUT" });
  }, []);

  const navigateAfterLogin = useCallback(
    (bootstrap: Bootstrap) => {
      const deepLink = sessionStorage.getItem(DEEP_LINK_KEY);
      sessionStorage.removeItem(DEEP_LINK_KEY);
      router.replace(deepLink || `/${firstSection(bootstrap.sections)}`);
    },
    [router]
  );

  const doRestore = useCallback(async () => {
    const stored = loadSession();
    if (!stored) {
      clearSession();
      setView({ kind: "SIGNED_OUT" });
      return;
    }

    setView({ kind: "RESTORING" });
    announce(COPY.restore.loading);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const bootstrap = await restoreApp(stored, {
        signal: controller.signal,
      });
      if (!mountRef.current) {
        return;
      }
      announce(COPY.restore.restored);
      navigateAfterLogin(bootstrap);
    } catch (error) {
      if (!mountRef.current) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        handleExpiry(COPY.restore.expired);
      } else {
        const msg =
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.error.networkError;
        setView({ kind: "RECOVERABLE_ERROR", error: msg, retry: doRestore });
        announce(msg);
      }
    }

    abortRef.current = null;
  }, [navigateAfterLogin, handleExpiry]);

  // On mount, restore any stored session.
  useEffect(() => {
    doRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doRestore/navigateAfterLogin are stable
  }, []);

  // On mount, surface any flash notice from a prior logout (Task 4).
  useEffect(() => {
    if (sessionStorage.getItem("efcc_session_expired") === "1") {
      announce(COPY.restore.expired);
      setNotice(COPY.restore.expired);
      sessionStorage.removeItem("efcc_session_expired");
    }
    if (sessionStorage.getItem(LOGOUT_FAILED_KEY) === "1") {
      announce(COPY.logout.failedNotice);
      setNotice(COPY.logout.failedNotice);
      sessionStorage.removeItem(LOGOUT_FAILED_KEY);
    }
  }, []);

  const handleLogin = useCallback(async () => {
    setView({ kind: "AUTHENTICATING" });
    announce(COPY.login.submitting);
    setNotice(null);
    try {
      const bootstrap = await loginUser(username, pin);
      saveSession({
        userId: bootstrap.session.userId,
        sessionId: bootstrap.session.sessionId,
        sessionToken: bootstrap.session.sessionToken,
      });
      announce(COPY.login.success);
      navigateAfterLogin(bootstrap);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code)
          : COPY.login.networkError;
      setView({ kind: "ERROR", error: msg });
      announce(msg);
      clearSession();
    }
  }, [username, pin, navigateAfterLogin]);

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

  if (view.kind === "RECOVERABLE_ERROR") {
    const handleRetry = view.retry;
    return (
      <RecoveryView message={view.error} safeHref="/" onRetry={handleRetry} />
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
