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

/* The four capacities the system actually ships (Spec 000 / Spec 074). */
const REGISTER_FEATURES = [
  { name: LANDING.featurePrograms, desc: LANDING.featureProgramsDesc },
  { name: LANDING.featureEvents, desc: LANDING.featureEventsDesc },
  { name: LANDING.featureScanner, desc: LANDING.featureScannerDesc },
  { name: LANDING.featureCare, desc: LANDING.featureCareDesc },
] as const;

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
        announce(COPY.login.upgradeRequired);
        return;
      }
      setAuthHint();
      // Login sets the cookies; /me resolves the full profile from the
      // access cookie to assemble the shell bootstrap.
      const user = await authMe();
      const bootstrap = buildBootstrap(user);
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
      const user = await authMe();
      const bootstrap = buildBootstrap(user);
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
      // The gate stays mounted: the legacy credential was NOT consumed, so a
      // retry may re-submit the same PIN.
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.login.networkError;
      setView({ kind: "UPGRADE" });
      setNotice(msg);
      announce(msg);
      clearAuthHint();
      return;
    }
    // The session is issued; only the profile fetch may still fail. The retry
    // must resolve the profile from the issued session — never re-submit the
    // upgrade, because the legacy credential is already consumed (a retry
    // would 409 against the consumed hash).
    setAuthHint();
    await finishUpgrade();
  }, [legacyPin, newCredential, username, finishUpgrade]);

  if (view.kind === "RESTORING") {
    return (
      <main className={styles.restoring}>
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

      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label={LANDING.homeLabel}>
          <SealMark />
          <span>
            {LANDING.brand}
            <span className={styles.brandSuffix}>{LANDING.brandSystem}</span>
          </span>
        </a>
        <nav className={styles.nav} aria-label={LANDING.navLabel}>
          <a className={styles.navLink} href="#features">
            {LANDING.featuresNav}
          </a>
          <a className={`${styles.navLink} ${styles.navCta}`} href="#login">
            {LANDING.loginNav}
          </a>
        </nav>
      </header>

      <main className={styles.main}>
        <section
          className={`${styles.section} ${styles.hero}`}
          aria-labelledby="hero-title"
        >
          <div className={styles.heroInner}>
            <h1 id="hero-title" className={styles.heroTitle}>
              {LANDING.heroTitle}
            </h1>
            <p className={styles.heroSub}>{LANDING.heroSub}</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryAction} href="#login">
                {LANDING.primaryCta}
              </a>
              <a className={styles.secondaryAction} href="#features">
                {LANDING.secondaryCta}
              </a>
            </div>
          </div>
        </section>

        <section
          id="features"
          className={styles.section}
          aria-labelledby="register-title"
        >
          <div className={styles.split}>
            <div className={styles.register}>
              <div className={styles.registerHead}>
                <h2 id="register-title" className={styles.registerTitle}>
                  {LANDING.registerTitle}
                </h2>
                <p className={styles.registerLead}>{LANDING.registerLead}</p>
              </div>
              <div className={styles.registerRows}>
                {REGISTER_FEATURES.map((feature) => (
                  <div className={styles.registerRow} key={feature.name}>
                    <span className={styles.rowMark} aria-hidden="true" />
                    <div>
                      <span className={styles.rowName}>{feature.name}</span>
                      <span className={styles.rowDesc}>{feature.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <section
              id="login"
              className={styles.loginPanel}
              aria-labelledby="login-title"
            >
              <div className={styles.loginTitleWrap}>
                <SealMark size={22} />
                <h2 id="login-title" className={styles.loginTitle}>
                  {upgradeMode ? COPY.login.upgradeTitle : COPY.login.title}
                </h2>
              </div>
              <p className={styles.loginLead}>{LANDING.loginPanelLead}</p>
              {notice && (
                <p role="alert" className={styles.notice}>
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
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {COPY.login.usernameLabel}
                  </span>
                  <input
                    className={styles.input}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={busy || upgradeMode}
                    autoComplete="username"
                  />
                </label>
                {upgradeMode ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {COPY.login.legacyPasswordLabel}
                      </span>
                      <input
                        className={styles.input}
                        type="password"
                        value={legacyPin}
                        onChange={(e) => setLegacyPin(e.target.value)}
                        disabled={busy}
                        autoComplete="current-password"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {COPY.login.newPasswordLabel}
                      </span>
                      <input
                        className={styles.input}
                        type="password"
                        value={newCredential}
                        onChange={(e) => setNewCredential(e.target.value)}
                        disabled={busy}
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                ) : (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.login.passwordLabel}
                    </span>
                    <input
                      className={styles.input}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      autoComplete="current-password"
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
                <p role="alert" className={styles.notice}>
                  {view.error}
                </p>
              )}
            </section>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerMotto}>{LANDING.footerMotto}</p>
          <p className={styles.footerNote}>{LANDING.footerNote}</p>
        </div>
      </footer>
    </div>
  );
}
