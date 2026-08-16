"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

import styles from "@/app/programs/programs.module.css";

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
  // Exceptions created this session, keyed by HK wall date. The API exposes
  // no list-exceptions endpoint, so the 恢復 affordance lives for the session.
  const [exceptions, setExceptions] = useState<
    Record<string, ScheduleException>
  >({});
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

  const load = useCallback(async () => {
    setRules(null);
    setEvents(null);
    setActionError(null);
    setLoadError(false);
    try {
      const [rulesResp, eventsResp] = await Promise.all([
        listScheduleRules(program.program_id),
        listEvents(program.program_id),
      ]);
      if (!mounted.current) {
        return;
      }
      setRules(rulesResp.rules);
      setEvents(eventsResp.events);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
      setLoadError(true);
      setRules([]);
      setEvents([]);
    }
  }, [program.program_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      successCopy: string | ((result: T) => string)
    ) => {
      setBusy(true);
      setActionError(null);
      try {
        const result = await fn();
        if (!mounted.current) {
          return;
        }
        await load();
        if (!mounted.current) {
          return;
        }
        const message =
          typeof successCopy === "function" ? successCopy(result) : successCopy;
        setNotice(message);
        announce(message);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setActionError(errorMessage(error));
        announce(errorMessage(error));
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
    (eventId: string) => (event: React.FormEvent<HTMLFormElement>) => {
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
      void runAction(
        () => cancelEvent(program.program_id, eventId, reason),
        COPY.programs.eventCancelledNotice
      );
      setConfirmingEventId(null);
    };

  const rememberException = (result: {
    exception: ScheduleException;
  }): void => {
    const { exception } = result;
    setExceptions((previous) => ({
      ...previous,
      [exception.override_date]: exception,
    }));
  };

  const submitReschedule =
    (rule: ScheduleRule, wallDate: string) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const newStartTime = String(form.get("new_start_time") ?? "");
      const newEndTime = String(form.get("new_end_time") ?? "");
      void runAction(
        () =>
          createScheduleException(program.program_id, rule.rule_id, {
            override_date: wallDate,
            action: "RESCHEDULE",
            new_start_time: newStartTime,
            new_end_time: newEndTime,
          }),
        (result) => {
          rememberException(result);
          return COPY.programs.exceptionUpdatedNotice;
        }
      );
      setReschedulingEventId(null);
    };

  const submitCancelOccurrence =
    (rule: ScheduleRule, wallDate: string, eventId: string) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (confirmingCancelId !== eventId) {
        setConfirmingCancelId(eventId);
        return;
      }
      void runAction(
        () =>
          createScheduleException(program.program_id, rule.rule_id, {
            override_date: wallDate,
            action: "CANCEL",
          }),
        (result) => {
          rememberException(result);
          return COPY.programs.exceptionUpdatedNotice;
        }
      );
      setConfirmingCancelId(null);
    };

  const removeException = (exception: ScheduleException) => {
    void runAction(
      () =>
        deleteScheduleException(
          program.program_id,
          exception.rule_id,
          exception.exception_id
        ),
      () => {
        setExceptions((previous) => {
          const { [exception.override_date]: _, ...next } = previous;
          return next;
        });
        return COPY.programs.exceptionRemovedNotice;
      }
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
        <output className={styles.panelError} role="alert">
          {actionError}
        </output>
      )}
      {loadError && (
        <button
          type="button"
          className={styles.retry}
          onClick={() => void load()}
        >
          {COPY.error.retry}
        </button>
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
            <output className={styles.panelError} role="alert">
              {manualError}
            </output>
          )}
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventDate}</span>
            <input
              type="date"
              name="event_date"
              aria-label={COPY.programs.eventDate}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventTime}</span>
            <input
              type="time"
              name="event_time"
              aria-label={COPY.programs.eventTime}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventName}</span>
            <input
              type="text"
              name="name"
              placeholder={COPY.programs.eventNamePlaceholder}
              aria-label={COPY.programs.eventName}
              aria-required="true"
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.eventType}</span>
            <select name="event_type" aria-label={COPY.programs.eventType}>
              {EVENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.recurrenceTag}</span>
            <select
              name="recurrence_tag"
              defaultValue={COPY.programs.recurrenceNone}
              aria-label={COPY.programs.recurrenceTag}
            >
              {RECURRENCE_TAG_OPTIONS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.programDetailMuted}>
            {COPY.programs.repeatFormInformational}
          </p>
          <button
            type="submit"
            disabled={busy}
            className={styles.actionButton}
          >
            {busy ? COPY.programs.submitting : COPY.programs.createMeeting}
          </button>
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
            <select
              name="recurrence"
              defaultValue="weekly"
              aria-label={COPY.programs.behaviorType}
            >
              <option value="weekly">{COPY.programs.ruleWeekly}</option>
              <option value="monthly">{COPY.programs.ruleMonthly}</option>
            </select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.dayOfWeekLabel}</span>
            <select
              name="day_of_week"
              defaultValue={2}
              aria-label={COPY.programs.dayOfWeekLabel}
            >
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.monthDayLabel}</span>
            <input
              type="number"
              name="month_day"
              min={1}
              max={31}
              aria-label={COPY.programs.monthDayLabel}
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.startTime}</span>
            <input
              type="time"
              name="start_time"
              required
              aria-label={COPY.programs.startTime}
            />
          </label>
          <label className={styles.ruleField}>
            <span>{COPY.programs.endTime}</span>
            <input
              type="time"
              name="end_time"
              required
              aria-label={COPY.programs.endTime}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={styles.actionButton}
          >
            {busy ? COPY.programs.submitting : COPY.programs.addRule}
          </button>
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
            const exception = exceptions[wall.date];
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
                <span className={styles.eventSource}>
                  {event.event_type ?? COPY.programs.eventTypeOptions[5]}
                </span>
                <span className={styles.eventSource}>
                  {COPY.programs.repeatLabel.replace(
                    "{tag}",
                    eventRecurrenceTag(event, rule)
                  )}
                </span>
                <span className={styles.eventSource}>
                  {event.source === "SCHEDULE"
                    ? COPY.programs.eventScheduleSource
                    : COPY.programs.eventManualSource}
                </span>
                <span
                  className={
                    event.status === "Cancelled"
                      ? styles.eventCancelled
                      : styles.eventActive
                  }
                >
                  {STATUS_LABEL[event.status]}
                </span>
                {event.exception !== null && event.exception !== undefined && (
                  <span className={styles.exceptionBadge}>
                    {event.exception.action === "RESCHEDULE"
                      ? COPY.programs.eventRescheduledBadge.replace(
                          "{time}",
                          event.exception.new_start_time ?? ""
                        )
                      : COPY.programs.eventCancelledBadge}
                  </span>
                )}
                {canManage &&
                  event.status === "Active" &&
                  rule !== null &&
                  (exception === undefined ? (
                    <div className={styles.eventActions}>
                      {reschedulingEventId === event.event_id ? (
                        <form
                          className={styles.ruleForm}
                          ref={rescheduleFormRef}
                          onSubmit={submitReschedule(rule, wall.date)}
                        >
                          <input
                            type="time"
                            name="new_start_time"
                            required
                            aria-label={COPY.programs.rescheduleStart}
                          />
                          <input
                            type="time"
                            name="new_end_time"
                            required
                            aria-label={COPY.programs.rescheduleEnd}
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className={styles.actionButton}
                          >
                            {COPY.programs.confirmReschedule}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={styles.secondaryButton}
                            onClick={() => setReschedulingEventId(null)}
                          >
                            {COPY.programs.cancelRevoke}
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          className={styles.secondaryButton}
                          onClick={() => setReschedulingEventId(event.event_id)}
                        >
                          {COPY.programs.rescheduleEvent}
                        </button>
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
                            <button
                              type="submit"
                              disabled={busy}
                              className={styles.dangerButton}
                            >
                              {COPY.programs.confirmCancelOccurrence}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className={styles.secondaryButton}
                              onClick={() => setConfirmingCancelId(null)}
                            >
                              {COPY.programs.keepOccurrence}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="submit"
                            disabled={busy}
                            className={styles.secondaryButton}
                          >
                            {COPY.programs.cancelOccurrence}
                          </button>
                        )}
                      </form>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className={styles.successOutline}
                      onClick={() => removeException(exception)}
                    >
                      {COPY.programs.restoreOccurrence}
                    </button>
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
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => onOpenEvent?.(event.event_id)}
                  >
                    {COPY.programs.eventDetailOpen}
                  </button>
                )}
                {canManage && event.status === "Active" && (
                  <>
                    <form
                      className={styles.cancelForm}
                      noValidate
                      onSubmit={submitCancel(event.event_id)}
                    >
                      <input
                        type="text"
                        name="cancel_reason"
                        placeholder={COPY.programs.cancelReasonPlaceholder}
                        aria-label={COPY.programs.cancelReason}
                      />
                      {confirmingEventId !== event.event_id && (
                        <button
                          type="submit"
                          disabled={busy}
                          className={styles.dangerOutline}
                        >
                          {COPY.programs.cancelEvent}
                        </button>
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
                          <span>
                            {COPY.programs.cancelMeetingConfirmBody}
                          </span>
                          <button
                            type="submit"
                            disabled={busy}
                            className={styles.dangerButton}
                          >
                            {COPY.programs.confirmCancel}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={styles.secondaryButton}
                            onClick={() => setConfirmingEventId(null)}
                          >
                            {COPY.programs.keepMeeting}
                          </button>
                        </div>
                      )}
                    </form>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => printSheet(event)}
                    >
                      {COPY.attendance.printSheet}
                    </button>
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
