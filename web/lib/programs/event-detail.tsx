"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  getEvent,
  setEventAvailability,
  updateEvent,
} from "@/lib/programs/program-api";
import type {
  EventDetail as EventDetailData,
  ProgramEvent,
  ProgramLeader,
} from "@/lib/programs/program-api";
import {
  HK_UTC_OFFSET_MINUTES,
  hkWallDateTimeLabel,
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

const AVAILABILITY_LABEL: Record<
  NonNullable<ProgramEvent["availability"]>,
  string
> = {
  Active: COPY.programs.eventAvailable,
  Inactive: COPY.programs.eventUnavailable,
};

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
  onBack,
}: {
  programId: string;
  eventId: string;
  canManage: boolean;
  onBack: () => void;
}) => {
  const [detail, setDetail] = useState<EventDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(errorMessage(error));
      setDetail(null);
    }
  }, [programId, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    [load]
  );

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("starts_at") ?? "");
    const endsAt = String(form.get("ends_at") ?? "");
    void runAction(
      () =>
        updateEvent(programId, eventId, {
          name: String(form.get("name") ?? "").trim() || null,
          location: String(form.get("location") ?? "").trim() || null,
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
        return COPY.programs.eventSavedNotice;
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
              : Math.max(
                  detail?.participant_summary.active_enrollments ?? 0,
                  detail?.participant_summary.checked_in ?? 0
                )
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
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("cancel_reason") ?? "").trim();
    if (!reason) {
      setActionError(errorMessage(new RpcError({ code: "VALIDATION" })));
      return;
    }
    void runAction(
      () => cancelEvent(programId, eventId, reason),
      () => {
        setConfirmingCancel(false);
        setUndoAvailable(false);
        return COPY.programs.eventCancelledNotice;
      }
    );
  };

  if (loadError !== null && detail === null) {
    return (
      <section
        className={styles.workspaceTask}
        aria-label={COPY.programs.eventDetailTitle}
      >
        <p className={styles.panelError} role="alert">
          {loadError}
        </p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => void load()}
        >
          {COPY.error.retry}
        </button>
      </section>
    );
  }
  if (detail === null) {
    return null;
  }
  const { event, leaders, participant_summary } = detail;
  const cancelled = event.status === "Cancelled";

  return (
    <section
      className={styles.workspaceTask}
      aria-label={COPY.programs.eventDetailTitle}
    >
      <button
        type="button"
        className={styles.programDetailBack}
        onClick={onBack}
      >
        {COPY.programs.eventDetailBack}
      </button>
      {notice !== null && (
        <output className={styles.panelNotice}>
          {notice}
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
                    if (
                      participant_summary.active_enrollments === 0 &&
                      participant_summary.checked_in === 0
                    ) {
                      submitDeactivate(false);
                    } else {
                      setDeactivateImpact(
                        Math.max(
                          participant_summary.active_enrollments,
                          participant_summary.checked_in
                        )
                      );
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
              <form className={styles.cancelForm} onSubmit={submitCancel}>
                <div ref={cancelConfirmRef}>
                  <input
                    type="text"
                    name="cancel_reason"
                    required
                    placeholder={COPY.programs.cancelReasonPlaceholder}
                    aria-label={COPY.programs.cancelReason}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className={styles.dangerButton}
                  >
                    {COPY.programs.confirmCancelEvent}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => setConfirmingCancel(false)}
                  >
                    {COPY.programs.keepEvent}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.dangerOutline}
                disabled={busy}
                onClick={() => setConfirmingCancel(true)}
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
