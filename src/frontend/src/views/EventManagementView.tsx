import { useCallback, useEffect, useState } from "react";

import { CreateEventForm } from "../components/CreateEventForm";
import { apiService } from "../services/api";
import type { Event } from "../types";

interface Props {
  grantedUserId: string;
  sessionToken: string;
  onBack: () => void;
}

const MSG_STYLE: Record<string, React.CSSProperties> = {
  container: {
    padding: "16px 20px",
    maxWidth: 720,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
  },
  backBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  createBtn: {
    padding: "8px 18px",
    borderRadius: 6,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  card: {
    background: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 15,
    fontWeight: 600,
    margin: "0 0 4px",
  },
  eventMeta: {
    fontSize: 13,
    color: "#6b7280",
    margin: 0,
  },
  cancelBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #ef4444",
    background: "#fff",
    color: "#ef4444",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  empty: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 14,
    padding: 40,
  },
  banner: {
    padding: "10px 16px",
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
  },
  successBanner: {
    background: "#d1fae5",
    color: "#065f46",
  },
  errorBanner: {
    background: "#fee2e2",
    color: "#991b1b",
  },
};

export function EventManagementView({
  grantedUserId,
  sessionToken,
  onBack,
}: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getGrantedUserEvents(
        grantedUserId,
        sessionToken
      );
      if (res.success && res.data) {
        setEvents(res.data);
      }
    } catch {
      // silently fail; events stay empty
    } finally {
      setLoading(false);
    }
  }, [grantedUserId, sessionToken]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleCreated = (newEvent: Event) => {
    setShowForm(false);
    setBanner({ type: "success", message: "Event created successfully." });
    setEvents((prev) => [newEvent, ...prev].sort(byDate));
  };

  const handleCancel = async (eventId: string) => {
    if (!window.confirm("Are you sure you want to cancel this event?")) {
      return;
    }
    setCancellingId(eventId);
    try {
      const res = await apiService.cancelEvent({
        eventId,
        cancelledBy: grantedUserId,
      });
      if (res.success) {
        setBanner({
          type: "success",
          message: res.message || "Event cancelled.",
        });
        setEvents((prev) => prev.filter((e) => e.eventId !== eventId));
      } else {
        setBanner({
          type: "error",
          message: res.message || "Failed to cancel event.",
        });
      }
    } catch {
      setBanner({
        type: "error",
        message: "An error occurred while cancelling.",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const clearBanner = () => setBanner(null);

  return (
    <div style={MSG_STYLE.container}>
      <div style={MSG_STYLE.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" style={MSG_STYLE.backBtn} onClick={onBack}>
            &larr; Back
          </button>
          <h1 style={MSG_STYLE.title}>Event Management</h1>
        </div>
        <button
          type="button"
          style={MSG_STYLE.createBtn}
          onClick={() => setShowForm(true)}
        >
          + Create Event
        </button>
      </div>

      {banner && (
        <div
          style={{
            ...MSG_STYLE.banner,
            ...(banner.type === "success"
              ? MSG_STYLE.successBanner
              : MSG_STYLE.errorBanner),
          }}
          onClick={clearBanner}
        >
          {banner.message}
        </div>
      )}

      {showForm && (
        <CreateEventForm
          createdBy={grantedUserId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div style={MSG_STYLE.empty}>Loading events...</div>
      ) : events.length === 0 ? (
        <div style={MSG_STYLE.empty}>
          No upcoming events. Click &quot;Create Event&quot; to add one.
        </div>
      ) : (
        events.map((event) => (
          <div key={event.eventId} style={MSG_STYLE.card}>
            <div style={MSG_STYLE.eventInfo}>
              <p style={MSG_STYLE.eventName}>{event.eventName}</p>
              <p style={MSG_STYLE.eventMeta}>
                {event.eventDate} at {event.timeSlot}
                {event.programName ? ` \u00b7 ${event.programName}` : ""}
                {event.eventType === "SPECIAL" ? " \u00b7 Special" : ""}
              </p>
            </div>
            <button
              type="button"
              style={MSG_STYLE.cancelBtn}
              onClick={() => handleCancel(event.eventId)}
              disabled={cancellingId === event.eventId}
            >
              {cancellingId === event.eventId ? "..." : "Cancel"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function byDate(a: Event, b: Event): number {
  const da = a.eventDate.split("/");
  const db = b.eventDate.split("/");
  if (da.length === 3 && db.length === 3) {
    return (
      new Date(
        parseInt(da[2], 10),
        parseInt(da[1], 10) - 1,
        parseInt(da[0], 10)
      ).getTime() -
      new Date(
        parseInt(db[2], 10),
        parseInt(db[1], 10) - 1,
        parseInt(db[0], 10)
      ).getTime()
    );
  }
  return a.eventDate.localeCompare(b.eventDate);
}
