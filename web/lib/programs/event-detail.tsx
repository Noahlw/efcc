"use client";

import { CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ProgramIdentityAssignment,
} from "@/lib/programs/program-api";
import {
  HK_UTC_OFFSET_MINUTES,
  hkWallDateTimeLabel,
} from "@/lib/programs/recurrence";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenHeader,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";

import { buildProgramsHref } from "./programs-intent";
import type { ProgramsOrigin } from "./programs-intent";

export const EventFactIcon = ({
  name,
}: {
  name: "calendar" | "pin" | "back";
}) => {
  const Icon =
    name === "calendar" ? CalendarDays : name === "pin" ? MapPin : ChevronLeft;
  return (
    <Icon
      aria-hidden="true"
      className="size-[var(--screen-icon-size)] shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
      focusable="false"
      strokeWidth={1.8}
    />
  );
};

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
/* oxlint-disable-next-line eslint/complexity -- EVT-01 branch matrix is one state machine; splitting it would scatter the transitions */
export const EventDetail = ({
  programId,
  eventId,
  canManage,
  origin,
  departmentId,
  hash,
  backHref,
  backReplace,
  onBack,
  onAttentionRefresh,
  onAuthRequired,
}: {
  programId: string;
  eventId: string;
  canManage: boolean;
  origin?: ProgramsOrigin;
  departmentId?: string | null;
  hash?: string | null;
  backHref: string;
  backReplace?: boolean;
  onBack?: React.MouseEventHandler<HTMLAnchorElement>;
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
  useEffect(() => {
    if (!editing) {
      return;
    }
    const firstInput = document.querySelector<HTMLInputElement>(
      'form input[name="name"]'
    );
    firstInput?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [editing]);

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
      /* oxlint-disable-next-line unicorn/prefer-query-selector -- exact id lookup on participant-event-title */
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
      /* oxlint-disable-next-line promise/prefer-await-to-callbacks -- runAction takes success/error callbacks by design; awaiting means reworking every call site */
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
      /* oxlint-disable-next-line promise/prefer-await-to-callbacks -- runAction takes success/error callbacks by design; awaiting means reworking every call site */
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
    const RecoveryHeading = canManage ? "h2" : "h1";
    if (loadError !== null) {
      const programHref = buildProgramsHref({
        mode: canManage ? "management" : "participant",
        programId,
        ...(canManage ? { departmentId, task: "events" as const } : {}),
        ...(canManage || origin === undefined ? {} : { origin }),
        hash,
      });
      return (
        <ScreenState
          kind="error"
          title={
            <RecoveryHeading
              ref={recoveryRef}
              className="m-0 text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
              tabIndex={-1}
            >
              {COPY.programs.eventDetailRecoveryTitle}
            </RecoveryHeading>
          }
          description={loadError}
          action={
            <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
              <Button
                type="button"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                onClick={() => void load()}
              >
                {COPY.error.retry}
              </Button>
              {programHref !== "/programs" && (
                <Button
                  asChild
                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                  variant="outline"
                >
                  <Link href={programHref}>
                    {COPY.programs.eventDetailViewProgram}
                  </Link>
                </Button>
              )}
              {!canManage && (
                <Button
                  asChild
                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                  variant="outline"
                >
                  <Link href={backHref} replace={backReplace} onClick={onBack}>
                    {COPY.programs.backToOrigin}
                  </Link>
                </Button>
              )}
              <Button
                asChild
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
              >
                <Link href="/programs">
                  {COPY.programs.eventDetailBackToCatalog}
                </Link>
              </Button>
            </div>
          }
          aria-label={COPY.programs.eventDetailTitle}
        />
      );
    }
    return (
      <ScreenState
        kind="loading"
        title={
          <RecoveryHeading
            ref={recoveryRef}
            className="m-0 text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
            tabIndex={-1}
          >
            {COPY.programs.eventDetailLoading}
          </RecoveryHeading>
        }
        aria-label={COPY.programs.eventDetailTitle}
      >
        <ScreenLoadingRows count={2} label={COPY.programs.eventDetailLoading} />
      </ScreenState>
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
        className="grid min-w-0 gap-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--screen-ink)]"
        aria-labelledby="participant-event-title"
        aria-busy={busy}
      >
        <ScreenHeader
          level="child"
          backLabel={COPY.programs.backToOrigin}
          backHref={backHref}
          backReplace={backReplace}
          onBack={onBack}
          title={eventTitle}
          lead={programName}
          headingId="participant-event-title"
          status={
            checkInOpen ? (
              <ScreenStatus
                role="status"
                tone="success"
                aria-label={COPY.programs.checkInAvailable}
              >
                {COPY.programs.checkInAvailable}
              </ScreenStatus>
            ) : null
          }
        />

        <ScreenCard asChild>
          <article>
            <p className="m-0 flex min-w-0 items-start gap-3 wrap-anywhere font-semibold leading-[1.6]">
              <EventFactIcon name="calendar" />
              <time dateTime={event.starts_at}>{whenLabel}</time>
            </p>
            {event.location && (
              <p className="m-0 flex min-w-0 items-start gap-3 wrap-anywhere leading-[1.6]">
                <EventFactIcon name="pin" />
                <span>{event.location}</span>
              </p>
            )}
          </article>
        </ScreenCard>

        <ScreenSection
          headingId={instructionsHeadingId}
          title={COPY.programs.checkInInstructionsHeading}
        >
          <p className="m-0 min-w-0 max-w-[65ch] wrap-anywhere leading-[1.6] text-[var(--screen-muted)]">
            {checkInOpen
              ? COPY.programs.eventInstructions
              : event.check_in_window_opens_at
                ? `${COPY.programs.eventInstructionsClosed} ${COPY.programs.eventCheckInWindowOpensAt} ${hkShortDateLabel(event.check_in_window_opens_at)} ${hkShortTimeLabel(event.check_in_window_opens_at)}`
                : COPY.programs.eventInstructionsClosed}
          </p>
        </ScreenSection>

        <ScreenCard className="mt-0" data-action-bar>
          <Button
            asChild
            className={
              checkInOpen
                ? "h-auto w-full justify-center whitespace-normal bg-[var(--screen-accent)] text-center text-white hover:bg-[var(--screen-accent-deep)]"
                : "h-auto w-full justify-center whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-center text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
            }
            variant={checkInOpen ? "default" : "outline"}
            data-action-state={checkInOpen ? "available" : "closed"}
          >
            <Link href={scanHref}>{COPY.programs.goToScan}</Link>
          </Button>
        </ScreenCard>
      </section>
    );
  }

  return (
    <section
      className="grid min-w-0 gap-[var(--screen-section-gap)] text-[var(--screen-ink)]"
      aria-label={COPY.programs.eventDetailTitle}
      aria-busy={busy}
    >
      <Button
        asChild
        variant="ghost"
        className="w-fit text-[var(--screen-muted)] hover:bg-transparent hover:text-[var(--screen-ink)]"
        size="row"
      >
        <Link href={backHref} replace={backReplace} onClick={onBack}>
          {COPY.programs.eventDetailBack}
        </Link>
      </Button>
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
            <span>{notice}</span>
            {undoAvailable && !cancelled && (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                disabled={busy}
                onClick={submitActivate}
              >
                {COPY.programs.eventAvailabilityUndo}
              </Button>
            )}
          </div>
        </Alert>
      )}
      {actionError !== null && (
        <Alert variant="destructive">{actionError}</Alert>
      )}

      <ScreenSection
        title={event.name ?? hkWallDateTimeLabel(event.starts_at)}
        headingId="management-event-detail-title"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          <ScreenRowMeta>
            {hkWallDateTimeLabel(event.starts_at)} —{" "}
            {hkWallDateTimeLabel(event.ends_at)}
          </ScreenRowMeta>
          <ScreenStatus
            tone={event.source === "SCHEDULE" ? "accent" : "neutral"}
          >
            {event.source === "SCHEDULE"
              ? COPY.programs.eventScheduleSource
              : COPY.programs.eventManualSource}
          </ScreenStatus>
          <ScreenStatus tone="neutral">
            {event.event_type ?? COPY.programs.eventTypeOptions[5]}
          </ScreenStatus>
          <ScreenStatus tone="neutral">
            {COPY.programs.repeatLabel.replace(
              "{tag}",
              event.recurrence_tag ?? COPY.programs.recurrenceNone
            )}
          </ScreenStatus>
          <ScreenStatus tone={cancelled ? "danger" : "success"}>
            {STATUS_LABEL[event.status]}
          </ScreenStatus>
          {event.availability !== undefined && (
            <ScreenStatus
              tone={event.availability === "Active" ? "success" : "danger"}
            >
              {AVAILABILITY_LABEL[event.availability]}
            </ScreenStatus>
          )}
          {event.exception !== null && event.exception !== undefined && (
            <ScreenStatus tone="pending">
              {event.exception.action === "RESCHEDULE"
                ? COPY.programs.eventRescheduledBadge.replace(
                    "{time}",
                    event.exception.new_start_time ?? ""
                  )
                : COPY.programs.eventCancelledBadge}
            </ScreenStatus>
          )}
        </div>
        {cancelled && event.cancel_reason !== null && (
          <ScreenRowMeta className="text-[var(--screen-danger)]">
            {COPY.programs.cancelledReason.replace(
              "{reason}",
              event.cancel_reason
            )}
          </ScreenRowMeta>
        )}
      </ScreenSection>

      <ScreenCard>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
          {event.location !== null && event.location !== undefined && (
            <div>
              <dt className="text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
                {COPY.programs.eventLocation}
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-semibold">
                {event.location}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
              {COPY.programs.eventCheckInWindow}
            </dt>
            <dd className="m-0 mt-1 wrap-anywhere">
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
      </ScreenCard>

      <ScreenSection title={COPY.programs.eventDetailParticipantSummary}>
        <div className="grid grid-cols-2 border-y border-[var(--screen-line)]">
          <div className="grid gap-0.5 py-3">
            <ScreenRowMeta>
              {COPY.programs.eventActiveEnrollments.replace(
                "{count}",
                String(participant_summary.active_enrollments)
              )}
            </ScreenRowMeta>
          </div>
          <div className="grid gap-0.5 border-l border-[var(--screen-line)] py-3 pl-4">
            <ScreenRowMeta>
              {COPY.programs.eventCheckedIn.replace(
                "{count}",
                String(participant_summary.checked_in)
              )}
            </ScreenRowMeta>
          </div>
        </div>
      </ScreenSection>

      <ScreenSection title={COPY.programs.identityAssignments}>
        {leaders.length === 0 ? (
          <ScreenState
            kind="empty"
            title={COPY.programs.noIdentityAssignments}
          />
        ) : (
          <ScreenRowList>
            <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
              {leaders.map((leader: ProgramIdentityAssignment) => (
                <li
                  key={`${leader.user_id}:${leader.role_definition_id}`}
                  className="min-w-0"
                  aria-label={`${leader.user_name ?? leader.username ?? leader.user_id}，身份組：${leader.label}`}
                >
                  <ScreenRow>
                    <ScreenRowMain>
                      <ScreenRowTitle>
                        {leader.user_name ?? leader.username ?? leader.user_id}
                      </ScreenRowTitle>
                      <ScreenRowMeta>{leader.label}</ScreenRowMeta>
                    </ScreenRowMain>
                  </ScreenRow>
                </li>
              ))}
            </ul>
          </ScreenRowList>
        )}
      </ScreenSection>

      {canManage && !cancelled && (
        <>
          <ScreenSection title={COPY.programs.eventAvailability}>
            {event.availability === "Active" ? (
              confirmingDeactivate ? (
                <ScreenCard role="alert" ref={confirmRef} tone="default">
                  <p className="m-0 wrap-anywhere">
                    {COPY.programs.eventAvailabilityConfirmBody.replace(
                      "{count}",
                      String(deactivateImpact)
                    )}
                  </p>
                  <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                    <Button
                      type="button"
                      className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                      disabled={busy}
                      onClick={() => submitDeactivate(true)}
                    >
                      {COPY.programs.eventAvailabilityConfirmProceed}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      disabled={busy}
                      onClick={() => setConfirmingDeactivate(false)}
                    >
                      {COPY.programs.keepEvent}
                    </Button>
                  </div>
                </ScreenCard>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                  disabled={busy}
                  onClick={() => {
                    // AC-4: safe (zero affected operations) deactivation is
                    // immediate with Undo; only consequential deactivation
                    // requires the inline confirm naming the open operations.
                    if (participant_summary.checked_in === 0) {
                      submitDeactivate(false);
                    } else {
                      setDeactivateImpact(participant_summary.checked_in);
                      setConfirmingDeactivate(true);
                    }
                  }}
                >
                  {COPY.programs.eventAvailabilityDeactivate}
                </Button>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                disabled={busy}
                onClick={submitActivate}
              >
                {COPY.programs.eventAvailabilityActivate}
              </Button>
            )}
          </ScreenSection>

          <ScreenSection title={COPY.programs.eventEditTitle}>
            {editing ? (
              <ScreenCard asChild>
                <ScreenEditor onSubmit={submitEdit}>
                  <ScreenField
                    htmlFor="management-event-name"
                    label={COPY.programs.eventName}
                  >
                    <Input
                      id="management-event-name"
                      autoFocus
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="text"
                      name="name"
                      defaultValue={event.name ?? ""}
                      placeholder={COPY.programs.eventNamePlaceholder}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-type"
                    label={COPY.programs.eventType}
                  >
                    <select
                      id="management-event-type"
                      className="min-h-11 min-w-0 w-full rounded-[var(--screen-radius-control)] border border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-3 py-2 text-base text-[var(--screen-ink)]"
                      name="event_type"
                      defaultValue={
                        event.event_type ?? COPY.programs.eventTypeOptions[0]
                      }
                    >
                      {COPY.programs.eventTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-recurrence"
                    label={COPY.programs.recurrenceTag}
                  >
                    <select
                      id="management-event-recurrence"
                      className="min-h-11 min-w-0 w-full rounded-[var(--screen-radius-control)] border border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-3 py-2 text-base text-[var(--screen-ink)]"
                      name="recurrence_tag"
                      defaultValue={
                        event.recurrence_tag ?? COPY.programs.recurrenceNone
                      }
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
                    <span className="text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                      {COPY.programs.repeatFormInformational}
                    </span>
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-location"
                    label={COPY.programs.eventLocation}
                  >
                    <Input
                      id="management-event-location"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="text"
                      name="location"
                      defaultValue={event.location ?? ""}
                      placeholder={COPY.programs.eventLocationPlaceholder}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-start"
                    label={COPY.programs.eventStart}
                  >
                    <Input
                      id="management-event-start"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      name="starts_at"
                      required
                      defaultValue={hkWallInputValue(event.starts_at)}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-end"
                    label={COPY.programs.eventEnd}
                  >
                    <Input
                      id="management-event-end"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      name="ends_at"
                      required
                      defaultValue={hkWallInputValue(event.ends_at)}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-opens"
                    label={COPY.programs.eventCheckInWindowOpensAt}
                  >
                    <Input
                      id="management-event-opens"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      name="opens_at"
                      required={
                        event.check_in_window_opens_at !== null &&
                        event.check_in_window_opens_at !== undefined
                      }
                      defaultValue={hkWallInputValue(
                        event.check_in_window_opens_at
                      )}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="management-event-closes"
                    label={COPY.programs.eventCheckInWindowClosesAt}
                  >
                    <Input
                      id="management-event-closes"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      name="closes_at"
                      required={
                        event.check_in_window_closes_at !== null &&
                        event.check_in_window_closes_at !== undefined
                      }
                      defaultValue={hkWallInputValue(
                        event.check_in_window_closes_at
                      )}
                    />
                  </ScreenField>
                  <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                    >
                      {COPY.programs.eventEditSave}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      {COPY.programs.eventEditCancel}
                    </Button>
                  </div>
                </ScreenEditor>
              </ScreenCard>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {COPY.programs.eventEditTitle}
              </Button>
            )}
          </ScreenSection>

          <ScreenSection title={COPY.programs.cancelEvent}>
            {confirmingCancel ? (
              <ScreenEditor noValidate onSubmit={submitCancel}>
                <ScreenCard role="alert" ref={cancelConfirmRef}>
                  <strong>{COPY.programs.cancelMeetingConfirmTitle}</strong>
                  <span>{COPY.programs.cancelMeetingConfirmBody}</span>
                  <ScreenField
                    htmlFor="management-cancel-reason"
                    label={COPY.programs.cancelReason}
                  >
                    <Input
                      id="management-cancel-reason"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="text"
                      name="cancel_reason"
                      placeholder={COPY.programs.cancelReasonPlaceholder}
                    />
                  </ScreenField>
                  <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                    >
                      {COPY.programs.confirmCancel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      disabled={busy}
                      onClick={() => setConfirmingCancel(false)}
                    >
                      {COPY.programs.keepMeeting}
                    </Button>
                  </div>
                </ScreenCard>
              </ScreenEditor>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
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
              </Button>
            )}
          </ScreenSection>
        </>
      )}
    </section>
  );
};
