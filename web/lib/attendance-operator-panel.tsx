"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  AttendanceSnapshot,
  AttendanceState,
} from "@/lib/programs/program-api";
import { ScreenTab, ScreenTabs } from "@/lib/screen-foundations";
import { clearAuthHint, rememberDeepLink } from "@/lib/session";
import { useQrCamera } from "@/lib/use-qr-camera";
import { cn } from "@/lib/utils";

import { EventCheckInSheet } from "./programs/event-check-in-sheet";

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
type PendingAttendanceMutation =
  | { kind: "check-in"; memberUserId: string }
  | { kind: "void"; attendanceId: string }
  | { kind: "correction"; attendanceId: string; name: string; phone: string }
  | { kind: "excuse"; enrollmentId: string }
  | { kind: "materialize" };

type LiveAttendanceRosterFilter = "not-yet" | "checked-in" | "all";
type PostEventAttendanceRosterFilter =
  | "all"
  | "present"
  | "excused"
  | "absent"
  | "guest";
type AttendanceRosterFilter =
  | LiveAttendanceRosterFilter
  | PostEventAttendanceRosterFilter;

const expectedRowVariants = cva(
  "grid min-w-0 gap-3 border-b border-[var(--line)] py-3 pl-3",
  {
    variants: {
      state: {
        Present: "border-l-2 border-l-[var(--success)]",
        "Not Yet": "border-l-2 border-l-[var(--pending)]",
        Absent: "border-l-2 border-l-[var(--error)]",
        Excused: "border-l-2 border-l-[var(--accent)]",
        Cancelled: "border-l-2 border-l-[var(--line-strong)]",
      },
    },
    defaultVariants: { state: "Not Yet" },
  }
);

const attendanceRowVariants = cva(
  "grid min-w-0 gap-3 border-b border-[var(--line)] py-3 pl-3",
  {
    variants: {
      status: {
        Active: "border-l-2 border-l-[var(--success)]",
        Voided: "border-l-2 border-l-[var(--line-strong)]",
      },
    },
    defaultVariants: { status: "Active" },
  }
);

const attendanceStatusVariants = cva(
  "rounded-full border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        open: "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        present:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        active:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        excused:
          "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent-deep)]",
        closed:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]",
        cancelled:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]",
        "not-yet":
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]",
        absent:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]",
        voided:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)]",
      },
    },
    defaultVariants: { status: "not-yet" },
  }
);

type AttendanceStatusVariant = NonNullable<
  VariantProps<typeof attendanceStatusVariants>["status"]
>;

function attendanceStatusVariant(
  state: AttendanceState
): AttendanceStatusVariant {
  switch (state) {
    case "Present": {
      return "present";
    }
    case "Excused": {
      return "excused";
    }
    case "Cancelled": {
      return "cancelled";
    }
    case "Absent": {
      return "absent";
    }
    default: {
      return "not-yet";
    }
  }
}

function attendanceWindowIsOpen(event: AttendanceEvent, now = Date.now()) {
  if (event.status !== "Active" || event.availability !== "Active") {
    return false;
  }
  const opensAt = Date.parse(event.check_in_window_opens_at);
  const closesAt = Date.parse(event.check_in_window_closes_at);
  return (
    Number.isFinite(opensAt) &&
    Number.isFinite(closesAt) &&
    opensAt <= now &&
    now <= closesAt
  );
}

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
    <section
      className="grid gap-4 print:hidden"
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
                size="default"
                className="flex w-full flex-col items-start justify-between bg-[var(--surface-raised)] text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:flex-row sm:items-center motion-reduce:transition-none"
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
    </section>
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
  snapshot?: AttendanceSnapshot | null;
  onBack?: () => void;
  onRefresh?: () => void;
  onMaterialize?: () => void;
  onCheckIn?: (row: AttendanceExpectedRow) => void;
  operatorContent?: React.ReactNode;
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

interface SheetFocusTarget {
  element: HTMLElement;
  fallbackId: string;
}

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

type AttendanceRosterRead = Awaited<ReturnType<typeof listAttendanceRoster>>;

function rosterSettlesMutation(
  roster: AttendanceRosterRead,
  mutation: PendingAttendanceMutation
): boolean {
  const rows = [...(roster.attendances ?? []), ...(roster.guests ?? [])];
  switch (mutation.kind) {
    case "check-in":
      return rows.some(
        (row) =>
          row.member_user_id === mutation.memberUserId &&
          row.status === "Active"
      );
    case "void":
      return rows.some(
        (row) =>
          row.attendance_id === mutation.attendanceId && row.status === "Voided"
      );
    case "correction":
      return rows.some(
        (row) =>
          row.attendance_id === mutation.attendanceId &&
          row.status === "Active" &&
          row.guest_name === mutation.name &&
          row.guest_phone === mutation.phone
      );
    case "excuse":
      return (roster.expected ?? []).some(
        (row) =>
          row.enrollment_id === mutation.enrollmentId &&
          row.disposition?.disposition === "Excused"
      );
    case "materialize":
      return roster.snapshot !== null || !roster.materialization_required;
  }
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
  snapshot,
  onBack,
  onRefresh,
  onMaterialize,
  onCheckIn,
  operatorContent,
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
  const [detailAdditionalRow, setDetailAdditionalRow] =
    useState<AttendanceRow | null>(null);
  const [rosterFilter, setRosterFilter] =
    useState<AttendanceRosterFilter>("not-yet");
  const voidInputRef = useRef<HTMLInputElement>(null);
  const correctionHeadingRef = useRef<HTMLHeadingElement>(null);
  const excuseInputRef = useRef<HTMLInputElement>(null);
  const sheetFocusTargetRef = useRef<SheetFocusTarget | null>(null);
  const [focusRestoreToken, setFocusRestoreToken] = useState(0);

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
    if (readOnly) {
      setVoidingId(null);
      setCorrectionId(null);
      setExcusingId(null);
    }
  }, [readOnly]);

  useLayoutEffect(() => {
    const target = sheetFocusTargetRef.current;
    if (focusRestoreToken === 0 || !target) {
      return;
    }
    const focusTarget = target.element.isConnected
      ? target.element
      : document.getElementById(target.fallbackId);
    if (
      focusTarget instanceof HTMLElement &&
      focusTarget.isConnected &&
      !focusTarget.hasAttribute("disabled")
    ) {
      focusTarget.focus();
    }
    sheetFocusTargetRef.current = null;
  }, [focusRestoreToken]);

  const rememberSheetFocus = (
    event: React.MouseEvent<HTMLElement>,
    fallbackId: string
  ) => {
    sheetFocusTargetRef.current = {
      element: event.currentTarget,
      fallbackId,
    };
  };

  const requestSheetFocusRestore = () => {
    if (sheetFocusTargetRef.current) {
      setFocusRestoreToken((token) => token + 1);
    }
  };

  const activeRows = rows.filter((row) => row.status === "Active");
  const expectedAttendanceIds = new Set(
    expectedRows.flatMap(({ attendance }) =>
      attendance ? [attendance.attendance_id] : []
    )
  );
  const hasExpectedProjection = expectedRows.length > 0;
  const hasMaterializedProjection =
    snapshot === undefined ? hasExpectedProjection : snapshot !== null;
  const additionalRows = rows.filter(
    (row) =>
      !expectedAttendanceIds.has(row.attendance_id) &&
      (!hasMaterializedProjection ||
        row.member_user_id === null ||
        row.status === "Active")
  );
  const guestRows = additionalRows.filter((row) => row.member_user_id === null);
  const additionalPresentRows = additionalRows.filter(
    (row) => row.member_user_id !== null && row.status === "Active"
  );
  const statusIsOpen = attendanceWindowIsOpen(event);
  const eventQrAvailable = statusIsOpen;
  const closesAt = Date.parse(event.check_in_window_closes_at);
  const windowClosed = Number.isFinite(closesAt) && Date.now() > closesAt;
  const hasAbsent = expectedRows.some((row) => row.state === "Absent");
  const isPostEventRoster =
    hasMaterializedProjection && event.status !== "Cancelled" && windowClosed;

  useEffect(() => {
    setRosterFilter(
      isPostEventRoster ? (hasAbsent ? "absent" : "all") : "not-yet"
    );
  }, [event.event_id, hasAbsent, isPostEventRoster]);

  const visibleExpectedRows = expectedRows.filter((row) => {
    if (!hasMaterializedProjection || rosterFilter === "all") {
      return true;
    }
    if (isPostEventRoster) {
      switch (rosterFilter) {
        case "present": {
          return row.state === "Present";
        }
        case "excused": {
          return row.state === "Excused";
        }
        case "absent": {
          return row.state === "Absent";
        }
        case "guest": {
          return false;
        }
        default: {
          return true;
        }
      }
    }
    if (rosterFilter === "checked-in") {
      return row.state === "Present";
    }
    return row.state !== "Present" && row.state !== "Cancelled";
  });
  const visibleAdditionalRows = hasMaterializedProjection
    ? isPostEventRoster
      ? rosterFilter === "all"
        ? additionalRows
        : rosterFilter === "present"
          ? additionalPresentRows
          : rosterFilter === "guest"
            ? guestRows
            : []
      : rosterFilter === "all"
        ? additionalRows
        : rosterFilter === "checked-in"
          ? additionalRows.filter((row) => row.status === "Active")
          : []
    : additionalRows;
  const liveRosterFilterCounts = {
    "not-yet": expectedRows.filter(
      (row) => row.state !== "Present" && row.state !== "Cancelled"
    ).length,
    "checked-in":
      expectedRows.filter((row) => row.state === "Present").length +
      (hasMaterializedProjection
        ? additionalRows.filter((row) => row.status === "Active").length
        : activeRows.length),
    all: expectedRows.length + additionalRows.length,
  } satisfies Record<LiveAttendanceRosterFilter, number>;
  const postEventRosterFilterCounts = {
    all: expectedRows.length + additionalRows.length,
    present:
      expectedRows.filter((row) => row.state === "Present").length +
      additionalPresentRows.length,
    excused: expectedRows.filter((row) => row.state === "Excused").length,
    absent: expectedRows.filter((row) => row.state === "Absent").length,
    guest: guestRows.length,
  } satisfies Record<PostEventAttendanceRosterFilter, number>;
  const countForRosterFilter = (value: AttendanceRosterFilter) =>
    isPostEventRoster
      ? postEventRosterFilterCounts[value as PostEventAttendanceRosterFilter]
      : liveRosterFilterCounts[value as LiveAttendanceRosterFilter];
  const eventTitle = event.name?.trim() || event.program_name;
  const checkedInCount = counts?.present ?? activeRows.length;
  const expectedCount = counts?.expected ?? rows.length;
  const lastUpdatedLabel = lastUpdatedAt
    ? hkWallLabel(new Date(lastUpdatedAt).toISOString())
    : null;
  const writeDisabled = busy || readOnly;
  const voidRow = rows.find((row) => row.attendance_id === voidingId);
  const correctionRow = rows.find((row) => row.attendance_id === correctionId);
  const excuseRow = expectedRows.find(
    (row) => (row.expected_attendance_id ?? row.enrollment_id) === excusingId
  );

  async function submitVoid(row: AttendanceRow) {
    const reason = voidReason.trim();
    if (!reason || !onVoid) {
      return;
    }
    const saved = await onVoid(row, reason);
    if (saved) {
      requestSheetFocusRestore();
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
      requestSheetFocusRestore();
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
      requestSheetFocusRestore();
      setExcusingId(null);
      setExcuseCategory("");
      setExcuseDetails("");
    }
  }

  return (
    <Sheet
      open={
        detailRow !== null ||
        detailAdditionalRow !== null ||
        voidingId !== null ||
        correctionId !== null ||
        excusingId !== null
      }
      onOpenChange={(open) => {
        if (!open) {
          requestSheetFocusRestore();
          setDetailRow(null);
          setDetailAdditionalRow(null);
          setVoidingId(null);
          setCorrectionId(null);
          setExcusingId(null);
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
              className={cn(
                attendanceStatusVariants({
                  status: statusIsOpen
                    ? "open"
                    : event.status === "Cancelled"
                      ? "cancelled"
                      : "closed",
                })
              )}
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
            {onOpenCheckInSheet &&
              event.manual_check_in_code &&
              eventQrAvailable && (
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

        {operatorContent}

        {expectedRows.length === 0 && rows.length === 0 ? (
          <output
            className="text-base text-[var(--ink-muted)] py-4 text-center block print:hidden"
            aria-live="polite"
          >
            {COPY.programs.eventNoParticipants}
          </output>
        ) : (
          <>
            {hasMaterializedProjection && (
              <div className="mt-4 grid min-w-0 gap-2 print:hidden">
                <p className="m-0 text-sm text-[var(--ink-muted)]">
                  {isPostEventRoster
                    ? COPY.attendance.rosterPostEventFilterHint
                    : COPY.attendance.rosterFilterHint}
                </p>
                <ScreenTabs
                  aria-label={COPY.attendance.rosterFilterLabel}
                  value={rosterFilter}
                  onValueChange={(value) =>
                    setRosterFilter(value as AttendanceRosterFilter)
                  }
                  role="tablist"
                >
                  {(isPostEventRoster
                    ? ([
                        ["all", COPY.attendance.rosterFilterAll],
                        ["present", COPY.attendance.rosterFilterPresent],
                        ["excused", COPY.attendance.rosterFilterExcused],
                        ["absent", COPY.attendance.rosterFilterAbsent],
                        ["guest", COPY.attendance.rosterFilterGuest],
                      ] as const)
                    : ([
                        ["not-yet", COPY.attendance.rosterFilterNotYet],
                        ["checked-in", COPY.attendance.rosterFilterCheckedIn],
                        ["all", COPY.attendance.rosterFilterAll],
                      ] as const)
                  ).map(([value, label]) => (
                    <ScreenTab
                      key={value}
                      id={`attendance-${value}-tab`}
                      role="tab"
                      aria-controls={`attendance-${value}-panel`}
                      aria-selected={rosterFilter === value}
                      selected={rosterFilter === value}
                      value={value}
                    >
                      {label} ({countForRosterFilter(value)})
                    </ScreenTab>
                  ))}
                </ScreenTabs>
              </div>
            )}

            <section
              id={`attendance-${rosterFilter}-panel`}
              role={hasMaterializedProjection ? "tabpanel" : undefined}
              aria-labelledby={
                hasMaterializedProjection
                  ? `attendance-${rosterFilter}-tab`
                  : undefined
              }
              tabIndex={hasMaterializedProjection ? 0 : undefined}
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
                      className="mt-4 grid list-none gap-0 p-0 print:hidden"
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
                        const detailTriggerId = `attendance-expected-detail-${expectedKey}`;
                        return (
                          <li
                            className={expectedRowVariants({
                              state: row.state,
                            })}
                            data-attendance-expected-row
                            key={expectedKey}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <Button
                                  variant="link"
                                  size="row"
                                  className="text-left text-base font-bold text-[var(--ink)] [overflow-wrap:anywhere]"
                                  type="button"
                                  id={detailTriggerId}
                                  onClick={(event) => {
                                    rememberSheetFocus(event, detailTriggerId);
                                    setDetailRow(row);
                                    setDetailAdditionalRow(null);
                                  }}
                                >
                                  {row.member_name ||
                                    memberDirectory[row.member_user_id]?.name ||
                                    row.member_user_id}
                                </Button>
                                <p className="text-sm text-[var(--ink-muted)]">
                                  {displayPhone ?? "會員"}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  attendanceStatusVariants({
                                    status: attendanceStatusVariant(row.state),
                                  })
                                )}
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
                                {row.state === "Not Yet" &&
                                  statusIsOpen &&
                                  onCheckIn && (
                                    <Button
                                      type="button"
                                      variant="default"
                                      disabled={writeDisabled}
                                      onClick={() => onCheckIn(row)}
                                    >
                                      {COPY.attendance.checkInMember}
                                    </Button>
                                  )}
                                {attendance?.status === "Active" && (
                                  <Button
                                    variant="destructive"
                                    type="button"
                                    disabled={writeDisabled}
                                    onClick={(event) => {
                                      rememberSheetFocus(
                                        event,
                                        detailTriggerId
                                      );
                                      setVoidingId(attendance.attendance_id);
                                      setVoidReason("");
                                      setExcusingId(null);
                                      setCorrectionId(null);
                                      setDetailRow(null);
                                      setDetailAdditionalRow(null);
                                    }}
                                  >
                                    {COPY.attendance.voidAttendance}
                                  </Button>
                                )}
                                {onExcuse &&
                                  !readOnly &&
                                  !row.disposition &&
                                  row.state !== "Present" && (
                                    <Button
                                      variant="outline"
                                      type="button"
                                      disabled={writeDisabled}
                                      onClick={(event) => {
                                        rememberSheetFocus(
                                          event,
                                          detailTriggerId
                                        );
                                        setExcusingId(expectedKey);
                                        setExcuseCategory("");
                                        setExcuseDetails("");
                                        setVoidingId(null);
                                        setCorrectionId(null);
                                        setDetailRow(null);
                                        setDetailAdditionalRow(null);
                                      }}
                                    >
                                      {EXCUSE_COPY.action}
                                    </Button>
                                  )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {visibleAdditionalRows.length > 0 && (
                    <div className="mt-4 grid min-w-0 gap-2 print:hidden">
                      <h2 className="m-0 text-base font-bold text-[var(--ink)]">
                        {COPY.attendance.rosterAdditionalTitle}
                      </h2>
                      <ul
                        className="grid list-none gap-0 p-0"
                        aria-label={COPY.attendance.rosterAdditionalTitle}
                      >
                        {visibleAdditionalRows.map((row) => {
                          const phone = rowPhone(row, memberDirectory);
                          const displayPhone =
                            phone && row.member_user_id
                              ? COPY.attendance.maskedPhone(phone)
                              : phone;
                          const detailTriggerId = `attendance-additional-detail-${row.attendance_id}`;
                          return (
                            <li
                              className={attendanceRowVariants({
                                status: row.status,
                              })}
                              data-attendance-additional-row
                              key={row.attendance_id}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <Button
                                    variant="link"
                                    size="row"
                                    className="text-left text-base font-bold text-[var(--ink)] [overflow-wrap:anywhere]"
                                    type="button"
                                    id={detailTriggerId}
                                    onClick={(event) => {
                                      rememberSheetFocus(
                                        event,
                                        detailTriggerId
                                      );
                                      setDetailAdditionalRow(row);
                                      setDetailRow(null);
                                    }}
                                  >
                                    {rowLabel(row, memberDirectory)}
                                  </Button>
                                  <p className="text-sm text-[var(--ink-muted)]">
                                    {displayPhone ??
                                      COPY.attendance.method[row.method]}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    attendanceStatusVariants({
                                      status:
                                        row.status === "Active"
                                          ? "active"
                                          : "voided",
                                    })
                                  )}
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
                                    onClick={(event) => {
                                      rememberSheetFocus(
                                        event,
                                        detailTriggerId
                                      );
                                      setVoidingId(row.attendance_id);
                                      setVoidReason("");
                                      setCorrectionId(null);
                                      setExcusingId(null);
                                      setDetailRow(null);
                                      setDetailAdditionalRow(null);
                                    }}
                                  >
                                    {COPY.attendance.voidAttendance}
                                  </Button>
                                  {row.member_user_id === null && !readOnly && (
                                    <Button
                                      variant="outline"
                                      type="button"
                                      disabled={writeDisabled}
                                      onClick={(event) => {
                                        rememberSheetFocus(
                                          event,
                                          detailTriggerId
                                        );
                                        setCorrectionId(row.attendance_id);
                                        setCorrectionName(row.guest_name ?? "");
                                        setCorrectionPhone(
                                          row.guest_phone ?? ""
                                        );
                                        setCorrectionReason("");
                                        setVoidingId(null);
                                        setExcusingId(null);
                                        setDetailRow(null);
                                        setDetailAdditionalRow(null);
                                      }}
                                    >
                                      {COPY.attendance.correctGuest}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
        <SheetContent
          side="bottom"
          aria-label={COPY.attendance.participantDetailTitle}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestSheetFocusRestore();
          }}
        >
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
                      <Button
                        variant="destructive"
                        type="button"
                        onClick={() => {
                          setVoidingId(
                            detailRow.attendance?.attendance_id ?? null
                          );
                          setVoidReason("");
                          setDetailRow(null);
                          setDetailAdditionalRow(null);
                        }}
                      >
                        {COPY.attendance.voidAttendance}
                      </Button>
                    )}
                  {!readOnly &&
                    onExcuse &&
                    !detailRow.disposition &&
                    detailRow.state !== "Present" &&
                    detailRow.state !== "Cancelled" && (
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
                          setDetailRow(null);
                          setDetailAdditionalRow(null);
                        }}
                      >
                        {EXCUSE_COPY.action}
                      </Button>
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
          {detailAdditionalRow && (
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
                  <strong className="text-lg">
                    {rowLabel(detailAdditionalRow, memberDirectory)}
                  </strong>
                  <span className="text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailPhone}：
                    {rowPhone(detailAdditionalRow, memberDirectory) ?? "—"}
                  </span>
                </div>
                <div className="grid gap-1">
                  <span className="font-bold text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailStatus}
                  </span>
                  <span>
                    {COPY.attendance.status[detailAdditionalRow.status]}
                  </span>
                </div>
                <div className="grid gap-2">
                  <h3 className="font-bold text-[var(--ink-muted)]">
                    {COPY.attendance.participantDetailHistory}
                  </h3>
                  <div className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-3">
                    <span>
                      {COPY.attendance.method[detailAdditionalRow.method]}
                    </span>
                    <span className="text-[var(--ink-muted)]">
                      {COPY.attendance.participantDetailCheckedInAt}：
                      {hkWallLabel(detailAdditionalRow.checked_in_at)}
                    </span>
                    {detailAdditionalRow.status === "Voided" &&
                      detailAdditionalRow.void_reason && (
                        <span className="text-[var(--error)]">
                          {detailAdditionalRow.void_reason}
                        </span>
                      )}
                    {detailAdditionalRow.status === "Voided" &&
                      detailAdditionalRow.voided_at && (
                        <span className="text-[var(--ink-muted)]">
                          {COPY.attendance.participantDetailRecordedAt}：
                          {hkWallLabel(detailAdditionalRow.voided_at)}
                        </span>
                      )}
                  </div>
                </div>
              </div>
              <SheetFooter>
                <div className="flex flex-wrap gap-3">
                  {!readOnly &&
                    detailAdditionalRow.status === "Active" &&
                    onVoid && (
                      <Button
                        variant="destructive"
                        type="button"
                        onClick={() => {
                          setVoidingId(detailAdditionalRow.attendance_id);
                          setVoidReason("");
                          setDetailAdditionalRow(null);
                        }}
                      >
                        {COPY.attendance.voidAttendance}
                      </Button>
                    )}
                  {!readOnly &&
                    detailAdditionalRow.status === "Active" &&
                    detailAdditionalRow.member_user_id === null &&
                    onCorrectGuest && (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                          setCorrectionId(detailAdditionalRow.attendance_id);
                          setCorrectionName(
                            detailAdditionalRow.guest_name ?? ""
                          );
                          setCorrectionPhone(
                            detailAdditionalRow.guest_phone ?? ""
                          );
                          setCorrectionReason("");
                          setDetailAdditionalRow(null);
                        }}
                      >
                        {COPY.attendance.correctGuest}
                      </Button>
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
          {voidRow && !readOnly && (
            <>
              <SheetHeader className="border-b border-[var(--line)]">
                <SheetTitle className="text-xl font-bold text-[var(--ink)]">
                  {COPY.attendance.voidAttendance}
                </SheetTitle>
                <SheetDescription>{COPY.attendance.voidLead}</SheetDescription>
              </SheetHeader>
              <form
                className="grid gap-3 px-4"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  void submitVoid(voidRow);
                }}
              >
                <label className="grid gap-1.5" htmlFor="void-reason">
                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                    {COPY.attendance.voidReason}
                  </span>
                  <Input
                    ref={voidInputRef}
                    id="void-reason"
                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    value={voidReason}
                    onChange={(eventChange) =>
                      setVoidReason(eventChange.target.value)
                    }
                    required
                    autoComplete="off"
                  />
                </label>
                <SheetFooter className="p-0 pb-4">
                  <div className="flex flex-wrap gap-3">
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
                </SheetFooter>
              </form>
            </>
          )}
          {excuseRow && onExcuse && !readOnly && (
            <>
              <SheetHeader className="border-b border-[var(--line)]">
                <SheetTitle className="text-xl font-bold text-[var(--ink)]">
                  {EXCUSE_COPY.action}
                </SheetTitle>
                <SheetDescription>
                  {event.program_name} · {eventTitle} ·{" "}
                  {hkWallLabel(event.starts_at)}
                </SheetDescription>
              </SheetHeader>
              <form
                className="grid gap-3 px-4"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  void submitExcuse(excuseRow);
                }}
              >
                <label className="grid gap-1.5" htmlFor="excuse-category">
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
                      id="excuse-category"
                      aria-label={EXCUSE_COPY.reason}
                    >
                      <SelectValue
                        placeholder={COPY.attendance.excuseReasonPlaceholder}
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
                <label className="grid gap-1.5" htmlFor="excuse-details">
                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                    {COPY.attendance.excuseDetails}
                    {excuseCategory === "其他"
                      ? COPY.attendance.excuseDetailsRequired
                      : COPY.attendance.excuseDetailsOptional}
                  </span>
                  <Input
                    ref={excuseInputRef}
                    id="excuse-details"
                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    value={excuseDetails}
                    onChange={(eventChange) =>
                      setExcuseDetails(eventChange.target.value)
                    }
                    required={excuseCategory === "其他"}
                    autoComplete="off"
                  />
                </label>
                <SheetFooter className="p-0 pb-4">
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="default"
                      type="submit"
                      disabled={
                        writeDisabled ||
                        !excuseCategory ||
                        (excuseCategory === "其他" && !excuseDetails.trim())
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
                </SheetFooter>
              </form>
            </>
          )}
          {correctionRow && !readOnly && (
            <>
              <SheetHeader className="border-b border-[var(--line)]">
                <SheetTitle
                  ref={correctionHeadingRef}
                  className="text-xl font-bold text-[var(--ink)]"
                >
                  {COPY.attendance.guestCorrection}
                </SheetTitle>
                <SheetDescription>
                  {COPY.attendance.correctionLead}
                </SheetDescription>
              </SheetHeader>
              <form
                className="grid gap-3 px-4"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  void submitCorrection(correctionRow);
                }}
              >
                <label className="grid gap-1.5" htmlFor="correction-name">
                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                    {COPY.attendance.guestName}
                  </span>
                  <Input
                    id="correction-name"
                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    value={correctionName}
                    onChange={(eventChange) =>
                      setCorrectionName(eventChange.target.value)
                    }
                    maxLength={80}
                    required
                  />
                </label>
                <label className="grid gap-1.5" htmlFor="correction-phone">
                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                    {COPY.attendance.guestPhone}
                  </span>
                  <Input
                    id="correction-phone"
                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    value={correctionPhone}
                    onChange={(eventChange) =>
                      setCorrectionPhone(eventChange.target.value)
                    }
                    required
                  />
                </label>
                <label className="grid gap-1.5" htmlFor="correction-reason">
                  <span className="text-sm font-bold leading-normal text-[var(--ink)]">
                    {COPY.attendance.correctionReason}
                  </span>
                  <Input
                    id="correction-reason"
                    className="bg-[var(--surface-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    value={correctionReason}
                    onChange={(eventChange) =>
                      setCorrectionReason(eventChange.target.value)
                    }
                    required
                  />
                </label>
                <SheetFooter className="p-0 pb-4">
                  <div className="flex flex-wrap gap-3">
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
                </SheetFooter>
              </form>
            </>
          )}
        </SheetContent>
      </>
    </Sheet>
  );
};

export interface AttendanceOperatorPanelProps {
  onAuthRequired?: () => void;
  onMutationBlockChange?: (blocked: boolean) => void;
}

export const AttendanceOperatorPanel = ({
  onAuthRequired,
  onMutationBlockChange,
}: AttendanceOperatorPanelProps = {}) => {
  const [eventId, setEventId] = useState<string | null>(null);
  const [chooserEvents, setChooserEvents] = useState<AttendanceEventSummary[]>(
    []
  );
  const [chooserLoading, setChooserLoading] = useState(true);
  const [chooserError, setChooserError] = useState<string | null>(null);
  const [rosterReadError, setRosterReadError] = useState<string | null>(null);
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
  const [rosterSnapshot, setRosterSnapshot] =
    useState<AttendanceSnapshot | null>(null);
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
  const onlineRef = useRef(online);
  const selectedEventIdRef = useRef<string | null>(null);
  const rosterRequestRef = useRef(false);
  const rosterRequestPromiseRef = useRef<Promise<boolean> | null>(null);
  const latestRosterResultRef = useRef<AttendanceRosterRead | null>(null);
  const pendingMutationRef = useRef<PendingAttendanceMutation | null>(null);
  const staleRef = useRef(false);
  const mutationOutcomeUnknownRef = useRef(false);

  useEffect(() => {
    onlineRef.current = online;
    staleRef.current = stale;
    mutationOutcomeUnknownRef.current = mutationOutcomeUnknown;
  }, [mutationOutcomeUnknown, online, stale]);

  useEffect(() => {
    onMutationBlockChange?.(mutationOutcomeUnknown);
    return () => onMutationBlockChange?.(false);
  }, [mutationOutcomeUnknown, onMutationBlockChange]);

  useEffect(() => {
    if (!mutationOutcomeUnknown || typeof window === "undefined") {
      return;
    }
    const blockedHref = window.location.href;
    const guardToken = crypto.randomUUID();
    const historyState =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    const guardedState = {
      ...historyState,
      efccAttendanceMutationGuard: guardToken,
    };
    window.history.pushState(guardedState, "", blockedHref);
    const announceBlocked = () => {
      const message = COPY.attendance.transportAmbiguous;
      setStatus(message);
      setTone("error");
      announce(message);
    };
    const handleDocumentClick = (clickEvent: globalThis.MouseEvent) => {
      if (
        clickEvent.defaultPrevented ||
        clickEvent.button !== 0 ||
        clickEvent.metaKey ||
        clickEvent.ctrlKey ||
        clickEvent.shiftKey ||
        clickEvent.altKey
      ) {
        return;
      }
      const target = clickEvent.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-attendance-operator-root='true']")) {
        return;
      }
      const anchor = target.closest("a[href]");
      const button = target.closest("button");
      if (!anchor && !button) {
        return;
      }
      if (anchor instanceof HTMLAnchorElement) {
        const rawHref = anchor.getAttribute("href");
        if (
          rawHref?.startsWith("#") ||
          anchor.hasAttribute("download") ||
          (anchor.getAttribute("target") ?? "").toLowerCase() === "_blank"
        ) {
          return;
        }
      }
      if (button instanceof HTMLButtonElement && button.disabled) {
        return;
      }
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      announceBlocked();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePopState = () => {
      window.history.pushState(guardedState, "", blockedHref);
      announceBlocked();
    };
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      if (
        window.location.href === blockedHref &&
        (window.history.state as Record<string, unknown> | null)
          ?.efccAttendanceMutationGuard === guardToken
      ) {
        window.history.back();
      }
    };
  }, [mutationOutcomeUnknown]);

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

  function markUnknownMutation(mutation: PendingAttendanceMutation) {
    pendingMutationRef.current = mutation;
    setMutationOutcomeUnknown(true);
    showStatus(COPY.attendance.transportAmbiguous, "error");
    announce(COPY.attendance.transportAmbiguous);
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
    clearRecovery?: boolean;
    allowRecovery?: boolean;
  }

  function applyRosterResult(
    id: string,
    result: Awaited<ReturnType<typeof listAttendanceRoster>>,
    clearRecovery = true,
    allowRecovery = false
  ) {
    if (selectedEventIdRef.current !== id) {
      return false;
    }
    if (
      !clearRecovery &&
      !allowRecovery &&
      (staleRef.current || mutationOutcomeUnknownRef.current)
    ) {
      return false;
    }
    latestRosterResultRef.current = result;
    setEvent(result.event);
    setRows(result.attendances ?? []);
    setExpectedRows(result.expected ?? []);
    setRosterSnapshot(result.snapshot ?? null);
    setRosterCounts(result.counts ?? null);
    setMaterializationRequired(
      Boolean(result.materialization_required && !result.snapshot)
    );
    if (clearRecovery) {
      setStale(false);
      setMutationOutcomeUnknown(false);
      setRosterReadError(null);
    }
    setLastUpdatedAt(Date.now());
    updateAttendanceEventUrl(id);
    return true;
  }

  async function performRosterRead(
    id: string,
    {
      silent = false,
      clearRecovery,
      allowRecovery = false,
    }: RosterLoadOptions = {}
  ): Promise<boolean> {
    if (!silent) {
      setBusy(true);
    }
    try {
      const result = await listAttendanceRoster(id);
      return applyRosterResult(
        id,
        result,
        clearRecovery ?? !silent,
        allowRecovery
      );
    } catch (error) {
      if (selectedEventIdRef.current !== id) {
        return false;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.attendance.assistedAccessError;
      // Keep a confirmed snapshot visible only as an explicitly stale,
      // read-only projection. A failed read must never look writable.
      setStale(true);
      setRosterReadError(message);
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        handleAuthRequired();
      } else if (!silent) {
        showStatus(message, "error");
        announce(message);
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
    const refreshed = await loadRoster(id, {
      allowRecovery: true,
      clearRecovery: false,
    });
    const pendingMutation = pendingMutationRef.current;
    const roster = latestRosterResultRef.current;
    if (
      refreshed &&
      roster &&
      pendingMutation &&
      rosterSettlesMutation(roster, pendingMutation)
    ) {
      pendingMutationRef.current = null;
      setStale(false);
      setMutationOutcomeUnknown(false);
      setRosterReadError(null);
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
      pendingMutationRef.current = null;
      const message = COPY.attendance.rosterMaterialize;
      showStatus(message, "success");
      announce(message);
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        markUnknownMutation({ kind: "materialize" });
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
    pendingMutationRef.current = null;
    latestRosterResultRef.current = null;
    setEventId(nextEventId);
    setEvent(null);
    setRows([]);
    setExpectedRows([]);
    setRosterSnapshot(null);
    setRosterCounts(null);
    setMaterializationRequired(false);
    setStale(false);
    setRosterReadError(null);
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
    pendingMutationRef.current = null;
    latestRosterResultRef.current = null;
    setEventId(null);
    setEvent(null);
    setShowCheckInSheet(false);
    setRows([]);
    setExpectedRows([]);
    setRosterSnapshot(null);
    setRosterCounts(null);
    setMaterializationRequired(false);
    setStale(false);
    setRosterReadError(null);
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
        markUnknownMutation({
          kind: "check-in",
          memberUserId: member.user_id,
        });
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
        markUnknownMutation({
          kind: "void",
          attendanceId: row.attendance_id,
        });
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
        markUnknownMutation({
          kind: "correction",
          attendanceId: row.attendance_id,
          name: input.name,
          phone: input.phone,
        });
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
        markUnknownMutation({
          kind: "excuse",
          enrollmentId: row.enrollment_id,
        });
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
      onlineRef.current = true;
      setOnline(true);
      const id = selectedEventIdRef.current;
      if (id) {
        void (mutationOutcomeUnknownRef.current
          ? reconcileUnknownAttendance()
          : loadRoster(id));
      }
    };
    const handleOffline = () => {
      onlineRef.current = false;
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
      if (visible && onlineRef.current && selectedEventIdRef.current) {
        void (mutationOutcomeUnknownRef.current
          ? reconcileUnknownAttendance()
          : loadRoster(selectedEventIdRef.current));
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
  const expectedMemberIds = new Set(
    expectedRows.map((row) => row.member_user_id)
  );
  const operatorContent =
    rosterVisible && event && eventId && attendanceWindowIsOpen(event) ? (
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
        <p className="m-0 text-sm leading-6 text-[var(--ink-muted)]">
          {COPY.attendance.rosterFilterHint}
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Button
            variant="outline"
            type="button"
            disabled={busy || !online || stale}
            onClick={() => void startCamera()}
          >
            {cameraOpen ? COPY.attendance.cameraRetry : COPY.attendance.camera}
          </Button>
          {cameraOpen && (
            <Button variant="outline" type="button" onClick={stopCamera}>
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
              onChange={(changeEvent) => setQuery(changeEvent.target.value)}
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
        {pendingCheckIn && (
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
                  ? COPY.attendance.maskedPhone(pendingCheckIn.member.phone)
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
                  void checkIn(pendingCheckIn.member, pendingCheckIn.method)
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
            {members.map((member) => {
              const expected = expectedMemberIds.has(member.user_id);
              return (
                <li key={member.user_id}>
                  <Button
                    variant="outline"
                    size="default"
                    className="flex w-full flex-col items-start justify-between bg-[var(--surface-raised)] text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:flex-row sm:items-center motion-reduce:transition-none"
                    type="button"
                    data-search-member-kind={expected ? "expected" : "addition"}
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
                      {expected
                        ? COPY.attendance.checkInMember
                        : COPY.attendance.addAndCheckIn}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    ) : null;
  return (
    <div
      className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12 print:p-0 print:m-0 print:w-full"
      data-attendance-operator-root="true"
    >
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
              error={rosterReadError ?? chooserError}
              onSelect={(nextEventId) => void selectEvent(nextEventId)}
              onRetry={() => {
                const id = selectedEventIdRef.current;
                void (id ? loadRoster(id) : loadChooser());
              }}
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
                  snapshot={rosterSnapshot}
                  counts={rosterCounts ?? undefined}
                  memberDirectory={memberDirectory}
                  busy={busy}
                  readOnly={
                    !online ||
                    mutationOutcomeUnknown ||
                    stale ||
                    event.status === "Cancelled"
                  }
                  offline={!online}
                  stale={stale}
                  lastUpdatedAt={lastUpdatedAt}
                  materializationRequired={materializationRequired}
                  onBack={backToChooser}
                  onRefresh={() => {
                    if (eventId) {
                      void (mutationOutcomeUnknown
                        ? reconcileUnknownAttendance()
                        : loadRoster(eventId));
                    }
                  }}
                  onMaterialize={() => void materializeRoster()}
                  operatorContent={operatorContent}
                  onCheckIn={(row) =>
                    void checkIn({
                      user_id: row.member_user_id,
                      name: row.member_name,
                      phone: row.member_phone,
                      qr_code_string: null,
                    })
                  }
                  onOpenCheckInSheet={
                    attendanceWindowIsOpen(event)
                      ? () => setShowCheckInSheet(true)
                      : undefined
                  }
                  onVoid={handleVoid}
                  onCorrectGuest={handleCorrection}
                  onExcuse={handleExcuse}
                  onPrint={printAttendanceRoster}
                  onExport={exportRoster}
                />
                {showCheckInSheet && attendanceWindowIsOpen(event) && (
                  <EventCheckInSheet
                    event={event}
                    onClose={() => setShowCheckInSheet(false)}
                    onAuthRequired={onAuthRequired}
                  />
                )}
              </div>
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
