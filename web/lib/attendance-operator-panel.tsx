"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RpcError } from "@/lib/api";
import { attendanceEventName } from "@/lib/attendance-display";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  assistedCheckIn,
  correctGuestAttendance,
  listAttendanceRoster,
  listScannerEvents,
  searchAttendanceMembers,
  voidAttendance,
} from "@/lib/programs/program-api";
import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceMember,
  AttendanceRow,
} from "@/lib/programs/program-api";
import { useQrCamera } from "@/lib/use-qr-camera";

import styles from "./attendance-panel.module.css";

const primaryControl = `${styles.button} min-h-11 h-auto rounded-[var(--radius-sm)] px-4 py-3 text-base font-extrabold`;
const secondaryControl = `${styles.buttonSecondary} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`;
const dangerControl = `${styles.buttonDanger} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--error)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--error)] hover:bg-[var(--error-surface)] hover:text-[var(--error)]`;
const inputControl = `${styles.input} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`;
const eventButtonControl = `${styles.eventButton} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`;
const backControl = `${styles.back} min-h-11 h-auto px-2 py-3 text-base font-bold text-[var(--accent-deep)] hover:bg-transparent hover:text-[var(--accent)]`;

type StatusTone = "info" | "success" | "error";

type MemberDirectory = Readonly<Record<string, AttendanceMember>>;

export interface AttendanceChooserProps {
  events: readonly AttendanceEventSummary[];
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  onSelect: (eventId: string) => void;
  onRetry?: () => void;
}

/**
 * Cross-program attendance entry point. The server owns the authorized,
 * currently-open projection; the client never asks an operator to paste an ID.
 */
export const AttendanceChooser = ({
  events,
  loading = false,
  busy = false,
  error = null,
  onSelect,
  onRetry,
}: AttendanceChooserProps) => {
  return (
    <Card
      className={styles.chooser}
      role="region"
      aria-labelledby="attendance-chooser-title"
    >
      <h1 id="attendance-chooser-title" className={styles.title}>
        {COPY.attendance.chooserTitle}
      </h1>
      <p className={styles.lead}>{COPY.attendance.chooserLead}</p>
      <h2 className={styles.sectionTitle}>
        {COPY.attendance.chooserOpenMeetings}
      </h2>

      {loading && (
        <output
          className={styles.chooserLoading}
          aria-busy="true"
          aria-live="polite"
        >
          <Skeleton className="h-3 w-24" aria-hidden="true" />
          <span>{COPY.management.loading}</span>
        </output>
      )}

      {error && !loading && (
        <Alert variant="destructive" className={styles.chooserError}>
          <p>{error}</p>
          {onRetry && (
            <Button
              variant="outline"
              className={secondaryControl}
              type="button"
              onClick={onRetry}
              disabled={busy}
            >
              {COPY.management.retry}
            </Button>
          )}
        </Alert>
      )}

      {!loading && !error && events.length === 0 && (
        <output className={styles.chooserEmpty} aria-live="polite">
          {COPY.attendance.chooserEmpty}
        </output>
      )}

      {!loading && !error && events.length > 0 && (
        <ul
          className={styles.events}
          aria-label={COPY.attendance.chooserOpenMeetings}
        >
          {events.map((event) => (
            <li key={event.event_id}>
              <Button
                variant="outline"
                className={eventButtonControl}
                type="button"
                disabled={busy}
                onClick={() => onSelect(event.event_id)}
              >
                <span className={styles.eventCopy}>
                  <strong>{attendanceEventName(event)}</strong>
                  <span className={styles.eventMeta}>
                    {hkWallLabel(event.starts_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </span>
                <span className={styles.rowAction}>
                  {COPY.attendance.rosterTitle}
                </span>
                <svg
                  className={styles.chevron}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export interface AttendanceRosterProps {
  event: AttendanceEvent;
  rows: readonly AttendanceRow[];
  memberDirectory?: MemberDirectory;
  busy?: boolean;
  onBack?: () => void;
  onVoid?: (row: AttendanceRow, reason: string) => Promise<boolean> | boolean;
  onCorrectGuest?: (
    row: AttendanceRow,
    input: { name: string; phone: string; reason: string }
  ) => Promise<boolean> | boolean;
  onPrint?: () => void;
  onExport?: () => void;
}

function rowLabel(
  row: AttendanceRow,
  memberDirectory: MemberDirectory
): string {
  if (row.guest_name?.trim()) {
    return row.guest_name;
  }
  if (row.member_user_id && memberDirectory[row.member_user_id]?.name) {
    return memberDirectory[row.member_user_id].name;
  }
  return row.member_user_id ?? COPY.attendance.guestName;
}

function rowPhone(
  row: AttendanceRow,
  memberDirectory: MemberDirectory
): string | null {
  return (
    row.guest_phone ??
    (row.member_user_id
      ? (memberDirectory[row.member_user_id]?.phone ?? null)
      : null)
  );
}

const EMPTY_MEMBER_DIRECTORY: MemberDirectory = {};

function updateAttendanceEventUrl(nextEventId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (nextEventId) {
    url.searchParams.set("event", nextEventId);
    url.searchParams.delete("eventId");
  } else {
    url.searchParams.delete("event");
    url.searchParams.delete("eventId");
  }
  window.history.replaceState(null, "", url);
}

function printAttendanceRoster() {
  if (typeof window !== "undefined") {
    window.print();
  }
}

/** Roster header, live count, record-preserving operations, and print sheet. */
export const AttendanceRoster = ({
  event,
  rows,
  memberDirectory = EMPTY_MEMBER_DIRECTORY,
  busy = false,
  onBack,
  onVoid,
  onCorrectGuest,
  onPrint,
  onExport,
}: AttendanceRosterProps) => {
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionName, setCorrectionName] = useState("");
  const [correctionPhone, setCorrectionPhone] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const voidInputRef = useRef<HTMLInputElement>(null);
  const correctionHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (voidingId) {
      voidInputRef.current?.focus();
    }
  }, [voidingId]);

  useEffect(() => {
    if (correctionId) {
      correctionHeadingRef.current?.focus();
    }
  }, [correctionId]);

  const activeRows = rows.filter((row) => row.status === "Active");
  const statusIsOpen =
    event.status === "Active" && event.availability === "Active";
  const eventTitle = event.name?.trim() || event.program_name;

  async function submitVoid(row: AttendanceRow) {
    const reason = voidReason.trim();
    if (!reason || !onVoid) {
      return;
    }
    const saved = await onVoid(row, reason);
    if (saved) {
      setVoidingId(null);
      setVoidReason("");
    }
  }

  async function submitCorrection(row: AttendanceRow) {
    const input = {
      name: correctionName.trim(),
      phone: correctionPhone.trim(),
      reason: correctionReason.trim(),
    };
    if (!input.name || !input.phone || !input.reason || !onCorrectGuest) {
      return;
    }
    const saved = await onCorrectGuest(row, input);
    if (saved) {
      setCorrectionId(null);
      setCorrectionName("");
      setCorrectionPhone("");
      setCorrectionReason("");
    }
  }

  return (
    <>
      <header className={styles.rosterHeader}>
        <div className={styles.rosterHeaderTopline}>
          {onBack && (
            <Button
              variant="link"
              className={backControl}
              type="button"
              onClick={onBack}
              disabled={busy}
            >
              {COPY.attendance.chooseEvent}
            </Button>
          )}
          <Badge
            variant="outline"
            className={`${styles.statusBadge} ${
              statusIsOpen ? styles.statusBadgeActive : styles.statusBadgeMuted
            }`}
          >
            {statusIsOpen
              ? COPY.attendance.rosterStatusActive
              : event.status === "Cancelled"
                ? COPY.attendance.eventCancelled
                : COPY.attendance.eventClosed}
          </Badge>
        </div>
        <div className={styles.rosterHeadingRow}>
          <div>
            <h1 className={styles.title}>{COPY.attendance.rosterTitle}</h1>
            <p className={styles.lead}>
              {eventTitle}
              {event.location ? ` · ${event.location}` : ""}
              {` · ${hkWallLabel(event.starts_at)}`}
            </p>
          </div>
          <p className={styles.rosterCount} aria-live="polite">
            <strong>
              {COPY.attendance.checkedInCount(activeRows.length, rows.length)}
            </strong>
          </p>
        </div>
        <div className={styles.actionsRow}>
          {onPrint && (
            <Button
              variant="outline"
              className={secondaryControl}
              type="button"
              onClick={onPrint}
              disabled={busy}
            >
              {COPY.attendance.printSheet}
            </Button>
          )}
          {onExport && (
            <Button
              variant="outline"
              className={secondaryControl}
              type="button"
              onClick={onExport}
              disabled={busy}
            >
              {COPY.attendance.exportSheet}
            </Button>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <output className={styles.chooserEmpty} aria-live="polite">
          {COPY.programs.eventNoParticipants}
        </output>
      ) : (
        <ul
          className={styles.rosterList}
          aria-label={COPY.attendance.rosterTitle}
        >
          {rows.map((row) => {
            const phone = rowPhone(row, memberDirectory);
            const displayPhone =
              phone && row.member_user_id
                ? COPY.attendance.maskedPhone(phone)
                : phone;
            const isVoiding = voidingId === row.attendance_id;
            const isCorrecting = correctionId === row.attendance_id;
            return (
              <li className={styles.rowCard} key={row.attendance_id}>
                <div className={styles.rowHeader}>
                  <div>
                    <strong className={styles.rowName}>
                      {rowLabel(row, memberDirectory)}
                    </strong>
                    <p className={styles.eventMeta}>
                      {displayPhone ?? COPY.attendance.method[row.method]}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${styles.pill} ${
                      row.status === "Active"
                        ? styles.pillActive
                        : styles.pillMuted
                    }`}
                  >
                    {COPY.attendance.status[row.status]}
                  </Badge>
                </div>

                {row.status === "Voided" && row.void_reason && (
                  <p className={styles.voidNote}>{row.void_reason}</p>
                )}

                {row.status === "Active" && (
                  <div className={styles.actionsRow}>
                    <Button
                      variant="outline"
                      className={dangerControl}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setVoidingId(row.attendance_id);
                        setVoidReason("");
                        setCorrectionId(null);
                      }}
                    >
                      {COPY.attendance.voidAttendance}
                    </Button>
                    {row.member_user_id === null && (
                      <Button
                        variant="outline"
                        className={secondaryControl}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCorrectionId(row.attendance_id);
                          setCorrectionName(row.guest_name ?? "");
                          setCorrectionPhone(row.guest_phone ?? "");
                          setCorrectionReason("");
                          setVoidingId(null);
                        }}
                      >
                        {COPY.attendance.correctGuest}
                      </Button>
                    )}
                  </div>
                )}

                {isVoiding && (
                  <form
                    className={styles.operationPanel}
                    onSubmit={(formEvent) => {
                      formEvent.preventDefault();
                      void submitVoid(row);
                    }}
                  >
                    <h2 className={styles.operationTitle}>
                      {COPY.attendance.voidAttendance}
                    </h2>
                    <p className={styles.operationLead}>
                      {COPY.attendance.voidLead}
                    </p>
                    <label
                      className={styles.field}
                      htmlFor={`void-reason-${row.attendance_id}`}
                    >
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.voidReason}
                      </span>
                      <Input
                        ref={voidInputRef}
                        id={`void-reason-${row.attendance_id}`}
                        className={inputControl}
                        value={voidReason}
                        onChange={(eventChange) =>
                          setVoidReason(eventChange.target.value)
                        }
                        required
                        autoComplete="off"
                      />
                    </label>
                    <div className={styles.actionsRow}>
                      <Button
                        variant="outline"
                        className={dangerControl}
                        type="submit"
                        disabled={busy}
                      >
                        {COPY.attendance.voidConfirm}
                      </Button>
                      <Button
                        variant="outline"
                        className={secondaryControl}
                        type="button"
                        onClick={() => setVoidingId(null)}
                        disabled={busy}
                      >
                        {COPY.attendance.chooseEvent}
                      </Button>
                    </div>
                  </form>
                )}

                {isCorrecting && (
                  <form
                    className={styles.operationPanel}
                    onSubmit={(formEvent) => {
                      formEvent.preventDefault();
                      void submitCorrection(row);
                    }}
                  >
                    <h2
                      ref={correctionHeadingRef}
                      className={styles.operationTitle}
                      tabIndex={-1}
                    >
                      {COPY.attendance.guestCorrection}
                    </h2>
                    <p className={styles.operationLead}>
                      {COPY.attendance.correctionLead}
                    </p>
                    <label
                      className={styles.field}
                      htmlFor={`correction-name-${row.attendance_id}`}
                    >
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.guestName}
                      </span>
                      <Input
                        id={`correction-name-${row.attendance_id}`}
                        className={inputControl}
                        value={correctionName}
                        onChange={(eventChange) =>
                          setCorrectionName(eventChange.target.value)
                        }
                        maxLength={80}
                        required
                      />
                    </label>
                    <label
                      className={styles.field}
                      htmlFor={`correction-phone-${row.attendance_id}`}
                    >
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.guestPhone}
                      </span>
                      <Input
                        id={`correction-phone-${row.attendance_id}`}
                        className={inputControl}
                        value={correctionPhone}
                        onChange={(eventChange) =>
                          setCorrectionPhone(eventChange.target.value)
                        }
                        required
                      />
                    </label>
                    <label
                      className={styles.field}
                      htmlFor={`correction-reason-${row.attendance_id}`}
                    >
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.correctionReason}
                      </span>
                      <Input
                        id={`correction-reason-${row.attendance_id}`}
                        className={inputControl}
                        value={correctionReason}
                        onChange={(eventChange) =>
                          setCorrectionReason(eventChange.target.value)
                        }
                        required
                      />
                    </label>
                    <div className={styles.actionsRow}>
                      <Button
                        className={primaryControl}
                        type="submit"
                        disabled={busy}
                      >
                        {COPY.attendance.saveCorrection}
                      </Button>
                      <Button
                        variant="outline"
                        className={secondaryControl}
                        type="button"
                        onClick={() => setCorrectionId(null)}
                        disabled={busy}
                      >
                        {COPY.attendance.chooseEvent}
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export const AttendanceOperatorPanel = () => {
  const [eventId, setEventId] = useState<string | null>(null);
  const [chooserEvents, setChooserEvents] = useState<AttendanceEventSummary[]>(
    []
  );
  const [chooserLoading, setChooserLoading] = useState(true);
  const [chooserError, setChooserError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [memberDirectory, setMemberDirectory] = useState<
    Record<string, AttendanceMember>
  >({});
  const [event, setEvent] = useState<AttendanceEvent | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");
  const [busy, setBusy] = useState(false);

  function showStatus(message: string, nextTone: StatusTone = "info") {
    setStatus(message);
    setTone(nextTone);
  }

  function showError(error: unknown) {
    const message =
      error instanceof RpcError
        ? errorCopyFor(error.problem.code, error.problem.detail)
        : COPY.error.networkError;
    showStatus(message, "error");
    announce(message);
  }

  async function loadChooser() {
    setChooserLoading(true);
    setChooserError(null);
    try {
      const result = await listScannerEvents();
      setChooserEvents(result.events);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setChooserError(message);
      showError(error);
    } finally {
      setChooserLoading(false);
    }
  }

  async function loadRoster(nextEventId: string, silent = false) {
    const normalizedId = nextEventId.trim();
    if (!normalizedId) {
      return false;
    }
    setBusy(true);
    try {
      const result = await listAttendanceRoster(normalizedId);
      setEventId(normalizedId);
      setEvent(result.event);
      setRows(result.attendances);
      setMembers([]);
      if (!silent) {
        setStatus("");
      }
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function selectEvent(nextEventId: string) {
    updateAttendanceEventUrl(nextEventId);
    await loadRoster(nextEventId);
  }

  function backToChooser() {
    setEventId(null);
    setEvent(null);
    setRows([]);
    setMembers([]);
    setStatus("");
    updateAttendanceEventUrl(null);
  }

  async function searchMembers() {
    if (!eventId || !query.trim()) {
      showStatus(COPY.attendance.memberSearchEmpty);
      return;
    }
    setBusy(true);
    try {
      const result = await searchAttendanceMembers(eventId, query.trim());
      setMembers(result.members);
      setMemberDirectory((previous) => {
        const next = { ...previous };
        for (const member of result.members) {
          next[member.user_id] = member;
        }
        return next;
      });
      if (result.members.length === 0) {
        showStatus(COPY.attendance.memberSearchEmpty);
        announce(COPY.attendance.memberSearchEmpty);
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(
    member: AttendanceMember,
    method: "leader_qr_scan" | "leader_manual_search" = "leader_manual_search"
  ) {
    if (!eventId) {
      return;
    }
    setBusy(true);
    try {
      const result = await assistedCheckIn(eventId, member.user_id, method);
      const message =
        result.outcome === "duplicate"
          ? COPY.attendance.duplicate
          : COPY.attendance.success;
      showStatus(message, result.outcome === "duplicate" ? "info" : "success");
      announce(message);
      await loadRoster(eventId, true);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function scanMember(rawValue: string) {
    if (!eventId) {
      return;
    }
    try {
      const result = await searchAttendanceMembers(eventId, rawValue);
      if (result.members.length !== 1) {
        showStatus(COPY.attendance.assistedMemberSearchAmbiguous);
        announce(COPY.attendance.assistedMemberSearchAmbiguous);
        return;
      }
      setMemberDirectory((previous) => ({
        ...previous,
        [result.members[0].user_id]: result.members[0],
      }));
      await checkIn(result.members[0], "leader_qr_scan");
    } catch (error) {
      showError(error);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (value) => {
      void scanMember(value);
    },
    onUnavailable: () => showStatus(COPY.attendance.cameraUnavailable, "error"),
  });

  async function handleVoid(
    row: AttendanceRow,
    reason: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      await voidAttendance(row.attendance_id, reason);
      showStatus(COPY.attendance.voidSuccess, "success");
      announce(COPY.attendance.voidSuccess);
      await loadRoster(row.event_id, true);
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrection(
    row: AttendanceRow,
    input: { name: string; phone: string; reason: string }
  ): Promise<boolean> {
    setBusy(true);
    try {
      await correctGuestAttendance(row.attendance_id, input);
      showStatus(COPY.attendance.correctionSaved, "success");
      announce(COPY.attendance.correctionSaved);
      await loadRoster(row.event_id, true);
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function exportRoster() {
    if (typeof window === "undefined" || !event) {
      return;
    }
    const header = [
      COPY.attendance.rosterTitle,
      event.name?.trim() || event.program_name,
    ];
    const lines = rows.map((row) => {
      const phone = rowPhone(row, memberDirectory);
      return [
        rowLabel(row, memberDirectory),
        phone ? COPY.attendance.maskedPhone(phone) : "",
        COPY.attendance.status[row.status],
      ]
        .map((value) => `"${value.replaceAll('"', '""')}"`)
        .join(",");
    });
    const csv = `\uFEFF${header.join(",")}\n${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.event_id}-attendance.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void loadChooser();
    const params = new URLSearchParams(window.location.search);
    const deepLinkedEventId = params.get("event") ?? params.get("eventId");
    if (deepLinkedEventId) {
      setEventId(deepLinkedEventId);
      void loadRoster(deepLinkedEventId);
    }
    // The first render owns the URL-derived deep link; subsequent state changes
    // are driven by the chooser and the roster actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rosterVisible = Boolean(event && eventId);
  return (
    <div className={styles.page}>
      <Card
        className={styles.card}
        role="region"
        aria-labelledby={
          rosterVisible ? "attendance-roster-title" : "attendance-chooser-title"
        }
        aria-busy={busy || chooserLoading}
      >
        {!rosterVisible && (
          <AttendanceChooser
            events={chooserEvents}
            loading={chooserLoading}
            busy={busy}
            error={chooserError}
            onSelect={(nextEventId) => void selectEvent(nextEventId)}
            onRetry={() => void loadChooser()}
          />
        )}

        {!rosterVisible && (
          <h2 className={styles.srOnly}>{COPY.sections.events}</h2>
        )}

        {rosterVisible && event && eventId && (
          <>
            <div id="attendance-roster-title">
              <AttendanceRoster
                event={event}
                rows={rows}
                memberDirectory={memberDirectory}
                busy={busy}
                onBack={backToChooser}
                onVoid={handleVoid}
                onCorrectGuest={handleCorrection}
                onPrint={printAttendanceRoster}
                onExport={exportRoster}
              />
            </div>

            {event.status === "Active" && event.availability === "Active" && (
              <section
                className={styles.group}
                aria-labelledby="attendance-operations-title"
              >
                <h2
                  id="attendance-operations-title"
                  className={styles.sectionTitle}
                >
                  {COPY.attendance.operatorTitle}
                </h2>
                <div className={styles.actionsRow}>
                  <Button
                    variant="outline"
                    className={secondaryControl}
                    type="button"
                    disabled={busy}
                    onClick={() => void startCamera()}
                  >
                    {cameraOpen
                      ? COPY.attendance.cameraRetry
                      : COPY.attendance.camera}
                  </Button>
                  {cameraOpen && (
                    <Button
                      variant="outline"
                      className={secondaryControl}
                      type="button"
                      onClick={stopCamera}
                    >
                      {COPY.attendance.cameraClose}
                    </Button>
                  )}
                </div>
                {cameraOpen && (
                  <video
                    ref={videoRef}
                    className={styles.video}
                    muted
                    playsInline
                    aria-label={COPY.attendance.camera}
                  />
                )}
                <div className={styles.inputRow}>
                  <label className={styles.field} htmlFor="member-search">
                    <span className={styles.fieldLabel}>
                      {COPY.attendance.memberSearch}
                    </span>
                    <Input
                      id="member-search"
                      className={inputControl}
                      value={query}
                      onChange={(changeEvent) =>
                        setQuery(changeEvent.target.value)
                      }
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter") {
                          keyEvent.preventDefault();
                          void searchMembers();
                        }
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    className={secondaryControl}
                    type="button"
                    disabled={busy}
                    onClick={() => void searchMembers()}
                  >
                    {COPY.attendance.search}
                  </Button>
                </div>
                {members.length > 0 && (
                  <ul
                    className={styles.events}
                    aria-label={COPY.attendance.memberSearch}
                  >
                    {members.map((member) => (
                      <li key={member.user_id}>
                        <Button
                          variant="outline"
                          className={eventButtonControl}
                          type="button"
                          disabled={busy}
                          onClick={() => void checkIn(member)}
                        >
                          <strong>{member.name}</strong>
                          <span className={styles.eventMeta}>
                            {member.phone ?? member.user_id}
                          </span>
                          <span className={styles.rowAction}>
                            {COPY.attendance.checkInMember}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        <output
          className={styles.status}
          data-tone={status ? tone : undefined}
          aria-live="polite"
          aria-atomic="true"
        >
          {status}
        </output>

        {rosterVisible && event && (
          <section
            className={styles.printSheet}
            aria-label={COPY.attendance.printSheet}
          >
            <h1>{event.name?.trim() || event.program_name}</h1>
            <p>
              {hkWallLabel(event.starts_at)}
              {event.location ? ` · ${event.location}` : ""}
            </p>
            <div className={styles.printRows}>
              {rows.map((row) => {
                const phone = rowPhone(row, memberDirectory);
                return (
                  <div className={styles.printRow} key={row.attendance_id}>
                    <span>{rowLabel(row, memberDirectory)}</span>
                    <span>
                      {phone ? COPY.attendance.maskedPhone(phone) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </Card>
    </div>
  );
};
