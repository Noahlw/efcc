import { useEffect, useState } from "react";

import { apiService } from "../services/api";
import type { Program } from "../types";

interface Props {
  onBack: () => void;
  onViewEnrollment: (programId: string) => void;
}

type ViewState =
  | { status: "loading"; programs: Program[]; message: null }
  | { status: "ready"; programs: Program[]; message: null }
  | { status: "error"; programs: Program[]; message: string };

const styles = {
  action: {
    background: "#9a3412",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    marginTop: "1.25rem",
    padding: "0.72rem 0.9rem",
    width: "100%",
  },
  back: {
    background: "#fffdf8",
    border: "1px solid #c8c1b4",
    color: "#172033",
    cursor: "pointer",
    fontWeight: 700,
    padding: "0.65rem 0.9rem",
  },
  badge: {
    alignSelf: "flex-start",
    background: "#e7efe7",
    color: "#24513b",
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.05em",
    padding: "0.25rem 0.55rem",
    textTransform: "uppercase" as const,
  },
  card: {
    background: "#fffdf8",
    border: "1px solid #d9d2c5",
    boxShadow: "0 12px 30px rgba(67, 55, 38, 0.08)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    minHeight: "14rem",
    padding: "1.25rem",
  },
  cardTitle: { fontSize: "1.35rem", margin: "1rem 0 0.4rem" },
  description: { color: "#526078", lineHeight: 1.6, margin: 0 },
  error: {
    background: "#fff4f1",
    border: "1px solid #efb0a5",
    color: "#9f2515",
    padding: "1rem",
  },
  eyebrow: {
    color: "#9a3412",
    fontSize: "0.78rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    margin: "0 0 0.35rem",
    textTransform: "uppercase" as const,
  },
  grid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
  },
  header: {
    alignItems: "flex-end",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  page: {
    color: "#172033",
    margin: "2.5rem auto",
    maxWidth: "62rem",
    padding: "0 1.25rem 3rem",
  },
  state: {
    background: "#fffdf8",
    border: "1px solid #d9d2c5",
    color: "#526078",
    padding: "1.25rem",
  },
  subtitle: { color: "#526078", margin: "0.75rem 0 0", maxWidth: "38rem" },
  title: { fontSize: "clamp(2rem, 6vw, 3.5rem)", lineHeight: 1, margin: 0 },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Programs could not be loaded. Please try again.";
}

export function ProgramCatalogView({ onBack, onViewEnrollment }: Props) {
  const [view, setView] = useState<ViewState>({
    message: null,
    programs: [],
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    const fetchPrograms = async () => {
      try {
        const programs = await apiService.getProgramsCatalog();
        if (!cancelled) {
          setView({ message: null, programs, status: "ready" });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setView({
            message: getErrorMessage(error),
            programs: [],
            status: "error",
          });
        }
      }
    };
    void fetchPrograms();
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
