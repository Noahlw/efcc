"use client";

// ponytail: minimal states for #143 (BOOTING→SIGNED_OUT→AUTHENTICATING→READY).
// Add RESTORING, RECOVERABLE_ERROR when #144 (reload restoration) or #146
// (error recovery) land.

import { useCallback, useEffect, useState } from "react";

import { loginUser, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { clearSession, loadSession, saveSession } from "@/lib/session";

function ProfileView({ bootstrap }: { bootstrap: Bootstrap }) {
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
    </main>
  );
}

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "AUTHENTICATING" }
  | { kind: "READY"; bootstrap: Bootstrap }
  | { kind: "ERROR"; error: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  // On mount, check for stored session (restoreApp will be implemented in #144).
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      // ponytail: restoreApp not yet called; #144 adds the restore RPC.
      // For now, any stored session just goes to READY.
      // The server will reject stale sessions on the first real RPC.
    }
  }, []);

  const handleLogin = useCallback(async () => {
    setView({ kind: "AUTHENTICATING" });
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

  if (view.kind === "READY") {
    return <ProfileView bootstrap={view.bootstrap} />;
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
