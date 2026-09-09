"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

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

type RegistrationField = "username" | "password" | "name" | "phone";

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
  const [invalidFields, setInvalidFields] = useState<RegistrationField[]>([]);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  const busy = state.kind === "submitting";

  useEffect(() => {
    if (state.kind === "done") {
      doneHeadingRef.current?.focus();
      return;
    }
    if (state.kind !== "error") {
      return;
    }
    if (invalidFields.includes("username")) {
      usernameRef.current?.focus();
    } else if (invalidFields.length === 0) {
      errorRef.current?.focus();
    }
  }, [state, invalidFields]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) {
      return;
    }

    const missing: RegistrationField[] = [];
    if (!username.trim()) {
      missing.push("username");
    }
    if (password.length < 8) {
      missing.push("password");
    }
    if (!name.trim()) {
      missing.push("name");
    }
    if (!phone.trim()) {
      missing.push("phone");
    }
    if (missing.length > 0) {
      setInvalidFields(missing);
      setState({ kind: "error", message: REGISTRATION_COPY.missingFields });
      const firstInvalid = missing[0];
      if (firstInvalid === "username") {
        usernameRef.current?.focus();
      } else if (firstInvalid === "password") {
        passwordRef.current?.focus();
      } else if (firstInvalid === "name") {
        nameRef.current?.focus();
      } else {
        phoneRef.current?.focus();
      }
      return;
    }

    setInvalidFields([]);
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
      setInvalidFields(
        error instanceof RegistrationApiError && error.code === "CONFLICT"
          ? ["username"]
          : []
      );
      setState({ kind: "error", message });
    }
  };

  if (state.kind === "done") {
    return (
      <section className="mx-auto w-full max-w-[440px] min-w-0 overflow-visible rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center shadow-none">
        <h2
          ref={doneHeadingRef}
          className="mb-3 text-2xl font-black text-[var(--ink)] outline-none"
          tabIndex={-1}
        >
          {REGISTRATION_COPY.doneTitle}
        </h2>
        <p className="mb-6 wrap-anywhere text-[0.9375rem] leading-[1.7] text-[var(--ink-muted)]">
          {REGISTRATION_COPY.doneMessage}
        </p>
        <div className="flex flex-col gap-3">
          <Button
            asChild
            variant="link"
            className="min-h-11 rounded-[8px] font-bold text-[var(--accent-deep)] motion-reduce:transition-none"
          >
            <Link href="/">{REGISTRATION_COPY.backToLogin}</Link>
          </Button>
          <Button
            asChild
            variant="link"
            className="min-h-11 rounded-[8px] font-bold text-[var(--accent-deep)] motion-reduce:transition-none"
          >
            <Link href="/guest-check-in">{REGISTRATION_COPY.guestCheckIn}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      aria-label={REGISTRATION_COPY.pageTitle}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[1.125rem]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor="reg-username"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.usernameLabel}
        </label>
        <Input
          ref={usernameRef}
          id="reg-username"
          name="username"
          autoComplete="username"
          required
          aria-invalid={invalidFields.includes("username") || undefined}
          aria-describedby={
            invalidFields.includes("username")
              ? "registration-error"
              : undefined
          }
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setInvalidFields([]);
            if (state.kind === "error") {
              setState({ kind: "idle" });
            }
          }}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor="reg-password"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.passwordLabel}
        </label>
        <Input
          ref={passwordRef}
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={invalidFields.includes("password") || undefined}
          aria-describedby={
            invalidFields.includes("password")
              ? "registration-error"
              : undefined
          }
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setInvalidFields([]);
            if (state.kind === "error") {
              setState({ kind: "idle" });
            }
          }}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor="reg-name"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.nameLabel}
        </label>
        <Input
          ref={nameRef}
          id="reg-name"
          name="name"
          autoComplete="name"
          required
          aria-invalid={invalidFields.includes("name") || undefined}
          aria-describedby={
            invalidFields.includes("name") ? "registration-error" : undefined
          }
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setInvalidFields([]);
            if (state.kind === "error") {
              setState({ kind: "idle" });
            }
          }}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor="reg-phone"
          className="mb-0 text-[0.9375rem] font-bold text-[var(--ink)]"
        >
          {REGISTRATION_COPY.phoneLabel}
        </label>
        <Input
          ref={phoneRef}
          id="reg-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          aria-invalid={invalidFields.includes("phone") || undefined}
          aria-describedby={
            invalidFields.includes("phone") ? "registration-error" : undefined
          }
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setInvalidFields([]);
            if (state.kind === "error") {
              setState({ kind: "idle" });
            }
          }}
          className="min-h-12 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
        />
      </div>

      {state.kind === "error" && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert
            id="registration-error"
            aria-label={state.message}
            variant="destructive"
            className="border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
          >
            {state.message}
          </Alert>
        </div>
      )}

      <Button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="min-h-11 rounded-[8px] bg-[var(--accent)] text-base font-extrabold text-white motion-reduce:transition-none hover:bg-[var(--accent-deep)]"
      >
        {busy ? REGISTRATION_COPY.submitting : REGISTRATION_COPY.submit}
      </Button>
    </form>
  );
};
