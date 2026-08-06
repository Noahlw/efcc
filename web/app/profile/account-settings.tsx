"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  authChangePassword,
  authChangeUsername,
  RpcError,
} from "@/lib/api";
import { useApp } from "@/lib/app-context";
import {
  ACCOUNT_SETTINGS_COPY,
  accountSettingsErrorCopy,
} from "@/lib/account-settings-copy";
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
export function AccountSettings() {
  const router = useRouter();
  const { bootstrap } = useApp();

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
  const usernameFormRef = useRef<HTMLFormElement>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);
  const usernameRetryRef = useRef<HTMLButtonElement>(null);
  const passwordRetryRef = useRef<HTMLButtonElement>(null);

  // Focus handoff (matrix S14): when a network failure renders the recovery
  // block, keyboard / screen-reader users land directly on the retry control.
  useEffect(() => {
    if (usernameState.kind === "error" && usernameState.retryable) {
      usernameRetryRef.current?.focus();
    }
  }, [usernameState]);

  useEffect(() => {
    if (passwordState.kind === "error" && passwordState.retryable) {
      passwordRetryRef.current?.focus();
    }
  }, [passwordState]);

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

  const submitUsername = (e: React.FormEvent<HTMLFormElement>) => {
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
    void authChangeUsername(trimmed)
      .then((result) => {
        if (!result.sessionRevoked) {
          // Value-idempotent no-op: the session stays live, no sign-out.
          announce(ACCOUNT_SETTINGS_COPY.usernameUnchanged);
          setUsernameState({ kind: "unchanged" });
          return;
        }
        completeChange(result);
      })
      .catch((err: unknown) => {
        const isNetwork =
          !(err instanceof RpcError) || err.problem.code === "NETWORK_ERROR";
        if (!isNetwork) {
          setUsernameState({
            kind: "error",
            message: accountSettingsErrorCopy(
              err.problem.code,
              err.problem.detail,
              "username"
            ),
            retryable: false,
          });
          return;
        }
        // S14 network matrix: a transport failure gets a recovery block with
        // a retry control, not a bare error string.
        setUsernameState({
          kind: "error",
          message: ACCOUNT_SETTINGS_COPY.networkError,
          retryable: true,
        });
      });
  };

  const submitPassword = (e: React.FormEvent<HTMLFormElement>) => {
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
    void authChangePassword(currentPassword, newPassword)
      .then((result) => {
        completeChange(result);
      })
      .catch((err: unknown) => {
        const isNetwork =
          !(err instanceof RpcError) || err.problem.code === "NETWORK_ERROR";
        if (!isNetwork) {
          setPasswordState({
            kind: "error",
            message: accountSettingsErrorCopy(
              err.problem.code,
              err.problem.detail,
              "password"
            ),
            retryable: false,
          });
          return;
        }
        setPasswordState({
          kind: "error",
          message: ACCOUNT_SETTINGS_COPY.networkError,
          retryable: true,
        });
      });
  };

  if (outcome) {
    return (
      <section
        className={styles.success}
        role="status"
        aria-labelledby="account-settings-success-title"
      >
        <h2 id="account-settings-success-title" className={styles.successTitle}>
          {ACCOUNT_SETTINGS_COPY.updated}
        </h2>
        <p className={styles.successDetail}>{ACCOUNT_SETTINGS_COPY.updatedDetail}</p>
        <p className={styles.successStatus}>{ACCOUNT_SETTINGS_COPY.redirecting}</p>
      </section>
    );
  }

  return (
    <section
      className={styles.section}
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
          <input
            id="account-settings-username"
            name="username"
            className={styles.input}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={usernameState.kind === "submitting"}
          />
          <p className={styles.fieldHint}>{ACCOUNT_SETTINGS_COPY.usernameHint}</p>
        </div>
        {usernameState.kind === "error" && (
          <div role="alert" className={styles.errorBlock}>
            <p className={styles.error}>{usernameState.message}</p>
            {usernameState.retryable && (
              <button
                type="button"
                className={styles.retry}
                ref={usernameRetryRef}
                onClick={() => usernameFormRef.current?.requestSubmit()}
              >
                {ACCOUNT_SETTINGS_COPY.retry}
              </button>
            )}
          </div>
        )}
        {usernameState.kind === "unchanged" && (
          <p role="status" className={styles.notice}>
            {ACCOUNT_SETTINGS_COPY.usernameUnchanged}
          </p>
        )}
        <button
          type="submit"
          className={styles.submit}
          disabled={usernameState.kind === "submitting"}
        >
          {usernameState.kind === "submitting"
            ? ACCOUNT_SETTINGS_COPY.usernameSubmitting
            : ACCOUNT_SETTINGS_COPY.usernameSubmit}
        </button>
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
          <input
            id="account-settings-current-password"
            name="currentPassword"
            type="password"
            className={styles.input}
            autoComplete="current-password"
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
          <input
            id="account-settings-new-password"
            name="newPassword"
            type="password"
            className={styles.input}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={passwordState.kind === "submitting"}
          />
          <p className={styles.fieldHint}>{ACCOUNT_SETTINGS_COPY.passwordHint}</p>
        </div>
        {passwordState.kind === "error" && (
          <div role="alert" className={styles.errorBlock}>
            <p className={styles.error}>{passwordState.message}</p>
            {passwordState.retryable && (
              <button
                type="button"
                className={styles.retry}
                ref={passwordRetryRef}
                onClick={() => passwordFormRef.current?.requestSubmit()}
              >
                {ACCOUNT_SETTINGS_COPY.retry}
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          className={styles.submit}
          disabled={passwordState.kind === "submitting"}
        >
          {passwordState.kind === "submitting"
            ? ACCOUNT_SETTINGS_COPY.passwordSubmitting
            : ACCOUNT_SETTINGS_COPY.passwordSubmit}
        </button>
      </form>
    </section>
  );
}

export { ACCOUNT_UPDATED_KEY };