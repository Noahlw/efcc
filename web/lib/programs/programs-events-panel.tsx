"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  createEvent,
  createScheduleRule,
  generateEvents,
  listEvents,
  listScheduleRules,
} from "@/lib/programs/program-api";
import type {
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { HK_TIME_ZONE } from "@/lib/programs/recurrence";

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
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const load = useCallback(async () => {
    setEvents(null);
    setNotice(null);
    setActionError(null);
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
      setEvents([]);
    }
  }, [program.program_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, successCopy: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        if (!mounted.current) {
          return;
        }
        setNotice(successCopy);
        announce(successCopy);
        await load();
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
    const recurrence = form.get("recurrence") === "monthly" ? "MONTHLY" : "WEEKLY";
    const dayOfWeek = recurrence === "WEEKLY" ? Number(form.get("day_of_week")) : undefined;
    const monthDay = recurrence === "MONTHLY" ? Number(form.get("month_day")) : undefined;
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
    void runAction(
      () => createEvent(program.program_id, { starts_at: startsAt, ends_at: endsAt }),
      COPY.programs.created
    );
  };

  const submitCancel = (eventId: string) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("cancel_reason") ?? "").trim();
    void runAction(
      () => cancelEvent(program.program_id, eventId, reason),
      COPY.programs.eventCancelledNotice
    );
  };

  const handleGenerate = () => {
    void runAction(
      async () => {
        const { generated } = await generateEvents(program.program_id);
        return generated;
      },
      COPY.programs.generated.replace("{created}", "0").replace("{skipped}", "0")
    );
  };

  return (
    <section className={styles.eventsPanel} aria-label={COPY.programs.events}>
      {notice !== null && <output className={styles.panelNotice}>{notice}</output>}
      {actionError !== null && (
        <output className={styles.panelError} role="alert">
          {actionError}
        </output>
      )}

      {canManage && program.behavior_type === "Recurring" && (
        <>
          <h3 className={styles.panelHeading}>{COPY.programs.events}</h3>
          <form className={styles.ruleForm} onSubmit={submitRule}>
            <select name="recurrence" defaultValue="weekly" aria-label={COPY.programs.behaviorType}>
              <option value="weekly">{COPY.programs.ruleWeekly}</option>
              <option value="monthly">{COPY.programs.ruleMonthly}</option>
            </select>
            <input
              type="number"
              name="day_of_week"
              min={0}
              max={6}
              defaultValue={2}
              aria-label={COPY.programs.dayOfWeekLabel}
            />
            <input
              type="number"
              name="month_day"
              min={1}
              max={31}
              aria-label={COPY.programs.monthDayLabel}
            />
            <input type="time" name="start_time" required aria-label={COPY.programs.startTime} />
            <input type="time" name="end_time" required aria-label={COPY.programs.endTime} />
            <button type="submit" disabled={busy} className={styles.actionButton}>
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
          <ul className={styles.ruleList} aria-label={COPY.programs.events}>
            {rules === null
              ? null
              : rules.length === 0
                ? (
                    <li className={styles.emptyLine}>{COPY.programs.noRules}</li>
                  )
                : rules.map((rule) => (
                    <li key={rule.rule_id} className={styles.ruleRow}>
                      <span>
                        {rule.recurrence === "WEEKLY"
                          ? `${COPY.programs.ruleWeekly} ${rule.day_of_week}`
                          : `${COPY.programs.ruleMonthly} ${rule.month_day}`}
                      </span>
                      <span>
                        {rule.start_time}–{rule.end_time}
                      </span>
                    </li>
                  ))}
          </ul>
        </>
      )}

      {canManage && program.behavior_type === "OneOff" && (
        <form className={styles.ruleForm} onSubmit={submitManualEvent}>
          <input type="datetime-local" name="starts_at" required aria-label={COPY.programs.eventStart} />
          <input type="datetime-local" name="ends_at" required aria-label={COPY.programs.eventEnd} />
          <button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.createEvent}
          </button>
        </form>
      )}

      <ul className={styles.eventList} aria-label={COPY.programs.events}>
        {events === null
          ? null
          : events.length === 0
            ? (
                <li className={styles.emptyLine}>{COPY.programs.eventsEmpty}</li>
              )
            : events.map((event) => (
                <li key={event.event_id} className={styles.eventRow}>
                  <span className={styles.eventDate}>{hkWallLabel(event.starts_at)}</span>
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
                  {canManage && event.status === "Active" && (
                    <form className={styles.cancelForm} onSubmit={submitCancel(event.event_id)}>
                      <input
                        type="text"
                        name="cancel_reason"
                        placeholder={COPY.programs.cancelReasonPlaceholder}
                        required
                        aria-label={COPY.programs.cancelReason}
                      />
                      <button type="submit" disabled={busy} className={styles.actionButton}>
                        {COPY.programs.cancelEvent}
                      </button>
                    </form>
                  )}
                </li>
              ))}
      </ul>
    </section>
  );
};
