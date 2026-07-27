// Member self-registration form.
// Matches existing Apps Script member registration fields: Name, Username, PIN, Phone, Address.
import { useState, type FormEvent } from "react";
import { apiService } from "../services/api";
import type { RegisterPayload } from "../types";

type Props = {
  onCancel: () => void;
  onRegistered: () => void;
};

type Status = "idle" | "submitting" | "error" | "success";

const styles = {
  card: {
    maxWidth: "30rem",
    margin: "3rem auto",
    padding: "2rem",
    borderRadius: "0.75rem",
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, sans-serif",
  },
  title: { margin: "0 0 0.25rem", fontSize: "1.5rem", color: "#0f172a" },
  subtitle: { margin: "0 0 1.5rem", color: "#475569", fontSize: "0.95rem" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" },
  field: { display: "block", marginBottom: "0.85rem" },
  label: {
    display: "block",
    marginBottom: "0.25rem",
    color: "#1e293b",
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  input: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid #cbd5e1",
    fontSize: "1rem",
    boxSizing: "border-box" as const,
    background: "#f8fafc",
    color: "#0f172a",
  },
  textarea: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid #cbd5e1",
    fontSize: "1rem",
    boxSizing: "border-box" as const,
    background: "#f8fafc",
    color: "#0f172a",
    minHeight: "4.5rem",
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  error: {
    margin: "0.5rem 0 1rem",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: "0.9rem",
  },
  success: {
    margin: "0.5rem 0 1rem",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    fontSize: "0.9rem",
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  primary: {
    flex: 1,
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
  },
  primaryDisabled: { background: "#94a3b8", cursor: "not-allowed" },
  ghost: {
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1e293b",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
  },
};

function validate(payload: RegisterPayload): string | null {
  if (!payload.name.trim()) return "Name is required.";
  if (!payload.username.trim()) return "Username is required.";
  if (!/^\d{4}$/.test(payload.pin)) return "PIN must be exactly 4 digits.";
  if (payload.pin.replace(/\D/g, "").length !== 4)
    return "PIN must be digits only.";
  if (!payload.phone || !payload.phone.trim()) return "Phone is required.";
  if (!payload.address || !payload.address.trim())
    return "Address is required.";
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
      name: name.trim(),
      username: username.trim(),
      pin: pin.replace(/\D/g, ""),
      phone: phone.trim(),
      address: address.trim(),
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
    } catch (caught: unknown) {
      const message =
        caught instanceof Error
          ? caught.message
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
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
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
          <div
            role="status"
            style={styles.success}
            data-testid="register-success"
          >
            Registration complete. Redirecting to sign in…
          </div>
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
