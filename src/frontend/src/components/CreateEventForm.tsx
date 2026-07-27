import { useEffect, useState } from "react";

import { apiService } from "../services/api";
import type { Program, CreateEventPayload, Event } from "../types";

interface Props {
  createdBy: string;
  onCreated: (event: Event) => void;
  onCancel: () => void;
}

function toDdMmYyyy(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

const FORM_STYLE: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: 28,
    width: "90%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  title: {
    margin: "0 0 20px",
    fontSize: 20,
    fontWeight: 600,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    boxSizing: "border-box",
  },
  actions: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 20,
  },
  btnPrimary: {
    padding: "8px 20px",
    borderRadius: 6,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "8px 20px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    fontSize: 14,
    cursor: "pointer",
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 8,
  },
};

export function CreateEventForm({ createdBy, onCreated, onCancel }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    programId: "",
    eventName: "",
    eventDate: "",
    timeSlot: "",
    eventType: "REGULAR" as "REGULAR" | "SPECIAL",
    recurrence: "NONE" as "NONE" | "WEEKLY" | "MONTHLY",
  });

  useEffect(() => {
    apiService
      .getProgramsCatalog()
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  const handleSubmit = async () => {
    if (
      !form.programId ||
      !form.eventName ||
      !form.eventDate ||
      !form.timeSlot
    ) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError("");

    const payload: CreateEventPayload = {
      programId: form.programId,
      eventName: form.eventName,
      eventDate: toDdMmYyyy(form.eventDate),
      timeSlot: form.timeSlot,
      eventType: form.eventType,
      recurrence: form.recurrence,
      createdBy,
    };

    try {
      const result = await apiService.createEvent(payload);
      if (result && result.eventId) {
        onCreated(result);
      } else {
        setError("Failed to create event.");
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={FORM_STYLE.overlay} onClick={onCancel}>
      <div style={FORM_STYLE.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={FORM_STYLE.title}>Create Event</h2>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Program</label>
          <select
            style={FORM_STYLE.select}
            value={form.programId}
            onChange={(e) => setForm({ ...form, programId: e.target.value })}
          >
            <option value="">Select a program...</option>
            {programs.map((p) => (
              <option key={p.programId} value={p.programId}>
                {p.title || p.programId}
              </option>
            ))}
          </select>
        </div>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Event Name</label>
          <input
            style={FORM_STYLE.input}
            value={form.eventName}
            onChange={(e) => setForm({ ...form, eventName: e.target.value })}
            placeholder="e.g. Sunday Service - 01/08/2026"
          />
        </div>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Event Date</label>
          <input
            style={FORM_STYLE.input}
            type="date"
            value={form.eventDate}
            onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
          />
        </div>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Time Slot</label>
          <input
            style={FORM_STYLE.input}
            type="time"
            value={form.timeSlot}
            onChange={(e) => setForm({ ...form, timeSlot: e.target.value })}
          />
        </div>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Event Type</label>
          <select
            style={FORM_STYLE.select}
            value={form.eventType}
            onChange={(e) =>
              setForm({
                ...form,
                eventType: e.target.value as "REGULAR" | "SPECIAL",
              })
            }
          >
            <option value="REGULAR">Regular</option>
            <option value="SPECIAL">Special</option>
          </select>
        </div>

        <div style={FORM_STYLE.field}>
          <label style={FORM_STYLE.label}>Recurrence</label>
          <select
            style={FORM_STYLE.select}
            value={form.recurrence}
            onChange={(e) =>
              setForm({
                ...form,
                recurrence: e.target.value as "NONE" | "WEEKLY" | "MONTHLY",
              })
            }
          >
            <option value="NONE">None</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>

        {error && <div style={FORM_STYLE.error}>{error}</div>}

        <div style={FORM_STYLE.actions}>
          <button
            type="button"
            style={FORM_STYLE.btnSecondary}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            style={FORM_STYLE.btnPrimary}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
