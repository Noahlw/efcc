// Member self-registration form.
// Matches existing Apps Script member registration fields: Name, Username, PIN, Phone, Address.
import { useState } from "react";
import type { FormEvent } from "react";

import { apiService } from "../services/api";
import type { RegisterPayload } from "../types";

interface Props {
  onCancel: () => void;
  onRegistered: () => void;
}

type Status = "idle" | "submitting" | "error" | "success";

const styles = {
  actions: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  card: {
    background: "#fff",
    borderRadius: "0.75rem",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, sans-serif",
    margin: "3rem auto",
    maxWidth: "30rem",
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
  ghost: {
    background: "#fff",
    border: "1px solid #cbd5e1",
    borderRadius: "0.5rem",
    color: "#1e293b",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    padding: "0.75rem 1rem",
  },
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
  primary: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: "0.5rem",
    color: "#fff",
    cursor: "pointer",
    flex: 1,
    fontSize: "1rem",
    fontWeight: 600,
    padding: "0.75rem",
  },
  primaryDisabled: { background: "#94a3b8", cursor: "not-allowed" },
  row: { display: "grid", gap: "0.85rem", gridTemplateColumns: "1fr 1fr" },
  subtitle: { color: "#475569", fontSize: "0.95rem", margin: "0 0 1.5rem" },
  success: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "0.5rem",
    color: "#047857",
    fontSize: "0.9rem",
    margin: "0.5rem 0 1rem",
    padding: "0.6rem 0.75rem",
  },
  textarea: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "0.5rem",
    boxSizing: "border-box" as const,
    color: "#0f172a",
    fontFamily: "inherit",
    fontSize: "1rem",
    minHeight: "4.5rem",
    padding: "0.6rem 0.75rem",
    resize: "vertical" as const,
    width: "100%",
  },
  title: { color: "#0f172a", fontSize: "1.5rem", margin: "0 0 0.25rem" },
};

function validate(payload: RegisterPayload): string | null {
  if (!payload.name.trim()) {
    return "Name is required.";
  }
  if (!payload.username.trim()) {
    return "Username is required.";
  }
  if (!/^\d{4}$/u.test(payload.pin)) {
    return "PIN must be exactly 4 digits.";
  }
  if (payload.pin.replaceAll(/\D/gu, "").length !== 4) {
    return "PIN must be digits only.";
  }
  if (!payload.phone || !payload.phone.trim()) {
    return "Phone is required.";
  }
  if (!payload.address || !payload.address.trim()) {
    return "Address is required.";
  }
  return null;
}

export function MemberRegistrationView({ onCancel, onRegistered }: Props) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: RegisterPayload = {
      address: address.trim(),
      name: name.trim(),
      phone: phone.trim(),
      pin: pin.replaceAll(/\D/gu, ""),
      username: username.trim(),
    };
    const validationError = validate(payload);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const response = await apiService.registerUser(payload);
      if (!response.success) {
        setError(response.message ?? "Registration failed.");
        setStatus("error");
        return;
      }
      setStatus("success");
      // Give the user a moment to read the success banner, then navigate.
      window.setTimeout(onRegistered, 1200);
    } catch (registerError: unknown) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "Registration failed. Please try again.";
      setError(message);
      setStatus("error");
    }
  };

  const submitting = status === "submitting" || status === "success";
  const submitStyle = {
    ...styles.primary,
    ...(submitting ? styles.primaryDisabled : {}),
  };

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>Register as a Member</h1>
      <p style={styles.subtitle}>
        Create your account. Your username and PIN let you sign in.
      </p>
      <form onSubmit={submit} noValidate>
        <label style={styles.field}>
          <span style={styles.label}>Full Name</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={styles.input}
            data-testid="register-name"
            disabled={submitting}
          />
        </label>
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.label}>Username</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              style={styles.input}
              data-testid="register-username"
              disabled={submitting}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>4-Digit PIN</span>
            <input
              type="password"
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="new-password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replaceAll(/\D/gu, "").slice(0, 4))
              }
              style={styles.input}
              data-testid="register-pin"
              disabled={submitting}
            />
          </label>
        </div>
        <label style={styles.field}>
          <span style={styles.label}>Phone</span>
          <input
            type="tel"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            style={styles.input}
            data-testid="register-phone"
            disabled={submitting}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Address</span>
          <textarea
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            style={styles.textarea}
            data-testid="register-address"
            disabled={submitting}
          />
        </label>
        {status === "error" && error && (
          <div role="alert" style={styles.error} data-testid="register-error">
            {error}
          </div>
        )}
        {status === "success" && (
          <output style={styles.success} data-testid="register-success">
            Registration complete. Redirecting to sign in…
          </output>
        )}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onCancel}
            style={styles.ghost}
            data-testid="register-cancel"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={submitStyle}
            data-testid="register-submit"
          >
            {submitting ? "Submitting…" : "Create Account"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default MemberRegistrationView;
