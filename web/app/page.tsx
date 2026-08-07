"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { authLogin, authMe, authUpgrade, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY, LANDING, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { RecoveryView } from "@/lib/recovery-view";
import { REGISTRATION_COPY } from "@/lib/registration-copy";
import { firstSection } from "@/lib/sections";
import {
  buildBootstrap,
  clearAuthHint,
  hasAuthHint,
  restoreBootstrap,
  setAuthHint,
} from "@/lib/session";

import styles from "./page.module.css";

const DEEP_LINK_KEY = "efcc_deep_link";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";
const ACCOUNT_UPDATED_KEY = "efcc_account_updated";

/* Minimal civic system copy for the signed-out shell (Variant A, Issue #178). */
const SYSTEM_DESCRIPTION = "會友與教會同工的內部營運系統。";

/** Squar-cut seal mark (恩) — the brand's carved-stamp identity. */
function SealMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--seal)" />
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
      />
      <text
        x="16"
        y="22.6"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill="#fff"
        fontFamily="inherit"
      >
        恩
      </text>
    </svg>
  );
}

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "RESTORING" }
  | { kind: "AUTHENTICATING" }
  | { kind: "UPGRADE" }
  | { kind: "UPGRADING" }
  | { kind: "ERROR"; error: string }
  | { kind: "RECOVERABLE_ERROR"; error: string; retry: () => void };

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [legacyPin, setLegacyPin] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Flash notices carry different tones: errors (expiry, failed logout,
  // login failure) vs success (account updated) vs neutral instructions
  // (legacy-PIN upgrade gate). All keep role="alert" for announcement.
  const [noticeKind, setNoticeKind] = useState<
    "error" | "info" | "success"
  >("info");
  const mountRef = useRef(true);

  useEffect(
    () => () => {
      mountRef.current = false;
    },
    []
  );

  const handleExpiry = useCallback((message: string) => {
    clearAuthHint();
    announce(message);
    setNotice(message);
    setNoticeKind("error");
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
    if (hasAuthHint()) {
      // Only show the restoring state when a session may actually be stored;
      // cold boot (no hint) renders Login directly without a restore call.
      setView({ kind: "RESTORING" });
      announce(COPY.restore.loading);
    }
    try {
      const bootstrap = await restoreBootstrap();
      if (!mountRef.current) {
        return;
      }
      if (bootstrap === null) {
        // No stored session — cold boot straight to Login, no restore call.
        setView({ kind: "SIGNED_OUT" });
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
  }, [navigateAfterLogin, handleExpiry]);

  // On mount, restore any stored cookie session (silent, no re-entry).
  useEffect(() => {
    doRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doRestore/navigateAfterLogin are stable
  }, []);

  // On mount, surface any flash notice from a prior logout / expiry.
  useEffect(() => {
    if (sessionStorage.getItem("efcc_session_expired") === "1") {
      announce(COPY.restore.expired);
      setNotice(COPY.restore.expired);
      setNoticeKind("error");
      sessionStorage.removeItem("efcc_session_expired");
    }
    if (sessionStorage.getItem(LOGOUT_FAILED_KEY) === "1") {
      announce(COPY.logout.failedNotice);
      setNotice(COPY.logout.failedNotice);
      setNoticeKind("error");
      sessionStorage.removeItem(LOGOUT_FAILED_KEY);
    }
    if (sessionStorage.getItem(ACCOUNT_UPDATED_KEY) === "1") {
      announce(COPY.account.updatedNotice);
      setNotice(COPY.account.updatedNotice);
      setNoticeKind("success");
      sessionStorage.removeItem(ACCOUNT_UPDATED_KEY);
    }
  }, []);

  const handleLogin = useCallback(async () => {
    setView({ kind: "AUTHENTICATING" });
    announce(COPY.login.submitting);
    setNotice(null);
    try {
      const result = await authLogin(username, password);
      if (result.mustSetNewCredential) {
        // Legacy forced-upgrade gate (AUTH-01 #159 / ADR-0020 §4): identity
        // proven but NO session is issued until a new credential is set.
        // Preserve the verified legacy credential in a dedicated upgrade form;
        // the upgrade endpoint is the only path that can issue the session.
        setLegacyPin(password);
        setPassword("");
        setNewCredential("");
        setView({ kind: "UPGRADE" });
        setNotice(COPY.login.upgradeRequired);
        setNoticeKind("info");
        announce(COPY.login.upgradeRequired);
        return;
      }
      setAuthHint();
      // Login sets the cookies; /me resolves the full profile from the
      // access cookie to assemble the shell bootstrap.
      const me = await authMe();
      const bootstrap = buildBootstrap(me.user, me.sections);
      announce(COPY.login.success);
      navigateAfterLogin(bootstrap);
    } catch (error) {
      // A 401 AUTH_REQUIRED on the login action means invalid credentials —
      // a distinct message from the generic session-expired case.
      const isInvalidCredentials =
        error instanceof RpcError && error.problem.code === "AUTH_REQUIRED";
      const msg = isInvalidCredentials
        ? COPY.login.error
        : error instanceof RpcError
          ? errorCopyFor(error.problem.code)
          : COPY.login.networkError;
      setView({ kind: "ERROR", error: msg });
      announce(msg);
      clearAuthHint();
    }
  }, [username, password, navigateAfterLogin]);

  const finishUpgrade = useCallback(async () => {
    try {
      const me = await authMe();
      const bootstrap = buildBootstrap(me.user, me.sections);
      announce(COPY.login.success);
      navigateAfterLogin(bootstrap);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.login.networkError;
      setView({ kind: "RECOVERABLE_ERROR", error: msg, retry: finishUpgrade });
      announce(msg);
    }
  }, [navigateAfterLogin]);

  const handleUpgrade = useCallback(async () => {
    setView({ kind: "UPGRADING" });
    announce(COPY.login.upgrading);
    setNotice(null);
    try {
      await authUpgrade(username, legacyPin, newCredential);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.login.networkError;
      const ambiguous =
        error instanceof RpcError &&
        (error.problem.code === "NETWORK_ERROR" || error.problem.status === 0);
      if (!ambiguous) {
        // Definitive server problem: the upgrade did not commit. The gate
        // stays mounted so a retry may re-submit the same PIN.
        setView({ kind: "UPGRADE" });
        setNotice(msg);
        announce(msg);
        clearAuthHint();
        return;
      }
      // Ambiguous network failure: the request may have committed server-side
      // (legacy hash consumed, session cookies set) before the response was
      // lost. Probe the issued session before re-mounting the gate — a retry
      // of a consumed PIN would 409 and strand the user despite a valid
      // session (Spec 077 U5).
      try {
        const me = await authMe();
        const bootstrap = buildBootstrap(me.user, me.sections);
        setAuthHint();
        announce(COPY.login.success);
        navigateAfterLogin(bootstrap);
        return;
      } catch (probeError) {
        const noSession =
          probeError instanceof RpcError &&
          probeError.problem.code === "AUTH_REQUIRED";
        if (noSession) {
          // Definitive: the upgrade did not commit. Re-mount the gate.
          setView({ kind: "UPGRADE" });
          setNotice(msg);
          announce(msg);
          clearAuthHint();
          return;
        }
        // The probe itself failed transiently; the upgrade may still have
        // committed (consumed PIN, issued session). Keep a recoverable profile
        // retry — never re-mount the gate for a possibly-issued session (a
        // retry of a consumed PIN would 409).
        setAuthHint();
        await finishUpgrade();
        return;
      }
    }
    // The session is issued; only the profile fetch may still fail. The retry
    // must resolve the profile from the issued session — never re-submit the
    // upgrade, because the legacy credential is already consumed (a retry
    // would 409 against the consumed hash).
    setAuthHint();
    await finishUpgrade();
  }, [legacyPin, newCredential, username, finishUpgrade, navigateAfterLogin]);

  if (view.kind === "RESTORING") {
    return (
      <main className={styles.restoring}>
        <div className={styles.spinner} aria-hidden="true" />
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

  const upgradeMode = view.kind === "UPGRADE" || view.kind === "UPGRADING";
  const busy = view.kind === "AUTHENTICATING" || view.kind === "UPGRADING";

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#login">
        {LANDING.skipToLogin}
      </a>

      {/* Minimal civic shell — seal mark + official church title. */}
      <header className={styles.header}>
        <div className={styles.brand} aria-label={LANDING.homeLabel}>
          <SealMark />
          <span>{LANDING.brandFull}</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.bodyCenter}>
          <div className={styles.splitLogin}>
            <section
              id="login"
              className={styles.formCard}
              aria-labelledby="login-title"
            >
              <div className={styles.cardHead}>
                <span className={styles.cardSeal}>
                  <SealMark size={22} />
                </span>
                <h2 id="login-title" className={styles.cardTitle}>
                  {upgradeMode ? COPY.login.upgradeTitle : COPY.login.title}
                </h2>
              </div>
              <p className={styles.cardLead}>{LANDING.loginPanelLead}</p>
              {notice && (
                <p
                  role="alert"
                  className={`${styles.notice} ${
                    noticeKind === "error"
                      ? styles.noticeError
                      : noticeKind === "success"
                        ? styles.noticeSuccess
                        : ""
                  }`}
                >
                  {notice}
                </p>
              )}
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) {
                    if (upgradeMode) {
                      handleUpgrade();
                    } else {
                      handleLogin();
                    }
                  }
                }}
              >
                <label className={styles.field} htmlFor="login-username">
                  <span className={styles.fieldLabel}>
                    {COPY.login.usernameLabel}
                  </span>
                  <input
                    id="login-username"
                    className={styles.input}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={busy || upgradeMode}
                    autoComplete="username"
                    required
                  />
                </label>
                {upgradeMode ? (
                  <>
                    <label className={styles.field} htmlFor="upgrade-pin">
                      <span className={styles.fieldLabel}>
                        {COPY.login.legacyPasswordLabel}
                      </span>
                      <input
                        id="upgrade-pin"
                        className={styles.input}
                        type="password"
                        value={legacyPin}
                        onChange={(e) => setLegacyPin(e.target.value)}
                        disabled={busy}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <label className={styles.field} htmlFor="upgrade-password">
                      <span className={styles.fieldLabel}>
                        {COPY.login.newPasswordLabel}
                      </span>
                      <input
                        id="upgrade-password"
                        className={styles.input}
                        type="password"
                        value={newCredential}
                        onChange={(e) => setNewCredential(e.target.value)}
                        disabled={busy}
                        autoComplete="new-password"
                        required
                      />
                    </label>
                  </>
                ) : (
                  <label className={styles.field} htmlFor="login-password">
                    <span className={styles.fieldLabel}>
                      {COPY.login.passwordLabel}
                    </span>
                    <input
                      id="login-password"
                      className={styles.input}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                )}
                <button className={styles.submit} type="submit" disabled={busy}>
                  {busy
                    ? upgradeMode
                      ? COPY.login.upgrading
                      : COPY.login.submitting
                    : upgradeMode
                      ? COPY.login.upgradeSubmit
                      : COPY.login.submit}
                </button>
                <p className={styles.loginNote}>
                  {LANDING.loginAfterNote}{" "}
                  <a href="/register">{REGISTRATION_COPY.pageTitle}</a>
                </p>
              </form>
              {view.kind === "ERROR" && (
                <p
                  role="alert"
                  className={`${styles.notice} ${styles.noticeError}`}
                >
                  {view.error}
                </p>
              )}
            </section>

            <div className={styles.loginCopy}>
              <span className={styles.copySeal}>
                <SealMark size={44} />
              </span>
              <h1>{LANDING.brandFull}</h1>
              <p>{SYSTEM_DESCRIPTION}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
