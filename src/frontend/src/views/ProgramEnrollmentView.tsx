import { useEffect, useRef, useState } from "react";

import { apiService } from "../services/api";
import type { ProgramWithEnrollment } from "../types";

interface Props {
  currentUserId: string;
  initialProgramId?: string;
  onBack: () => void;
}

type Feedback = { kind: "success" | "error"; message: string } | null;

const styles = {
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.55rem",
    minWidth: "10.5rem",
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
    background: "#e7efe7",
    color: "#24513b",
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.05em",
    padding: "0.25rem 0.55rem",
    textTransform: "uppercase" as const,
  },
  cancel: {
    background: "transparent",
    border: "1px solid #a83a2a",
    color: "#9f2515",
    cursor: "pointer",
    fontWeight: 800,
    padding: "0.72rem 0.9rem",
  },
  card: {
    alignItems: "center",
    background: "#fffdf8",
    border: "1px solid #d9d2c5",
    boxShadow: "0 12px 30px rgba(67, 55, 38, 0.07)",
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    padding: "1.25rem",
  },
  cardFeatured: {
    borderColor: "#9a3412",
    boxShadow: "0 12px 32px rgba(154, 52, 18, 0.14)",
  },
  cardTitle: { fontSize: "1.35rem", margin: "0.8rem 0 0.35rem" },
  cardTop: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.6rem",
  },
  description: {
    color: "#526078",
    lineHeight: 1.6,
    margin: 0,
    maxWidth: "42rem",
  },
  enrolled: {
    background: "#d8eee2",
    color: "#14532d",
    fontSize: "0.78rem",
    fontWeight: 800,
    padding: "0.25rem 0.55rem",
  },
  error: {
    background: "#fff4f1",
    border: "1px solid #efb0a5",
    color: "#9f2515",
    marginBottom: "1rem",
    padding: "0.8rem 1rem",
  },
  eyebrow: {
    color: "#24513b",
    fontSize: "0.78rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    margin: "0 0 0.35rem",
    textTransform: "uppercase" as const,
  },
  header: {
    alignItems: "flex-end",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  list: { display: "grid", gap: "1rem" },
  notEnrolled: {
    border: "1px solid #c8c1b4",
    color: "#526078",
    fontSize: "0.78rem",
    fontWeight: 700,
    padding: "0.25rem 0.55rem",
  },
  page: {
    color: "#172033",
    margin: "2.5rem auto",
    maxWidth: "62rem",
    padding: "0 1.25rem 3rem",
  },
  primary: {
    background: "#9a3412",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    padding: "0.72rem 0.9rem",
  },
  primaryDisabled: { background: "#a9afb8", cursor: "not-allowed" },
  state: {
    background: "#fffdf8",
    border: "1px solid #d9d2c5",
    color: "#526078",
    padding: "1.25rem",
  },
  subtitle: { color: "#526078", margin: "0.75rem 0 0", maxWidth: "40rem" },
  success: {
    background: "#eef9f2",
    border: "1px solid #8fc9a9",
    color: "#14532d",
    marginBottom: "1rem",
    padding: "0.8rem 1rem",
  },
  title: { fontSize: "clamp(2rem, 6vw, 3.5rem)", lineHeight: 1, margin: 0 },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

export function ProgramEnrollmentView({
  currentUserId,
  initialProgramId,
  onBack,
}: Props) {
  const refreshEpochRef = useRef(0);
  const [programs, setPrograms] = useState<ProgramWithEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadPrograms = async (epoch: number): Promise<void> => {
    const availablePrograms =
      await apiService.getAvailablePrograms(currentUserId);
    if (epoch !== refreshEpochRef.current) {
      return;
    }
    setPrograms(availablePrograms);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchPrograms = async () => {
      try {
        const availablePrograms =
          await apiService.getAvailablePrograms(currentUserId);
        if (!cancelled) {
          setPrograms(availablePrograms);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setFeedback({ kind: "error", message: getErrorMessage(error) });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void fetchPrograms();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleMutation = async (
    programId: string,
    action: "enroll" | "cancel"
  ): Promise<void> => {
    if (pendingProgramId !== null) {
      return;
    }
    setPendingProgramId(programId);
    setFeedback(null);
    const epochAtStart = refreshEpochRef.current;
    try {
      const result =
        action === "enroll"
          ? await apiService.enrollUser(currentUserId, programId)
          : await apiService.cancelEnrollment(currentUserId, programId);
      if (!result.success) {
        setFeedback({
          kind: "error",
          message: result.message || "The request was rejected.",
        });
        return;
      }
      try {
        const nextEpoch = epochAtStart + 1;
        refreshEpochRef.current = nextEpoch;
        await loadPrograms(nextEpoch);
        setFeedback({
          kind: "success",
          message:
            action === "enroll"
              ? "Enrollment completed."
              : "Enrollment cancelled.",
        });
      } catch (refreshError: unknown) {
        if (refreshEpochRef.current === epochAtStart + 1) {
          refreshEpochRef.current = epochAtStart;
        }
        setFeedback({
          kind: "error",
          message: `Saved on the server, but the schedule could not be refreshed: ${getErrorMessage(refreshError)}`,
        });
      }
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setPendingProgramId(null);
    }
  };

  return (
    <section style={styles.page} aria-labelledby="program-enrollment-title">
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Your schedule</p>
          <h1 id="program-enrollment-title" style={styles.title}>
            Program Enrollment
          </h1>
          <p style={styles.subtitle}>
            Choose a program. The server checks every scheduled event before
            confirming enrollment.
          </p>
        </div>
        <button type="button" onClick={onBack} style={styles.back}>
          Back to catalog
        </button>
      </header>

      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          style={feedback.kind === "error" ? styles.error : styles.success}
        >
          {feedback.message}
        </div>
      )}
      {isLoading && <p style={styles.state}>Loading your programs…</p>}
      {!isLoading && programs.length === 0 && !feedback && (
        <p style={styles.state}>No programs are available right now.</p>
      )}
      {programs.length > 0 && (
        <div style={styles.list} data-testid="program-enrollment-list">
          {programs.map((program) => {
            const isPending = pendingProgramId === program.programId;
            const isFeatured = initialProgramId === program.programId;
            return (
              <article
                key={program.programId}
                style={{
                  ...styles.card,
                  ...(isFeatured ? styles.cardFeatured : {}),
                }}
              >
                <div>
                  <div style={styles.cardTop}>
                    <span style={styles.badge}>
                      {program.type || "Church program"}
                    </span>
                    <span
                      style={
                        program.isEnrolled
                          ? styles.enrolled
                          : styles.notEnrolled
                      }
                    >
                      {program.isEnrolled ? "Enrolled" : "Not enrolled"}
                    </span>
                  </div>
                  <h2 style={styles.cardTitle}>{program.title}</h2>
                  <p style={styles.description}>
                    {program.description || "Details will be announced soon."}
                  </p>
                </div>
                <div style={styles.actions}>
                  <button
                    type="button"
                    disabled={program.isEnrolled || pendingProgramId !== null}
                    style={{
                      ...styles.primary,
                      ...(program.isEnrolled || pendingProgramId !== null
                        ? styles.primaryDisabled
                        : {}),
                    }}
                    onClick={() =>
                      void handleMutation(program.programId, "enroll")
                    }
                  >
                    {isPending && !program.isEnrolled ? "Enrolling…" : "Enroll"}
                  </button>
                  {program.isEnrolled && (
                    <button
                      type="button"
                      disabled={pendingProgramId !== null}
                      style={styles.cancel}
                      onClick={() =>
                        void handleMutation(program.programId, "cancel")
                      }
                    >
                      {isPending ? "Cancelling…" : "Cancel Enrollment"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ProgramEnrollmentView;
