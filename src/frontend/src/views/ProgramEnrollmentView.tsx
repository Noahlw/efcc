import { useEffect, useRef, useState } from "react";
import { apiService } from "../services/api";
import type { ProgramWithEnrollment } from "../types";

type Props = {
  currentUserId: string;
  initialProgramId?: string;
  onBack: () => void;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

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
    color: "#24513b",
    fontSize: "0.78rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  title: { margin: 0, fontSize: "clamp(2rem, 6vw, 3.5rem)", lineHeight: 1 },
  subtitle: { margin: "0.75rem 0 0", maxWidth: "40rem", color: "#526078" },
  back: {
    padding: "0.65rem 0.9rem",
    border: "1px solid #c8c1b4",
    background: "#fffdf8",
    color: "#172033",
    fontWeight: 700,
    cursor: "pointer",
  },
  list: { display: "grid", gap: "1rem" },
  card: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "1.25rem",
    alignItems: "center",
    padding: "1.25rem",
    border: "1px solid #d9d2c5",
    background: "#fffdf8",
    boxShadow: "0 12px 30px rgba(67, 55, 38, 0.07)",
  },
  cardFeatured: {
    borderColor: "#9a3412",
    boxShadow: "0 12px 32px rgba(154, 52, 18, 0.14)",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    flexWrap: "wrap" as const,
  },
  badge: {
    padding: "0.25rem 0.55rem",
    background: "#e7efe7",
    color: "#24513b",
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  enrolled: {
    padding: "0.25rem 0.55rem",
    background: "#d8eee2",
    color: "#14532d",
    fontSize: "0.78rem",
    fontWeight: 800,
  },
  notEnrolled: {
    padding: "0.25rem 0.55rem",
    border: "1px solid #c8c1b4",
    color: "#526078",
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  cardTitle: { margin: "0.8rem 0 0.35rem", fontSize: "1.35rem" },
  description: {
    margin: 0,
    maxWidth: "42rem",
    color: "#526078",
    lineHeight: 1.6,
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.55rem",
    minWidth: "10.5rem",
  },
  primary: {
    padding: "0.72rem 0.9rem",
    border: "none",
    background: "#9a3412",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryDisabled: { background: "#a9afb8", cursor: "not-allowed" },
  cancel: {
    padding: "0.72rem 0.9rem",
    border: "1px solid #a83a2a",
    background: "transparent",
    color: "#9f2515",
    fontWeight: 800,
    cursor: "pointer",
  },
  state: {
    padding: "1.25rem",
    border: "1px solid #d9d2c5",
    background: "#fffdf8",
    color: "#526078",
  },
  success: {
    marginBottom: "1rem",
    padding: "0.8rem 1rem",
    border: "1px solid #8fc9a9",
    background: "#eef9f2",
    color: "#14532d",
  },
  error: {
    marginBottom: "1rem",
    padding: "0.8rem 1rem",
    border: "1px solid #efb0a5",
    background: "#fff4f1",
    color: "#9f2515",
  },
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
    const availablePrograms = await apiService.getAvailablePrograms(
      currentUserId
    );
    if (epoch !== refreshEpochRef.current) return;
    setPrograms(availablePrograms);
  };

  useEffect(() => {
    let cancelled = false;
    void apiService
      .getAvailablePrograms(currentUserId)
      .then((availablePrograms) => {
        if (!cancelled) setPrograms(availablePrograms);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFeedback({ kind: "error", message: getErrorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleMutation = async (
    programId: string,
    action: "enroll" | "cancel"
  ): Promise<void> => {
    if (pendingProgramId !== null) return;
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
