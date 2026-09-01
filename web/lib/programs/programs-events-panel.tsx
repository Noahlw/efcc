"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildCheckInSheet } from "@/lib/check-in-sheet";
import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  createEvent,
  createScheduleException,
  createScheduleRule,
  deleteScheduleException,
  listEvents,
  listScheduleRules,
} from "@/lib/programs/program-api";
import type {
  Program,
  ProgramEvent,
  ScheduleException,
  ScheduleRule,
} from "@/lib/programs/program-api";
import {
  HK_UTC_OFFSET_MINUTES,
  hkWallDateTimeLabel,
  wallWeekday,
  WEEKDAY_LABELS,
} from "@/lib/programs/recurrence";
import { qrDataUrl } from "@/lib/qr";

const styles = {
  eventsPanel: "grid min-w-0 gap-4",
  panelHeading:
    "m-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  panelNotice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  panelError:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  select:
    "min-h-11 min-w-0 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]",
  ruleForm:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4",
  input: "min-h-11 min-w-0",
  eventCreateForm: "grid-cols-1 md:grid-cols-2",
  workspaceSubheading:
    "m-0 text-base font-bold leading-6 [overflow-wrap:anywhere]",
  ruleField: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  actionButton:
    "inline-flex min-h-11 min-w-11 w-fit items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  timeMarker: "m-0 text-xs text-[var(--ink-muted)]",
  ruleList: "m-0 grid min-w-0 list-none gap-2 p-0",
  emptyLine:
    "m-0 rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  ruleRow:
    "flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-3 [overflow-wrap:anywhere]",
  eventList: "m-0 grid min-w-0 list-none gap-2 p-0",
  eventRow:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 [overflow-wrap:anywhere]",
  eventDate: "min-w-0 text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  eventSource: "w-fit whitespace-normal",
  eventCancelled: "text-[var(--error)]",
  eventActive: "text-[var(--accent)]",
  exceptionBadge: "w-fit whitespace-normal text-[var(--pending)]",
  eventActions: "flex min-w-0 flex-wrap items-center gap-2",
  secondaryButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  cancelForm: "flex min-w-0 flex-wrap items-center gap-2",
  confirmation:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--pending-border)] bg-[var(--pending-surface)] p-3 [overflow-wrap:anywhere]",
  dangerButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] px-4 py-2 text-[var(--error)] whitespace-normal",
  successOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] px-4 py-2 text-[var(--success)] whitespace-normal",
  dangerOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--error-border)] bg-transparent px-4 py-2 text-[var(--error)] whitespace-normal",
  eventReason:
    "min-w-0 text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]",
} as const;
const STATUS_LABEL: Record<ProgramEvent["status"], string> = {
  Active: COPY.programs.eventActive,
  Cancelled: COPY.programs.eventCancelled,
};
const EVENT_TYPE_OPTIONS = COPY.programs.eventTypeOptions;
const RECURRENCE_TAG_OPTIONS = [
  COPY.programs.recurrenceNone,
  COPY.programs.recurrenceWeekly,
  COPY.programs.recurrenceMonthly,
] as const;

function eventRecurrenceTag(
  event: ProgramEvent,
  rule: ScheduleRule | null
): string {
  if (event.recurrence_tag !== undefined && event.recurrence_tag !== null) {
    return event.recurrence_tag;
  }
  if (rule?.recurrence === "WEEKLY") {
    return COPY.programs.recurrenceWeekly;
  }
  if (rule?.recurrence === "MONTHLY") {
    return COPY.programs.recurrenceMonthly;
  }
  return COPY.programs.recurrenceNone;
}

function wallDateTimeToIso(date: string, time: string): string | null {
  if (!date || !time) {
    return null;
  }
  const parsed = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function oneHourAfter(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60_000).toISOString();
}

/** HK wall date ("YYYY-MM-DD") and time ("HH:MM") of an ISO instant. */
function hkWallParts(iso: string): { date: string; time: string } {
  const shifted = new Date(
    new Date(iso).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  );
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

/**
 * The rule whose schedule produced this event, when attribution is
 * unambiguous: a single rule firing on the event's HK wall date wins; a
 * time match breaks ties among same-date rules. Events carry no rule_id,
 * so exception controls hide when attribution is ambiguous.
 */
function ruleForEvent(
  event: ProgramEvent,
  rules: ScheduleRule[]
): ScheduleRule | null {
  if (event.source !== "SCHEDULE") {
    return null;
  }
  const { date, time } = hkWallParts(event.starts_at);
  const byDate = rules.filter((rule) =>
    rule.recurrence === "WEEKLY"
      ? rule.day_of_week === wallWeekday(date)
      : rule.month_day === Number(date.slice(8, 10))
  );
  if (byDate.length === 1) {
    return byDate[0];
  }
  const byTime = byDate.filter((rule) => rule.start_time === time);
  return byTime.length === 1 ? byTime[0] : null;
}

export const EventsPanel = ({
  program,
  canManage,
  onOpenEvent,
}: {
  program: Program;
  canManage: boolean;
  /** EVT-01 (#251): deep link into the Event operational detail screen. */
  onOpenEvent?: (eventId: string) => void;
}) => {
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const [events, setEvents] = useState<ProgramEvent[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(
    null
  );
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(
    null
  );
  const [reschedulingEventId, setReschedulingEventId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  // Inline confirmations replace the control that opened them; hand focus to
  // the first control of the replacement so keyboard users land on the new
  // affordance instead of losing focus to the body.
  const rescheduleFormRef = useRef<HTMLFormElement>(null);
  const confirmOccurrenceRef = useRef<HTMLDivElement>(null);
  const confirmEventRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reschedulingEventId !== null) {
      rescheduleFormRef.current?.querySelector("input")?.focus();
    }
  }, [reschedulingEventId]);

  useEffect(() => {
    if (confirmingCancelId !== null) {
      confirmOccurrenceRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingCancelId]);

  useEffect(() => {
    if (confirmingEventId !== null) {
      confirmEventRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingEventId]);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const load = useCallback(
    async (preserve = false): Promise<boolean> => {
      if (!preserve) {
        setRules(null);
        setEvents(null);
      }
      setActionError(null);
      setLoadError(false);
      try {
        const [rulesResp, eventsResp] = await Promise.all([
          listScheduleRules(program.program_id),
          listEvents(program.program_id),
        ]);
        if (!mounted.current) {
          return false;
        }
        setRules(rulesResp.rules);
        setEvents(eventsResp.events);
        return true;
      } catch (error) {
        if (!mounted.current) {
          return false;
        }
        setActionError(errorMessage(error));
        setLoadError(true);
        if (!preserve) {
          setRules([]);
          setEvents([]);
        }
        return false;
      }
    },
    [program.program_id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      successCopy: string | ((result: T) => string)
    ): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      try {
        const result = await fn();
        if (!mounted.current) {
          return false;
        }
        const refreshed = await load(true);
        if (!refreshed || !mounted.current) {
          return false;
        }
        const message =
          typeof successCopy === "function" ? successCopy(result) : successCopy;
        setNotice(message);
        announce(message);
        return true;
      } catch (error) {
        if (!mounted.current) {
          return false;
        }
        setActionError(errorMessage(error));
        announce(errorMessage(error));
        return false;
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [load]
  );

  const submitRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const recurrence =
      form.get("recurrence") === "monthly" ? "MONTHLY" : "WEEKLY";
    const dayOfWeek =
      recurrence === "WEEKLY" ? Number(form.get("day_of_week")) : undefined;
    const monthDay =
      recurrence === "MONTHLY" ? Number(form.get("month_day")) : undefined;
    const startTime = String(form.get("start_time") ?? "");
    const endTime = String(form.get("end_time") ?? "");
    void runAction(
      () =>
        createScheduleRule(program.program_id, {
          recurrence,
          day_of_week: dayOfWeek,
          month_day: monthDay,
          start_time: startTime,
          end_time: endTime,
        }),
      COPY.programs.created
    );
  };

  const submitManualEvent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("event_date") ?? "").trim();
    const time = String(form.get("event_time") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    if (!date || !time || !name) {
      const message = COPY.programs.createMeetingValidation;
      setManualError(message);
      announce(message);
      return;
    }
    const startsAt = wallDateTimeToIso(date, time);
    if (startsAt === null) {
      const message = COPY.programs.createMeetingValidation;
      setManualError(message);
      announce(message);
      return;
    }
    const eventType = String(
      form.get("event_type") ?? EVENT_TYPE_OPTIONS[0]
    ) as (typeof EVENT_TYPE_OPTIONS)[number];
    setManualError(null);
    void runAction(
      () =>
        createEvent(program.program_id, {
          starts_at: startsAt,
          ends_at: oneHourAfter(startsAt),
          name,
          event_type: eventType,
        }),
      COPY.programs.eventCreatedNotice
    );
  };

  const submitCancel =
    (eventId: string) => async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const currentEvent = events?.find(
        (candidate) => candidate.event_id === eventId
      );
      if (currentEvent?.has_attendance) {
        const message = COPY.programs.cancelBlockedWithAttendance;
        setConfirmingEventId(null);
        setActionError(message);
        announce(message);
        return;
      }
      if (confirmingEventId !== eventId) {
        setConfirmingEventId(eventId);
        return;
      }
      const form = new FormData(event.currentTarget);
      const reason = String(form.get("cancel_reason") ?? "").trim() || null;
      const succeeded = await runAction(
        () => cancelEvent(program.program_id, eventId, reason),
        COPY.programs.eventCancelledNotice
      );
      if (succeeded && mounted.current) {
        setConfirmingEventId(null);
      }
    };

  const submitReschedule =
    (rule: ScheduleRule, wallDate: string) =>
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const newStartTime = String(form.get("new_start_time") ?? "");
      const newEndTime = String(form.get("new_end_time") ?? "");
      const succeeded = await runAction(
        () =>
          createScheduleException(program.program_id, rule.rule_id, {
            override_date: wallDate,
            action: "RESCHEDULE",
            new_start_time: newStartTime,
            new_end_time: newEndTime,
          }),
        COPY.programs.exceptionUpdatedNotice
      );
      if (succeeded && mounted.current) {
        setReschedulingEventId(null);
      }
    };

  const submitCancelOccurrence =
    (rule: ScheduleRule, wallDate: string, eventId: string) =>
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (confirmingCancelId !== eventId) {
        setConfirmingCancelId(eventId);
        return;
      }
      const succeeded = await runAction(
        () =>
          createScheduleException(program.program_id, rule.rule_id, {
            override_date: wallDate,
            action: "CANCEL",
          }),
        COPY.programs.exceptionUpdatedNotice
      );
      if (succeeded && mounted.current) {
        setConfirmingCancelId(null);
      }
    };

  const removeException = (exception: ScheduleException) => {
    void runAction(
      () =>
        deleteScheduleException(
          program.program_id,
          exception.rule_id,
          exception.exception_id
        ),
      COPY.programs.exceptionRemovedNotice
    );
  };
  const printSheet = (event: ProgramEvent) => {
    const token = program.check_in_token;
    const code = event.manual_check_in_code;
    if (!token || !code) {
      return;
    }
    const printWindow = window.open("", "_blank", "popup,width=640,height=720");
    if (!printWindow) {
      return;
    }
    void (async () => {
      const sheet = await buildCheckInSheet({
        programName: program.name,
        startsAtLabel: hkWallDateTimeLabel(event.starts_at),
        checkInUrl: `${window.location.origin}/guest-check-in?program_token=${encodeURIComponent(token)}`,
        manualCode: code,
        renderQr: qrDataUrl,
      });
      // Build the sheet with textContent DOM, never document.write, so the
      // popup can never be injected from any string we hold.
      const doc = printWindow.document;
      doc.open();
      doc.write("<!doctype html><html><body></body></html>");
      const main = doc.createElement("main");
      const title = doc.createElement("h1");
      title.textContent = sheet.programName;
      const time = doc.createElement("p");
      time.textContent = sheet.startsAtLabel;
      main.append(title, time);
      const qr = doc.createElement("img");
      qr.src = sheet.qrDataUrl;
      qr.alt = "Program QR";
      main.append(qr);
      for (const row of sheet.rows) {
        if (row.value === null) {
          continue;
        }
        const p = doc.createElement("p");
        const strong = doc.createElement("strong");
        strong.textContent = row.value;
        p.append(row.label, ": ", strong);
        main.append(p);
      }
      doc.body.append(main);
      doc.close();
      printWindow.focus();
      printWindow.print();
    })();
  };

  return (
    <section
      className={styles.eventsPanel}
      aria-label={COPY.programs.events}
      aria-busy={busy}
    >
      <h3 className={styles.panelHeading}>{COPY.programs.events}</h3>
      <p className={styles.programDetailMuted}>
        {COPY.programs.repeatInformational}
      </p>
      {notice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          {notice}
        </output>
      )}
      {actionError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {actionError}
        </Alert>
      )}
      {loadError && (
        <Button
          type="button"
          className={styles.retry}
          onClick={() => void load()}
        >
          {COPY.error.retry}
        </Button>
      )}

      {canManage && (
        <form
          className={`${styles.ruleForm} ${styles.eventCreateForm}`}
          noValidate
          onSubmit={submitManualEvent}
          aria-busy={busy}
        >
          <h5 className={styles.workspaceSubheading}>
            {COPY.programs.createMeeting}
          </h5>
          {manualError !== null && (
            <Alert className={styles.panelError} variant="destructive">
              {manualError}
            </Alert>
          )}
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventDate}</span>
            <Input
              className={styles.input}
              type="date"
              name="event_date"
              aria-label={COPY.programs.eventDate}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventTime}</span>
            <Input
              className={styles.input}
              type="time"
              name="event_time"
              aria-label={COPY.programs.eventTime}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventName}</span>
            <Input
              className={styles.input}
              type="text"
              name="name"
              placeholder={COPY.programs.eventNamePlaceholder}
              aria-label={COPY.programs.eventName}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventType}</span>
            <Select name="event_type" defaultValue={EVENT_TYPE_OPTIONS[0]}>
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.eventType}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.recurrenceTag}</span>
            <Select
              name="recurrence_tag"
              defaultValue={COPY.programs.recurrenceNone}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.recurrenceTag}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_TAG_OPTIONS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className={styles.programDetailMuted}>
            {COPY.programs.repeatFormInformational}
          </p>
          <Button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.createMeeting}
          </Button>
          <p className={styles.timeMarker}>{COPY.programs.hkTimeMarker}</p>
        </form>
      )}

      {program.behavior_type === "Recurring" && (
        <>
          {canManage && (
            <h4 className={styles.workspaceSubheading}>
              {COPY.programs.secondaryGeneratorLabel}
            </h4>
          )}
          <ul className={styles.ruleList} aria-label={COPY.programs.events}>
            {rules === null ? (
              <li className={styles.emptyLine} aria-live="polite">
                {COPY.nav.loading}
              </li>
            ) : rules.length === 0 ? (
              <li className={styles.emptyLine}>{COPY.programs.noRules}</li>
            ) : (
              rules.map((rule) => (
                <li key={rule.rule_id} className={styles.ruleRow}>
                  <span>
                    {rule.recurrence === "WEEKLY"
                      ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0]}`
                      : `${COPY.programs.ruleMonthly} ${rule.month_day}`}
                  </span>
                  <span>
                    {rule.start_time}–{rule.end_time}
                  </span>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {canManage && program.behavior_type === "Recurring" && (
        <form className={styles.ruleForm} onSubmit={submitRule}>
          <label className={styles.ruleField}>
            <span>{COPY.programs.behaviorType}</span>
            <Select name="recurrence" defaultValue="weekly">
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.behaviorType}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">
                  {COPY.programs.ruleWeekly}
                </SelectItem>
                <SelectItem value="monthly">
                  {COPY.programs.ruleMonthly}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.dayOfWeekLabel}</span>
            <Select name="day_of_week" defaultValue="2">
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.dayOfWeekLabel}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, index) => (
                  <SelectItem key={label} value={String(index)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.monthDayLabel}</span>
            <Input
              className={styles.input}
              type="number"
              name="month_day"
              min={1}
              max={31}
              aria-label={COPY.programs.monthDayLabel}
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.startTime}</span>
            <Input
              className={styles.input}
              type="time"
              name="start_time"
              required
              aria-label={COPY.programs.startTime}
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.endTime}</span>
            <Input
              className={styles.input}
              type="time"
              name="end_time"
              required
              aria-label={COPY.programs.endTime}
            />
          </label>
          <Button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.addRule}
          </Button>
          <p className={styles.timeMarker}>{COPY.programs.hkTimeMarker}</p>
        </form>
      )}

      <ul className={styles.eventList} aria-label={COPY.programs.events}>
        {events === null ? (
          <li className={styles.emptyLine} aria-live="polite">
            {COPY.nav.loading}
          </li>
        ) : events.length === 0 ? (
          <li className={styles.emptyLine}>{COPY.programs.eventsEmpty}</li>
        ) : (
          // oxlint-disable-next-line complexity
          events.map((event) => {
            const wall = hkWallParts(event.starts_at);
            const rule = ruleForEvent(event, rules ?? []);
            const exception = event.exception ?? null;
            const now = Date.now();
            const opensAt = event.check_in_window_opens_at;
            const closesAt = event.check_in_window_closes_at;
            const assistedEligible =
              event.availability === "Active" &&
              typeof opensAt === "string" &&
              typeof closesAt === "string" &&
              Date.parse(opensAt) <= now &&
              Date.parse(closesAt) >= now;
            return (
              <li key={event.event_id} className={styles.eventRow}>
                <strong>
                  {event.name ?? hkWallDateTimeLabel(event.starts_at)}
                </strong>
                <span className={styles.eventDate}>{wall.date}</span>
                <span className={styles.eventDate}>{wall.time}</span>
                <Badge className={styles.eventSource} variant="outline">
                  {event.event_type ?? COPY.programs.eventTypeOptions[5]}
                </Badge>
                <Badge className={styles.eventSource} variant="outline">
                  {COPY.programs.repeatLabel.replace(
                    "{tag}",
                    eventRecurrenceTag(event, rule)
                  )}
                </Badge>
                <Badge className={styles.eventSource} variant="outline">
                  {event.source === "SCHEDULE"
                    ? COPY.programs.eventScheduleSource
                    : COPY.programs.eventManualSource}
                </Badge>
                <Badge
                  className={
                    event.status === "Cancelled"
                      ? styles.eventCancelled
                      : styles.eventActive
                  }
                  variant={event.status === "Cancelled" ? "outline" : "default"}
                >
                  {STATUS_LABEL[event.status]}
                </Badge>
                {event.exception !== null && event.exception !== undefined && (
                  <Badge className={styles.exceptionBadge} variant="secondary">
                    {event.exception.action === "RESCHEDULE"
                      ? COPY.programs.eventRescheduledBadge.replace(
                          "{time}",
                          event.exception.new_start_time ?? ""
                        )
                      : COPY.programs.eventCancelledBadge}
                  </Badge>
                )}
                {canManage &&
                  event.status === "Active" &&
                  rule !== null &&
                  (exception === null ? (
                    <div className={styles.eventActions}>
                      {reschedulingEventId === event.event_id ? (
                        <form
                          className={styles.ruleForm}
                          ref={rescheduleFormRef}
                          onSubmit={submitReschedule(rule, wall.date)}
                        >
                          <Input
                            className={styles.input}
                            type="time"
                            name="new_start_time"
                            required
                            aria-label={COPY.programs.rescheduleStart}
                          />
                          <Input
                            className={styles.input}
                            type="time"
                            name="new_end_time"
                            required
                            aria-label={COPY.programs.rescheduleEnd}
                          />
                          <Button
                            type="submit"
                            disabled={busy}
                            className={styles.actionButton}
                          >
                            {COPY.programs.confirmReschedule}
                          </Button>
                          <Button
                            type="button"
                            disabled={busy}
                            className={styles.secondaryButton}
                            onClick={() => setReschedulingEventId(null)}
                          >
                            {COPY.programs.cancelRevoke}
                          </Button>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          disabled={busy}
                          className={styles.secondaryButton}
                          onClick={() => setReschedulingEventId(event.event_id)}
                        >
                          {COPY.programs.rescheduleEvent}
                        </Button>
                      )}
                      <form
                        className={styles.cancelForm}
                        onSubmit={submitCancelOccurrence(
                          rule,
                          wall.date,
                          event.event_id
                        )}
                      >
                        {confirmingCancelId === event.event_id ? (
                          <div
                            className={styles.confirmation}
                            role="alert"
                            ref={confirmOccurrenceRef}
                          >
                            <span>{COPY.programs.cancelOccurrenceConfirm}</span>
                            <Button
                              type="submit"
                              disabled={busy}
                              className={styles.dangerButton}
                            >
                              {COPY.programs.confirmCancelOccurrence}
                            </Button>
                            <Button
                              type="button"
                              disabled={busy}
                              className={styles.secondaryButton}
                              onClick={() => setConfirmingCancelId(null)}
                            >
                              {COPY.programs.keepOccurrence}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="submit"
                            disabled={busy}
                            className={styles.secondaryButton}
                          >
                            {COPY.programs.cancelOccurrence}
                          </Button>
                        )}
                      </form>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      disabled={busy}
                      className={styles.successOutline}
                      onClick={() => removeException(exception)}
                    >
                      {COPY.programs.restoreOccurrence}
                    </Button>
                  ))}
                {event.status === "Cancelled" &&
                  event.cancel_reason !== null && (
                    <span className={styles.eventReason}>
                      {COPY.programs.cancelledReason.replace(
                        "{reason}",
                        event.cancel_reason
                      )}
                    </span>
                  )}
                {canManage && (
                  <Button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => onOpenEvent?.(event.event_id)}
                  >
                    {COPY.programs.eventDetailOpen}
                  </Button>
                )}
                {canManage && event.status === "Active" && (
                  <>
                    <form
                      className={styles.cancelForm}
                      noValidate
                      onSubmit={submitCancel(event.event_id)}
                    >
                      <Input
                        className={styles.input}
                        type="text"
                        name="cancel_reason"
                        placeholder={COPY.programs.cancelReasonPlaceholder}
                        aria-label={COPY.programs.cancelReason}
                      />
                      {confirmingEventId !== event.event_id && (
                        <Button
                          type="submit"
                          disabled={busy}
                          className={styles.dangerOutline}
                        >
                          {COPY.programs.cancelEvent}
                        </Button>
                      )}
                      {confirmingEventId === event.event_id && (
                        <div
                          className={styles.confirmation}
                          role="alert"
                          ref={confirmEventRef}
                        >
                          <strong>
                            {COPY.programs.cancelMeetingConfirmTitle}
                          </strong>
                          <span>{COPY.programs.cancelMeetingConfirmBody}</span>
                          <Button
                            type="submit"
                            disabled={busy}
                            className={styles.dangerButton}
                          >
                            {COPY.programs.confirmCancel}
                          </Button>
                          <Button
                            type="button"
                            disabled={busy}
                            className={styles.secondaryButton}
                            onClick={() => setConfirmingEventId(null)}
                          >
                            {COPY.programs.keepMeeting}
                          </Button>
                        </div>
                      )}
                    </form>
                    <Button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => printSheet(event)}
                    >
                      {COPY.attendance.printSheet}
                    </Button>
                    <a
                      className={styles.actionButton}
                      href={
                        assistedEligible
                          ? `/scanner?mode=assisted&event=${encodeURIComponent(event.event_id)}`
                          : `/events?eventId=${encodeURIComponent(event.event_id)}`
                      }
                    >
                      {COPY.attendance.assistedOpen}
                    </a>
                  </>
                )}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
};
