"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import { getParticipantProgramDetail } from "@/lib/programs/program-api";
import type {
  ParticipantEventSummary,
  ParticipantProgramDetail as ParticipantProgramDetailData,
  ParticipantScheduleRule,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

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

const lifecycleLabel: Record<
  ParticipantProgramDetailData["program"]["lifecycle"],
  string
> = {
  Draft: COPY.programs.detailLifecycleDraft,
  Active: COPY.programs.detailLifecycleActive,
  Archived: COPY.programs.detailLifecycleArchived,
};

const behaviorLabel: Record<
  ParticipantProgramDetailData["program"]["behavior_type"],
  string
> = {
  Recurring: COPY.programs.detailBehaviorRecurring,
  OneOff: COPY.programs.detailBehaviorOneOff,
};

const participationLabel: Record<
  ParticipantProgramDetailData["program"]["enrollment_mode"],
  string
> = {
  MemberRequest: COPY.programs.detailParticipationMemberRequest,
  ManagerOnly: COPY.programs.detailParticipationManagerOnly,
};

function scheduleLabel(rule: ParticipantScheduleRule): string {
  if (rule.recurrence === "WEEKLY") {
    const day = COPY.programs.scheduleDays[rule.day_of_week ?? 0] ?? "";
    return `每週${day} ${rule.start_time}–${rule.end_time}`;
  }
  return `每月${rule.month_day ?? ""}日 ${rule.start_time}–${rule.end_time}`;
}

function eventIsUpcoming(startsAt: string): boolean {
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp >= Date.now();
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

function eventTitle(
  event: ParticipantEventSummary,
  programName: string
): string {
  const view = event as ParticipantEventView;
  return view.name?.trim() || view.title?.trim() || programName;
}

function eventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-Hant-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function eventWhen(event: ParticipantEventSummary): string {
  const start = hkWallLabel(event.starts_at);
  const endTime = eventTime(event.ends_at);
  return endTime ? `${start}–${endTime}` : start;
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

  const upcomingEvents = useMemo(() => {
    if (state.kind !== "ready") {
      return [];
    }
    const events = state.detail.events
      .filter((event) => event.status === "Active")
      .filter((event) => eventIsUpcoming(event.starts_at))
      .toSorted((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return state.detail.program.behavior_type === "OneOff"
      ? events
      : events.slice(0, 1);
  }, [state]);

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
    department,
    program,
    schedule_rules: scheduleRules,
    enrollment,
    enrollment_access: enrollmentAccess,
  } = state.detail;
  const status = statusForDetail(state.detail);
  const nextEvent = upcomingEvents[0] ?? null;
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
        ← {COPY.programs.detailBack}
      </button>
      <header className={styles.programDetailHeader}>
        <p className={styles.programDetailEyebrow}>
          {department.name}
          {program.category ? ` · ${program.category}` : ""}
        </p>
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
      </header>

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-purpose"
      >
        <h3 id="program-detail-purpose" className={styles.programDetailHeading}>
          {COPY.programs.detailPurpose}
        </h3>
        <p className={styles.programDetailDescription}>
          {program.description ?? COPY.programs.programDescriptionEmpty}
        </p>
      </section>

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
            {eventTitle(nextEvent, program.name)}
          </h3>
          <dl className={styles.programDetailEventMeta}>
            <div>
              <dt>{COPY.programs.detailEventTime}</dt>
              <dd>
                <time dateTime={nextEvent.starts_at}>
                  {hkWallLabel(nextEvent.starts_at)}
                </time>
                {eventTime(nextEvent.ends_at) && (
                  <span>–{eventTime(nextEvent.ends_at)}</span>
                )}
              </dd>
            </div>
            {eventLocation(nextEvent) && (
              <div>
                <dt>{COPY.programs.detailEventLocation}</dt>
                <dd>{eventLocation(nextEvent)}</dd>
              </div>
            )}
          </dl>
          {nextConflict && (
            <p className={styles.programDetailConflict} role="note">
              {nextConflict}
            </p>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onOpenEvent(nextEvent.event_id)}
            aria-label={COPY.programs.viewEventDetail}
          >
            {COPY.programs.viewEventDetail}
          </button>
        </article>
      )}

      <dl className={styles.programDetailFacts}>
        <div>
          <dt>{COPY.programs.detailBehavior}</dt>
          <dd>{behaviorLabel[program.behavior_type]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailLifecycle}</dt>
          <dd>{lifecycleLabel[program.lifecycle]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailParticipation}</dt>
          <dd>{participationLabel[program.enrollment_mode]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailDepartment}</dt>
          <dd>{department.name}</dd>
        </div>
        {program.category && (
          <div>
            <dt>{COPY.programs.detailCategory}</dt>
            <dd>{program.category}</dd>
          </div>
        )}
      </dl>

      <ParticipantEnrollment
        program={program}
        enrollment={enrollment}
        enrollmentAccess={enrollmentAccess}
        scheduleRules={scheduleRules}
        events={state.detail.events}
        onRefresh={refreshDetail}
      />

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-schedule"
      >
        <h3
          id="program-detail-schedule"
          className={styles.programDetailHeading}
        >
          {COPY.programs.scheduleTitle}
        </h3>
        {scheduleRules.length > 0 ? (
          <div className={styles.programDetailTableWrap}>
            <table
              className={styles.programDetailTable}
              aria-label={COPY.programs.scheduleTitle}
            >
              <thead>
                <tr>
                  <th scope="col">{COPY.programs.scheduleTitle}</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRules.map((rule) => (
                  <tr key={rule.rule_id}>
                    <td>{scheduleLabel(rule)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.detailScheduleNone}
          </p>
        )}
      </section>

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-events"
      >
        <h3 id="program-detail-events" className={styles.programDetailHeading}>
          {COPY.programs.detailEvents}
        </h3>
        {upcomingEvents.length > 0 ? (
          <ul className={styles.programDetailList}>
            {upcomingEvents.map((event) => (
              <li key={event.event_id} className={styles.programDetailEvent}>
                <span>{COPY.programs.detailEventTime}</span>
                <time dateTime={event.starts_at}>{eventWhen(event)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.detailEventsNone}
          </p>
        )}
      </section>
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
    </article>
  );
};
