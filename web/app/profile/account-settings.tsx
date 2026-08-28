"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_SETTINGS_COPY,
  accountSettingsErrorCopy,
} from "@/lib/account-settings-copy";
import { authChangePassword, authChangeUsername, RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { ContextualTaskHeader } from "@/lib/contextual-task-header";
import { ForbiddenView } from "@/lib/forbidden-view";
import { announce } from "@/lib/live-region";
import { clearAuthHint, rememberDeepLink } from "@/lib/session";

import styles from "./account-settings.module.css";

/** One-time flash consumed by the canonical sign-in surface. */
const ACCOUNT_UPDATED_KEY = "efcc_account_updated";

type UsernameState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; retryable: boolean }
  | { kind: "unchanged" };

type PasswordState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; retryable: boolean };

type CompletedChange = { kind: "done"; field: "username" | "password" };

/**
 * The one shipped `/profile/settings` implementation. Domain validation and
 * mutations stay here while the shared header owns the task navigation shape.
 * Inline alerts own inline error announcements; the global live region owns
 * only transitions that navigate or complete the whole task.
 */
export const AccountSettings = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrap } = useApp();

  const [username, setUsername] = useState(() => bootstrap.profile.username);
  const [usernameState, setUsernameState] = useState<UsernameState>({
    kind: "idle",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordState, setPasswordState] = useState<PasswordState>({
    kind: "idle",
  });
  const [outcome, setOutcome] = useState<CompletedChange | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const usernameFormRef = useRef<HTMLFormElement>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);
  const usernameErrorRef = useRef<HTMLDivElement>(null);
  const passwordErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outcome || forbidden) {
      headingRef.current?.focus();
    }
  }, [outcome, forbidden]);

  useEffect(() => {
    if (usernameState.kind === "error" && !usernameState.retryable) {
      usernameErrorRef.current?.focus();
    }
  }, [usernameState]);

  useEffect(() => {
    if (passwordState.kind === "error" && !passwordState.retryable) {
      passwordErrorRef.current?.focus();
    }
  }, [passwordState]);

  const completeChange = (
    field: "username" | "password",
    result: { sessionRevoked: boolean }
  ) => {
    if (!result.sessionRevoked) {
      if (field === "username") {
        setUsernameState({ kind: "unchanged" });
      } else {
        setPasswordState({
          kind: "error",
          message: ACCOUNT_SETTINGS_COPY.genericError,
          retryable: false,
        });
      }
      return;
    }

    setOutcome({ kind: "done", field });
    // The visible success state is intentionally not aria-live: this global
    // announcement is the single owner for the task-complete transition.
    announce(ACCOUNT_SETTINGS_COPY.updated);
    try {
      sessionStorage.setItem(ACCOUNT_UPDATED_KEY, "1");
    } catch {
      // The route still transitions safely when sessionStorage is unavailable.
    }
    clearAuthHint();
    router.replace("/");
  };

  const handleSubmitError = (
    error: unknown,
    field: "username" | "password",
    setState: (state: {
      kind: "error";
      message: string;
      retryable: boolean;
    }) => void
  ) => {
    const rpcError = error instanceof RpcError ? error : null;
    const code = rpcError?.problem.code;
    const status = rpcError?.problem.status;

    if (code === "AUTH_REQUIRED" || status === 401) {
      rememberDeepLink(
        `${pathname}${window.location.search}${window.location.hash}`
      );
      announce(ACCOUNT_SETTINGS_COPY.sessionExpired);
      clearAuthHint();
      router.replace("/");
      return;
    }

    if (code === "FORBIDDEN" || status === 403) {
      setForbidden(true);
      return;
    }

    const isNetwork =
      !rpcError || code === "NETWORK_ERROR" || status === 0;
    const isUnavailable =
      code === "UNAVAILABLE" || (status !== undefined && status >= 500);
    if (isNetwork || isUnavailable) {
      setState({
        kind: "error",
        message: isUnavailable
          ? ACCOUNT_SETTINGS_COPY.unavailable
          : ACCOUNT_SETTINGS_COPY.networkError,
        retryable: true,
      });
      return;
    }

    setState({
      kind: "error",
      message: accountSettingsErrorCopy(
        code,
        rpcError?.problem.detail,
        field
      ),
      retryable: false,
    });
  };

  const submitUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (usernameState.kind === "submitting" || outcome || forbidden) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setUsernameState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.offlineError,
        retryable: true,
      });
      return;
    }

    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.missingUsername,
        retryable: false,
      });
      return;
    }

    setUsernameState({ kind: "submitting" });
    try {
      const result = await authChangeUsername(trimmed);
      completeChange("username", result);
    } catch (error: unknown) {
      handleSubmitError(error, "username", setUsernameState);
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordState.kind === "submitting" || outcome || forbidden) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPasswordState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.offlineError,
        retryable: true,
      });
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.missingPasswordFields,
        retryable: false,
      });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.shortPassword,
        retryable: false,
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordState({
        kind: "error",
        message: ACCOUNT_SETTINGS_COPY.passwordMismatch,
        retryable: false,
      });
      return;
    }

    setPasswordState({ kind: "submitting" });
    try {
      const result = await authChangePassword(currentPassword, newPassword);
      completeChange("password", result);
    } catch (error: unknown) {
      handleSubmitError(error, "password", setPasswordState);
    }
  };

  const header = (
    <ContextualTaskHeader
      backHref="/profile"
      backLabel={ACCOUNT_SETTINGS_COPY.backToProfile}
      title={ACCOUNT_SETTINGS_COPY.sectionTitle}
      lead={ACCOUNT_SETTINGS_COPY.sectionLead}
      headingId="account-settings-title"
      headingRef={headingRef}
    />
  );

  if (outcome) {
    return (
      <div className={styles.page}>
        {header}
        <section
          className={`${styles.success} gap-0 overflow-visible border border-[var(--success-border)] bg-[var(--surface-raised)] p-6 text-center shadow-none ring-0`}
          aria-labelledby="account-settings-success-title"
        >
          <h2
            id="account-settings-success-title"
            className={styles.successTitle}
            tabIndex={-1}
          >
            {ACCOUNT_SETTINGS_COPY.updated}
          </h2>
          <p className={styles.successDetail}>
            {outcome.field === "username"
              ? ACCOUNT_SETTINGS_COPY.usernameSuccess
              : ACCOUNT_SETTINGS_COPY.passwordSuccess}
          </p>
          <p className={styles.successDetail}>
            {ACCOUNT_SETTINGS_COPY.updatedDetail}
          </p>
          <p className={styles.successStatus}>
            {ACCOUNT_SETTINGS_COPY.redirecting}
          </p>
        </section>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.forbidden}>
          <ForbiddenView safeHref="/profile" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}
      <Card
        className={`${styles.section} overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-none ring-0 max-[799px]:p-4`}
      >
        <form
          className={styles.form}
          onSubmit={submitUsername}
          ref={usernameFormRef}
          noValidate
          aria-labelledby="account-settings-username-title"
        >
          <h2 id="account-settings-username-title" className={styles.formTitle}>
            {ACCOUNT_SETTINGS_COPY.usernameTitle}
          </h2>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              htmlFor="account-settings-username"
            >
              {ACCOUNT_SETTINGS_COPY.usernameLabel}
            </label>
            <Input
              id="account-settings-username"
              name="username"
              className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              autoComplete="username"
              required
              aria-invalid={usernameState.kind === "error" ? true : undefined}
              aria-describedby={
                usernameState.kind === "error"
                  ? "account-settings-username-hint account-settings-username-error"
                  : "account-settings-username-hint"
              }
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (usernameState.kind !== "submitting") {
                  setUsernameState({ kind: "idle" });
                }
              }}
              disabled={usernameState.kind === "submitting"}
            />
            <p id="account-settings-username-hint" className={styles.fieldHint}>
              {ACCOUNT_SETTINGS_COPY.usernameHint}
            </p>
          </div>
          {usernameState.kind === "error" && (
            <div ref={usernameErrorRef} tabIndex={-1}>
              <Alert
                variant="destructive"
                className={`${styles.errorBlock} border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]`}
              >
                <p id="account-settings-username-error" className={styles.error}>
                  {usernameState.message}
                </p>
                {usernameState.retryable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 text-base text-[var(--accent-deep)] hover:border-[var(--accent-deep)] hover:bg-[var(--surface)]"
                    autoFocus
                    onClick={() => usernameFormRef.current?.requestSubmit()}
                  >
                    {ACCOUNT_SETTINGS_COPY.retry}
                  </Button>
                )}
              </Alert>
            </div>
          )}
          {usernameState.kind === "unchanged" && (
            <output
              className={`${styles.notice} border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--ink)]`}
              role="status"
            >
              {ACCOUNT_SETTINGS_COPY.usernameUnchanged}
            </output>
          )}
          <Button
            type="submit"
            className="min-h-12 w-full rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
            disabled={usernameState.kind === "submitting"}
            aria-busy={usernameState.kind === "submitting"}
          >
            {usernameState.kind === "submitting"
              ? ACCOUNT_SETTINGS_COPY.usernameSubmitting
              : ACCOUNT_SETTINGS_COPY.usernameSubmit}
          </Button>
        </form>

        <form
          className={styles.form}
          onSubmit={submitPassword}
          ref={passwordFormRef}
          noValidate
          aria-labelledby="account-settings-password-title"
        >
          <h2 id="account-settings-password-title" className={styles.formTitle}>
            {ACCOUNT_SETTINGS_COPY.passwordTitle}
          </h2>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              htmlFor="account-settings-current-password"
            >
              {ACCOUNT_SETTINGS_COPY.currentPasswordLabel}
            </label>
            <Input
              id="account-settings-current-password"
              name="currentPassword"
              type="password"
              className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              autoComplete="current-password"
              required
              aria-invalid={passwordState.kind === "error" ? true : undefined}
              aria-describedby={
                passwordState.kind === "error"
                  ? "account-settings-password-error"
                  : undefined
              }
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                if (passwordState.kind !== "submitting") {
                  setPasswordState({ kind: "idle" });
                }
              }}
              disabled={passwordState.kind === "submitting"}
            />
          </div>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              htmlFor="account-settings-new-password"
            >
              {ACCOUNT_SETTINGS_COPY.newPasswordLabel}
            </label>
            <Input
              id="account-settings-new-password"
              name="newPassword"
              type="password"
              className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={passwordState.kind === "error" ? true : undefined}
              aria-describedby={
                passwordState.kind === "error"
                  ? "account-settings-password-hint account-settings-password-error"
                  : "account-settings-password-hint"
              }
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (passwordState.kind !== "submitting") {
                  setPasswordState({ kind: "idle" });
                }
              }}
              disabled={passwordState.kind === "submitting"}
            />
            <p id="account-settings-password-hint" className={styles.fieldHint}>
              {ACCOUNT_SETTINGS_COPY.passwordHint}
            </p>
          </div>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              htmlFor="account-settings-confirm-password"
            >
              {ACCOUNT_SETTINGS_COPY.confirmPasswordLabel}
            </label>
            <Input
              id="account-settings-confirm-password"
              name="confirmPassword"
              type="password"
              className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              autoComplete="new-password"
              required
              aria-invalid={passwordState.kind === "error" ? true : undefined}
              aria-describedby={
                passwordState.kind === "error"
                  ? "account-settings-password-error"
                  : undefined
              }
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (passwordState.kind !== "submitting") {
                  setPasswordState({ kind: "idle" });
                }
              }}
              disabled={passwordState.kind === "submitting"}
            />
          </div>
          {passwordState.kind === "error" && (
            <div ref={passwordErrorRef} tabIndex={-1}>
              <Alert
                variant="destructive"
                className={`${styles.errorBlock} border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]`}
              >
                <p id="account-settings-password-error" className={styles.error}>
                  {passwordState.message}
                </p>
                {passwordState.retryable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 text-base text-[var(--accent-deep)] hover:border-[var(--accent-deep)] hover:bg-[var(--surface)]"
                    autoFocus
                    onClick={() => passwordFormRef.current?.requestSubmit()}
                  >
                    {ACCOUNT_SETTINGS_COPY.retry}
                  </Button>
                )}
              </Alert>
            </div>
          )}
          <p className={styles.notice}>{ACCOUNT_SETTINGS_COPY.passwordNotice}</p>
          <Button
            type="submit"
            className="min-h-12 w-full rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
            disabled={passwordState.kind === "submitting"}
            aria-busy={passwordState.kind === "submitting"}
          >
            {passwordState.kind === "submitting"
              ? ACCOUNT_SETTINGS_COPY.passwordSubmitting
              : ACCOUNT_SETTINGS_COPY.passwordSubmit}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export { ACCOUNT_UPDATED_KEY };
