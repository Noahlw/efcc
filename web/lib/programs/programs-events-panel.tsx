"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  createEvent,
  createScheduleException,
  createScheduleRule,
  deleteScheduleException,
  generateEvents,
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
  HK_TIME_ZONE,
  HK_UTC_OFFSET_MINUTES,
  wallWeekday,
} from "@/lib/programs/recurrence";

import styles from "@/app/programs/programs.module.css";

function errorMessage(err: unknown): string {
  return err instanceof RpcError
    ? errorCopyFor(err.problem.code)
    : COPY.error.networkError;
}

const STATUS_LABEL: Record<ProgramEvent["status"], string> = {
  Active: COPY.programs.eventActive,
  Cancelled: COPY.programs.eventCancelled,
};

function hkWallLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-Hant", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const WEEKDAY_LABELS = [
  COPY.programs.weekdaySunday,
  COPY.programs.weekdayMonday,
  COPY.programs.weekdayTuesday,
  COPY.programs.weekdayWednesday,
  COPY.programs.weekdayThursday,
  COPY.programs.weekdayFriday,
  COPY.programs.weekdaySaturday,
];

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
}: {
  program: Program;
  canManage: boolean;
}) => {
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const [events, setEvents] = useState<ProgramEvent[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  const [exceptions, setExceptions] = useState<Record<string, ScheduleException>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

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
    async (
      fn: () => Promise<unknown>,
      successCopy: string | ((result: unknown) => string)
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
    const startsAt = String(form.get("starts_at") ?? "");
    const endsAt = String(form.get("ends_at") ?? "");
    // datetime-local yields wall-clock HK time without a zone; the server
    // requires ISO-8601 UTC instants ending in Z — interpret as UTC+8 (the
    // form labels state 香港時間) and normalize.
    void runAction(
      () =>
        createEvent(program.program_id, {
          starts_at: new Date(`${startsAt}:00+08:00`).toISOString(),
          ends_at: new Date(`${endsAt}:00+08:00`).toISOString(),
        }),
      COPY.programs.created
    );
  };

  const submitCancel =
    (eventId: string) => (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (confirmingEventId !== eventId) {
        setConfirmingEventId(eventId);
        return;
      }
      const form = new FormData(event.currentTarget);
      const reason = String(form.get("cancel_reason") ?? "").trim();
      void runAction(
        () => cancelEvent(program.program_id, eventId, reason),
        COPY.programs.eventCancelledNotice
      );
      setConfirmingEventId(null);
    };

  const rememberException = (result: unknown): void => {
    const { exception } = result as { exception: ScheduleException };
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
          const next = { ...previous };
          delete next[exception.override_date];
          return next;
        });
        return COPY.programs.exceptionRemovedNotice;
      }
    );
  };

  const handleGenerate = () => {
    void runAction(
      async () => {
        const { generated } = await generateEvents(program.program_id);
        return generated;
      },
      (result) => {
        const generated = result as {
          created: number;
          skipped: number;
        };
        return COPY.programs.generated
          .replace("{created}", String(generated.created))
          .replace("{skipped}", String(generated.skipped));
      }
    );
  };

  return (
    <section className={styles.eventsPanel} aria-label={COPY.programs.events}>
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
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

      {program.behavior_type === "Recurring" && (
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
      )}

      {canManage && program.behavior_type === "Recurring" && (
        <>
          <h3 className={styles.panelHeading}>{COPY.programs.events}</h3>
          <form className={styles.ruleForm} onSubmit={submitRule}>
            <select
              name="recurrence"
              defaultValue="weekly"
              aria-label={COPY.programs.behaviorType}
            >
              <option value="weekly">{COPY.programs.ruleWeekly}</option>
              <option value="monthly">{COPY.programs.ruleMonthly}</option>
            </select>
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
            <input
              type="number"
              name="month_day"
              min={1}
              max={31}
              aria-label={COPY.programs.monthDayLabel}
            />
            <input
              type="time"
              name="start_time"
              required
              aria-label={COPY.programs.startTime}
            />
            <input
              type="time"
              name="end_time"
              required
              aria-label={COPY.programs.endTime}
            />
            <button
              type="submit"
              disabled={busy}
              className={styles.actionButton}
            >
              {busy ? COPY.programs.submitting : COPY.programs.addRule}
            </button>
          </form>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className={styles.actionButton}
          >
            {busy ? COPY.programs.generating : COPY.programs.generateEvents}
          </button>
          <p className={styles.timeMarker}>{COPY.programs.hkTimeMarker}</p>
        </>
      )}

      {canManage && program.behavior_type === "OneOff" && (
        <form className={styles.ruleForm} onSubmit={submitManualEvent}>
          <input
            type="datetime-local"
            name="starts_at"
            required
            aria-label={COPY.programs.eventStart}
          />
          <input
            type="datetime-local"
            name="ends_at"
            required
            aria-label={COPY.programs.eventEnd}
          />
          <button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.createEvent}
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
          events.map((event) => {
            const wall = hkWallParts(event.starts_at);
            const rule = ruleForEvent(event, rules ?? []);
            const exception = exceptions[wall.date];
            return (
            <li key={event.event_id} className={styles.eventRow}>
              <span className={styles.eventDate}>
                {hkWallLabel(event.starts_at)}
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
              {canManage && event.status === "Active" && rule !== null &&
                (exception === undefined ? (
                  <div className={styles.eventActions}>
                    {reschedulingEventId === event.event_id ? (
                      <form
                        className={styles.ruleForm}
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
                        className={styles.actionButton}
                        onClick={() => setReschedulingEventId(event.event_id)}
                      >
                        {COPY.programs.rescheduleEvent}
                      </button>
                    )}
                    <form
                      className={styles.cancelForm}
                      onSubmit={submitCancelOccurrence(rule, wall.date, event.event_id)}
                    >
                      {confirmingCancelId !== event.event_id ? (
                        <button
                          type="submit"
                          disabled={busy}
                          className={styles.secondaryButton}
                        >
                          {COPY.programs.cancelOccurrence}
                        </button>
                      ) : (
                        <div className={styles.confirmation} role="alert">
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
                      )}
                    </form>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondaryButton}
                    onClick={() => removeException(exception!)}
                  >
                    {COPY.programs.restoreOccurrence}
                  </button>
                ))}
              {event.status === "Cancelled" && event.cancel_reason !== null && (
                <span className={styles.eventReason}>
                  {COPY.programs.cancelledReason.replace(
                    "{reason}",
                    event.cancel_reason
                  )}
                </span>
              )}
              {canManage && event.status === "Active" && (
                <form
                  className={styles.cancelForm}
                  onSubmit={submitCancel(event.event_id)}
                >
                  <input
                    type="text"
                    name="cancel_reason"
                    placeholder={COPY.programs.cancelReasonPlaceholder}
                    required
                    aria-label={COPY.programs.cancelReason}
                  />
                  {confirmingEventId !== event.event_id && (
                    <button
                      type="submit"
                      disabled={busy}
                      className={styles.actionButton}
                    >
                      {COPY.programs.cancelEvent}
                    </button>
                  )}
                  {confirmingEventId === event.event_id && (
                    <div className={styles.confirmation} role="alert">
                      <span>{COPY.programs.cancelEventConfirm}</span>
                      <button
                        type="submit"
                        disabled={busy}
                        className={styles.dangerButton}
                      >
                        {COPY.programs.confirmCancelEvent}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={styles.secondaryButton}
                        onClick={() => setConfirmingEventId(null)}
                      >
                        {COPY.programs.keepEvent}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </li>
            );
          })
        )}
      </ul>
    </section>
  );
};
