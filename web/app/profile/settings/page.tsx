"use client";

import Link from "next/link";
import { useState } from 'react';
import type { FormEvent } from 'react';

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
import { AppShell } from "@/lib/app-shell";

import styles from "./settings.module.css";

const BackIcon = () => 
  (
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
  )
;

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

const AccountSettingsContent = () => {
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
    if (usernameSubmitting) {return;}

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
    if (passwordSubmitting) {return;}

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
      <header className={styles.header}>
        <span>{ACCOUNT_SETTINGS_COPY.headerTitle}</span>
      </header>

      <div className={styles.intro}>
        <Button
          asChild
          variant="ghost"
          className={`${styles.back} min-h-11 rounded-[8px] px-2 text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`}
        >
          <Link href="/profile">
            <BackIcon />
            <span>{ACCOUNT_SETTINGS_COPY.backToProfile}</span>
          </Link>
        </Button>
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
        <Card
          className={`${styles.card} overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] shadow-none ring-0`}
        >
          <form onSubmit={submitUsername} noValidate>
            <div className={styles.field}>
              <label htmlFor="new-username">
                {ACCOUNT_SETTINGS_COPY.usernameLabel}
              </label>
              <Input
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
                className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              />
            </div>
            <Alert
              id="new-username-error"
              variant={usernameError ? "destructive" : "default"}
              className={
                usernameError
                  ? `${styles.error} border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]`
                  : styles.errorPlaceholder
              }
            >
              {usernameError}
            </Alert>
            {usernameSuccess && (
              <output
                className={`${styles.success} border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]`}
              >
                {ACCOUNT_SETTINGS_COPY.usernameSuccess}
              </output>
            )}
            <Button
              type="submit"
              variant="outline"
              className="min-h-12 w-full rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 text-base font-semibold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              disabled={usernameSubmitting}
            >
              {usernameSubmitting
                ? ACCOUNT_SETTINGS_COPY.usernameSubmitting
                : ACCOUNT_SETTINGS_COPY.usernameSubmit}
            </Button>
          </form>
        </Card>
      </section>

      <section
        className={styles.section}
        aria-labelledby="change-password-title"
      >
        <h2 id="change-password-title">
          {ACCOUNT_SETTINGS_COPY.passwordTitle}
        </h2>
        <Card
          className={`${styles.card} overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] shadow-none ring-0`}
        >
          <form onSubmit={submitPassword} noValidate>
            <div className={styles.field}>
              <label htmlFor="current-password">
                {ACCOUNT_SETTINGS_COPY.currentPasswordLabel}
              </label>
              <Input
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
                className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-password">
                {ACCOUNT_SETTINGS_COPY.newPasswordLabel}
              </label>
              <Input
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
                className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              />
              <span id="new-password-hint" className={styles.help}>
                {ACCOUNT_SETTINGS_COPY.passwordHint}
              </span>
            </div>
            <div className={styles.field}>
              <label htmlFor="confirm-password">
                {ACCOUNT_SETTINGS_COPY.confirmPasswordLabel}
              </label>
              <Input
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
                className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              />
            </div>
            <Alert
              id="password-error"
              variant={passwordError ? "destructive" : "default"}
              className={
                passwordError
                  ? `${styles.error} border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]`
                  : styles.errorPlaceholder
              }
            >
              {passwordError}
            </Alert>
            <p className={styles.notice}>
              {ACCOUNT_SETTINGS_COPY.passwordNotice}
            </p>
            <Button
              type="submit"
              className="min-h-12 w-full rounded-[8px] bg-[var(--accent)] px-4 text-base font-semibold text-white hover:bg-[var(--accent-deep)]"
              disabled={passwordSubmitting}
            >
              {passwordSubmitting
                ? ACCOUNT_SETTINGS_COPY.passwordSubmitting
                : ACCOUNT_SETTINGS_COPY.passwordSubmit}
            </Button>
          </form>
        </Card>
      </section>
    </div>
  );
};

const SettingsPage = () => 
  (
    <AppShell>
      <AccountSettingsContent />
    </AppShell>
  )
;

export default SettingsPage;
