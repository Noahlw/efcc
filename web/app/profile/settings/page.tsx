"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

import {
  ACCOUNT_SETTINGS_COPY,
  accountSettingsErrorCopy,
} from "@/lib/account-settings-copy";
import { authChangePassword, authChangeUsername, RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";

import styles from "./settings.module.css";

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.backIcon}
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path
        d="m12.5 4-5 6 5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function errorMessage(error: unknown, field: "username" | "password") {
  if (error instanceof RpcError) {
    return accountSettingsErrorCopy(
      error.problem.code,
      error.problem.detail,
      field
    );
  }
  return ACCOUNT_SETTINGS_COPY.offlineError;
}

function AccountSettingsContent() {
  const { signOut } = useApp();
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  async function submitUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernameSubmitting) {
      return;
    }

    setUsernameError("");
    setUsernameSuccess(false);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setUsernameError(ACCOUNT_SETTINGS_COPY.offlineError);
      return;
    }

    const trimmed = newUsername.trim();
    if (!trimmed) {
      setUsernameError(ACCOUNT_SETTINGS_COPY.missingUsername);
      return;
    }

    setUsernameSubmitting(true);
    try {
      await authChangeUsername(trimmed);
      setUsernameSuccess(true);
    } catch (error: unknown) {
      setUsernameError(errorMessage(error, "username"));
    } finally {
      setUsernameSubmitting(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSubmitting) {
      return;
    }

    setPasswordError("");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPasswordError(ACCOUNT_SETTINGS_COPY.offlineError);
      return;
    }
    if (!currentPassword || !newPassword) {
      setPasswordError(ACCOUNT_SETTINGS_COPY.missingPasswordFields);
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(ACCOUNT_SETTINGS_COPY.shortPassword);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(ACCOUNT_SETTINGS_COPY.passwordMismatch);
      return;
    }

    setPasswordSubmitting(true);
    try {
      await authChangePassword(currentPassword, newPassword);
      signOut();
    } catch (error: unknown) {
      setPasswordError(errorMessage(error, "password"));
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <Link href="/profile" className={styles.back}>
          <BackIcon />
          <span>{ACCOUNT_SETTINGS_COPY.backToProfile}</span>
        </Link>
        <h1>{ACCOUNT_SETTINGS_COPY.sectionTitle}</h1>
        <p>{ACCOUNT_SETTINGS_COPY.sectionLead}</p>
      </div>

      <section
        className={styles.section}
        aria-labelledby="change-username-title"
      >
        <h2 id="change-username-title">
          {ACCOUNT_SETTINGS_COPY.usernameTitle}
        </h2>
        <div className={styles.card}>
          <form onSubmit={submitUsername} noValidate>
            <div className={styles.field}>
              <label htmlFor="new-username">
                {ACCOUNT_SETTINGS_COPY.usernameLabel}
              </label>
              <input
                id="new-username"
                name="new-username"
                type="text"
                autoComplete="username"
                value={newUsername}
                onChange={(event) => {
                  setNewUsername(event.target.value);
                  setUsernameError("");
                  setUsernameSuccess(false);
                }}
                disabled={usernameSubmitting}
                aria-invalid={Boolean(usernameError)}
                aria-describedby="new-username-error"
              />
            </div>
            <p
              id="new-username-error"
              role="alert"
              className={usernameError ? styles.error : styles.errorPlaceholder}
            >
              {usernameError}
            </p>
            {usernameSuccess && (
              <output className={styles.success}>
                {ACCOUNT_SETTINGS_COPY.usernameSuccess}
              </output>
            )}
            <button
              type="submit"
              className={styles.submit}
              disabled={usernameSubmitting}
            >
              {usernameSubmitting
                ? ACCOUNT_SETTINGS_COPY.usernameSubmitting
                : ACCOUNT_SETTINGS_COPY.usernameSubmit}
            </button>
          </form>
        </div>
      </section>

      <section
        className={styles.section}
        aria-labelledby="change-password-title"
      >
        <h2 id="change-password-title">
          {ACCOUNT_SETTINGS_COPY.passwordTitle}
        </h2>
        <div className={styles.card}>
          <form onSubmit={submitPassword} noValidate>
            <div className={styles.field}>
              <label htmlFor="current-password">
                {ACCOUNT_SETTINGS_COPY.currentPasswordLabel}
              </label>
              <input
                id="current-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordError("");
                }}
                disabled={passwordSubmitting}
                aria-invalid={Boolean(passwordError)}
                aria-describedby="password-error"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-password">
                {ACCOUNT_SETTINGS_COPY.newPasswordLabel}
              </label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordError("");
                }}
                disabled={passwordSubmitting}
                aria-invalid={Boolean(passwordError)}
                aria-describedby="new-password-hint password-error"
              />
              <span id="new-password-hint" className={styles.help}>
                {ACCOUNT_SETTINGS_COPY.passwordHint}
              </span>
            </div>
            <div className={styles.field}>
              <label htmlFor="confirm-password">
                {ACCOUNT_SETTINGS_COPY.confirmPasswordLabel}
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError("");
                }}
                disabled={passwordSubmitting}
                aria-invalid={Boolean(passwordError)}
                aria-describedby="password-error"
              />
            </div>
            <p
              id="password-error"
              role="alert"
              className={passwordError ? styles.error : styles.errorPlaceholder}
            >
              {passwordError}
            </p>
            <p className={styles.notice}>
              {ACCOUNT_SETTINGS_COPY.passwordNotice}
            </p>
            <button
              type="submit"
              className={styles.submitPrimary}
              disabled={passwordSubmitting}
            >
              {passwordSubmitting
                ? ACCOUNT_SETTINGS_COPY.passwordSubmitting
                : ACCOUNT_SETTINGS_COPY.passwordSubmit}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <AccountSettingsContent />
    </AppShell>
  );
}
