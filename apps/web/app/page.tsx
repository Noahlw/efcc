"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authLogin, authMe, RpcError } from "@/lib/api";
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
  | { kind: "SESSION_EXPIRED" }
  | { kind: "ERROR"; error: string }
  | { kind: "RECOVERABLE_ERROR"; error: string; retry: () => void };

type LoginField = "username" | "password";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";
const ACCOUNT_UPDATED_KEY = "efcc_account_updated";

const LoginPage = () => {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "SIGNED_OUT" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Flash notices carry different tones: errors (failed logout) vs success
  // (account updated).
  // Session expiry is its own dedicated screen (SESSION_EXPIRED), not a
  // flash notice on this form. Visual tone and announcement urgency are
  // independent; the visible Alert owns each notice announcement.
  const [noticeKind, setNoticeKind] = useState<"error" | "info" | "success">(
    "info"
  );
  const [invalidFields, setInvalidFields] = useState<LoginField[]>([]);
  const mountRef = useRef(true);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
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
      setNotice(COPY.logout.failedNotice);
      setNoticeKind("error");
      sessionStorage.removeItem(LOGOUT_FAILED_KEY);
    }
    if (sessionStorage.getItem(ACCOUNT_UPDATED_KEY) === "1") {
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
      await authLogin(username, password);
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
      clearAuthHint();
    }
  }, [username, password, navigateAfterLogin]);

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
        <Alert
          announcement="polite"
          aria-label={COPY.restore.loading}
          className="w-full max-w-[22rem] text-center"
          tone="pending"
        >
          {COPY.restore.loading}
        </Alert>
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
          className="w-full max-w-[400px] min-w-0 gap-0 text-center"
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
            className="mt-5 w-full bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
            type="button"
            onClick={() => setView({ kind: "SIGNED_OUT" })}
          >
            {COPY.sessionExpired.reLogin}
          </Button>
        </Card>
      </main>
    );
  }

  const busy = view.kind === "AUTHENTICATING";

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
              className="order-first w-full max-w-[400px] min-w-0 gap-0 max-[799px]:order-first max-[799px]:max-w-none min-[800px]:order-2 min-[800px]:justify-self-end"
              role="region"
              aria-labelledby="login-title"
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <h2
                  id="login-title"
                  className="min-w-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight tracking-[-0.01em]"
                >
                  {COPY.login.title}
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
                    announcement={
                      noticeKind === "error" ? "assertive" : "polite"
                    }
                    className="mb-0 text-[0.92rem] leading-[1.5]"
                    tone={noticeKind}
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
                    handleLogin();
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
                    className="border-[var(--line-strong)] bg-[var(--surface-raised)] text-base text-[var(--ink)]"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setInvalidFields([]);
                      if (view.kind === "ERROR") {
                        setView({ kind: "SIGNED_OUT" });
                      }
                    }}
                    disabled={busy}
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
                    className="border-[var(--line-strong)] bg-[var(--surface-raised)] text-base text-[var(--ink)]"
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
                <Button
                  className="w-full bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy ? COPY.login.submitting : COPY.login.submit}
                </Button>
                <p className="m-0 text-center text-[0.8rem] leading-[1.6] text-[var(--ink-muted)] max-[799px]:hidden">
                  {LANDING.loginAfterNote}
                </p>
                <p className="m-0.5 text-center">
                  <Button
                    asChild
                    variant="link"
                    className="w-full font-bold text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    <Link href="/register">{REGISTRATION_COPY.pageTitle}</Link>
                  </Button>
                </p>
                <p className="mt-[0.4rem]">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-[var(--line-strong)] bg-[var(--surface-raised)] font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
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
                    announcement="assertive"
                    tone="error"
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
