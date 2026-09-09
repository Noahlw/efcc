"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  authLogin,
  authLogout,
  authMe,
  authUpgrade,
  RpcError,
} from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { COPY, LANDING, errorCopyFor } from "@/lib/copy";
import {
  clearGuestCredential,
  readGuestCredential,
  scannerEntryPath,
} from "@/lib/guest-context";
import { announce } from "@/lib/live-region";
import { RecoveryView } from "@/lib/recovery-view";
import { REGISTRATION_COPY } from "@/lib/registration-copy";
import { firstSection } from "@/lib/sections";
import {
  buildBootstrap,
  clearAuthHint,
  consumeDeepLink,
  hasAuthHint,
  restoreBootstrap,
  setAuthHint,
} from "@/lib/session";

type View =
  | { kind: "SIGNED_OUT" }
  | { kind: "RESTORING" }
  | { kind: "AUTHENTICATING" }
  | { kind: "UPGRADE" }
  | { kind: "UPGRADING" }
  | { kind: "SESSION_EXPIRED" }
  | { kind: "ERROR"; error: string }
  | { kind: "RECOVERABLE_ERROR"; error: string; retry: () => void };

type LoginField =
  | "username"
  | "password"
  | "legacyPin"
  | "newCredential"
  | "confirmCredential";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";
const ACCOUNT_UPDATED_KEY = "efcc_account_updated";
function matchesUsername(actual: string, expected: string): boolean {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

const LoginPage = () => {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [legacyPin, setLegacyPin] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [confirmCredential, setConfirmCredential] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Flash notices carry different tones: errors (failed logout) vs success
  // (account updated) vs neutral instructions (legacy-PIN upgrade gate).
  // Session expiry is its own dedicated screen (SESSION_EXPIRED), not a
  // flash notice on this form. All keep role="alert" for announcement.
  const [noticeKind, setNoticeKind] = useState<"error" | "info" | "success">(
    "info"
  );
  const [invalidFields, setInvalidFields] = useState<LoginField[]>([]);
  const mountRef = useRef(true);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const legacyPinRef = useRef<HTMLInputElement>(null);
  const newCredentialRef = useRef<HTMLInputElement>(null);
  const confirmCredentialRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const sessionExpiredHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      mountRef.current = false;
    },
    []
  );
  useEffect(() => {
    if (view.kind === "ERROR" && invalidFields.length === 0) {
      errorRef.current?.focus();
    }
  }, [view, invalidFields.length]);
  useEffect(() => {
    if (
      view.kind === "UPGRADE" &&
      noticeKind === "error" &&
      notice &&
      invalidFields.length === 0
    ) {
      noticeRef.current?.focus();
    }
  }, [view, notice, noticeKind, invalidFields.length]);
  useEffect(() => {
    if (view.kind === "SESSION_EXPIRED") {
      sessionExpiredHeadingRef.current?.focus();
    }
  }, [view.kind]);

  const handleExpiry = useCallback(() => {
    clearAuthHint();
    announce(COPY.sessionExpired.title);
    setInvalidFields([]);
    setView({ kind: "SESSION_EXPIRED" });
  }, []);

  const navigateAfterLogin = useCallback(
    (bootstrap: Bootstrap) => {
      const guestCredential = readGuestCredential();
      if (guestCredential) {
        clearGuestCredential();
        router.replace(scannerEntryPath(guestCredential));
        return;
      }
      const deepLink = consumeDeepLink();
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
        handleExpiry();
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

  // On mount: a prior mid-use AUTH_REQUIRED (app-shell.tsx / a boundary
  // component) already cleared the auth hint, remembered the deep link, and
  // set this flag before redirecting here — show the dedicated expiry
  // screen directly and skip the restore attempt entirely (the session is
  // definitively dead; re-probing it would only delay the same outcome).
  useEffect(() => {
    if (sessionStorage.getItem("efcc_session_expired") === "1") {
      sessionStorage.removeItem("efcc_session_expired");
      handleExpiry();
      return;
    }
    doRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doRestore/handleExpiry are stable
  }, []);

  // On mount, surface any flash notice unrelated to session expiry.
  useEffect(() => {
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
    const missingUsername = !username.trim();
    const missingPassword = password.length === 0;
    if (missingUsername || missingPassword) {
      const nextInvalidFields: LoginField[] = [];
      if (missingUsername) {
        nextInvalidFields.push("username");
      }
      if (missingPassword) {
        nextInvalidFields.push("password");
      }
      setInvalidFields(nextInvalidFields);
      setView({ kind: "ERROR", error: COPY.login.missingFields });
      announce(COPY.login.missingFields);
      if (missingUsername) {
        usernameRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }
    setInvalidFields([]);
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
      const bootstrap = buildBootstrap(me.user, me.sections, me.navigation);
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
      setInvalidFields([]);
      setView({ kind: "ERROR", error: msg });
      announce(msg);
      clearAuthHint();
    }
  }, [username, password, navigateAfterLogin]);
  const finishUpgrade = useCallback(async () => {
    try {
      const me = await authMe();
      if (!matchesUsername(me.user.username, username)) {
        try {
          await authLogout();
        } catch {
          // A stale session is not evidence that the upgrade committed.
        }
        clearAuthHint();
        const msg = COPY.login.upgradeNetworkError;
        setInvalidFields([]);
        setNoticeKind("error");
        setNotice(msg);
        setView({ kind: "SIGNED_OUT" });
        announce(msg);
        return;
      }
      const bootstrap = buildBootstrap(me.user, me.sections, me.navigation);
      announce(COPY.login.success);
      navigateAfterLogin(bootstrap);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        clearAuthHint();
        setInvalidFields([]);
        setNoticeKind("error");
        setNotice(msg);
        setView({ kind: "SIGNED_OUT" });
        announce(msg);
        return;
      }
      setView({ kind: "RECOVERABLE_ERROR", error: msg, retry: finishUpgrade });
      announce(msg);
    }
  }, [navigateAfterLogin, username]);

  const handleUpgrade = useCallback(async () => {
    // The auth boundary applies the canonical legacy normalization (strip
    // non-digits, then zero-pad/truncate to four digits), so reject only an
    // input that has no usable PIN digits.
    if (!/\d/u.test(legacyPin)) {
      setInvalidFields(["legacyPin"]);
      setNotice(COPY.login.upgradeLegacyPinInvalid);
      setNoticeKind("error");
      announce(COPY.login.upgradeLegacyPinInvalid);
      legacyPinRef.current?.focus();
      return;
    }
    if (newCredential.length < 8) {
      setInvalidFields(["newCredential"]);
      setNotice(COPY.login.upgradePasswordTooShort);
      setNoticeKind("error");
      announce(COPY.login.upgradePasswordTooShort);
      newCredentialRef.current?.focus();
      return;
    }
    if (newCredential !== confirmCredential) {
      setInvalidFields(["confirmCredential"]);
      setNotice(COPY.login.upgradePasswordMismatch);
      setNoticeKind("error");
      announce(COPY.login.upgradePasswordMismatch);
      confirmCredentialRef.current?.focus();
      return;
    }
    setInvalidFields([]);
    setView({ kind: "UPGRADING" });
    announce(COPY.login.upgrading);
    setNotice(null);
    try {
      await authUpgrade(username, legacyPin, newCredential);
    } catch (error) {
      const msg =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.login.upgradeNetworkError;
      const ambiguous =
        error instanceof RpcError &&
        (error.problem.code === "NETWORK_ERROR" ||
          error.problem.code === "MALFORMED_RESPONSE" ||
          error.problem.code === "UNAVAILABLE" ||
          error.problem.status === 0);
      if (!ambiguous) {
        // Definitive server problem: the upgrade did not commit. The gate
        // stays mounted so a retry may re-submit the same PIN.
        setInvalidFields([]);
        setView({ kind: "UPGRADE" });
        setNoticeKind("error");
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
        if (!matchesUsername(me.user.username, username)) {
          try {
            await authLogout();
          } catch {
            // A stale session is not evidence that the upgrade committed.
          }
          clearAuthHint();
          setInvalidFields([]);
          setNoticeKind("error");
          setNotice(COPY.login.upgradeNetworkError);
          setView({ kind: "SIGNED_OUT" });
          announce(COPY.login.upgradeNetworkError);
          return;
        }
        const bootstrap = buildBootstrap(me.user, me.sections, me.navigation);
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
          setInvalidFields([]);
          setView({ kind: "UPGRADE" });
          setNoticeKind("error");
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
  }, [
    legacyPin,
    newCredential,
    confirmCredential,
    username,
    finishUpgrade,
    navigateAfterLogin,
  ]);

  if (view.kind === "RESTORING") {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface)] p-4 text-center text-[var(--ink)]"
        aria-busy="true"
      >
        <h1 className="sr-only">{COPY.login.title}</h1>
        <Skeleton
          className="size-8 rounded-full bg-[var(--skeleton)]"
          aria-hidden="true"
        />
        <p className="text-[var(--ink-muted)]">{COPY.restore.loading}</p>
      </main>
    );
  }

  if (view.kind === "RECOVERABLE_ERROR") {
    const handleRetry = view.retry;
    return (
      <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
        <h1 className="sr-only">{COPY.login.title}</h1>
        <RecoveryView message={view.error} safeHref="/" onRetry={handleRetry} />
      </div>
    );
  }

  if (view.kind === "SESSION_EXPIRED") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-4">
        <Card
          className="w-full max-w-[400px] min-w-0 gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-[1.875rem_1.375rem] text-center shadow-none ring-0"
          role="article"
        >
          <h1
            ref={sessionExpiredHeadingRef}
            id="session-expired-title"
            className="wrap-anywhere text-2xl font-extrabold leading-tight text-[var(--ink)]"
            tabIndex={-1}
          >
            {COPY.sessionExpired.title}
          </h1>
          <p className="mt-2.5 wrap-anywhere text-[0.9rem] leading-[1.6] text-[var(--ink-muted)]">
            {COPY.sessionExpired.message}
          </p>
          <Button
            className="mt-5 min-h-11 w-full rounded-[8px] bg-[var(--accent)] px-6 text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
            type="button"
            onClick={() => setView({ kind: "SIGNED_OUT" })}
          >
            {COPY.sessionExpired.reLogin}
          </Button>
        </Card>
      </main>
    );
  }

  const upgradeMode = view.kind === "UPGRADE" || view.kind === "UPGRADING";
  const busy = view.kind === "AUTHENTICATING" || view.kind === "UPGRADING";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface)] text-[var(--ink)] antialiased">
      <a
        className="absolute left-4 top-[-3rem] z-[200] inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white transition-[top] duration-150 ease-out motion-reduce:transition-none focus-visible:top-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        href="#login"
      >
        {LANDING.skipToLogin}
      </a>

      <header className="flex items-center border-b border-[var(--line)] bg-[var(--surface-raised)] px-[clamp(1.25rem,4vw,2.5rem)] py-4">
        <Link
          className="inline-flex min-h-11 items-center rounded-lg font-extrabold tracking-[0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
          href="/"
          aria-label={LANDING.homeLabel}
        >
          <span className="min-w-0 wrap-anywhere">{LANDING.brandFull}</span>
        </Link>
      </header>

      <main className="flex flex-1">
        <div className="flex flex-1 items-center justify-center px-[clamp(1.25rem,4vw,2.5rem)] py-[clamp(2rem,6vw,4rem)] max-[799px]:items-start max-[799px]:justify-start max-[799px]:p-4">
          <div className="grid w-full max-w-[860px] items-center gap-[clamp(2rem,5vw,3.5rem)] max-[799px]:grid-cols-1 min-[800px]:grid-cols-2">
            <Card
              id="login"
              className="order-first w-full max-w-[400px] min-w-0 gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-7 shadow-none ring-0 max-[799px]:order-first max-[799px]:max-w-none max-[799px]:p-4 min-[800px]:order-2 min-[800px]:justify-self-end"
              role="region"
              aria-labelledby="login-title"
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <h2
                  id="login-title"
                  className="min-w-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight tracking-[-0.01em]"
                >
                  {upgradeMode ? COPY.login.upgradeTitle : COPY.login.title}
                </h2>
              </div>
              <p className="mb-5 wrap-anywhere text-[0.9rem] text-[var(--ink-muted)] max-[799px]:hidden">
                {LANDING.loginPanelLead}
              </p>
              {notice && (
                <div
                  ref={noticeRef}
                  tabIndex={-1}
                  className="mb-4 outline-none"
                >
                  <Alert
                    id="login-notice"
                    variant={noticeKind === "error" ? "destructive" : "default"}
                    className={`mb-0 text-[0.92rem] leading-[1.5] ${
                      noticeKind === "error"
                        ? "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
                        : noticeKind === "success"
                          ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--ink)]"
                          : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)]"
                    }`}
                  >
                    {notice}
                  </Alert>
                </div>
              )}
              <form
                className="flex min-w-0 flex-col gap-4 max-[799px]:gap-2.5"
                noValidate
                aria-labelledby="login-title"
                aria-busy={busy}
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
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    className="text-[0.88rem] font-bold text-[var(--ink-muted)]"
                    htmlFor="login-username"
                  >
                    {COPY.login.usernameLabel}
                  </label>
                  <Input
                    ref={usernameRef}
                    id="login-username"
                    className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setInvalidFields([]);
                      if (view.kind === "ERROR") {
                        setView({ kind: "SIGNED_OUT" });
                      }
                    }}
                    disabled={busy || upgradeMode}
                    autoComplete="username"
                    aria-invalid={
                      invalidFields.includes("username") || undefined
                    }
                    aria-describedby={
                      invalidFields.includes("username")
                        ? "login-error"
                        : undefined
                    }
                    required
                  />
                </div>
                {upgradeMode ? (
                  <>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        className="text-[0.88rem] font-bold text-[var(--ink-muted)]"
                        htmlFor="legacy-pin"
                      >
                        {COPY.login.legacyPasswordLabel}
                      </label>
                      <Input
                        ref={legacyPinRef}
                        id="legacy-pin"
                        className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                        type="password"
                        value={legacyPin}
                        onChange={(e) => {
                          setLegacyPin(e.target.value);
                          setInvalidFields([]);
                          if (noticeKind === "error") {
                            setNotice(null);
                          }
                        }}
                        disabled={busy}
                        autoComplete="current-password"
                        inputMode="numeric"
                        maxLength={4}
                        minLength={4}
                        pattern="[0-9]{4}"
                        aria-invalid={
                          invalidFields.includes("legacyPin") || undefined
                        }
                        aria-describedby={
                          invalidFields.includes("legacyPin")
                            ? "login-notice"
                            : undefined
                        }
                        required
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        className="text-[0.88rem] font-bold text-[var(--ink-muted)]"
                        htmlFor="new-credential"
                      >
                        {COPY.login.newPasswordLabel}
                      </label>
                      <Input
                        ref={newCredentialRef}
                        id="new-credential"
                        className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                        type="password"
                        value={newCredential}
                        onChange={(e) => {
                          setNewCredential(e.target.value);
                          setInvalidFields([]);
                          if (noticeKind === "error") {
                            setNotice(null);
                          }
                        }}
                        disabled={busy}
                        autoComplete="new-password"
                        aria-invalid={
                          invalidFields.includes("newCredential") || undefined
                        }
                        aria-describedby={
                          invalidFields.includes("newCredential")
                            ? "login-notice"
                            : undefined
                        }
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label
                        className="text-[0.88rem] font-bold text-[var(--ink-muted)]"
                        htmlFor="confirm-credential"
                      >
                        {COPY.login.confirmPasswordLabel}
                      </label>
                      <Input
                        ref={confirmCredentialRef}
                        id="confirm-credential"
                        className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                        type="password"
                        value={confirmCredential}
                        onChange={(e) => {
                          setConfirmCredential(e.target.value);
                          setInvalidFields([]);
                          if (noticeKind === "error") {
                            setNotice(null);
                          }
                        }}
                        disabled={busy}
                        autoComplete="new-password"
                        aria-invalid={
                          invalidFields.includes("confirmCredential") ||
                          undefined
                        }
                        aria-describedby={
                          invalidFields.includes("confirmCredential")
                            ? "login-notice"
                            : undefined
                        }
                        minLength={8}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label
                      className="text-[0.88rem] font-bold text-[var(--ink-muted)]"
                      htmlFor="login-password"
                    >
                      {COPY.login.passwordLabel}
                    </label>
                    <Input
                      ref={passwordRef}
                      id="login-password"
                      className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setInvalidFields([]);
                        if (view.kind === "ERROR") {
                          setView({ kind: "SIGNED_OUT" });
                        }
                      }}
                      disabled={busy}
                      autoComplete="current-password"
                      aria-invalid={
                        invalidFields.includes("password") || undefined
                      }
                      aria-describedby={
                        invalidFields.includes("password")
                          ? "login-error"
                          : undefined
                      }
                      required
                    />
                  </div>
                )}
                <Button
                  className="min-h-11 w-full rounded-[8px] bg-[var(--accent)] px-6 text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy
                    ? upgradeMode
                      ? COPY.login.upgrading
                      : COPY.login.submitting
                    : upgradeMode
                      ? COPY.login.upgradeSubmit
                      : COPY.login.submit}
                </Button>
                <p className="m-0 text-center text-[0.8rem] leading-[1.6] text-[var(--ink-muted)] max-[799px]:hidden">
                  {LANDING.loginAfterNote}
                </p>
                <p className="m-0.5 text-center">
                  <Button
                    asChild
                    variant="link"
                    className="min-h-11 w-full rounded-[8px] font-bold text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    <Link href="/register">{REGISTRATION_COPY.pageTitle}</Link>
                  </Button>
                </p>
                <p className="mt-[0.4rem]">
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 w-full rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                  >
                    <Link href="/guest-check-in">
                      {COPY.login.guestCheckIn}
                    </Link>
                  </Button>
                </p>
              </form>
              {view.kind === "ERROR" && (
                <div ref={errorRef} tabIndex={-1} className="mt-4 outline-none">
                  <Alert
                    id="login-error"
                    aria-label={view.error}
                    variant="destructive"
                    className="border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
                  >
                    {view.error}
                  </Alert>
                </div>
              )}
            </Card>

            <div className="order-2 w-full max-w-[40ch] min-w-0 max-[799px]:mt-2 min-[800px]:order-1">
              <h1 className="mb-3 wrap-anywhere text-[clamp(1.75rem,3vw,2.25rem)] font-extrabold leading-tight tracking-[-0.02em]">
                {LANDING.brandFull}
              </h1>
              <p className="m-0 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
                {LANDING.systemDescription}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
