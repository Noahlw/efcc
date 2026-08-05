"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { loginUser, restoreApp, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY, LANDING, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { RecoveryView } from "@/lib/recovery-view";
import { firstSection } from "@/lib/sections";
import { clearSession, loadSession, saveSession } from "@/lib/session";

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
      role="img"
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
      <main className={styles.restoring}>
        <p>{COPY.restore.loading}</p>
      </main>
    );
  }

  if (view.kind === "RECOVERABLE_ERROR") {
    const handleRetry = view.retry;
    return <RecoveryView message={view.error} safeHref="/" onRetry={handleRetry} />;
  }

  const busy = view.kind === "AUTHENTICATING";

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
        <section className={`${styles.section} ${styles.hero}`} aria-labelledby="hero-title">
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

        <section id="features" className={styles.section} aria-labelledby="register-title">
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

            <section id="login" className={styles.loginPanel} aria-labelledby="login-title">
              <div className={styles.loginTitleWrap}>
                <SealMark size={22} />
                <h2 id="login-title" className={styles.loginTitle}>
                  {COPY.login.title}
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
                    handleLogin();
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
                    disabled={busy}
                    autoComplete="username"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {COPY.login.pinLabel}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    disabled={busy}
                    autoComplete="current-password"
                  />
                </label>
                <button className={styles.submit} type="submit" disabled={busy}>
                  {busy ? COPY.login.submitting : COPY.login.submit}
                </button>
                <p className={styles.loginNote}>{LANDING.loginAfterNote}</p>
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