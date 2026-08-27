"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_SETTINGS_COPY,
  accountSettingsErrorCopy,
} from "@/lib/account-settings-copy";
import { authChangePassword, authChangeUsername, RpcError } from "@/lib/api";
import { ForbiddenView } from "@/lib/forbidden-view";
import { announce } from "@/lib/live-region";
import { clearAuthHint } from "@/lib/session";

import styles from "./account-settings.module.css";

/**
 * One-time flash-notice key consumed by the login surface (app/page.tsx,
 * owned by Ui01Shell): the login page reads it on mount and shows
 * "帳戶資料已更新，請重新登入" (Spec #191 §6).
 */
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

/**
 * 帳戶資料 — the authenticated Profile sub-surface (UI-04 #196 / Spec #191 §6).
 *
 * Two self-contained forms: change username (session-authenticated, no current
 * password) and change password (current + new, no confirmation field). Errors
 * render inline with role="alert". A successful change shows the 已更新 success
 * state, then routes to the login surface with a one-time sessionStorage-carried
 * notice, because every refresh session was revoked server-side.
 *
 * Rendered inside the Profile page (web/app/profile/page.tsx, owned by
 * Ui02Profile — the orchestrator integrates this component there). Reads the
 * current username from the shell's AppProvider bootstrap.
 */
export const AccountSettings = () => {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>({
    kind: "idle",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordState, setPasswordState] = useState<PasswordState>({
    kind: "idle",
  });
  const [outcome, setOutcome] = useState<{ kind: "done" } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const usernameFormRef = useRef<HTMLFormElement>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  const completeChange = (result: { sessionRevoked: boolean }) => {
    if (!result.sessionRevoked) {
      return;
    }
    setOutcome({ kind: "done" });
    announce(ACCOUNT_SETTINGS_COPY.updated);
    // Hand off to the login surface with the one-time notice (Spec #191 §6:
    // sessionStorage-carried). Synchronous — the session was revoked, so route
    // immediately instead of lingering on a delayed success state.
    sessionStorage.setItem(ACCOUNT_UPDATED_KEY, "1");
    clearAuthHint();
    router.replace("/");
  };

  /**
   * Shared submit-failure handling (review R4):
   * - AUTH_REQUIRED (401): the cookie session is gone — hand the user back to
   *   the signing surface; no inline error survives the navigation.
   * - FORBIDDEN (403): the Active-status gate — inline S13 block routing back
   *   to a safe section, never retryable.
   * - NETWORK_ERROR / UNAVAILABLE (503): recovery block with a 重試連接 control.
   * - everything else: inline per-error copy, not retryable.
   */
  const handleSubmitError = (
    error: unknown,
    field: "username" | "password",
    setState: (s: {
      kind: "error";
      message: string;
      retryable: boolean;
    }) => void
  ) => {
    if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
      announce(ACCOUNT_SETTINGS_COPY.sessionExpired);
      clearAuthHint();
      router.replace("/");
      return;
    }
    if (error instanceof RpcError && error.problem.code === "FORBIDDEN") {
      setForbidden(true);
      return;
    }
    const isNetwork =
      !(error instanceof RpcError) || error.problem.code === "NETWORK_ERROR";
    const isUnavailable =
      error instanceof RpcError && error.problem.code === "UNAVAILABLE";
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
        error.problem.code,
        error.problem.detail,
        field
      ),
      retryable: false,
    });
  };

  const submitUsername = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (usernameState.kind === "submitting" || outcome) {
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
      if (!result.sessionRevoked) {
        // Value-idempotent no-op: the session stays live, no sign-out.
        announce(ACCOUNT_SETTINGS_COPY.usernameUnchanged);
        setUsernameState({ kind: "unchanged" });
        return;
      }
      completeChange(result);
    } catch (error: unknown) {
      handleSubmitError(error, "username", setUsernameState);
    }
  };

  const submitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (passwordState.kind === "submitting" || outcome) {
      return;
    }
    if (!currentPassword || !newPassword) {
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
    setPasswordState({ kind: "submitting" });
    try {
      const result = await authChangePassword(currentPassword, newPassword);
      completeChange(result);
    } catch (error: unknown) {
      handleSubmitError(error, "password", setPasswordState);
    }
  };

  if (outcome) {
    return (
      <section
        className={`${styles.success} gap-0 overflow-visible border border-[var(--success-border)] bg-[var(--surface-raised)] p-6 text-center shadow-none ring-0`}
        aria-labelledby="account-settings-success-title"
      >
        <h2 id="account-settings-success-title" className={styles.successTitle}>
          {ACCOUNT_SETTINGS_COPY.updated}
        </h2>
        <p className={styles.successDetail}>
          {ACCOUNT_SETTINGS_COPY.updatedDetail}
        </p>
        <p className={styles.successStatus}>
          {ACCOUNT_SETTINGS_COPY.redirecting}
        </p>
      </section>
    );
  }

  if (forbidden) {
    // S13 (review P1): the batch/resolver surfaced a 403 — Active-status
    // gate. Render the shared forbidden block; no form survives.
    return <ForbiddenView safeHref="/profile" />;
  }

  return (
    <Card
      className={`${styles.section} overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-none ring-0 max-[799px]:p-4`}
      aria-labelledby="account-settings-title"
    >
      <h2 id="account-settings-title" className={styles.sectionTitle}>
        {ACCOUNT_SETTINGS_COPY.sectionTitle}
      </h2>
      <p className={styles.sectionLead}>{ACCOUNT_SETTINGS_COPY.sectionLead}</p>

      <form
        className={styles.form}
        onSubmit={submitUsername}
        ref={usernameFormRef}
        noValidate
        aria-labelledby="account-settings-username-title"
      >
        <h3 id="account-settings-username-title" className={styles.formTitle}>
          {ACCOUNT_SETTINGS_COPY.usernameTitle}
        </h3>
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
            onChange={(e) => setUsername(e.target.value)}
            disabled={usernameState.kind === "submitting"}
          />
          <p id="account-settings-username-hint" className={styles.fieldHint}>
            {ACCOUNT_SETTINGS_COPY.usernameHint}
          </p>
        </div>
        {usernameState.kind === "error" && (
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
        )}
        {usernameState.kind === "unchanged" && (
          <output
            className={`${styles.notice} border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--ink)]`}
          >
            {ACCOUNT_SETTINGS_COPY.usernameUnchanged}
          </output>
        )}
        <Button
          type="submit"
          className="min-h-12 rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
          disabled={usernameState.kind === "submitting"}
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
        <h3 id="account-settings-password-title" className={styles.formTitle}>
          {ACCOUNT_SETTINGS_COPY.passwordTitle}
        </h3>
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
            onChange={(e) => setCurrentPassword(e.target.value)}
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
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={passwordState.kind === "submitting"}
          />
          <p id="account-settings-password-hint" className={styles.fieldHint}>
            {ACCOUNT_SETTINGS_COPY.passwordHint}
          </p>
        </div>
        {passwordState.kind === "error" && (
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
        )}
        <Button
          type="submit"
          className="min-h-12 rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
          disabled={passwordState.kind === "submitting"}
        >
          {passwordState.kind === "submitting"
            ? ACCOUNT_SETTINGS_COPY.passwordSubmitting
            : ACCOUNT_SETTINGS_COPY.passwordSubmit}
        </Button>
      </form>
    </Card>
  );
};

export { ACCOUNT_UPDATED_KEY };
