// Member PIN login form.
// Username + 4-digit PIN flow (unchanged from Apps Script UX per ADR-0005).
import { useState } from "react";
import type { FormEvent } from "react";

import { apiService } from "../services/api";
import { setSession } from "../services/session";
import type { LoginResponse } from "../types";

interface Props {
  onNavigateRegister: () => void;
  onLoggedIn: () => void;
}

type Status = "idle" | "submitting" | "error";

const styles = {
  card: {
    background: "#fff",
    borderRadius: "0.75rem",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, sans-serif",
    margin: "4rem auto",
    maxWidth: "26rem",
    padding: "2rem",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "0.5rem",
    color: "#b91c1c",
    fontSize: "0.9rem",
    margin: "0.5rem 0 1rem",
    padding: "0.6rem 0.75rem",
  },
  field: { display: "block", marginBottom: "0.85rem" },
  input: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "0.5rem",
    boxSizing: "border-box" as const,
    color: "#0f172a",
    fontSize: "1rem",
    padding: "0.6rem 0.75rem",
    width: "100%",
  },
  label: {
    color: "#1e293b",
    display: "block",
    fontSize: "0.9rem",
    fontWeight: 600,
    marginBottom: "0.25rem",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#1d4ed8",
    cursor: "pointer",
    fontSize: "0.9rem",
    marginTop: "1rem",
    padding: 0,
  },
  primary: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: "0.5rem",
    color: "#fff",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    marginTop: "0.5rem",
    padding: "0.75rem",
    width: "100%",
  },
  primaryDisabled: { background: "#94a3b8", cursor: "not-allowed" },
  subtitle: { color: "#475569", fontSize: "0.95rem", margin: "0 0 1.5rem" },
  title: { color: "#0f172a", fontSize: "1.5rem", margin: "0 0 0.25rem" },
};

function persistSession(response: LoginResponse): void {
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Login failed");
  }
  const { userId, name, role, sessionToken, qrCodeString, expiryTimestamp } =
    response.data;
  setSession({
    expiryTimestamp,
    name,
    qrCodeString,
    role,
    sessionToken,
    userId,
  });
}

export function LoginView({ onNavigateRegister, onLoggedIn }: Props) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanedUsername = username.trim();
    const cleanedPin = pin.replaceAll(/\D/gu, "");
    if (!cleanedUsername) {
      setError("Please enter your username.");
      return;
    }
    if (!/^\d{4}$/u.test(cleanedPin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const response = await apiService.loginUser(cleanedUsername, cleanedPin);
      persistSession(response);
      setStatus("idle");
      onLoggedIn();
    } catch (loginError: unknown) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Login failed. Please try again.";
      setError(message);
      setStatus("idle");
    }
  };

  const submitting = status === "submitting";
  const buttonStyle = {
    ...styles.primary,
    ...(submitting ? styles.primaryDisabled : {}),
  };

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>Member Sign In</h1>
      <p style={styles.subtitle}>
        Enter your username and 4-digit PIN to access your profile.
      </p>
      <form onSubmit={submit} noValidate>
        <label style={styles.field}>
          <span style={styles.label}>Username</span>
          <input
            type="text"
            autoComplete="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={styles.input}
            data-testid="login-username"
            disabled={submitting}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>4-Digit PIN</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="current-password"
            name="pin"
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replaceAll(/\D/gu, "").slice(0, 4))
            }
            style={styles.input}
            data-testid="login-pin"
            disabled={submitting}
          />
        </label>
        {error && (
          <div role="alert" style={styles.error} data-testid="login-error">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={buttonStyle}
          data-testid="login-submit"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <button
        type="button"
        onClick={onNavigateRegister}
        style={styles.linkBtn}
        data-testid="goto-register"
      >
        New here? Register as a member →
      </button>
    </section>
  );
}

export default LoginView;
