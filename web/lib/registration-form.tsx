"use client";

import Link from "next/link";
import { useState } from "react";

import {
  submitRegistration,
  RegistrationApiError,
} from "@/lib/registration-client";
import {
  REGISTRATION_COPY,
  registrationErrorCopy,
} from "@/lib/registration-copy";
import { QUEUE_COPY } from "@/lib/registration-copy";
import { announce } from "@/lib/live-region";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done" };

const field = {
  label: {
    display: "block",
    fontSize: "0.9375rem",
    fontWeight: 700,
    marginBottom: "0.5rem",
  } as const,
  input: {
    width: "100%",
    minHeight: 48,
    padding: "0 0.875rem",
    border: "1px solid var(--line-strong)",
    borderRadius: 8,
    background: "var(--surface-raised)",
    color: "var(--ink)",
    fontSize: "1rem",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
};

/**
 * Self-service registration form (AUTH-05 #163). Public surface — no session
 * is required. Submits a Pending registration request via
 * POST /api/v1/auth/register; success shows a confirmation and issues no
 * session. Duplicate usernames surface a deterministic CONFLICT message.
 */
export function RegistrationForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const busy = state.kind === "submitting";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
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
    void submitRegistration({
      username: username.trim(),
      password,
      name: name.trim(),
      phone: phone.trim(),
    })
      .then(() => {
        announce(REGISTRATION_COPY.submittedLive);
        setState({ kind: "done" });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof RegistrationApiError
            ? registrationErrorCopy(err.code)
            : QUEUE_COPY.networkError;
        setState({ kind: "error", message });
      });
  };

  if (state.kind === "done") {
    return (
      <div
        role="status"
        style={{
          maxWidth: 440,
          margin: "0 auto",
          padding: "2rem",
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--surface-raised)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 0.75rem",
            fontSize: "1.5rem",
            fontWeight: 900,
            color: "var(--ink)",
          }}
        >
          {REGISTRATION_COPY.doneTitle}
        </h1>
        <p
          style={{
            margin: "0 0 1.5rem",
            fontSize: "0.9375rem",
            lineHeight: 1.7,
            color: "var(--ink-muted)",
          }}
        >
          {REGISTRATION_COPY.doneMessage}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Link
            href="/"
            style={{ color: "var(--accent-deep)", fontWeight: 700, textDecoration: "underline" }}
          >
            {REGISTRATION_COPY.backToLogin}
          </Link>
          <Link
            href="/guest-check-in"
            style={{ color: "var(--accent-deep)", fontWeight: 700, textDecoration: "underline" }}
          >
            {REGISTRATION_COPY.guestCheckIn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.125rem",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="reg-username" style={field.label}>
          {REGISTRATION_COPY.usernameLabel}
        </label>
        <input
          id="reg-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={field.input}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="reg-password" style={field.label}>
          {REGISTRATION_COPY.passwordLabel}
        </label>
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field.input}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="reg-name" style={field.label}>
          {REGISTRATION_COPY.nameLabel}
        </label>
        <input
          id="reg-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={field.input}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="reg-phone" style={field.label}>
          {REGISTRATION_COPY.phoneLabel}
        </label>
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={field.input}
        />
      </div>

      {state.kind === "error" && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "0.75rem 0.875rem",
            borderRadius: 10,
            background: "rgba(156, 48, 44, 0.09)",
            color: "var(--accent-deep)",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
          }}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        style={{
          minHeight: 44,
          border: "none",
          borderRadius: 8,
          background: "var(--accent)",
          color: "#fff",
          fontSize: "1rem",
          fontWeight: 800,
          fontFamily: "inherit",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? REGISTRATION_COPY.submitting : REGISTRATION_COPY.submit}
      </button>
    </form>
  );
}