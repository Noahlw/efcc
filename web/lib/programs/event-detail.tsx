"use client";
/* oxlint-disable eslint/complexity, react/function-component-definition, promise/prefer-await-to-callbacks, jsx-a11y/prefer-tag-over-role, eslint/no-eq-null, eslint/eqeqeq, unicorn/prefer-query-selector */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import {
  hkShortDateLabel,
  hkShortTimeLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  getEvent,
  setEventAvailability,
  updateEvent,
} from "@/lib/programs/program-api";
import type {
  EventDetail as EventDetailData,
  EventType,
  ProgramEvent,
  ProgramLeader,
} from "@/lib/programs/program-api";
import {
  HK_UTC_OFFSET_MINUTES,
  hkWallDateTimeLabel,
} from "@/lib/programs/recurrence";

import { buildProgramsHref } from "./programs-intent";
import type { ProgramsOrigin } from "./programs-intent";

import styles from "@/app/programs/programs.module.css";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
};

export const EventFactIcon = ({
  name,
}: {
  name: "calendar" | "pin" | "back";
}) => (
  <svg
    aria-hidden="true"
    className={styles.programDetailFactIcon}
    focusable="false"
    viewBox="0 0 24 24"
  >
    {name === "calendar" && (
      <>
        <rect {...ICON_STROKE} x="3" y="5" width="18" height="16" rx="2" />
        <path {...ICON_STROKE} d="M16 3v4M8 3v4M3 10h18" />
      </>
    )}
    {name === "pin" && (
      <>
        <path
          {...ICON_STROKE}
          d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"
        />
        <circle {...ICON_STROKE} cx="12" cy="10" r="2.5" />
      </>
    )}
    {name === "back" && <path {...ICON_STROKE} d="m15 18-6-6 6-6" />}
  </svg>
);

const STATUS_LABEL: Record<ProgramEvent["status"], string> = {
  Active: COPY.programs.eventActive,
  Cancelled: COPY.programs.eventCancelled,
};

const AVAILABILITY_LABEL: Record<
  NonNullable<ProgramEvent["availability"]>,
  string
> = {
  Active: COPY.programs.eventAvailable,
  Inactive: COPY.programs.eventUnavailable,
};
function checkInWindowIsOpen(event: ProgramEvent, now = Date.now()): boolean {
  if (
    event.status !== "Active" ||
    event.availability !== "Active" ||
    !event.check_in_window_opens_at ||
    !event.check_in_window_closes_at
  ) {
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

/** HK wall "YYYY-MM-DDTHH:MM" value for a datetime-local input. */
export function hkWallInputValue(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const shifted = new Date(
    new Date(iso).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  );
  return `${shifted.toISOString().slice(0, 16)}`;
}

/** datetime-local HK wall value back to a UTC ISO instant. */
export function hkWallInputToIso(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  return new Date(`${value}:00+08:00`).toISOString();
}

/**
 * EVT-01 (#251): Event operational detail — identity, participant summary,
 * leaders, edit, independent availability with confirm + undo, and cancel.
 * Rendered by ProgramWorkspace when a management events task carries an
 * `event` deep link; every mutation is re-authorized server-side.
 */
export const EventDetail = ({
  programId,
  eventId,
  canManage,
  origin,
  onBack,
  onAttentionRefresh,
  onAuthRequired,
}: {
  programId: string;
  eventId: string;
  canManage: boolean;
  origin?: ProgramsOrigin;
  onBack: () => void;
  /** NTF-01 (#256): keep shell attention counts fresh after a confirmed mutation. */
  onAttentionRefresh?: () => void;
  onAuthRequired?: () => void;
}) => {
  const [detail, setDetail] = useState<EventDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recoveryRef = useRef<HTMLHeadingElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Inline confirmations replace the control that opened them; hand focus to
  // the replacement so keyboard users land on the new affordance.
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  // Affected-operation count shown in the deactivation confirm; sourced
  // from the loaded summary or, on a server refusal, the server's fresh
  // count.
  const [deactivateImpact, setDeactivateImpact] = useState(0);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelConfirmRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  useEffect(() => {
    if (confirmingDeactivate) {
      confirmRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingDeactivate]);

  useEffect(() => {
    if (confirmingCancel) {
      cancelConfirmRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingCancel]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await getEvent(programId, eventId);
      if (!mounted.current) {
        return;
      }
      setDetail(next);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        onAuthRequired?.();
        return;
      }
      setLoadError(errorMessage(error));
      setDetail(null);
    }
  }, [eventId, onAuthRequired, programId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canManage && detail !== null) {
      document.getElementById("participant-event-title")?.focus();
    }
  }, [canManage, detail]);
  useEffect(() => {
    if (loadError !== null && detail === null) {
      recoveryRef.current?.focus();
    }
  }, [loadError, detail]);

  const runAction = useCallback(
    async (
      fn: () => Promise<unknown>,
      successCopy: string | (() => string),
      onRefused?: (error: unknown) => boolean
    ) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        if (!mounted.current) {
          return;
        }
        onAttentionRefresh?.();
        await load();
        if (!mounted.current) {
          return;
        }
        const message =
          typeof successCopy === "function" ? successCopy() : successCopy;
        setNotice(message);
        announce(message);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        if (onRefused?.(error)) {
          return;
        }
        const message = errorMessage(error);
        setActionError(message);
        announce(message);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [load, onAttentionRefresh]
  );

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("starts_at") ?? "");
    const endsAt = String(form.get("ends_at") ?? "");
    const hasAttendance =
      detail?.event.has_attendance === true ||
      (detail?.participant_summary.checked_in ?? 0) > 0;
    void runAction(
      () =>
        updateEvent(programId, eventId, {
          name: String(form.get("name") ?? "").trim() || null,
          location: String(form.get("location") ?? "").trim() || null,
          event_type: (String(form.get("event_type") ?? "") ||
            null) as EventType | null,
          starts_at: hkWallInputToIso(startsAt) ?? undefined,
          ends_at: hkWallInputToIso(endsAt) ?? undefined,
          check_in_window_opens_at: hkWallInputToIso(
            String(form.get("opens_at") ?? "")
          ),
          check_in_window_closes_at: hkWallInputToIso(
            String(form.get("closes_at") ?? "")
          ),
        }),
      () => {
        setEditing(false);
        // Any successful edit invalidates the prior deactivation's Undo
        // context; a stale Undo would silently re-open availability.
        setUndoAvailable(false);
        return hasAttendance
          ? COPY.programs.editWithAttendanceNotice
          : COPY.programs.eventSavedNotice;
      }
    );
  };

  const submitDeactivate = (confirmRequired: boolean) => {
    void runAction(
      () =>
        setEventAvailability(programId, eventId, "Inactive", confirmRequired),
      () => {
        setConfirmingDeactivate(false);
        setUndoAvailable(true);
        return COPY.programs.eventAvailabilityNotice;
      },
      (error) => {
        // A concurrent enrollment/check-in can make the server require
        // confirmation even when the loaded summary looked safe; surface
        // the inline confirm with the server's fresh operation count
        // instead of a dead-end error.
        if (
          !confirmRequired &&
          error instanceof RpcError &&
          error.problem.code === "CONFIRMATION_REQUIRED"
        ) {
          const problem = error.problem as typeof error.problem & {
            open_operations?: unknown;
          };
          setDeactivateImpact(
            typeof problem.open_operations === "number"
              ? problem.open_operations
              : (detail?.participant_summary.checked_in ?? 0)
          );
          setConfirmingDeactivate(true);
          return true;
        }
        return false;
      }
    );
  };

  const submitActivate = () => {
    void runAction(
      () => setEventAvailability(programId, eventId, "Active"),
      () => {
        setUndoAvailable(false);
        return COPY.programs.eventAvailabilityRestoredNotice;
      }
    );
  };

  const submitCancel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasAttendance =
      detail?.event.has_attendance === true ||
      (detail?.participant_summary.checked_in ?? 0) > 0;
    if (hasAttendance) {
      const message = COPY.programs.cancelBlockedWithAttendance;
      setConfirmingCancel(false);
      setActionError(message);
      announce(message);
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("cancel_reason") ?? "").trim() || null;
    void runAction(
      () => cancelEvent(programId, eventId, reason),
      () => {
        setConfirmingCancel(false);
        setUndoAvailable(false);
        return COPY.programs.eventCancelledNotice;
      },
      (error) => {
        if (
          error instanceof RpcError &&
          (error.problem.code === "EVENT_CANCEL_BLOCKED" ||
            error.problem.code === "EVENT_CANCELLATION_BLOCKED")
        ) {
          const message = COPY.programs.cancelBlockedWithAttendance;
          setActionError(message);
          announce(message);
          return true;
        }
        return false;
      }
    );
  };

  if (detail === null) {
    if (loadError !== null) {
      const programHref = buildProgramsHref({
        mode: canManage ? "management" : "participant",
        programId,
        ...(canManage ? { task: "events" as const } : {}),
        ...(canManage || origin === undefined ? {} : { origin }),
      });
      return (
        <section
          className={styles.workspaceTask}
          aria-label={COPY.programs.eventDetailTitle}
        >
          <h2 ref={recoveryRef} className={styles.boundaryTitle} tabIndex={-1}>
            {COPY.programs.eventDetailRecoveryTitle}
          </h2>
          <p className={styles.panelError} role="alert">
            {loadError}
          </p>
          <div className={styles.programDetailActions}>
            <button
              type="button"
              className={styles.retry}
              onClick={() => void load()}
            >
              {COPY.error.retry}
            </button>
            {programHref !== "/programs" && (
              <Link href={programHref} className={styles.secondaryButton}>
                {COPY.programs.eventDetailViewProgram}
              </Link>
            )}
            <Link href="/programs" className={styles.secondaryButton}>
              {COPY.programs.eventDetailBackToCatalog}
            </Link>
          </div>
        </section>
      );
    }
    return (
      <output
        className={styles.workspaceTask}
        aria-busy="true"
        aria-label={COPY.programs.eventDetailTitle}
      >
        {COPY.programs.eventDetailLoading}
      </output>
    );
  }
  const { event, leaders, participant_summary } = detail;
  const cancelled = event.status === "Cancelled";
  const hasAttendance =
    event.has_attendance === true || participant_summary.checked_in > 0;
  if (!canManage) {
    const programName = event.program_name ?? event.program_id;
    const checkInOpen = checkInWindowIsOpen(event);
    const scanHref = `/scanner?event=${encodeURIComponent(event.event_id)}`;
    const eventTitle =
      event.name ??
      (event.program_name
        ? COPY.programs.eventFallbackTitle.replace("{name}", event.program_name)
        : hkWallDateTimeLabel(event.starts_at));
    const whenLabel = `${hkShortDateLabel(event.starts_at)}${hkShortTimeRange(event.starts_at, event.ends_at)}`;
    const instructionsHeadingId = "participant-event-instructions";

    return (
      <section
        className={styles.programDetail}
        aria-labelledby="participant-event-title"
        aria-busy={busy}
      >
        <button
          type="button"
          className={styles.programDetailBack}
          aria-label={COPY.programs.backToOrigin}
          onClick={onBack}
        >
          <EventFactIcon name="back" /> {COPY.programs.backToOrigin}
        </button>
        <header className={styles.programDetailHeader}>
          {checkInOpen && (
            <span
              className={`${styles.directoryStatus} ${styles.directoryStatusSuccess}`}
              role="status"
              aria-label={COPY.programs.checkInAvailable}
            >
              {COPY.programs.checkInAvailable}
            </span>
          )}
          <p className={styles.programDetailEyebrow}>{programName}</p>
          <h1
            id="participant-event-title"
            className={styles.boundaryTitle}
            tabIndex={-1}
          >
            {eventTitle}
          </h1>
        </header>

        <article className={styles.programDetailInfoCard}>
          <p
            className={`${styles.programDetailFactRow} ${styles.programDetailFactTime}`}
          >
            <EventFactIcon name="calendar" />
            <time dateTime={event.starts_at}>{whenLabel}</time>
          </p>
          {event.location && (
            <p className={styles.programDetailFactRow}>
              <EventFactIcon name="pin" />
              <span>{event.location}</span>
            </p>
          )}
        </article>

        <section
          className={styles.programDetailSection}
          aria-labelledby={instructionsHeadingId}
        >
          <h2
            id={instructionsHeadingId}
            className={styles.programDetailHeading}
          >
            {COPY.programs.checkInInstructionsHeading}
          </h2>
          <p className={styles.programDetailDescription}>
            {checkInOpen
              ? COPY.programs.eventInstructions
              : event.check_in_window_opens_at
                ? `${COPY.programs.eventInstructionsClosed} ${COPY.programs.eventCheckInWindowOpensAt} ${hkShortDateLabel(event.check_in_window_opens_at)} ${hkShortTimeLabel(event.check_in_window_opens_at)}`
                : COPY.programs.eventInstructionsClosed}
          </p>
        </section>

        <div className={styles.stickyActionBar}>
          <Link
            href={scanHref}
            className={checkInOpen ? styles.button : styles.secondaryButton}
          >
            {COPY.programs.goToScan}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.workspaceTask}
      aria-label={COPY.programs.eventDetailTitle}
      aria-busy={busy}
    >
      <button
        type="button"
        className={styles.programDetailBack}
        onClick={onBack}
      >
        {COPY.programs.eventDetailBack}
      </button>
      {notice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          <span>{notice}</span>
          {undoAvailable && !cancelled && (
            <button
              type="button"
              className={styles.successOutline}
              disabled={busy}
              onClick={submitActivate}
            >
              {COPY.programs.eventAvailabilityUndo}
            </button>
          )}
        </output>
      )}
      {actionError !== null && (
        <output className={styles.panelError} role="alert">
          {actionError}
        </output>
      )}

      <div className={styles.programDetailHeader}>
        <h3 className={styles.workspaceHeading}>
          {event.name ?? hkWallDateTimeLabel(event.starts_at)}
        </h3>
        <p className={styles.workspaceEventSummary}>
          <span className={styles.eventDate}>
            {hkWallDateTimeLabel(event.starts_at)} —{" "}
            {hkWallDateTimeLabel(event.ends_at)}
          </span>
          <span className={styles.eventSource}>
            {event.source === "SCHEDULE"
              ? COPY.programs.eventScheduleSource
              : COPY.programs.eventManualSource}
          </span>
          <span className={styles.eventSource}>
            {event.event_type ?? COPY.programs.eventTypeOptions[5]}
          </span>
          <span className={styles.eventSource}>
            {COPY.programs.repeatLabel.replace(
              "{tag}",
              event.recurrence_tag ?? COPY.programs.recurrenceNone
            )}
          </span>
          <span
            className={cancelled ? styles.eventCancelled : styles.eventActive}
          >
            {STATUS_LABEL[event.status]}
          </span>
          {event.availability !== undefined && (
            <span
              className={
                event.availability === "Active"
                  ? styles.eventActive
                  : styles.eventCancelled
              }
            >
              {AVAILABILITY_LABEL[event.availability]}
            </span>
          )}
        </p>
        {cancelled && event.cancel_reason !== null && (
          <p className={styles.eventReason}>
            {COPY.programs.cancelledReason.replace(
              "{reason}",
              event.cancel_reason
            )}
          </p>
        )}
      </div>

      <dl className={styles.workspaceFacts}>
        {event.location !== null && event.location !== undefined && (
          <div>
            <dt>{COPY.programs.eventLocation}</dt>
            <dd>{event.location}</dd>
          </div>
        )}
        <div>
          <dt>{COPY.programs.eventCheckInWindow}</dt>
          <dd>
            {event.check_in_window_opens_at !== null &&
            event.check_in_window_opens_at !== undefined
              ? `${COPY.programs.eventCheckInWindowOpensAt} ${hkWallDateTimeLabel(event.check_in_window_opens_at)}；${
                  event.check_in_window_closes_at !== null &&
                  event.check_in_window_closes_at !== undefined
                    ? `${COPY.programs.eventCheckInWindowClosesAt} ${hkWallDateTimeLabel(event.check_in_window_closes_at)}`
                    : COPY.programs.eventCheckInWindowClosesAt
                }`
              : COPY.programs.hkTimeMarker}
          </dd>
        </div>
      </dl>

      <div className={styles.workspaceSection}>
        <h4 className={styles.workspaceSubheading}>
          {COPY.programs.eventDetailParticipantSummary}
        </h4>
        <p className={styles.workspaceEventSummary}>
          <span>
            {COPY.programs.eventActiveEnrollments.replace(
              "{count}",
              String(participant_summary.active_enrollments)
            )}
          </span>
          <span>
            {COPY.programs.eventCheckedIn.replace(
              "{count}",
              String(participant_summary.checked_in)
            )}
          </span>
        </p>
      </div>

      <div className={styles.workspaceSection}>
        <h4 className={styles.workspaceSubheading}>
          {COPY.programs.eventDetailLeaders}
        </h4>
        {leaders.length === 0 ? (
          <p className={styles.emptyLine}>{COPY.programs.noLeaders}</p>
        ) : (
          <ul className={styles.ruleList}>
            {leaders.map((leader: ProgramLeader) => (
              <li key={leader.user_id} className={styles.ruleRow}>
                <span>
                  {leader.user_name ?? leader.username ?? leader.user_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && !cancelled && (
        <>
          <div className={styles.workspaceSection}>
            <h4 className={styles.workspaceSubheading}>
              {COPY.programs.eventAvailability}
            </h4>
            {event.availability === "Active" ? (
              confirmingDeactivate ? (
                <div
                  className={styles.confirmation}
                  role="alert"
                  ref={confirmRef}
                >
                  <p>
                    {COPY.programs.eventAvailabilityConfirmBody.replace(
                      "{count}",
                      String(deactivateImpact)
                    )}
                  </p>
                  <div className={styles.confirmRow}>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={busy}
                      onClick={() => submitDeactivate(true)}
                    >
                      {COPY.programs.eventAvailabilityConfirmProceed}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={() => setConfirmingDeactivate(false)}
                    >
                      {COPY.programs.keepEvent}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.dangerOutline}
                  disabled={busy}
                  onClick={() => {
                    // AC-4: safe (zero affected operations) deactivation is
                    // immediate with Undo; only consequential deactivation
                    // requires the inline confirm naming the open operations.
                    // Enrollments are Program-scoped; this Event's own open
                    // operations are its active check-ins alone.
                    if (participant_summary.checked_in === 0) {
                      submitDeactivate(false);
                    } else {
                      setDeactivateImpact(participant_summary.checked_in);
                      setConfirmingDeactivate(true);
                    }
                  }}
                >
                  {COPY.programs.eventAvailabilityDeactivate}
                </button>
              )
            ) : (
              <button
                type="button"
                className={styles.successOutline}
                disabled={busy}
                onClick={submitActivate}
              >
                {COPY.programs.eventAvailabilityActivate}
              </button>
            )}
          </div>

          <div className={styles.workspaceSection}>
            <h4 className={styles.workspaceSubheading}>
              {COPY.programs.eventEditTitle}
            </h4>
            {editing ? (
              <form className={styles.ruleForm} onSubmit={submitEdit}>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventName}</span>
                  <input
                    type="text"
                    name="name"
                    defaultValue={event.name ?? ""}
                    placeholder={COPY.programs.eventNamePlaceholder}
                    aria-label={COPY.programs.eventName}
                  />
                </label>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventType}</span>
                  <select
                    name="event_type"
                    defaultValue={
                      event.event_type ?? COPY.programs.eventTypeOptions[0]
                    }
                    aria-label={COPY.programs.eventType}
                  >
                    {COPY.programs.eventTypeOptions.map((type) => (
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
                    defaultValue={
                      event.recurrence_tag ?? COPY.programs.recurrenceNone
                    }
                    aria-label={COPY.programs.recurrenceTag}
                    disabled
                  >
                    <option value={COPY.programs.recurrenceNone}>
                      {COPY.programs.recurrenceNone}
                    </option>
                    <option value={COPY.programs.recurrenceWeekly}>
                      {COPY.programs.recurrenceWeekly}
                    </option>
                    <option value={COPY.programs.recurrenceMonthly}>
                      {COPY.programs.recurrenceMonthly}
                    </option>
                  </select>
                </label>
                <p className={styles.programDetailMuted}>
                  {COPY.programs.repeatFormInformational}
                </p>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventLocation}</span>
                  <input
                    type="text"
                    name="location"
                    defaultValue={event.location ?? ""}
                    placeholder={COPY.programs.eventLocationPlaceholder}
                    aria-label={COPY.programs.eventLocation}
                  />
                </label>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventStart}</span>
                  <input
                    type="datetime-local"
                    name="starts_at"
                    required
                    defaultValue={hkWallInputValue(event.starts_at)}
                    aria-label={COPY.programs.eventStart}
                  />
                </label>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventEnd}</span>
                  <input
                    type="datetime-local"
                    name="ends_at"
                    required
                    defaultValue={hkWallInputValue(event.ends_at)}
                    aria-label={COPY.programs.eventEnd}
                  />
                </label>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventCheckInWindowOpensAt}</span>
                  <input
                    type="datetime-local"
                    name="opens_at"
                    required={event.check_in_window_opens_at != null}
                    defaultValue={hkWallInputValue(
                      event.check_in_window_opens_at
                    )}
                    aria-label={COPY.programs.eventCheckInWindowOpensAt}
                  />
                </label>
                <label className={styles.ruleField}>
                  <span>{COPY.programs.eventCheckInWindowClosesAt}</span>
                  <input
                    type="datetime-local"
                    name="closes_at"
                    required={event.check_in_window_opens_at != null}
                    defaultValue={hkWallInputValue(
                      event.check_in_window_closes_at
                    )}
                    aria-label={COPY.programs.eventCheckInWindowClosesAt}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className={styles.actionButton}
                >
                  {COPY.programs.eventEditSave}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  {COPY.programs.eventEditCancel}
                </button>
              </form>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {COPY.programs.eventEditTitle}
              </button>
            )}
          </div>

          <div className={styles.workspaceSection}>
            <h4 className={styles.workspaceSubheading}>
              {COPY.programs.cancelEvent}
            </h4>
            {confirmingCancel ? (
              <form
                className={styles.cancelForm}
                noValidate
                onSubmit={submitCancel}
              >
                <div
                  ref={cancelConfirmRef}
                  className={styles.confirmation}
                  role="alert"
                >
                  <strong>{COPY.programs.cancelMeetingConfirmTitle}</strong>
                  <span>{COPY.programs.cancelMeetingConfirmBody}</span>
                  <input
                    type="text"
                    name="cancel_reason"
                    placeholder={COPY.programs.cancelReasonPlaceholder}
                    aria-label={COPY.programs.cancelReason}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className={styles.dangerButton}
                  >
                    {COPY.programs.confirmCancel}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => setConfirmingCancel(false)}
                  >
                    {COPY.programs.keepMeeting}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.dangerOutline}
                disabled={busy}
                onClick={() => {
                  if (hasAttendance) {
                    const message = COPY.programs.cancelBlockedWithAttendance;
                    setActionError(message);
                    announce(message);
                    return;
                  }
                  setConfirmingCancel(true);
                }}
              >
                {COPY.programs.cancelEvent}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
