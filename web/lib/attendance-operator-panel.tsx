"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  isUnknownMutationOutcome,
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
import { ScreenTab, ScreenTabs } from "@/lib/screen-foundations";
import { clearAuthHint, rememberDeepLink } from "@/lib/session";
import { useQrCamera } from "@/lib/use-qr-camera";
import { cn } from "@/lib/utils";

import { EventCheckInSheet } from "./programs/event-check-in-sheet";

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

const EXCUSE_OPTIONS = ["身體不適", "工作或上課", "家庭事務", "其他"] as const;
type ExcuseCategory = (typeof EXCUSE_OPTIONS)[number];

type MemberDirectory = Readonly<Record<string, AttendanceMember>>;
type AttendanceRosterFilter = "not-yet" | "checked-in" | "all";

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
  readOnly?: boolean;
  offline?: boolean;
  stale?: boolean;
  lastUpdatedAt?: number | null;
  materializationRequired?: boolean;
  onBack?: () => void;
  onRefresh?: () => void;
  onMaterialize?: () => void;
  onOpenCheckInSheet?: () => void;
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
  readOnly = false,
  offline = false,
  stale = false,
  lastUpdatedAt = null,
  materializationRequired = false,
  onBack,
  onRefresh,
  onMaterialize,
  onOpenCheckInSheet,
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
  const [excuseCategory, setExcuseCategory] = useState<ExcuseCategory | "">("");
  const [excuseDetails, setExcuseDetails] = useState("");
  const [detailRow, setDetailRow] = useState<AttendanceExpectedRow | null>(
    null
  );
  const [rosterFilter, setRosterFilter] =
    useState<AttendanceRosterFilter>("not-yet");
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

  useEffect(() => {
    setRosterFilter("not-yet");
  }, [event.event_id]);

  const activeRows = rows.filter((row) => row.status === "Active");
  const expectedAttendanceIds = new Set(
    expectedRows.flatMap(({ attendance }) =>
      attendance ? [attendance.attendance_id] : []
    )
  );
  const additionalRows = rows.filter(
    (row) => !expectedAttendanceIds.has(row.attendance_id)
  );
  const hasExpectedProjection = expectedRows.length > 0;
  const visibleExpectedRows = expectedRows.filter((row) => {
    if (!hasExpectedProjection || rosterFilter === "all") {
      return true;
    }
    if (rosterFilter === "checked-in") {
      return row.state === "Present";
    }
    return row.state !== "Present" && row.state !== "Cancelled";
  });
  const visibleAdditionalRows = hasExpectedProjection
    ? rosterFilter === "all"
      ? additionalRows
      : rosterFilter === "checked-in"
        ? additionalRows.filter((row) => row.status === "Active")
        : []
    : additionalRows;
  const rosterFilterCounts = {
    "not-yet": expectedRows.filter(
      (row) => row.state !== "Present" && row.state !== "Cancelled"
    ).length,
    "checked-in":
      expectedRows.filter((row) => row.state === "Present").length +
      (hasExpectedProjection
        ? additionalRows.filter((row) => row.status === "Active").length
        : activeRows.length),
    all: expectedRows.length + additionalRows.length,
  } satisfies Record<AttendanceRosterFilter, number>;
  const statusIsOpen =
    event.status === "Active" && event.availability === "Active";
  const eventTitle = event.name?.trim() || event.program_name;
  const checkedInCount = counts?.present ?? activeRows.length;
  const expectedCount = counts?.expected ?? rows.length;
  const lastUpdatedLabel = lastUpdatedAt
    ? hkWallLabel(new Date(lastUpdatedAt).toISOString())
    : null;
  const writeDisabled = busy || readOnly;

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
    const details = excuseDetails.trim();
    if (
      !excuseCategory ||
      (excuseCategory === "其他" && !details) ||
      !onExcuse
    ) {
      return;
    }
    const reason = details ? `${excuseCategory}：${details}` : excuseCategory;
    const saved = await onExcuse(row, reason);
    if (saved) {
      setExcusingId(null);
      setExcuseCategory("");
      setExcuseDetails("");
    }
  }

  return (
    <Sheet
      open={detailRow !== null}
      onOpenChange={(open) => {
        if (!open) {
          setDetailRow(null);
        }
      }}
    >
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
          {(offline || stale) && (
            <Alert
              variant={offline ? "default" : "destructive"}
              className="grid gap-2"
              role="status"
            >
              <p className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                {offline
                  ? COPY.attendance.rosterOffline
                  : COPY.attendance.rosterStale(
                      lastUpdatedLabel ?? COPY.management.loading
                    )}
              </p>
              {onRefresh && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={onRefresh}
                  disabled={busy || offline}
                >
                  {COPY.management.retry}
                </Button>
              )}
            </Alert>
          )}
          {lastUpdatedLabel && !offline && !stale && (
            <p className="text-xs text-[var(--ink-muted)]" aria-live="polite">
              {COPY.attendance.rosterLastUpdated(lastUpdatedLabel)}
            </p>
          )}
          {materializationRequired && onMaterialize && (
            <Alert className="grid gap-2">
              <p className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                {COPY.attendance.rosterMaterializeHint}
              </p>
              <Button
                variant="default"
                type="button"
                onClick={onMaterialize}
                disabled={writeDisabled || offline}
              >
                {busy
                  ? COPY.attendance.rosterMaterializing
                  : COPY.attendance.rosterMaterialize}
              </Button>
            </Alert>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {onOpenCheckInSheet && event.manual_check_in_code && (
              <Button
                variant="outline"
                type="button"
                onClick={onOpenCheckInSheet}
                disabled={busy || readOnly}
              >
                {COPY.attendance.eventCheckInSheetOpen}
              </Button>
            )}
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

        {expectedRows.length === 0 && rows.length === 0 ? (
          <output
            className="text-base text-[var(--ink-muted)] py-4 text-center block print:hidden"
            aria-live="polite"
          >
            {COPY.programs.eventNoParticipants}
          </output>
        ) : (
          <>
            {hasExpectedProjection && (
              <div className="mt-4 grid min-w-0 gap-2 print:hidden">
                <p className="m-0 text-sm text-[var(--ink-muted)]">
                  {COPY.attendance.rosterFilterHint}
                </p>
                <ScreenTabs
                  aria-label={COPY.attendance.rosterFilterLabel}
                  role="tablist"
                >
                  {(
                    [
                      ["not-yet", COPY.attendance.rosterFilterNotYet],
                      ["checked-in", COPY.attendance.rosterFilterCheckedIn],
                      ["all", COPY.attendance.rosterFilterAll],
                    ] as const
                  ).map(([value, label]) => (
                    <ScreenTab
                      key={value}
                      id={`attendance-${value}-tab`}
                      role="tab"
                      aria-controls={`attendance-${value}-panel`}
                      aria-selected={rosterFilter === value}
                      selected={rosterFilter === value}
                      onClick={() => setRosterFilter(value)}
                    >
                      {label} ({rosterFilterCounts[value]})
                    </ScreenTab>
                  ))}
                </ScreenTabs>
              </div>
            )}

            <section
              id={`attendance-${rosterFilter}-panel`}
              role={hasExpectedProjection ? "tabpanel" : undefined}
              aria-labelledby={
                hasExpectedProjection
                  ? `attendance-${rosterFilter}-tab`
                  : undefined
              }
              tabIndex={hasExpectedProjection ? 0 : undefined}
            >
              {visibleExpectedRows.length === 0 &&
              visibleAdditionalRows.length === 0 ? (
                <output
                  className="text-base text-[var(--ink-muted)] py-4 text-center block print:hidden"
                  aria-live="polite"
                >
                  {COPY.attendance.rosterFilterEmpty}
                </output>
              ) : (
                <>
                  {visibleExpectedRows.length > 0 && (
                    <ul
                      className="grid gap-3 list-none p-0 mt-4 print:hidden"
                      aria-label={COPY.attendance.rosterFilterLabel}
                    >
                      {visibleExpectedRows.map((row) => {
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
                                <SheetTrigger asChild>
                                  <Button
                                    variant="link"
                                    className="text-left text-base font-bold text-[var(--ink)] [overflow-wrap:anywhere]"
                                    type="button"
                                    onClick={() => setDetailRow(row)}
                                  >
                                    {row.member_name ||
                                      memberDirectory[row.member_user_id]
                                        ?.name ||
                                      row.member_user_id}
                                  </Button>
                                </SheetTrigger>
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
                                    disabled={writeDisabled}
                                    onClick={() => {
                                      setVoidingId(attendance.attendance_id);
                                      setVoidReason("");
                                      setExcusingId(null);
                                    }}
                                  >
                                    {COPY.attendance.voidAttendance}
                                  </Button>
                                )}
                                {onExcuse && !readOnly && !row.disposition && (
                                  <Button
                                    variant="outline"
                                    type="button"
                                    disabled={writeDisabled}
                                    onClick={() => {
                                      setExcusingId(expectedKey);
                                      setExcuseCategory("");
                                      setExcuseDetails("");
                                      setVoidingId(null);
                                      setCorrectionId(null);
                                    }}
                                  >
                                    {EXCUSE_COPY.action}
                                  </Button>
                                )}
                              </div>
                            )}

                            {isVoiding && attendance && !readOnly && (
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
                                    disabled={writeDisabled}
                                  >
                                    {COPY.attendance.voidConfirm}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => setVoidingId(null)}
                                    disabled={writeDisabled}
                                  >
                                    {COPY.attendance.chooseEvent}
                                  </Button>
                                </div>
                              </form>
                            )}

                            {isExcusing && onExcuse && !readOnly && (
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
                                <p className="text-sm text-[var(--ink-muted)]">
                                  {event.program_name} · {eventTitle} ·{" "}
                                  {hkWallLabel(event.starts_at)}
                                </p>
                                <label
                                  className="grid gap-1.5"
                                  htmlFor={`excuse-category-${expectedKey}`}
                                >
                                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                                    {EXCUSE_COPY.reason}
                                  </span>
                                  <Select
                                    value={excuseCategory}
                                    onValueChange={(value) =>
                                      setExcuseCategory(value as ExcuseCategory)
                                    }
                                  >
                                    <SelectTrigger
                                      id={`excuse-category-${expectedKey}`}
                                      aria-label={EXCUSE_COPY.reason}
                                    >
                                      <SelectValue
                                        placeholder={
                                          COPY.attendance
                                            .excuseReasonPlaceholder
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EXCUSE_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                          {option}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                                <label
                                  className="grid gap-1.5"
                                  htmlFor={`excuse-details-${expectedKey}`}
                                >
                                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                                    {COPY.attendance.excuseDetails}
                                    {excuseCategory === "其他"
                                      ? COPY.attendance.excuseDetailsRequired
                                      : COPY.attendance.excuseDetailsOptional}
                                  </span>
                                  <Input
                                    ref={excuseInputRef}
                                    id={`excuse-details-${expectedKey}`}
                                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                                    value={excuseDetails}
                                    onChange={(eventChange) =>
                                      setExcuseDetails(eventChange.target.value)
                                    }
                                    required={excuseCategory === "其他"}
                                    autoComplete="off"
                                  />
                                </label>
                                <div className="flex flex-wrap gap-3 mt-2">
                                  <Button
                                    variant="default"
                                    type="submit"
                                    disabled={
                                      writeDisabled ||
                                      !excuseCategory ||
                                      (excuseCategory === "其他" &&
                                        !excuseDetails.trim())
                                    }
                                  >
                                    {EXCUSE_COPY.confirm}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => {
                                      setExcusingId(null);
                                      setExcuseCategory("");
                                      setExcuseDetails("");
                                    }}
                                    disabled={writeDisabled}
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

                  {visibleAdditionalRows.length > 0 && (
                    <ul
                      className="grid gap-3 list-none p-0 mt-4 print:hidden"
                      aria-label={COPY.attendance.rosterTitle}
                    >
                      {visibleAdditionalRows.map((row) => {
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
                                  {displayPhone ??
                                    COPY.attendance.method[row.method]}
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
                                  disabled={writeDisabled}
                                  onClick={() => {
                                    setVoidingId(row.attendance_id);
                                    setVoidReason("");
                                    setCorrectionId(null);
                                  }}
                                >
                                  {COPY.attendance.voidAttendance}
                                </Button>
                                {row.member_user_id === null && !readOnly && (
                                  <Button
                                    variant="outline"
                                    type="button"
                                    disabled={writeDisabled}
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

                            {isVoiding && !readOnly && (
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
                                    disabled={writeDisabled}
                                  >
                                    {COPY.attendance.voidConfirm}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => setVoidingId(null)}
                                    disabled={writeDisabled}
                                  >
                                    {COPY.attendance.chooseEvent}
                                  </Button>
                                </div>
                              </form>
                            )}

                            {isCorrecting && !readOnly && (
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
                                      setCorrectionName(
                                        eventChange.target.value
                                      )
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
                                      setCorrectionPhone(
                                        eventChange.target.value
                                      )
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
                                      setCorrectionReason(
                                        eventChange.target.value
                                      )
                                    }
                                    required
                                  />
                                </label>
                                <div className="flex flex-wrap gap-3 mt-2">
                                  <Button
                                    variant="default"
                                    type="submit"
                                    disabled={writeDisabled}
                                  >
                                    {COPY.attendance.saveCorrection}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => setCorrectionId(null)}
                                    disabled={writeDisabled}
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
            </section>
          </>
        )}
        <SheetContent side="bottom">
          {detailRow && (
            <>
              <SheetHeader className="border-b border-[var(--line)]">
                <SheetTitle className="text-xl font-bold text-[var(--ink)]">
                  {COPY.attendance.participantDetailTitle}
                </SheetTitle>
                <SheetDescription>
                  {event.program_name} · {eventTitle} ·{" "}
                  {hkWallLabel(event.starts_at)}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 px-4 text-sm text-[var(--ink)]">
                <div className="grid gap-1">
                  <span className="font-bold text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailIdentity}
                  </span>
                  <strong className="text-lg">{detailRow.member_name}</strong>
                  <span className="text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailPhone}：
                    {detailRow.member_phone
                      ? COPY.attendance.maskedPhone(detailRow.member_phone)
                      : "—"}
                  </span>
                </div>
                <div className="grid gap-1">
                  <span className="font-bold text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailStatus}
                  </span>
                  <span>{ATTENDANCE_STATE_LABEL[detailRow.state]}</span>
                </div>
                <div className="grid gap-2">
                  <h3 className="font-bold text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailHistory}
                  </h3>
                  {detailRow.attendance ? (
                    <div className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-3">
                      <span>
                        {COPY.attendance.status[detailRow.attendance.status]}
                      </span>
                      <span className="text-[var(--ink-muted)]">
                        {COPY.attendance.participantDetailCheckedInAt}：
                        {hkWallLabel(detailRow.attendance.checked_in_at)}
                      </span>
                      {detailRow.attendance.status === "Voided" &&
                        detailRow.attendance.void_reason && (
                          <span className="text-[var(--error)]">
                            {detailRow.attendance.void_reason}
                          </span>
                        )}
                      {detailRow.attendance.status === "Voided" &&
                        detailRow.attendance.voided_at && (
                          <span className="text-[var(--ink-muted)]">
                            {COPY.attendance.participantDetailRecordedAt}：
                            {hkWallLabel(detailRow.attendance.voided_at)}
                          </span>
                        )}
                    </div>
                  ) : null}
                  {detailRow.disposition ? (
                    <div className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--accent-surface)] p-3">
                      <span>
                        {COPY.attendance.participantDetailDisposition}
                      </span>
                      <span>{detailRow.disposition.reason}</span>
                      <span className="text-[var(--ink-muted)]">
                        {COPY.attendance.participantDetailRecordedAt}：
                        {hkWallLabel(detailRow.disposition.recorded_at)}
                      </span>
                    </div>
                  ) : null}
                  {!detailRow.attendance && !detailRow.disposition && (
                    <span className="text-[var(--ink-muted)]">
                      {COPY.attendance.participantDetailNoHistory}
                    </span>
                  )}
                </div>
              </div>
              <SheetFooter>
                <div className="flex flex-wrap gap-3">
                  {!readOnly &&
                    detailRow.attendance?.status === "Active" &&
                    onVoid && (
                      <SheetClose asChild>
                        <Button
                          variant="destructive"
                          type="button"
                          onClick={() => {
                            setVoidingId(
                              detailRow.attendance?.attendance_id ?? null
                            );
                            setVoidReason("");
                          }}
                        >
                          {COPY.attendance.voidAttendance}
                        </Button>
                      </SheetClose>
                    )}
                  {!readOnly &&
                    onExcuse &&
                    !detailRow.disposition &&
                    detailRow.state !== "Cancelled" && (
                      <SheetClose asChild>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => {
                            setExcusingId(
                              detailRow.expected_attendance_id ??
                                detailRow.enrollment_id
                            );
                            setExcuseCategory("");
                            setExcuseDetails("");
                          }}
                        >
                          {EXCUSE_COPY.action}
                        </Button>
                      </SheetClose>
                    )}
                  <SheetClose asChild>
                    <Button variant="outline" type="button">
                      {COPY.attendance.participantDetailClose}
                    </Button>
                  </SheetClose>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </>
    </Sheet>
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
  const [pendingCheckIn, setPendingCheckIn] = useState<{
    member: AttendanceMember;
    method: "leader_qr_scan" | "leader_manual_search";
  } | null>(null);
  const [memberDirectory, setMemberDirectory] = useState<
    Record<string, AttendanceMember>
  >({});
  const [event, setEvent] = useState<AttendanceEvent | null>(null);
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [expectedRows, setExpectedRows] = useState<AttendanceExpectedRow[]>([]);
  const [rosterCounts, setRosterCounts] =
    useState<AttendanceRosterCounts | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false
  );
  const [pageVisible, setPageVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible"
  );
  const [stale, setStale] = useState(false);
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [materializationRequired, setMaterializationRequired] = useState(false);
  const selectedEventIdRef = useRef<string | null>(null);
  const rosterRequestRef = useRef(false);
  const rosterRequestPromiseRef = useRef<Promise<boolean> | null>(null);
  const staleRef = useRef(false);
  const mutationOutcomeUnknownRef = useRef(false);

  useEffect(() => {
    staleRef.current = stale;
    mutationOutcomeUnknownRef.current = mutationOutcomeUnknown;
  }, [mutationOutcomeUnknown, stale]);

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
    if (!online) {
      setChooserLoading(false);
      setChooserError(COPY.attendance.rosterOffline);
      return;
    }
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

  interface RosterLoadOptions {
    silent?: boolean;
  }

  function applyRosterResult(
    id: string,
    result: Awaited<ReturnType<typeof listAttendanceRoster>>,
    clearRecovery = true
  ) {
    if (selectedEventIdRef.current !== id) {
      return false;
    }
    if (
      !clearRecovery &&
      (staleRef.current || mutationOutcomeUnknownRef.current)
    ) {
      return false;
    }
    setEvent(result.event);
    setRows(result.attendances ?? []);
    setExpectedRows(result.expected ?? []);
    setRosterCounts(result.counts ?? null);
    setMaterializationRequired(
      Boolean(result.materialization_required && !result.snapshot)
    );
    if (clearRecovery) {
      setStale(false);
      setMutationOutcomeUnknown(false);
    }
    setLastUpdatedAt(Date.now());
    updateAttendanceEventUrl(id);
    return true;
  }

  async function performRosterRead(
    id: string,
    { silent = false }: RosterLoadOptions = {}
  ): Promise<boolean> {
    if (!silent) {
      setBusy(true);
    }
    try {
      const result = await listAttendanceRoster(id);
      return applyRosterResult(id, result, !silent);
    } catch (error) {
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        handleAuthRequired();
      } else if (silent) {
        setStale(true);
      } else {
        showError(error);
      }
      return false;
    } finally {
      if (!silent) {
        setBusy(false);
      }
    }
  }

  async function loadRoster(
    id: string,
    options: RosterLoadOptions = {}
  ): Promise<boolean> {
    const { silent = false } = options;
    if (silent && (staleRef.current || mutationOutcomeUnknownRef.current)) {
      return false;
    }
    if (rosterRequestRef.current) {
      if (silent) {
        return false;
      }
      const activeRequest = rosterRequestPromiseRef.current;
      if (!activeRequest) {
        return false;
      }
      await activeRequest;
      return loadRoster(id, options);
    }
    rosterRequestRef.current = true;
    const request = performRosterRead(id, options);
    rosterRequestPromiseRef.current = request;
    try {
      return await request;
    } finally {
      rosterRequestRef.current = false;
      if (rosterRequestPromiseRef.current === request) {
        rosterRequestPromiseRef.current = null;
      }
    }
  }

  async function refreshRosterAfterMutation(): Promise<boolean> {
    const id = selectedEventIdRef.current;
    if (!id) {
      return true;
    }
    const refreshed = await loadRoster(id);
    if (!refreshed) {
      setStale(true);
      showStatus(COPY.attendance.rosterSavedStale, "error");
      announce(COPY.attendance.rosterSavedStale);
    }
    return refreshed;
  }

  async function reconcileUnknownAttendance(): Promise<void> {
    const id = selectedEventIdRef.current;
    if (!id) {
      return;
    }
    const refreshed = await loadRoster(id);
    if (refreshed) {
      setMutationOutcomeUnknown(false);
      showStatus(COPY.programs.workspaceReconciled, "info");
      announce(COPY.programs.workspaceReconciled);
    } else {
      setStale(true);
      setMutationOutcomeUnknown(true);
      showStatus(COPY.attendance.transportAmbiguous, "error");
      announce(COPY.attendance.transportAmbiguous);
    }
  }

  async function materializeRoster() {
    const id = selectedEventIdRef.current;
    if (
      !id ||
      !online ||
      rosterRequestRef.current ||
      mutationOutcomeUnknown ||
      stale
    ) {
      return;
    }
    rosterRequestRef.current = true;
    setBusy(true);
    try {
      const result = await materializeAttendanceSnapshot(id);
      applyRosterResult(id, result);
      const message = COPY.attendance.rosterMaterialize;
      showStatus(message, "success");
      announce(message);
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        setMutationOutcomeUnknown(true);
        showStatus(COPY.attendance.transportAmbiguous, "error");
        announce(COPY.attendance.transportAmbiguous);
        // The mutation has settled; release the write lock before the
        // authoritative roster read, otherwise reconciliation self-blocks.
        rosterRequestRef.current = false;
        await reconcileUnknownAttendance();
      } else {
        showError(error);
      }
    } finally {
      rosterRequestRef.current = false;
      setBusy(false);
    }
  }

  async function selectEvent(nextEventId: string) {
    if (mutationOutcomeUnknown) {
      showStatus(COPY.attendance.transportAmbiguous, "error");
      return;
    }
    selectedEventIdRef.current = nextEventId;
    setEventId(nextEventId);
    setShowCheckInSheet(false);
    const loaded = await loadRoster(nextEventId);
    if (loaded) {
      setStatus("");
    }
  }

  function backToChooser() {
    if (mutationOutcomeUnknown) {
      showStatus(COPY.attendance.transportAmbiguous, "error");
      return;
    }
    selectedEventIdRef.current = null;
    setEventId(null);
    setEvent(null);
    setShowCheckInSheet(false);
    setRows([]);
    setExpectedRows([]);
    setRosterCounts(null);
    setMaterializationRequired(false);
    setStale(false);
    setMutationOutcomeUnknown(false);
    setLastUpdatedAt(null);
    setMembers([]);
    setQuery("");
    setStatus("");
    updateAttendanceEventUrl(null);
    void loadChooser();
  }

  async function searchMembers() {
    const trimmed = query.trim();
    if (!online || !eventId || !trimmed) {
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
    if (
      !online ||
      !eventId ||
      rosterRequestRef.current ||
      mutationOutcomeUnknown ||
      stale
    ) {
      return;
    }
    setPendingCheckIn(null);
    setBusy(true);
    try {
      const result = await assistedCheckIn(eventId, member.user_id, method);
      const currentEventTitle = event
        ? event.name?.trim() || event.program_name
        : COPY.attendance.assistedContext;
      const successMessage =
        result.outcome === "duplicate"
          ? COPY.attendance.assistedCheckInDuplicate(
              member.name,
              currentEventTitle
            )
          : COPY.attendance.assistedCheckInSuccess(
              member.name,
              currentEventTitle
            );
      const refreshed = await refreshRosterAfterMutation();
      const message = refreshed
        ? successMessage
        : `${successMessage} ${COPY.attendance.rosterSavedStale}`;
      showStatus(message, refreshed ? "success" : "error");
      announce(message);
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        setMutationOutcomeUnknown(true);
        showStatus(COPY.attendance.transportAmbiguous, "error");
        announce(COPY.attendance.transportAmbiguous);
        await reconcileUnknownAttendance();
      } else {
        showError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(
    row: AttendanceRow,
    reason: string
  ): Promise<boolean> {
    if (
      !online ||
      mutationOutcomeUnknown ||
      stale ||
      rosterRequestRef.current
    ) {
      showStatus(COPY.attendance.rosterOffline, "error");
      return false;
    }
    setBusy(true);
    try {
      await voidAttendance(row.attendance_id, reason);
      if (!(await refreshRosterAfterMutation())) {
        return false;
      }
      showStatus(COPY.attendance.voidSuccess, "success");
      announce(COPY.attendance.voidSuccess);
      return true;
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        setMutationOutcomeUnknown(true);
        showStatus(COPY.attendance.transportAmbiguous, "error");
        announce(COPY.attendance.transportAmbiguous);
        await reconcileUnknownAttendance();
      } else {
        showError(error);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrection(
    row: AttendanceRow,
    input: { name: string; phone: string; reason: string }
  ): Promise<boolean> {
    if (
      !online ||
      mutationOutcomeUnknown ||
      stale ||
      rosterRequestRef.current
    ) {
      showStatus(COPY.attendance.rosterOffline, "error");
      return false;
    }
    setBusy(true);
    try {
      await correctGuestAttendance(row.attendance_id, input);
      if (!(await refreshRosterAfterMutation())) {
        return false;
      }
      showStatus(COPY.attendance.correctionSaved, "success");
      announce(COPY.attendance.correctionSaved);
      return true;
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        setMutationOutcomeUnknown(true);
        showStatus(COPY.attendance.transportAmbiguous, "error");
        announce(COPY.attendance.transportAmbiguous);
        await reconcileUnknownAttendance();
      } else {
        showError(error);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleExcuse(
    row: AttendanceExpectedRow,
    reason: string
  ): Promise<boolean> {
    if (
      !online ||
      mutationOutcomeUnknown ||
      stale ||
      rosterRequestRef.current
    ) {
      showStatus(COPY.attendance.rosterOffline, "error");
      return false;
    }
    setBusy(true);
    try {
      await recordExcusedAttendance(row.event_id, row.enrollment_id, reason);
      if (!(await refreshRosterAfterMutation())) {
        return false;
      }
      showStatus(EXCUSE_COPY.saved, "success");
      announce(EXCUSE_COPY.saved);
      return true;
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        setMutationOutcomeUnknown(true);
        showStatus(COPY.attendance.transportAmbiguous, "error");
        announce(COPY.attendance.transportAmbiguous);
        await reconcileUnknownAttendance();
      } else {
        showError(error);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: async (qrString) => {
      stopCamera();
      if (!online) {
        showStatus(COPY.attendance.rosterOffline, "error");
        return;
      }
      const match = members.find(
        (m) => m.qr_code_string?.trim() === qrString.trim()
      );
      if (match) {
        setPendingCheckIn({ member: match, method: "leader_qr_scan" });
        return;
      }
      if (!eventId) {
        return;
      }
      try {
        const result = await searchAttendanceMembers(eventId, qrString);
        const list = result.members ?? [];
        if (list.length === 1) {
          setPendingCheckIn({ member: list[0], method: "leader_qr_scan" });
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
      } catch (error) {
        showError(error);
      }
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
      selectedEventIdRef.current = deepLinkedEventId;
      setEventId(deepLinkedEventId);
      void loadRoster(deepLinkedEventId);
    }
    // The first render owns the URL-derived deep link; subsequent state changes
    // are driven by the chooser and the roster actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      const id = selectedEventIdRef.current;
      if (id) {
        void loadRoster(id);
      }
    };
    const handleOffline = () => {
      setOnline(false);
      if (selectedEventIdRef.current) {
        setStale(true);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // The listeners intentionally use refs so a reconnect cannot race a
    // stale render's event selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      setPageVisible(visible);
      if (visible && online && selectedEventIdRef.current) {
        void loadRoster(selectedEventIdRef.current);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (
      !eventId ||
      !online ||
      !pageVisible ||
      busy ||
      stale ||
      mutationOutcomeUnknown
    ) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failureCount = 0;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      const succeeded = await loadRoster(eventId, { silent: true });
      if (cancelled) {
        return;
      }
      if (staleRef.current || mutationOutcomeUnknownRef.current) {
        return;
      }
      failureCount = succeeded ? 0 : Math.min(failureCount + 1, 3);
      const delay = succeeded
        ? 10_000
        : Math.min(10_000 * 2 ** failureCount, 60_000);
      timer = setTimeout(() => void poll(), delay);
    };

    timer = setTimeout(() => void poll(), 10_000);
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
    // The polling loop pauses while writes/recovery are busy; loadRoster also
    // uses a ref to prevent overlap and discards stale recovery responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, eventId, mutationOutcomeUnknown, online, pageVisible, stale]);

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
              busy={busy || mutationOutcomeUnknown}
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
                  readOnly={!online || mutationOutcomeUnknown || stale}
                  offline={!online}
                  stale={stale}
                  lastUpdatedAt={lastUpdatedAt}
                  materializationRequired={materializationRequired}
                  onBack={backToChooser}
                  onRefresh={() => {
                    if (eventId) {
                      void loadRoster(eventId);
                    }
                  }}
                  onMaterialize={() => void materializeRoster()}
                  onOpenCheckInSheet={() => setShowCheckInSheet(true)}
                  onVoid={handleVoid}
                  onCorrectGuest={handleCorrection}
                  onExcuse={handleExcuse}
                  onPrint={printAttendanceRoster}
                  onExport={exportRoster}
                />
                {showCheckInSheet && (
                  <EventCheckInSheet
                    event={event}
                    onClose={() => setShowCheckInSheet(false)}
                    onAuthRequired={onAuthRequired}
                  />
                )}
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
                      disabled={busy || !online || stale}
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
                        disabled={busy || !online}
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
                      disabled={busy || !online}
                      onClick={() => void searchMembers()}
                    >
                      {COPY.attendance.search}
                    </Button>
                  </div>
                  {pendingCheckIn && event && (
                    <Card
                      className="grid gap-3"
                      role="dialog"
                      aria-labelledby="assisted-check-in-confirm-title"
                    >
                      <div className="grid gap-1">
                        <h3
                          id="assisted-check-in-confirm-title"
                          className="text-lg font-bold text-[var(--ink)]"
                        >
                          {COPY.attendance.assistedCheckInConfirmTitle}
                        </h3>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {COPY.attendance.assistedCheckInConfirmLead}
                        </p>
                      </div>
                      <div className="grid gap-1 text-sm text-[var(--ink)]">
                        <strong>{pendingCheckIn.member.name}</strong>
                        <span className="text-[var(--ink-muted)]">
                          {pendingCheckIn.member.phone
                            ? COPY.attendance.maskedPhone(
                                pendingCheckIn.member.phone
                              )
                            : pendingCheckIn.member.user_id}
                        </span>
                        <span className="text-[var(--ink-muted)]">
                          {event.program_name} ·{" "}
                          {event.name?.trim() || event.program_name} ·{" "}
                          {hkWallLabel(event.starts_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          disabled={busy || !online || stale}
                          onClick={() =>
                            void checkIn(
                              pendingCheckIn.member,
                              pendingCheckIn.method
                            )
                          }
                        >
                          {COPY.attendance.assistedCheckInConfirm}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingCheckIn(null)}
                        >
                          {COPY.attendance.assistedCheckInCancel}
                        </Button>
                      </div>
                    </Card>
                  )}
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
                            disabled={busy || !online}
                            onClick={() =>
                              setPendingCheckIn({
                                member,
                                method: "leader_manual_search",
                              })
                            }
                          >
                            <strong>{member.name}</strong>
                            <span className="text-sm text-[var(--ink-muted)]">
                              {member.phone
                                ? COPY.attendance.maskedPhone(member.phone)
                                : member.user_id}
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
