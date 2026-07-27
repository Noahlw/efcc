import { useEffect, useRef, useState } from "react";

// Member profile / dashboard view.
// On mount, validates cached session via api_getCurrentSession; renders role badge +
// "Show My QR Pass" + "Logout" controls.
import { apiService } from "../services/api";
import {
  clearSession,
  getSession,
  setSession,
} from "../services/session";
import type { SessionPayload } from "../types";
import type { Role } from "../types";
import { MemberPassModal } from "../components/MemberPassModal";

type Props = {
  onLogout: () => void;
  onOpenPrograms: () => void;
  onOpenEvents?: () => void;
  onOpenScanner?: () => void;
  onOpenCareDashboard?: () => void;
};
type ViewState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "ready"; session: SessionPayload; serverConfirmed: boolean };

const ROLES: ReadonlyArray<Role> = ["ADMIN", "STAFF", "EVENT_LEADER", "MEMBER"];
const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  STAFF: "Staff",
  EVENT_LEADER: "Event Leader",
  MEMBER: "Member",
};

const styles = {
  page: {
    maxWidth: "32rem",
    margin: "3rem auto",
    padding: "2rem",
    borderRadius: "0.75rem",
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, sans-serif",
    color: "#0f172a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  tab: {
    padding: "0.45rem 0.7rem",
    borderRadius: "0.5rem",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1e293b",
    fontWeight: 700,
    cursor: "pointer",
  },
  name: { margin: 0, fontSize: "1.5rem", fontWeight: 700 },
  id: { margin: "0.25rem 0 0", color: "#475569", fontSize: "0.85rem" },
  badge: (role: Role) => ({
    display: "inline-block",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#fff",
    background:
      role === "ADMIN"
        ? "#b91c1c"
        : role === "STAFF"
          ? "#1d4ed8"
          : role === "EVENT_LEADER"
            ? "#7c3aed"
            : "#0f766e",
  }),
  infoCard: {
    borderRadius: "0.5rem",
    background: "#f1f5f9",
    padding: "1rem",
    marginBottom: "1.5rem",
  },
  infoLabel: {
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    color: "#64748b",
    letterSpacing: "0.05em",
    marginBottom: "0.25rem",
  },
  infoValue: { fontSize: "0.95rem", color: "#0f172a" },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
  },
  primary: {
    padding: "0.85rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
  },
  ghost: {
    padding: "0.85rem",
    borderRadius: "0.5rem",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1e293b",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
  },
  warning: {
    marginTop: "0.75rem",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    fontSize: "0.85rem",
  },
};

function normalizeRole(raw: string | undefined | null): Role {
  if (!raw) return "MEMBER";
  const upper = raw.trim().toUpperCase();
  if (ROLES.includes(upper as Role)) return upper as Role;
  return "MEMBER";
}

async function verifyWithServer(
  cached: SessionPayload
): Promise<SessionPayload | null> {
  try {
    const response = await apiService.getCurrentSession(
      cached.userId,
      cached.sessionToken
    );
    if (response.success && response.data) {
      // Server is authoritative — refresh role/expiry from server response.
      const next: SessionPayload = {
        userId: response.data.userId,
        name: response.data.name,
        role: normalizeRole(response.data.role),
        sessionToken: response.data.sessionToken,
        qrCodeString: response.data.qrCodeString,
        expiryTimestamp: response.data.expiryTimestamp,
      };
      setSession(next);
      return next;
    }
    return null;
  } catch {
    return null;
  }
}
export function MyProfileView({ onLogout, onOpenPrograms, onOpenEvents, onOpenScanner, onOpenCareDashboard }: Props) {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [showPass, setShowPass] = useState(false);
  const logoutInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const cached = getSession();
    if (!cached) {
      setView({ status: "unauthenticated" });
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const session = await verifyWithServer(cached);
      if (cancelled) return;
      if (session) {
        setView({ status: "ready", session, serverConfirmed: true });
      } else {
        clearSession();
        setView({ status: "unauthenticated" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    const cached = getSession();
    try {
      if (cached) {
        await apiService.logoutUser(cached.userId, cached.sessionToken);
      }
    } catch {
      // Even if server-side logout fails, clear local state.
    }
    clearSession();
    logoutInFlight.current = false;
    onLogout();
  };

  if (view.status === "loading") {
    return (
      <section style={styles.page} data-testid="profile-loading">
        <p>Checking your session…</p>
      </section>
    );
  }

  if (view.status === "unauthenticated") {
    return (
      <section style={styles.page} data-testid="profile-unauthenticated">
        <h1 style={styles.name}>Session expired</h1>
        <p style={styles.id}>Please sign in again.</p>
      </section>
    );
  }

  const { session, serverConfirmed } = view;
  const role = normalizeRole(session.role);
  const roleLabel = ROLE_LABELS[role];

  return (
    <section style={styles.page} data-testid="profile-ready">
      <header style={styles.header}>
        <div>
          <h1 style={styles.name}>{session.name}</h1>
          <p style={styles.id}>Member ID: {session.userId}</p>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={onOpenPrograms}
            style={styles.tab}
            data-testid="programs-tab"
          >
            Programs
          </button>
          {role !== "MEMBER" && onOpenEvents && (
            <button
              type="button"
              onClick={onOpenEvents}
              style={styles.tab}
              data-testid="events-tab"
            >
              Manage Events
            </button>
          )}
          {role !== "MEMBER" && onOpenScanner && (
            <button
              type="button"
              onClick={onOpenScanner}
              style={styles.tab}
              data-testid="scanner-tab"
            >
              Scan Attendance
            </button>
          )}
          {(role === "STAFF" || role === "ADMIN") && onOpenCareDashboard && (
            <button
              type="button"
              onClick={onOpenCareDashboard}
              style={styles.tab}
              data-testid="care-dashboard-tab"
            >
              Care Dashboard
            </button>
          )}
          <span
            data-testid="role-badge"
            data-role={role}
            style={styles.badge(role)}
          >
            {roleLabel}
          </span>
        </div>
      </header>
      <div style={styles.infoCard}>
        <div style={styles.infoLabel}>Session expires</div>
        <div style={styles.infoValue}>
          {new Date(session.expiryTimestamp).toLocaleDateString()} (
          {Math.max(
            0,
            Math.ceil(
              (session.expiryTimestamp - Date.now()) / (24 * 60 * 60 * 1000)
            )
          )}{" "}
          days)
        </div>
      </div>
      {!serverConfirmed && (
        <div style={styles.warning} data-testid="profile-offline-banner">
          Server verification offline — showing cached session.
        </div>
      )}
      <div style={styles.actions}>
        <button
          type="button"
          onClick={() => setShowPass(true)}
          style={styles.primary}
          data-testid="show-pass"
        >
          Show My QR Pass
        </button>
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          style={styles.ghost}
          data-testid="logout"
        >
          Logout
        </button>
      </div>
      {showPass && (
        <MemberPassModal
          memberName={session.name}
          qrCodeString={session.qrCodeString}
          onClose={() => setShowPass(false)}
        />
      )}
    </section>
  );
}

export default MyProfileView;
