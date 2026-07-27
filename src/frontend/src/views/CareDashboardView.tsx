import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { getSession } from "../services/session";
import type { ActivityProfile, CareDashboardData } from "../types";

type Props = {
  onBack: () => void;
};

type DashboardState =
  | { status: "loading" }
  | { status: "loaded"; data: CareDashboardData }
  | { status: "error"; message: string }
  | { status: "empty" };

type ModalState =
  { open: false } | { open: true; profile: ActivityProfile; loading: boolean };

const THRESHOLD_OPTIONS = [14, 30, 60, 90] as const;

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
    fontFamily: "system-ui, sans-serif",
    padding: "1.5rem",
    maxWidth: "960px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#0f172a" },
  backBtn: {
    background: "#e2e8f0",
    border: "none",
    borderRadius: "8px",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    color: "#475569",
    cursor: "pointer",
    fontWeight: 500,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap" as const,
  },
  label: { fontSize: "0.875rem", color: "#475569", fontWeight: 500 },
  select: {
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "0.875rem",
    background: "#fff",
    color: "#0f172a",
  },
  summaryRow: {
    display: "flex",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap" as const,
  },
  summaryCard: {
    flex: "1 1 160px",
    background: "#fff",
    borderRadius: "10px",
    padding: "1rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    textAlign: "center" as const,
  },
  summaryNumber: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  summaryLabel: { fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" },
  card: {
    background: "#fff",
    borderRadius: "10px",
    padding: "1rem 1.25rem",
    marginBottom: "0.75rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    cursor: "pointer",
    transition: "box-shadow 0.15s",
    border: "1px solid #f1f5f9",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  memberName: { fontSize: "1rem", fontWeight: 600, color: "#0f172a" },
  phoneLink: {
    fontSize: "0.8rem",
    color: "#2563eb",
    textDecoration: "none",
    marginLeft: "0.5rem",
  },
  cardBody: {
    display: "flex",
    gap: "1rem",
    fontSize: "0.8rem",
    color: "#475569",
    flexWrap: "wrap" as const,
  },
  badge: (days: number): React.CSSProperties => {
    let bg = "#fef9c3";
    let text = "#854d0e";
    if (days > 60) {
      bg = "#fee2e2";
      text = "#991b1b";
    } else if (days >= 31) {
      bg = "#fed7aa";
      text = "#9a3412";
    }
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.2rem 0.6rem",
      borderRadius: "9999px",
      fontSize: "0.7rem",
      fontWeight: 600,
      background: bg,
      color: text,
      whiteSpace: "nowrap" as const,
    };
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.15rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.7rem",
    background: "#e0e7ff",
    color: "#3730a3",
    fontWeight: 500,
    marginRight: "0.3rem",
    marginBottom: "0.2rem",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "3rem 1rem",
    color: "#64748b",
  },
  errorState: {
    textAlign: "center" as const,
    padding: "3rem 1rem",
    color: "#991b1b",
    background: "#fee2e2",
    borderRadius: "10px",
  },
  // Modal styles
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: "1rem",
  },
  modal: {
    background: "#fff",
    borderRadius: "14px",
    maxWidth: "540px",
    width: "100%",
    maxHeight: "80vh",
    overflowY: "auto" as const,
    padding: "1.5rem",
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "1rem",
  },
  modalName: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  modalClose: {
    background: "none",
    border: "none",
    fontSize: "1.5rem",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "0.25rem",
    lineHeight: 1,
  },
  sectionTitle: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#334155",
    margin: "1rem 0 0.5rem",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: "0.35rem",
  },
  infoRow: { fontSize: "0.85rem", color: "#475569", marginBottom: "0.35rem" },
  infoLabel: { fontWeight: 500, color: "#334155" },
  progTag: {
    display: "inline-block",
    padding: "0.2rem 0.6rem",
    borderRadius: "6px",
    fontSize: "0.78rem",
    background: "#e0e7ff",
    color: "#3730a3",
    fontWeight: 500,
    margin: "0.2rem 0.25rem 0.2rem 0",
  },
  attRow: {
    fontSize: "0.8rem",
    color: "#475569",
    padding: "0.3rem 0",
    borderBottom: "1px solid #f8fafc",
  },
  spinner: {
    textAlign: "center" as const,
    padding: "2rem",
    color: "#64748b",
  },
};

export function CareDashboardView({ onBack }: Props) {
  const [threshold, setThreshold] = useState<number>(60);
  const [dashboard, setDashboard] = useState<DashboardState>({
    status: "loading",
  });
  const [modal, setModal] = useState<ModalState>({ open: false });

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setDashboard({ status: "error", message: "No active session." });
      return;
    }

    let cancelled = false;
    setDashboard({ status: "loading" });

    void (async () => {
      try {
        const data = await apiService.getCareDashboard(
          threshold,
          session.sessionToken
        );
        if (cancelled) return;
        if (!data || !data.inactiveMembers) {
          setDashboard({
            status: "error",
            message: "Failed to load care dashboard.",
          });
          return;
        }
        if (data.inactiveMembers.length === 0) {
          setDashboard({ status: "empty" });
          return;
        }
        setDashboard({ status: "loaded", data });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unexpected error";
        setDashboard({ status: "error", message: msg });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threshold]);

  const openProfile = async (member: ActivityProfile) => {
    setModal({ open: true, profile: member, loading: true });
    const session = getSession();
    if (!session) return;

    try {
      const fullProfile = await apiService.getUserActivityProfile(
        member.userId,
        session.sessionToken
      );
      if (fullProfile) {
        setModal({ open: true, profile: fullProfile, loading: false });
      } else {
        setModal({ open: true, profile: member, loading: false });
      }
    } catch {
      setModal({ open: true, profile: member, loading: false });
    }
  };

  const closeModal = () => setModal({ open: false });


  return (
    <section style={styles.page} data-testid="care-dashboard">
      <header style={styles.header}>
        <h1 style={styles.title}>Care Dashboard</h1>
        <button
          type="button"
          onClick={onBack}
          style={styles.backBtn}
          data-testid="care-back"
        >
          &larr; Back to Profile
        </button>
      </header>

      <div style={styles.filterBar}>
        <span style={styles.label}>Inactivity Threshold:</span>
        <select
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={styles.select}
          data-testid="threshold-select"
        >
          {THRESHOLD_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} Days
            </option>
          ))}
        </select>
      </div>

      {dashboard.status === "loading" && (
        <div style={styles.spinner} data-testid="dashboard-loading">
          Loading care dashboard…
        </div>
      )}

      {dashboard.status === "empty" && (
        <div style={styles.emptyState} data-testid="dashboard-empty">
          <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#334155" }}>
            All members are active
          </p>
          <p>No inactive members found within the {threshold}-day threshold.</p>
        </div>
      )}

      {dashboard.status === "error" && (
        <div style={styles.errorState} data-testid="dashboard-error">
          {dashboard.message}
        </div>
      )}

      {dashboard.status === "loaded" && (
        <>
          <div style={styles.summaryRow}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryNumber}>
                {dashboard.data.inactiveMembers.length}
              </div>
              <div style={styles.summaryLabel}>Needing Care</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryNumber}>{threshold}</div>
              <div style={styles.summaryLabel}>Day Threshold</div>
            </div>
          </div>

          {dashboard.data.inactiveMembers.map((member) => {
            const daysInactive = member.lastCheckInAt
              ? Math.floor(
                  (Date.now() - new Date(member.lastCheckInAt).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              : threshold + 1;

            return (
              <div
                key={member.userId}
                style={styles.card}
                onClick={() => openProfile(member)}
                data-testid={`member-card-${member.userId}`}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 4px 12px rgba(0,0,0,0.12)";
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                <div style={styles.cardHeader}>
                  <div>
                    <span style={styles.memberName}>{member.name}</span>
                    {member.phone && (
                      <a
                        href={`tel:${member.phone}`}
                        style={styles.phoneLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {member.phone}
                      </a>
                    )}
                  </div>
                  <span style={styles.badge(daysInactive)}>
                    {daysInactive > threshold
                      ? `${daysInactive}d`
                      : `${daysInactive}d`}
                  </span>
                </div>
                <div style={styles.cardBody}>
                  <span>
                    Last active:{" "}
                    {member.lastCheckInAt
                      ? new Date(member.lastCheckInAt).toLocaleDateString()
                      : "Never"}
                  </span>
                  <span>
                    {member.totalCheckIns} check-in
                    {member.totalCheckIns !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {modal.open && (
        <div
          style={styles.overlay}
          onClick={closeModal}
          data-testid="profile-modal-overlay"
        >
          <div
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
            data-testid="profile-modal"
          >
            {modal.loading ? (
              <div style={styles.spinner}>Loading profile…</div>
            ) : (
              <>
                <div style={styles.modalHeader}>
                  <div>
                    <h2 style={styles.modalName}>{modal.profile.name}</h2>
                    <p
                      style={{
                        margin: "0.2rem 0 0",
                        fontSize: "0.8rem",
                        color: "#64748b",
                      }}
                    >
                      ID: {modal.profile.userId}
                    </p>
                    {modal.profile.phone && (
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
                        Phone:{" "}
                        <a
                          href={`tel:${modal.profile.phone}`}
                          style={{ color: "#2563eb" }}
                        >
                          {modal.profile.phone}
                        </a>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={styles.modalClose}
                    data-testid="modal-close"
                  >
                    &times;
                  </button>
                </div>

                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Last Check-in: </span>
                  {modal.profile.lastCheckInAt
                    ? new Date(modal.profile.lastCheckInAt).toLocaleString()
                    : "Never"}
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Total Check-ins: </span>
                  {modal.profile.totalCheckIns}
                </div>

                <div style={styles.sectionTitle}>Enrolled Programs</div>
                {modal.profile.enrolledPrograms.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>None</p>
                ) : (
                  <div>
                    {modal.profile.enrolledPrograms.map((prog) => (
                      <span key={prog.programId} style={styles.progTag}>
                        {prog.title}
                      </span>
                    ))}
                  </div>
                )}

                <div style={styles.sectionTitle}>Recent Attendance</div>
                {modal.profile.attendance.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    No attendance records.
                  </p>
                ) : (
                  <div>
                    {modal.profile.attendance.slice(0, 20).map((att) => (
                      <div key={att.attendanceId} style={styles.attRow}>
                        {att.checkInTime
                          ? new Date(att.checkInTime).toLocaleString()
                          : "Unknown time"}
                        {att.checkInMethod && ` (${att.checkInMethod})`}
                      </div>
                    ))}
                    {modal.profile.attendance.length > 20 && (
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "#94a3b8",
                          marginTop: "0.3rem",
                        }}
                      >
                        Showing 20 of {modal.profile.attendance.length} records.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default CareDashboardView;
