"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import type {
  AttendanceEventSummary,
  AttendanceMember,
} from "@/lib/attendance";
import {
  attendanceEventLabel,
  attendanceEventName,
} from "@/lib/attendance-display";
import {
  attendanceButtonVariants,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  assistedCheckIn,
  searchAttendanceMembers,
} from "@/lib/programs/program-api";
import { useQrCamera } from "@/lib/use-qr-camera";

const inputControl =
  "min-h-11 h-auto min-w-0 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const eventButtonControl =
  "flex w-full min-h-11 flex-col items-start justify-between rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-3 text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:flex-row sm:items-center motion-reduce:transition-none";

type StatusTone = "info" | "success" | "error";

export interface AssistedScannerPanelProps {
  events: readonly AttendanceEventSummary[];
  requestedEventId: string | null;
  contextError?: string | null;
  onEventChange: (eventId: string | null) => void;
  onAuthRequired?: () => void;
}

export const AssistedScannerPanel = ({
  events,
  requestedEventId,
  contextError = null,
  onEventChange,
  onAuthRequired,
}: AssistedScannerPanelProps) => {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [status, setStatus] = useState(contextError ?? "");
  const [tone, setTone] = useState<StatusTone>(contextError ? "error" : "info");
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  const currentEventRef = useRef(requestedEventId);
  const scanEventRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const selectedEvent = events.find(
    (event) => event.event_id === requestedEventId
  );

  const showStatus = (message: string, nextTone: StatusTone = "info") => {
    setStatus(message);
    setTone(nextTone);
  };

  const resetTransient = () => {
    scanEventRef.current = null;
    setQuery("");
    setMembers([]);
    setStatus("");
    setTone("info");
  };

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (value) => {
      const eventId = scanEventRef.current;
      if (!eventId) {
        return;
      }
      stopCamera();
      scanEventRef.current = null;
      void searchAndCheckInQr(eventId, value);
    },
    onUnavailable: () => {
      const message = COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentEventRef.current !== requestedEventId) {
      currentEventRef.current = requestedEventId;
      resetTransient();
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedEventId]);

  useEffect(() => {
    if (members.length > 0) {
      resultsRef.current?.focus();
    }
  }, [members]);
  useEffect(() => {
    if (contextError) {
      showStatus(contextError, "error");
      announce(contextError);
    }
  }, [contextError]);

  const changeContext = (nextEventId: string | null) => {
    resetTransient();
    stopCamera();
    onEventChange(nextEventId);
  };

  function handleAuthError(error: unknown) {
    if (
      error instanceof RpcError &&
      error.problem.code === "AUTH_REQUIRED" &&
      onAuthRequired
    ) {
      onAuthRequired();
      return;
    }
    const message =
      error instanceof RpcError
        ? errorCopyFor(error.problem.code, error.problem.detail)
        : COPY.attendance.assistedAccessError;
    showStatus(message, "error");
    announce(message);
  }

  async function checkIn(
    member: AttendanceMember,
    eventId: string,
    method: "leader_qr_scan" | "leader_manual_search"
  ) {
    setBusy(true);
    try {
      const result = await assistedCheckIn(eventId, member.user_id, method);
      if (!mountedRef.current) {
        return;
      }
      const successMessage =
        result.outcome === "duplicate"
          ? COPY.attendance.duplicate
          : COPY.attendance.success;
      showStatus(
        successMessage,
        result.outcome === "duplicate" ? "info" : "success"
      );
      announce(successMessage);
      setMembers([]);
      setQuery("");
    } catch (error: unknown) {
      if (!mountedRef.current) {
        return;
      }
      handleAuthError(error);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  async function searchAndCheckInQr(eventId: string, qrCode: string) {
    setBusy(true);
    showStatus(COPY.attendance.resolving, "info");
    announce(COPY.attendance.resolving);
    try {
      const { members: matches } = await searchAttendanceMembers(
        eventId,
        qrCode
      );
      if (!mountedRef.current) {
        return;
      }
      if (matches.length === 1) {
        await checkIn(matches[0], eventId, "leader_qr_scan");
      } else if (matches.length > 1) {
        setMembers(matches);
        const message = COPY.attendance.assistedMemberSearchAmbiguous;
        showStatus(message, "error");
        announce(message);
      } else {
        const message = COPY.attendance.memberSearchEmpty;
        showStatus(message, "error");
        announce(message);
      }
    } catch (error: unknown) {
      if (!mountedRef.current) {
        return;
      }
      handleAuthError(error);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  async function searchMembers() {
    if (!selectedEvent) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      showStatus(COPY.attendance.assistedSearchHint, "error");
      searchRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { members: matches } = await searchAttendanceMembers(
        selectedEvent.event_id,
        trimmed
      );
      if (!mountedRef.current) {
        return;
      }
      setMembers(matches);
      if (matches.length === 0) {
        showStatus(COPY.attendance.memberSearchEmpty, "error");
        announce(COPY.attendance.memberSearchEmpty);
      } else {
        const message = COPY.attendance.assistedMembersFound;
        showStatus(message, "info");
        announce(message);
      }
    } catch (error: unknown) {
      if (!mountedRef.current) {
        return;
      }
      handleAuthError(error);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
      <Card
        className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)]"
        role="region"
        aria-labelledby="assisted-scanner-title"
      >
        <h1
          id="assisted-scanner-title"
          className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
        >
          {COPY.sections.scanner}
        </h1>
        <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          {COPY.attendance.assistedHint}
        </p>
        <div
          className="mt-4 grid gap-3 min-w-0"
          aria-label={COPY.attendance.assistedMode}
        >
          <div className="flex flex-wrap gap-3">
            <Button
              className={attendanceButtonVariants({ variant: "primaryFit" })}
              type="button"
              disabled={!selectedEvent || busy || cameraOpen}
              onClick={() => {
                if (selectedEvent) {
                  scanEventRef.current = selectedEvent.event_id;
                  void startCamera();
                }
              }}
            >
              {cameraOpen
                ? COPY.attendance.cameraRetry
                : COPY.attendance.camera}
            </Button>
            {cameraOpen && (
              <Button
                variant="outline"
                className={attendanceButtonVariants({ variant: "secondary" })}
                type="button"
                onClick={() => {
                  scanEventRef.current = null;
                  stopCamera();
                }}
              >
                {COPY.attendance.cameraClose}
              </Button>
            )}
          </div>
          {cameraOpen && (
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-black object-cover"
              muted
              playsInline
              aria-label={COPY.attendance.camera}
            />
          )}
        </div>
        {selectedEvent ? (
          <div className="mt-4 grid gap-3 min-w-0">
            <p className="text-sm text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
              {attendanceEventLabel(selectedEvent)}
              {selectedEvent.location?.trim()
                ? ` · ${COPY.attendance.eventLocation}: ${selectedEvent.location.trim()}`
                : ""}
            </p>
            <form
              className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                void searchMembers();
              }}
            >
              <label
                className="grid min-w-0 gap-1.5"
                htmlFor="assisted-member-search"
              >
                <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                  {COPY.attendance.memberSearch}
                </span>
                <Input
                  ref={searchRef}
                  id="assisted-member-search"
                  className={inputControl}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={COPY.attendance.assistedSearchHint}
                  autoComplete="off"
                />
              </label>
              <Button
                variant="outline"
                className={attendanceButtonVariants({ variant: "secondary" })}
                type="submit"
                disabled={busy}
                aria-busy={busy}
              >
                {COPY.attendance.search}
              </Button>
            </form>
            {members.length > 0 && (
              <ul
                ref={resultsRef}
                className="mt-2 grid gap-2 min-w-0 list-none p-0"
                aria-label={COPY.attendance.memberSearch}
                aria-live="polite"
                tabIndex={-1}
              >
                {members.map((member) => (
                  <li key={member.user_id}>
                    <Button
                      variant="outline"
                      className={eventButtonControl}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void checkIn(
                          member,
                          selectedEvent.event_id,
                          "leader_manual_search"
                        )
                      }
                    >
                      <strong className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                        {member.name}
                      </strong>
                      <span className="text-sm text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                        {member.phone ?? member.user_id}
                      </span>
                      <span className="text-sm font-bold text-[var(--accent)] mt-1 sm:mt-0 shrink-0">
                        {COPY.attendance.checkInMember}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : contextError ? (
          <Alert
            variant="destructive"
            className="text-sm text-[var(--ink-muted)]"
          >
            {contextError}
          </Alert>
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">
            {COPY.attendance.assistedContextRequired}
          </p>
        )}
        <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4">
          <label className="grid gap-1.5" htmlFor="assisted-event-context">
            <span className="text-sm font-bold text-[var(--ink)]">
              {COPY.attendance.assistedContext}
            </span>
            <select
              id="assisted-event-context"
              className={inputControl}
              value={selectedEvent?.event_id ?? ""}
              onChange={(event) => changeContext(event.target.value || null)}
              aria-describedby="assisted-event-context-hint"
            >
              <option value="">—</option>
              {events.map((event) => (
                <option key={event.event_id} value={event.event_id}>
                  {event.program_name} · {attendanceEventName(event)} ·{" "}
                  {hkWallLabel(event.starts_at)}
                </option>
              ))}
            </select>
          </label>
          <p
            id="assisted-event-context-hint"
            className="text-xs text-[var(--ink-muted)]"
          >
            {COPY.attendance.assistedContextHint}
          </p>
        </div>
        <ScannerStatusOutput message={status} tone={tone} />
      </Card>
    </div>
  );
};
