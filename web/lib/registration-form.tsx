"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { announce } from "@/lib/live-region";
import {
  submitRegistration,
  RegistrationApiError,
} from "@/lib/registration-client";
import {
  REGISTRATION_COPY,
  registrationErrorCopy,
  QUEUE_COPY,
} from "@/lib/registration-copy";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done" };

/**
 * Self-service registration form (AUTH-05 #163). Public surface — no session
 * is required. Submits a Pending registration request via
 * POST /api/v1/auth/register; success shows a confirmation and issues no
 * session. Duplicate usernames surface a deterministic CONFLICT message.
 */
export const RegistrationForm = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const busy = state.kind === "submitting";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) {return;}
    if (
      !username.trim() ||
      !name.trim() ||
      !phone.trim() ||
      password.length < 8
    ) {
      setState({ kind: "error", message: REGISTRATION_COPY.missingFields });
      return;
    }
    setState({ kind: "submitting" });
    try {
      await submitRegistration({
        username: username.trim(),
        password,
        name: name.trim(),
        phone: phone.trim(),
      });
      announce(REGISTRATION_COPY.submittedLive);
      setState({ kind: "done" });
    } catch (error: unknown) {
      const message =
        error instanceof RegistrationApiError
          ? registrationErrorCopy(error.code)
          : QUEUE_COPY.networkError;
      setState({ kind: "error", message });
    }
  };

  if (state.kind === "done") {
    return (
      <section className="mx-auto w-full max-w-[440px] gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center shadow-none ring-0">
        <h1 className="mb-3 text-2xl font-black text-[var(--ink)]">
          {REGISTRATION_COPY.doneTitle}
        </h1>
        <p className="mb-6 text-[0.9375rem] leading-[1.7] text-[var(--ink-muted)]">
          {REGISTRATION_COPY.doneMessage}
        </p>
        <div className="flex flex-col gap-3">
          <Button
            asChild
            variant="link"
            className="min-h-11 rounded-[8px] text-[var(--accent-deep)] font-bold"
          >
            <Link href="/">{REGISTRATION_COPY.backToLogin}</Link>
          </Button>
          <Button
            asChild
            variant="link"
            className="min-h-11 rounded-[8px] text-[var(--accent-deep)] font-bold"
          >
            <Link href="/guest-check-in">{REGISTRATION_COPY.guestCheckIn}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-[1.125rem]"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reg-username"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.usernameLabel}
        </label>
        <Input
          id="reg-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reg-password"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.passwordLabel}
        </label>
        <Input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reg-name"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.nameLabel}
        </label>
        <Input
          id="reg-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reg-phone"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.phoneLabel}
        </label>
        <Input
          id="reg-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>

      {state.kind === "error" && (
        <Alert
          variant="destructive"
          className="border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
        >
          {state.message}
        </Alert>
      )}

      <Button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white hover:bg-[var(--accent-deep)]"
      >
        {busy ? REGISTRATION_COPY.submitting : REGISTRATION_COPY.submit}
      </Button>
    </form>
  );
};
