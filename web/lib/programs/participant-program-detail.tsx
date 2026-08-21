"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import {
  hkMonthDayLabel,
  hkShortDateLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import { getParticipantProgramDetail } from "@/lib/programs/program-api";
import type {
  ParticipantEventSummary,
  ParticipantProgramDetail as ParticipantProgramDetailData,
} from "@/lib/programs/program-api";
import { WEEKDAY_LABELS } from "@/lib/programs/recurrence";
import { rememberDeepLink } from "@/lib/session";

import { EventFactIcon } from "./event-detail";
import { ParticipantEnrollment } from "./participant-enrollment";

import styles from "@/app/programs/programs.module.css";

export interface ParticipantProgramDetailProps {
  programId: string;
  onBack: () => void;
  canManage: boolean;
  onManagement: () => void;
  /** PUI-05 (#323): open a participant Event Detail deep link on the boundary. */
  onOpenEvent: (eventId: string) => void;
  conflictProgramName?: string | null;
}

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; detail: ParticipantProgramDetailData }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type StatusKind = "success" | "pending" | "neutral" | "danger";

type ParticipantEventView = ParticipantEventSummary & {
  name?: string | null;
  location?: string | null;
  title?: string | null;
  conflict_note?: string | null;
  conflictNote?: string | null;
  has_schedule_conflict?: boolean;
};

type DetailConflictView = ParticipantProgramDetailData & {
  conflict_note?: string | null;
  conflictNote?: string | null;
  has_schedule_conflict?: boolean;
};

function eventIsUpcoming(startsAt: string): boolean {
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp >= Date.now();
}

const MOBILE_EVENT_CAP = 4;
const DESKTOP_EVENT_CAP = 8;
const DESKTOP_EVENT_MEDIA_QUERY = "(min-width: 800px)";

function scheduleRuleLabel(
  rule: ParticipantProgramDetailData["schedule_rules"][number]
): string {
  return rule.recurrence === "WEEKLY"
    ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0] ?? ""} ${rule.start_time}–${rule.end_time}`
    : `${COPY.programs.ruleMonthly} ${rule.month_day ?? ""}日 ${rule.start_time}–${rule.end_time}`;
}

function statusForDetail(detail: ParticipantProgramDetailData): {
  label: string;
  kind: StatusKind;
} {
  const { enrollment, program } = detail;
  if (program.lifecycle === "Archived") {
    return { label: COPY.programs.statusArchived, kind: "neutral" };
  }
  const active = enrollment?.enrollments.find(
    (item) => item.status === "Active"
  );
  if (active) {
    return { label: COPY.programs.statusActive, kind: "success" };
  }
  const pending = enrollment?.requests.find(
    (request) => request.status === "Pending"
  );
  if (pending) {
    return { label: COPY.programs.statusPending, kind: "pending" };
  }
  const latest = enrollment?.requests
    .toSorted((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .at(0);
  if (latest?.status === "Rejected") {
    return { label: COPY.programs.statusRejected, kind: "danger" };
  }
  if (latest?.status === "Withdrawn") {
    return { label: COPY.programs.statusWithdrawn, kind: "neutral" };
  }
  if (
    enrollment?.enrollments.some((item) => item.status === "Cancelled") === true
  ) {
    return { label: COPY.programs.statusCancelled, kind: "neutral" };
  }
  if (program.enrollment_mode === "ManagerOnly") {
    return { label: COPY.programs.statusManagerOnly, kind: "neutral" };
  }
  return { label: COPY.programs.statusEligible, kind: "pending" };
}

function eventTitle(event: ParticipantEventSummary, index: number): string {
  const view = event as ParticipantEventView;
  return (
    view.name?.trim() ||
    view.title?.trim() ||
    COPY.programs.sessionFallback.replace("{n}", String(index + 1))
  );
}

function eventWhen(event: ParticipantEventSummary): string {
  return hkShortTimeRange(event.starts_at, event.ends_at);
}

function eventLocation(event: ParticipantEventSummary): string | null {
  const location = (event as ParticipantEventView).location?.trim();
  return location || null;
}

function conflictNote(
  detail: ParticipantProgramDetailData,
  event: ParticipantEventSummary | null,
  programName: string,
  conflictProgramName: string | null
): string | null {
  const detailView = detail as DetailConflictView;
  const eventView = event as ParticipantEventView | null;
  const explicit =
    eventView?.conflict_note ??
    eventView?.conflictNote ??
    detailView.conflict_note ??
    detailView.conflictNote;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit;
  }
  const hasConflict =
    eventView?.has_schedule_conflict === true ||
    detailView.has_schedule_conflict === true ||
    (conflictProgramName?.trim() ?? "") !== "";
  return hasConflict
    ? COPY.programs.conflictNote.replace(
        "{program}",
        conflictProgramName?.trim() || programName
      )
    : null;
}

const statusClass: Record<StatusKind, string> = {
  success: styles.directoryStatusSuccess,
  pending: styles.directoryStatusPending,
  neutral: styles.directoryStatusNeutral,
  danger: styles.directoryStatusDanger,
};

interface ParticipantScheduleProps {
  program: ParticipantProgramDetailData["program"];
  scheduleRules: ParticipantProgramDetailData["schedule_rules"];
  events: ParticipantProgramDetailData["events"];
}

const ParticipantSchedule = ({
  program,
  scheduleRules,
  events,
}: ParticipantScheduleProps) => (
  <section
    className={styles.programDetailSection}
    aria-labelledby="program-detail-schedule"
  >
    <h3 id="program-detail-schedule" className={styles.programDetailHeading}>
      {COPY.programs.scheduleTitle}
    </h3>
    {scheduleRules.length > 0 && (
      <div className={styles.programDetailScheduleGroup}>
        <h4
          id="program-detail-schedule-rules"
          className={styles.programDetailSubheading}
        >
          {COPY.programs.scheduleRulesGroup}
        </h4>
        <ul
          className={styles.programDetailList}
          aria-label={COPY.programs.scheduleRulesGroup}
        >
          {scheduleRules.map((rule) => (
            <li key={rule.rule_id} className={styles.programDetailEvent}>
              <span className={styles.programDetailScheduleCopy}>
                {scheduleRuleLabel(rule)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
    {events.length > 0 && (
      <div className={styles.programDetailScheduleGroup}>
        <h4
          id="program-detail-schedule-events"
          className={styles.programDetailSubheading}
        >
          {COPY.programs.scheduleEventsGroup}
        </h4>
        <ul
          className={styles.programDetailList}
          aria-label={COPY.programs.scheduleEventsGroup}
        >
          {events.map((event, index) => {
            const location = eventLocation(event);
            const selfCheckInAvailable =
              event.self_check_in_available === true &&
              program.lifecycle !== "Archived" &&
              program.enrollment_mode !== "ManagerOnly";
            return (
              <li key={event.event_id} className={styles.programDetailEvent}>
                <time className={styles.eventDate} dateTime={event.starts_at}>
                  {hkMonthDayLabel(event.starts_at)}
                </time>
                <div className={styles.programDetailScheduleCopy}>
                  <strong>{eventTitle(event, index)}</strong>
                  <span className={styles.eventSource}>
                    {eventWhen(event)}
                    {location ? ` · ${location}` : ""}
                  </span>
                  <span className={styles.programDetailLifecycle}>
                    <span
                      className={styles.programDetailLifecycleDot}
                      aria-hidden="true"
                    />
                    {COPY.programs.eventActive}
                  </span>
                  {selfCheckInAvailable && (
                    <span
                      className={`${styles.directoryStatus} ${styles.directoryStatusNeutral}`}
                      role="status"
                      aria-label={COPY.programs.checkInAvailable}
                    >
                      {COPY.programs.checkInAvailable}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    )}
    {scheduleRules.length === 0 && events.length === 0 && (
      <p className={styles.programDetailMuted}>
        {COPY.programs.detailEventsNone}
      </p>
    )}
  </section>
);

export const ParticipantProgramDetail = ({
  programId,
  onBack,
  canManage,
  onManagement,
  onOpenEvent,
  conflictProgramName = null,
}: ParticipantProgramDetailProps) => {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const mounted = useRef(true);
  const requestId = useRef(0);
  const retryFocusPending = useRef(false);

  const [eventLimit, setEventLimit] = useState(MOBILE_EVENT_CAP);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(DESKTOP_EVENT_MEDIA_QUERY);
    const updateEventLimit = () => {
      setEventLimit(mediaQuery.matches ? DESKTOP_EVENT_CAP : MOBILE_EVENT_CAP);
    };
    updateEventLimit();
    mediaQuery.addEventListener("change", updateEventLimit);
    return () => mediaQuery.removeEventListener("change", updateEventLimit);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadDetail = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      requestId.current += 1;
      const currentRequest = requestId.current;
      if (showLoading) {
        setState({ kind: "loading" });
        announce(COPY.programs.detailLoading);
      }
      try {
        const detail = await getParticipantProgramDetail(programId);
        if (!mounted.current || requestId.current !== currentRequest) {
          return;
        }
        setState({ kind: "ready", detail });
      } catch (error) {
        if (!mounted.current || requestId.current !== currentRequest) {
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        if (
          error instanceof RpcError &&
          (error.problem.code === "NOT_FOUND" ||
            error.problem.code === "FORBIDDEN")
        ) {
          setState({ kind: "unavailable" });
          announce(COPY.programs.detailUnavailable);
          return;
        }
        const message =
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.error.networkError;
        setState({ kind: "error", message });
        announce(message);
      }
    },
    [programId, router]
  );
  const refreshDetail = useCallback(
    () => loadDetail({ showLoading: false }),
    [loadDetail]
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (state.kind === "loading") {
      return;
    }
    const targetId =
      state.kind === "ready"
        ? "#program-detail-title"
        : "#program-detail-state";
    const panel = document.querySelector<HTMLElement>(targetId);
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  const retryDetail = () => {
    retryFocusPending.current = true;
    void loadDetail();
  };

  const scheduledEvents = useMemo(() => {
    if (state.kind !== "ready") {
      return [];
    }
    return state.detail.events
      .filter((event) => event.status === "Active")
      .filter((event) => eventIsUpcoming(event.starts_at))
      .toSorted((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [state]);

  const visibleEvents = useMemo(
    () => scheduledEvents.slice(0, eventLimit),
    [eventLimit, scheduledEvents]
  );

  if (state.kind === "loading") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryState}
        tabIndex={-1}
        role="status"
        aria-busy="true"
      >
        <p>{COPY.programs.detailLoading}</p>
      </section>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryState}
        tabIndex={-1}
        role="status"
      >
        <h2 className={styles.boundaryTitle}>
          {COPY.programs.detailUnavailable}
        </h2>
        <p>{COPY.programs.detailUnavailableHint}</p>
        <button className={styles.retry} type="button" onClick={onBack}>
          {COPY.programs.detailBack}
        </button>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryError}
        tabIndex={-1}
        role="alert"
      >
        <h2 className={styles.boundaryTitle}>
          {COPY.programs.detailLoadError}
        </h2>
        <p>{state.message}</p>
        <div className={styles.programDetailActions}>
          <button className={styles.retry} type="button" onClick={retryDetail}>
            {COPY.programs.detailRetry}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onBack}
          >
            {COPY.programs.detailBack}
          </button>
        </div>
      </section>
    );
  }

  const {
    program,
    schedule_rules: scheduleRules,
    enrollment,
    enrollment_access: enrollmentAccess,
  } = state.detail;
  const status = statusForDetail(state.detail);
  const nextEvent = scheduledEvents[0] ?? null;
  const nextLocation = nextEvent ? eventLocation(nextEvent) : null;
  const hasActiveEnrollment =
    enrollment?.enrollments.some((item) => item.status === "Active") ?? false;
  const canOpenEventDetail = canManage || hasActiveEnrollment;
  const showEventDetailAdvisory =
    !canOpenEventDetail && scheduledEvents.length > 0;
  const nextConflict = conflictNote(
    state.detail,
    nextEvent,
    program.name,
    conflictProgramName
  );

  return (
    <article
      className={styles.programDetail}
      aria-labelledby="program-detail-title"
    >
      <button
        className={styles.programDetailBack}
        type="button"
        aria-label={COPY.programs.detailBack}
        onClick={onBack}
      >
        <EventFactIcon name="back" /> {COPY.programs.detailBack}
      </button>
      <header className={styles.programDetailHeader}>
        <span
          className={`${styles.directoryStatus} ${statusClass[status.kind]} ${styles.programDetailStatus}`}
          role="status"
        >
          {status.label}
        </span>
        <h2
          id="program-detail-title"
          className={styles.boundaryTitle}
          tabIndex={-1}
        >
          {program.name}
        </h2>
        <p className={styles.programDetailDescription}>
          {program.description ?? COPY.programs.programDescriptionEmpty}
        </p>
      </header>

      {nextEvent && (
        <article
          className={styles.programDetailNextEvent}
          aria-labelledby="program-detail-next-event"
        >
          <span className={styles.programDetailMonoLabel}>
            {COPY.programs.nextMeeting}
          </span>
          <h3
            id="program-detail-next-event"
            className={styles.programDetailNextEventTitle}
          >
            {eventTitle(nextEvent, 0)}
          </h3>
          <div className={styles.programDetailInfoCard}>
            <p className={styles.programDetailFactRow}>
              <EventFactIcon name="calendar" />
              <span>
                {hkShortDateLabel(nextEvent.starts_at)}
                {hkShortTimeRange(nextEvent.starts_at, nextEvent.ends_at)}
              </span>
            </p>
            {nextLocation ? (
              <p className={styles.programDetailFactRow}>
                <EventFactIcon name="pin" />
                <span>{nextLocation}</span>
              </p>
            ) : null}
          </div>
          {nextConflict && (
            <p className={styles.programDetailConflict} role="note">
              {nextConflict}
            </p>
          )}
          {canOpenEventDetail && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => onOpenEvent(nextEvent.event_id)}
              aria-label={COPY.programs.viewEventDetail}
            >
              {COPY.programs.viewEventDetail}
            </button>
          )}
        </article>
      )}

      <ParticipantSchedule
        program={program}
        scheduleRules={scheduleRules}
        events={visibleEvents}
      />

      {canManage && (
        <div className={styles.managementEntry}>
          <div>
            <h3>{COPY.programs.managementMode}</h3>
            <p>{COPY.programs.managementLead}</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={onManagement}
          >
            {COPY.programs.enterManagement}
          </button>
        </div>
      )}
      <ParticipantEnrollment
        program={program}
        enrollment={enrollment}
        enrollmentAccess={enrollmentAccess}
        scheduleRules={scheduleRules}
        events={state.detail.events}
        showEventDetailAdvisory={showEventDetailAdvisory}
        onRefresh={refreshDetail}
      />
    </article>
  );
};
