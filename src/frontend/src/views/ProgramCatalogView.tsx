import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import type { Program } from "../types";

type Props = {
  onBack: () => void;
  onViewEnrollment: (programId: string) => void;
};

type ViewState =
  | { status: "loading"; programs: Program[]; message: null }
  | { status: "ready"; programs: Program[]; message: null }
  | { status: "error"; programs: Program[]; message: string };

const styles = {
  page: {
    maxWidth: "62rem",
    margin: "2.5rem auto",
    padding: "0 1.25rem 3rem",
    color: "#172033",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  eyebrow: {
    margin: "0 0 0.35rem",
    color: "#9a3412",
    fontSize: "0.78rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  title: { margin: 0, fontSize: "clamp(2rem, 6vw, 3.5rem)", lineHeight: 1 },
  subtitle: { margin: "0.75rem 0 0", maxWidth: "38rem", color: "#526078" },
  back: {
    padding: "0.65rem 0.9rem",
    border: "1px solid #c8c1b4",
    background: "#fffdf8",
    color: "#172033",
    fontWeight: 700,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
    gap: "1rem",
  },
  card: {
    display: "flex",
    minHeight: "14rem",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    padding: "1.25rem",
    border: "1px solid #d9d2c5",
    background: "#fffdf8",
    boxShadow: "0 12px 30px rgba(67, 55, 38, 0.08)",
  },
  badge: {
    alignSelf: "flex-start",
    padding: "0.25rem 0.55rem",
    background: "#e7efe7",
    color: "#24513b",
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  cardTitle: { margin: "1rem 0 0.4rem", fontSize: "1.35rem" },
  description: { margin: 0, color: "#526078", lineHeight: 1.6 },
  action: {
    width: "100%",
    marginTop: "1.25rem",
    padding: "0.72rem 0.9rem",
    border: "none",
    background: "#9a3412",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  state: {
    padding: "1.25rem",
    border: "1px solid #d9d2c5",
    background: "#fffdf8",
    color: "#526078",
  },
  error: {
    padding: "1rem",
    border: "1px solid #efb0a5",
    background: "#fff4f1",
    color: "#9f2515",
  },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Programs could not be loaded. Please try again.";
}

export function ProgramCatalogView({ onBack, onViewEnrollment }: Props) {
  const [view, setView] = useState<ViewState>({
    status: "loading",
    programs: [],
    message: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiService
      .getProgramsCatalog()
      .then((programs) => {
        if (!cancelled) setView({ status: "ready", programs, message: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setView({
            status: "error",
            programs: [],
            message: getErrorMessage(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={styles.page} aria-labelledby="program-catalog-title">
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>EFCC community</p>
          <h1 id="program-catalog-title" style={styles.title}>
            Programs
          </h1>
          <p style={styles.subtitle}>
            Explore worship gatherings, classes, and fellowship opportunities.
          </p>
        </div>
        <button type="button" onClick={onBack} style={styles.back}>
          Back to profile
        </button>
      </header>

      {view.status === "loading" && (
        <p style={styles.state}>Loading programs…</p>
      )}
      {view.status === "error" && (
        <p role="alert" style={styles.error}>
          {view.message}
        </p>
      )}
      {view.status === "ready" && view.programs.length === 0 && (
        <p style={styles.state}>No programs are available right now.</p>
      )}
      {view.programs.length > 0 && (
        <div style={styles.grid} data-testid="program-catalog-list">
          {view.programs.map((program) => (
            <article key={program.programId} style={styles.card}>
              <div>
                <span style={styles.badge}>
                  {program.type || "Church program"}
                </span>
                <h2 style={styles.cardTitle}>{program.title}</h2>
                <p style={styles.description}>
                  {program.description || "Details will be announced soon."}
                </p>
              </div>
              <button
                type="button"
                style={styles.action}
                onClick={() => onViewEnrollment(program.programId)}
              >
                View Details / Enroll
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default ProgramCatalogView;
