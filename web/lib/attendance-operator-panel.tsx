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
import { ScannerStatusOutput } from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  assistedCheckIn,
  correctGuestAttendance,
  listAttendanceRoster,
  listScannerEvents,
  materializeAttendanceSnapshot,
  recordExcusedAttendance,
  searchAttendanceMembers,
  voidAttendance,
} from "@/lib/programs/program-api";
import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceExpectedRow,
  AttendanceMember,
  AttendanceRosterCounts,
  AttendanceRow,
  AttendanceState,
} from "@/lib/programs/program-api";
import { clearAuthHint, rememberDeepLink } from "@/lib/session";
import { useQrCamera } from "@/lib/use-qr-camera";
import { cn } from "@/lib/utils";

const eventButtonControl =
  "flex w-full min-h-11 flex-col items-start justify-between rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-3 text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:flex-row sm:items-center motion-reduce:transition-none";

type StatusTone = "info" | "success" | "error";

const ATTENDANCE_STATE_LABEL: Record<AttendanceState, string> = {
  Present: "已出席",
  "Not Yet": "未簽到",
  Absent: "缺席",
  Excused: "請假",
  Cancelled: "聚會已取消",
};

const EXCUSE_COPY = {
  action: "標記請假",
  reason: "請假原因",
  confirm: "確認請假",
  cancel: "取消",
  saved: "已記錄請假",
} as const;

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
      className="grid print:hidden"
      role="region"
      aria-labelledby="attendance-chooser-title"
    >
      <h1
        id="attendance-chooser-title"
        className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
      >
        {COPY.attendance.chooserTitle}
      </h1>
      <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
        {COPY.attendance.chooserLead}
      </p>
      <h2 className="mt-1.5 text-xl font-extrabold leading-snug text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
        {COPY.attendance.chooserOpenMeetings}
      </h2>

      {loading && (
        <output
          className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
          aria-busy="true"
          aria-live="polite"
        >
          <Skeleton className="h-3 w-24" aria-hidden="true" />
          <span>{COPY.management.loading}</span>
        </output>
      )}

      {error && !loading && (
        <Alert variant="destructive" className="grid gap-2">
          <p className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
            {error}
          </p>
          {onRetry && (
            <Button
              variant="outline"
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
        <output
          className="text-base text-[var(--ink-muted)] py-4 text-center block"
          aria-live="polite"
        >
          {COPY.attendance.chooserEmpty}
        </output>
      )}

      {!loading && !error && events.length > 0 && (
        <ul
          className="mt-2 grid gap-2 list-none p-0 min-w-0"
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
                <span className="grid gap-0.5 min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                  <strong>{attendanceEventName(event)}</strong>
                  <span className="text-sm text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                    {hkWallLabel(event.starts_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </span>
                <span className="text-sm font-bold text-[var(--accent)] mt-1 sm:mt-0 shrink-0">
                  {COPY.attendance.rosterTitle}
                </span>
                <svg
                  className="h-4 w-4 shrink-0 text-[var(--ink-muted)] hidden sm:block"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
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
  expectedRows?: readonly AttendanceExpectedRow[];
  counts?: AttendanceRosterCounts;
  memberDirectory?: MemberDirectory;
  busy?: boolean;
  onBack?: () => void;
  onVoid?: (row: AttendanceRow, reason: string) => Promise<boolean> | boolean;
  onCorrectGuest?: (
    row: AttendanceRow,
    input: { name: string; phone: string; reason: string }
  ) => Promise<boolean> | boolean;
  onExcuse?: (
    row: AttendanceExpectedRow,
    reason: string
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
  expectedRows = [],
  counts,
  memberDirectory = EMPTY_MEMBER_DIRECTORY,
  busy = false,
  onBack,
  onVoid,
  onCorrectGuest,
  onExcuse,
  onPrint,
  onExport,
}: AttendanceRosterProps) => {
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionName, setCorrectionName] = useState("");
  const [correctionPhone, setCorrectionPhone] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [excusingId, setExcusingId] = useState<string | null>(null);
  const [excuseReason, setExcuseReason] = useState("");
  const voidInputRef = useRef<HTMLInputElement>(null);
  const correctionHeadingRef = useRef<HTMLHeadingElement>(null);
  const excuseInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (excusingId) {
      excuseInputRef.current?.focus();
    }
  }, [excusingId]);

  const activeRows = rows.filter((row) => row.status === "Active");
  const expectedAttendanceIds = new Set(
    expectedRows.flatMap(({ attendance }) =>
      attendance ? [attendance.attendance_id] : []
    )
  );
  const additionalRows = rows.filter(
    (row) => !expectedAttendanceIds.has(row.attendance_id)
  );
  const statusIsOpen =
    event.status === "Active" && event.availability === "Active";
  const eventTitle = event.name?.trim() || event.program_name;
  const checkedInCount = counts?.present ?? activeRows.length;
  const expectedCount = counts?.expected ?? rows.length;

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

  async function submitExcuse(row: AttendanceExpectedRow) {
    const reason = excuseReason.trim();
    if (!reason || !onExcuse) {
      return;
    }
    const saved = await onExcuse(row, reason);
    if (saved) {
      setExcusingId(null);
      setExcuseReason("");
    }
  }

  return (
    <>
      <header className="grid gap-2 pb-4 border-b border-[var(--line)] print:hidden">
        <div className="flex items-center justify-between gap-2">
          {onBack && (
            <Button
              variant="link"
              className="w-fit text-[var(--accent-deep)]"
              type="button"
              onClick={onBack}
              disabled={busy}
            >
              {COPY.attendance.chooseEvent}
            </Button>
          )}
          <Badge
            variant="outline"
            className={`px-2.5 py-0.5 text-xs font-semibold ${
              statusIsOpen
                ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
                : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]"
            }`}
          >
            {statusIsOpen
              ? COPY.attendance.rosterStatusActive
              : event.status === "Cancelled"
                ? COPY.attendance.eventCancelled
                : COPY.attendance.eventClosed}
          </Badge>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
              {COPY.attendance.rosterTitle}
            </h1>
            <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
              {eventTitle}
              {event.location ? ` · ${event.location}` : ""}
              {` · ${hkWallLabel(event.starts_at)}`}
            </p>
          </div>
          <p
            className="text-sm text-[var(--ink-muted)] shrink-0"
            aria-live="polite"
          >
            <strong>
              {COPY.attendance.checkedInCount(checkedInCount, expectedCount)}
            </strong>
            {counts && counts.guests > 0 && (
              <span className="ml-2">· 訪客 {counts.guests}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          {onPrint && (
            <Button
              variant="outline"
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
              type="button"
              onClick={onExport}
              disabled={busy}
            >
              {COPY.attendance.exportSheet}
            </Button>
          )}
        </div>
      </header>

      {rows.length === 0 && expectedRows.length === 0 ? (
        <output
          className="text-base text-[var(--ink-muted)] py-4 text-center block print:hidden"
          aria-live="polite"
        >
          {COPY.programs.eventNoParticipants}
        </output>
      ) : (
        <>
          {expectedRows.length > 0 && (
            <ul
              className="grid gap-3 list-none p-0 mt-4 print:hidden"
              aria-label="預期出席名單"
            >
              {expectedRows.map((row) => {
                const { attendance } = row;
                const expectedKey =
                  row.expected_attendance_id ?? row.enrollment_id;
                const phone =
                  row.member_phone ??
                  memberDirectory[row.member_user_id]?.phone ??
                  null;
                const displayPhone = phone
                  ? COPY.attendance.maskedPhone(phone)
                  : null;
                const isVoiding =
                  attendance?.status === "Active" &&
                  voidingId === attendance.attendance_id;
                const isExcusing = excusingId === expectedKey;
                const statusClass =
                  row.state === "Present"
                    ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
                    : row.state === "Excused"
                      ? "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent-deep)]"
                      : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]";
                return (
                  <li
                    className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)]"
                    key={expectedKey}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="text-base font-bold text-[var(--ink)] [overflow-wrap:anywhere] min-w-0 max-w-full">
                          {row.member_name ||
                            memberDirectory[row.member_user_id]?.name ||
                            row.member_user_id}
                        </strong>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {displayPhone ?? "會員"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusClass}`}
                      >
                        {ATTENDANCE_STATE_LABEL[row.state]}
                      </Badge>
                    </div>

                    {row.disposition && (
                      <p className="text-xs text-[var(--accent-deep)] bg-[var(--accent-surface)] border border-[var(--accent-border)] p-2 rounded-[var(--radius-sm)]">
                        {row.disposition.reason}
                      </p>
                    )}
                    {attendance?.status === "Voided" &&
                      attendance.void_reason && (
                        <p className="text-xs text-[var(--error)] bg-[var(--error-surface)] border border-[var(--error-border)] p-2 rounded-[var(--radius-sm)]">
                          {attendance.void_reason}
                        </p>
                      )}

                    {row.state !== "Cancelled" && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        {attendance?.status === "Active" && (
                          <Button
                            variant="destructive"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setVoidingId(attendance.attendance_id);
                              setVoidReason("");
                              setExcusingId(null);
                            }}
                          >
                            {COPY.attendance.voidAttendance}
                          </Button>
                        )}
                        {onExcuse && !row.disposition && (
                          <Button
                            variant="outline"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setExcusingId(expectedKey);
                              setExcuseReason("");
                              setVoidingId(null);
                              setCorrectionId(null);
                            }}
                          >
                            {EXCUSE_COPY.action}
                          </Button>
                        )}
                      </div>
                    )}

                    {isVoiding && attendance && (
                      <form
                        className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] mt-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          void submitVoid(attendance);
                        }}
                      >
                        <h2 className="text-lg font-bold text-[var(--ink)]">
                          {COPY.attendance.voidAttendance}
                        </h2>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`expected-void-reason-${expectedKey}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {COPY.attendance.voidReason}
                          </span>
                          <Input
                            ref={voidInputRef}
                            id={`expected-void-reason-${expectedKey}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={voidReason}
                            onChange={(eventChange) =>
                              setVoidReason(eventChange.target.value)
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Button
                            variant="destructive"
                            type="submit"
                            disabled={busy}
                          >
                            {COPY.attendance.voidConfirm}
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => setVoidingId(null)}
                            disabled={busy}
                          >
                            {COPY.attendance.chooseEvent}
                          </Button>
                        </div>
                      </form>
                    )}

                    {isExcusing && onExcuse && (
                      <form
                        className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] mt-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          void submitExcuse(row);
                        }}
                      >
                        <h2 className="text-lg font-bold text-[var(--ink)]">
                          {EXCUSE_COPY.action}
                        </h2>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`excuse-reason-${expectedKey}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {EXCUSE_COPY.reason}
                          </span>
                          <Input
                            ref={excuseInputRef}
                            id={`excuse-reason-${expectedKey}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={excuseReason}
                            onChange={(eventChange) =>
                              setExcuseReason(eventChange.target.value)
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Button
                            variant="default"
                            type="submit"
                            disabled={busy}
                          >
                            {EXCUSE_COPY.confirm}
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => setExcusingId(null)}
                            disabled={busy}
                          >
                            {EXCUSE_COPY.cancel}
                          </Button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {additionalRows.length > 0 && (
            <ul
              className="grid gap-3 list-none p-0 mt-4 print:hidden"
              aria-label={COPY.attendance.rosterTitle}
            >
              {additionalRows.map((row) => {
                const phone = rowPhone(row, memberDirectory);
                const displayPhone =
                  phone && row.member_user_id
                    ? COPY.attendance.maskedPhone(phone)
                    : phone;
                const isVoiding = voidingId === row.attendance_id;
                const isCorrecting = correctionId === row.attendance_id;
                return (
                  <li
                    className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)]"
                    key={row.attendance_id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="text-base font-bold text-[var(--ink)] [overflow-wrap:anywhere] min-w-0 max-w-full">
                          {rowLabel(row, memberDirectory)}
                        </strong>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {displayPhone ?? COPY.attendance.method[row.method]}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          row.status === "Active"
                            ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
                            : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {COPY.attendance.status[row.status]}
                      </Badge>
                    </div>

                    {row.status === "Voided" && row.void_reason && (
                      <p className="text-xs text-[var(--error)] bg-[var(--error-surface)] border border-[var(--error-border)] p-2 rounded-[var(--radius-sm)]">
                        {row.void_reason}
                      </p>
                    )}

                    {row.status === "Active" && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        <Button
                          variant="destructive"
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
                        className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] mt-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          void submitVoid(row);
                        }}
                      >
                        <h2 className="text-lg font-bold text-[var(--ink)]">
                          {COPY.attendance.voidAttendance}
                        </h2>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {COPY.attendance.voidLead}
                        </p>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`void-reason-${row.attendance_id}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {COPY.attendance.voidReason}
                          </span>
                          <Input
                            ref={voidInputRef}
                            id={`void-reason-${row.attendance_id}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={voidReason}
                            onChange={(eventChange) =>
                              setVoidReason(eventChange.target.value)
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Button
                            variant="destructive"
                            type="submit"
                            disabled={busy}
                          >
                            {COPY.attendance.voidConfirm}
                          </Button>
                          <Button
                            variant="outline"
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
                        className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] mt-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          void submitCorrection(row);
                        }}
                      >
                        <h2
                          ref={correctionHeadingRef}
                          className="text-lg font-bold text-[var(--ink)]"
                          tabIndex={-1}
                        >
                          {COPY.attendance.guestCorrection}
                        </h2>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {COPY.attendance.correctionLead}
                        </p>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`correction-name-${row.attendance_id}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {COPY.attendance.guestName}
                          </span>
                          <Input
                            id={`correction-name-${row.attendance_id}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={correctionName}
                            onChange={(eventChange) =>
                              setCorrectionName(eventChange.target.value)
                            }
                            maxLength={80}
                            required
                          />
                        </label>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`correction-phone-${row.attendance_id}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {COPY.attendance.guestPhone}
                          </span>
                          <Input
                            id={`correction-phone-${row.attendance_id}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={correctionPhone}
                            onChange={(eventChange) =>
                              setCorrectionPhone(eventChange.target.value)
                            }
                            required
                          />
                        </label>
                        <label
                          className="grid gap-1.5"
                          htmlFor={`correction-reason-${row.attendance_id}`}
                        >
                          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                            {COPY.attendance.correctionReason}
                          </span>
                          <Input
                            id={`correction-reason-${row.attendance_id}`}
                            className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                            value={correctionReason}
                            onChange={(eventChange) =>
                              setCorrectionReason(eventChange.target.value)
                            }
                            required
                          />
                        </label>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Button
                            variant="default"
                            type="submit"
                            disabled={busy}
                          >
                            {COPY.attendance.saveCorrection}
                          </Button>
                          <Button
                            variant="outline"
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
      )}
    </>
  );
};

export interface AttendanceOperatorPanelProps {
  onAuthRequired?: () => void;
}

export const AttendanceOperatorPanel = ({
  onAuthRequired,
}: AttendanceOperatorPanelProps = {}) => {
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
  const [expectedRows, setExpectedRows] = useState<AttendanceExpectedRow[]>([]);
  const [rosterCounts, setRosterCounts] =
    useState<AttendanceRosterCounts | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");
  const [busy, setBusy] = useState(false);

  function handleAuthRequired() {
    if (onAuthRequired) {
      onAuthRequired();
      return;
    }
    clearAuthHint();
    if (typeof window !== "undefined") {
      rememberDeepLink(
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
      sessionStorage.setItem("efcc_session_expired", "1");
      window.location.assign("/");
    }
  }

  function showStatus(message: string, nextTone: StatusTone = "info") {
    setStatus(message);
    setTone(nextTone);
  }

  function showError(error: unknown) {
    if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
      handleAuthRequired();
      return;
    }
    const message =
      error instanceof RpcError
        ? errorCopyFor(error.problem.code, error.problem.detail)
        : COPY.attendance.assistedAccessError;
    showStatus(message, "error");
    announce(message);
  }

  async function loadChooser() {
    setChooserLoading(true);
    setChooserError(null);
    try {
      const { events } = await listScannerEvents();
      setChooserEvents(events);
    } catch (error) {
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        handleAuthRequired();
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.attendance.assistedAccessError;
      setChooserError(message);
      announce(message);
    } finally {
      setChooserLoading(false);
    }
  }

  async function loadRoster(id: string) {
    setBusy(true);
    try {
      let result = await listAttendanceRoster(id);
      if (result.materialization_required) {
        await materializeAttendanceSnapshot(id);
        result = await listAttendanceRoster(id);
      }
      setEvent(result.event);
      setRows(result.attendances ?? []);
      setExpectedRows(result.expected ?? []);
      setRosterCounts(result.counts ?? null);
      updateAttendanceEventUrl(id);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function selectEvent(nextEventId: string) {
    setEventId(nextEventId);
    await loadRoster(nextEventId);
    setStatus("");
  }

  function backToChooser() {
    setEventId(null);
    setEvent(null);
    setRows([]);
    setExpectedRows([]);
    setRosterCounts(null);
    setMembers([]);
    setQuery("");
    setStatus("");
    updateAttendanceEventUrl(null);
    void loadChooser();
  }

  async function searchMembers() {
    const trimmed = query.trim();
    if (!eventId || !trimmed) {
      return;
    }
    setBusy(true);
    try {
      const result = await searchAttendanceMembers(eventId, trimmed);
      const nextMembers = result.members ?? [];
      setMembers(nextMembers);
      setMemberDirectory((current) => {
        const next = { ...current };
        for (const member of nextMembers) {
          next[member.user_id] = member;
        }
        return next;
      });
      const message =
        nextMembers.length === 0
          ? COPY.attendance.memberSearchEmpty
          : COPY.attendance.assistedMembersFound;
      showStatus(message, nextMembers.length === 0 ? "error" : "info");
      announce(message);
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
      const successMessage =
        result.outcome === "duplicate"
          ? COPY.attendance.duplicate
          : COPY.attendance.success;
      showStatus(successMessage, "success");
      announce(successMessage);
      await loadRoster(eventId);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(
    row: AttendanceRow,
    reason: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      await voidAttendance(row.attendance_id, reason);
      showStatus(COPY.attendance.voidSuccess, "success");
      announce(COPY.attendance.voidSuccess);
      if (eventId) {
        await loadRoster(eventId);
      }
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
      if (eventId) {
        await loadRoster(eventId);
      }
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleExcuse(
    row: AttendanceExpectedRow,
    reason: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      await recordExcusedAttendance(row.event_id, row.enrollment_id, reason);
      showStatus(EXCUSE_COPY.saved, "success");
      announce(EXCUSE_COPY.saved);
      if (eventId) {
        await loadRoster(eventId);
      }
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (qrString) => {
      stopCamera();
      const match = members.find(
        (m) => m.qr_code_string?.trim() === qrString.trim()
      );
      if (match) {
        void checkIn(match, "leader_qr_scan");
        return;
      }
      if (!eventId) {
        return;
      }
      void searchAttendanceMembers(eventId, qrString)
        .then((result) => {
          const list = result.members ?? [];
          if (list.length === 1) {
            void checkIn(list[0], "leader_qr_scan");
          } else if (list.length > 1) {
            setMembers(list);
            const message = COPY.attendance.assistedMemberSearchAmbiguous;
            showStatus(message, "error");
            announce(message);
          } else {
            const message = COPY.attendance.memberSearchEmpty;
            showStatus(message, "error");
            announce(message);
          }
        })
        .catch(showError);
    },
    onUnavailable: () => {
      const message = COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
    },
  });

  function exportRoster() {
    if (!event) {
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
    <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12 print:p-0 print:m-0 print:w-full">
      <Card
        className="grid print:border-0 print:shadow-none print:p-0 print:bg-transparent"
        role={rosterVisible ? "region" : undefined}
        aria-labelledby={rosterVisible ? "attendance-roster-title" : undefined}
        aria-busy={busy || chooserLoading}
      >
        <div className="print:hidden">
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
            <h2 className="sr-only">{COPY.sections.events}</h2>
          )}

          {rosterVisible && event && eventId && (
            <>
              <div id="attendance-roster-title">
                <AttendanceRoster
                  event={event}
                  rows={rows}
                  expectedRows={expectedRows}
                  counts={rosterCounts ?? undefined}
                  memberDirectory={memberDirectory}
                  busy={busy}
                  onBack={backToChooser}
                  onVoid={handleVoid}
                  onCorrectGuest={handleCorrection}
                  onExcuse={handleExcuse}
                  onPrint={printAttendanceRoster}
                  onExport={exportRoster}
                />
              </div>

              {event.status === "Active" && event.availability === "Active" && (
                <section
                  className="mt-4 grid gap-3"
                  aria-labelledby="attendance-operations-title"
                >
                  <h2
                    id="attendance-operations-title"
                    className="mt-1.5 text-xl font-extrabold leading-snug text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
                  >
                    {COPY.attendance.operatorTitle}
                  </h2>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <Button
                      variant="outline"
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
                      className="aspect-video w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-black object-cover"
                      muted
                      playsInline
                      aria-label={COPY.attendance.camera}
                    />
                  )}
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="grid gap-1.5" htmlFor="member-search">
                      <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                        {COPY.attendance.memberSearch}
                      </span>
                      <Input
                        id="member-search"
                        className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
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
                      type="button"
                      disabled={busy}
                      onClick={() => void searchMembers()}
                    >
                      {COPY.attendance.search}
                    </Button>
                  </div>
                  {members.length > 0 && (
                    <ul
                      className="mt-2 grid gap-2 list-none p-0 min-w-0"
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
                            <span className="text-sm text-[var(--ink-muted)]">
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
                </section>
              )}
            </>
          )}

          <ScannerStatusOutput message={status} tone={tone} />
        </div>

        {rosterVisible && event && (
          <section
            className="hidden print:block print:p-0 print:m-0"
            aria-label={COPY.attendance.printSheet}
          >
            <h1 className="text-xl font-bold">
              {event.name?.trim() || event.program_name}
            </h1>
            <p className="text-sm text-gray-700">
              {hkWallLabel(event.starts_at)}
              {event.location ? ` · ${event.location}` : ""}
            </p>
            <div className="grid gap-2 border-t border-black pt-4 mt-4">
              {rows.map((row) => {
                const phone = rowPhone(row, memberDirectory);
                return (
                  <div
                    className="flex justify-between py-1 border-b border-gray-300 text-sm"
                    key={row.attendance_id}
                  >
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
