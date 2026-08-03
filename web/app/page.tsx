"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { loginUser, restoreApp, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { firstSection } from "@/lib/sections";
import { clearSession, loadSession, saveSession } from "@/lib/session";

const DEEP_LINK_KEY = "efcc_deep_link";

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "RESTORING" }
  | { kind: "AUTHENTICATING" }
  | { kind: "ERROR"; error: string };

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleExpiry = useCallback((message: string) => {
    clearSession();
    abortRef.current?.abort();
    abortRef.current = null;
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

  // On mount, restore any stored session.
  useEffect(() => {
    let cancelled = false;
    const stored = loadSession();
    if (!stored) {
      clearSession();
      return;
    }

    setView({ kind: "RESTORING" });

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const bootstrap = await restoreApp(stored, {
          signal: controller.signal,
        });
        if (cancelled) {return;}
        navigateAfterLogin(bootstrap);
      } catch (error) {
        if (cancelled) {return;}
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          handleExpiry(COPY.restore.expired);
        } else {
          clearSession();
          setView({ kind: "SIGNED_OUT" });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleExpiry/navigateAfterLogin are stable
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
      navigateAfterLogin(bootstrap);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? error.problem.detail || COPY.login.error
          : COPY.login.networkError;
      setView({ kind: "ERROR", error: msg });
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
