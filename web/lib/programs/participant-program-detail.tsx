"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEventHandler } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import {
  hkDayPadded,
  hkMonthWeekdayLabel,
  hkShortDateLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";
import { getParticipantProgramDetail } from "@/lib/programs/program-api";
import type {
  ParticipantEventSummary,
  ParticipantProgramDetail as ParticipantProgramDetailData,
} from "@/lib/programs/program-api";
import { formatScheduleRuleLabel } from "@/lib/programs/recurrence";
import {
  ScreenCard,
  ScreenHeader,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { ParticipantEnrollment } from "./participant-enrollment";
import { useAsyncResource } from "./use-async-resource";

export interface ParticipantProgramDetailProps {
  programId: string;
  /** Safe same-origin destination for the Contextual Task Header Back link. */
  backHref: string;
  /** Boundary-owned in-place navigation for same-app route state. */
  onBack?: () => void;
  canManage: boolean;
  /** PUI-05 (#323): optional compatibility callback for boundary navigation. */
  onOpenEvent?: (eventId: string) => void;
  /** Canonical same-origin URL for a participant Event Detail deep link. */
  eventHref?: (eventId: string) => string;
  /** Canonical same-origin destination for the management workspace Link. */
  managementHref: string;
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

interface ParticipantScheduleProps {
  program: ParticipantProgramDetailData["program"];
  scheduleRules: ParticipantProgramDetailData["schedule_rules"];
  events: ParticipantProgramDetailData["events"];
  totalEventCount?: number;
  onExpandAll?: () => void;
}

const ParticipantSchedule = ({
  program,
  scheduleRules,
  events,
  totalEventCount = 0,
  onExpandAll,
}: ParticipantScheduleProps) => (
  <ScreenSection title={COPY.programs.scheduleTitle}>
    {scheduleRules.length > 0 && (
      <ScreenRowList>
        <h3 id="program-detail-schedule-rules" className="sr-only">
          {COPY.programs.scheduleRulesGroup}
        </h3>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
          aria-label={COPY.programs.scheduleRulesGroup}
        >
          {scheduleRules.map((rule) => (
            <li key={rule.rule_id} className="min-w-0">
              <ScreenRow>
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {formatScheduleRuleLabel(rule)}
                  </ScreenRowTitle>
                </ScreenRowMain>
              </ScreenRow>
            </li>
          ))}
        </ul>
      </ScreenRowList>
    )}
    {events.length > 0 && (
      <ScreenRowList>
        <h3 id="program-detail-schedule-events" className="sr-only">
          {COPY.programs.scheduleEventsGroup}
        </h3>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
          aria-label={COPY.programs.scheduleEventsGroup}
        >
          {events.map((event, index) => {
            const location = eventLocation(event);
            const selfCheckInAvailable =
              event.self_check_in_available === true &&
              program.lifecycle !== "Archived" &&
              program.enrollment_mode !== "ManagerOnly";
            return (
              <li key={event.event_id} className="min-w-0">
                <ScreenRow>
                  <time
                    className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)] py-1.5 text-center [font-variant-numeric:tabular-nums] leading-[1.1]"
                    dateTime={event.starts_at}
                  >
                    <b className="block text-base font-extrabold text-[var(--screen-ink)]">
                      {hkDayPadded(event.starts_at)}
                    </b>
                    <span className="mt-0.5 block text-[0.6875rem] text-[var(--screen-muted)]">
                      {hkMonthWeekdayLabel(event.starts_at)}
                    </span>
                  </time>
                  <ScreenRowMain>
                    <ScreenRowTitle>{eventTitle(event, index)}</ScreenRowTitle>
                    <ScreenRowMeta>
                      {eventWhen(event)}
                      {location ? ` · ${location}` : ""}
                    </ScreenRowMeta>
                    <span className="inline-flex w-fit min-w-0 items-center gap-1.5 wrap-anywhere text-xs font-bold text-[var(--screen-muted)]">
                      <span
                        className="size-2 shrink-0 rounded-full bg-[var(--screen-muted)]"
                        aria-hidden="true"
                      />
                      {COPY.programs.eventActive}
                    </span>
                  </ScreenRowMain>
                  {selfCheckInAvailable ? (
                    <ScreenRowTrailing>
                      <ScreenStatus
                        role="status"
                        tone="neutral"
                        aria-label={COPY.programs.checkInAvailable}
                      >
                        {COPY.programs.checkInAvailable}
                      </ScreenStatus>
                    </ScreenRowTrailing>
                  ) : null}
                </ScreenRow>
              </li>
            );
          })}
        </ul>
        {totalEventCount > events.length && onExpandAll && (
          <Button
            type="button"
            className="h-auto min-h-11 w-full rounded-none border-0 px-4 py-3 text-sm font-bold text-[var(--screen-accent)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-accent-deep)] focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
            variant="ghost"
            onClick={onExpandAll}
          >
            {COPY.programs.scheduleExpandAll.replace(
              "{count}",
              String(totalEventCount)
            )}
          </Button>
        )}
      </ScreenRowList>
    )}
    {scheduleRules.length === 0 && events.length === 0 && (
      <ScreenState
        kind="empty"
        title={<span className="sr-only">{COPY.programs.scheduleTitle}</span>}
        description={
          <p className="m-0 wrap-anywhere leading-[1.6]">
            {COPY.programs.detailEventsNone}
          </p>
        }
      />
    )}
  </ScreenSection>
);

export const ParticipantProgramDetail = ({
  programId,
  backHref,
  onBack,
  canManage,
  onOpenEvent,
  eventHref,
  conflictProgramName = null,
}: ParticipantProgramDetailProps) => {
  const router = useRouter();
  const [eventLimit, setEventLimit] = useState(MOBILE_EVENT_CAP);
  const onAuthRequired = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    rememberDeepLink(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    router.replace("/");
  }, [router]);
  const handleBack = useCallback<MouseEventHandler<HTMLAnchorElement>>(
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      if (onBack) {
        onBack();
        return;
      }
      router.replace(backHref);
    },
    [backHref, onBack, router]
  );
  const {
    state,
    run,
    refresh,
    retry: retryDetail,
  } = useAsyncResource<ParticipantProgramDetailData, DetailState>(
    () => getParticipantProgramDetail(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (detail) => ({ kind: "ready", detail }),
      onError: (error) => {
        if (
          error instanceof RpcError &&
          (error.problem.code === "NOT_FOUND" ||
            error.problem.code === "FORBIDDEN")
        ) {
          return { kind: "unavailable" };
        }
        return {
          kind: "error",
          message:
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.error.networkError,
        };
      },
      announceLoading: COPY.programs.detailLoading,
      announceError: (error) =>
        error instanceof RpcError &&
        (error.problem.code === "NOT_FOUND" ||
          error.problem.code === "FORBIDDEN")
          ? COPY.programs.detailUnavailable
          : undefined,
      isAuthRequired: (error) =>
        error instanceof RpcError && error.problem.code === "AUTH_REQUIRED",
      onAuthRequired,
    },
    [programId, router]
  );

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
    void run();
  }, [run]);

  useEffect(() => {
    if (state.kind === "loading") {
      return;
    }
    const targetId =
      state.kind === "ready"
        ? "#program-detail-title"
        : "#program-detail-state";
    document.querySelector<HTMLElement>(targetId)?.focus();
  }, [state.kind]);

  const refreshDetail = useCallback(() => refresh(), [refresh]);
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
      <ScreenState
        id="program-detail-state"
        tabIndex={-1}
        kind="loading"
        title={
          <h1 className="m-0 wrap-anywhere text-[length:var(--screen-child-title-size)] font-extrabold leading-[var(--screen-child-title-leading)]">
            {COPY.programs.detailLoading}
          </h1>
        }
        description={
          <div className="grid gap-2 py-2" aria-hidden="true">
            <span className="h-4 w-2/3 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
            <span className="h-16 w-full rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
          </div>
        }
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <ScreenState
        id="program-detail-state"
        tabIndex={-1}
        kind="not-found"
        title={
          <h1 className="m-0 wrap-anywhere text-[length:var(--screen-child-title-size)] font-extrabold leading-[var(--screen-child-title-leading)]">
            {COPY.programs.detailUnavailable}
          </h1>
        }
        description={
          <p className="m-0 wrap-anywhere leading-[1.6]">
            {COPY.programs.detailUnavailableHint}
          </p>
        }
        action={
          <Button
            asChild
            className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
            variant="outline"
          >
            <Link href={backHref} replace onClick={handleBack}>
              {COPY.programs.detailBack}
            </Link>
          </Button>
        }
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ScreenState
        id="program-detail-state"
        tabIndex={-1}
        kind="error"
        title={
          <h1 className="m-0 wrap-anywhere text-[length:var(--screen-child-title-size)] font-extrabold leading-[var(--screen-child-title-leading)]">
            {COPY.programs.detailLoadError}
          </h1>
        }
        description={
          <p className="m-0 wrap-anywhere leading-[1.6]">{state.message}</p>
        }
        action={
          <div className="flex min-w-0 flex-wrap gap-3 max-[799px]:flex-col">
            <Button
              className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
              type="button"
              onClick={retryDetail}
            >
              {COPY.programs.detailRetry}
            </Button>
            <Button
              asChild
              className="h-auto min-h-11 w-full whitespace-normal border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-4 py-3 text-base font-bold text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)] sm:w-fit"
              variant="outline"
            >
              <Link href={backHref} replace onClick={handleBack}>
                {COPY.programs.detailBack}
              </Link>
            </Button>
          </div>
        }
      />
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
      className="grid min-w-0 gap-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--screen-ink)]"
      aria-labelledby="program-detail-title"
    >
      <ScreenHeader
        level="child"
        backHref={backHref}
        backLabel={COPY.programs.detailBack}
        backReplace
        onBack={handleBack}
        title={program.name}
        lead={program.description ?? COPY.programs.programDescriptionEmpty}
        headingId="program-detail-title"
        status={
          <ScreenStatus tone={status.kind} role="status">
            {status.label}
          </ScreenStatus>
        }
        className="min-w-0"
      />

      {nextEvent && (
        <ScreenSection title={COPY.programs.nextMeeting}>
          <ScreenCard asChild tone="emphasis">
            <article aria-labelledby="program-detail-next-event">
              <span className="sr-only">{COPY.programs.nextMeeting}</span>
              <ScreenRowMain>
                <h3
                  id="program-detail-next-event"
                  className="m-0 min-w-0 wrap-anywhere text-base font-bold leading-[1.35]"
                >
                  {eventTitle(nextEvent, 0)}
                </h3>
                <ScreenRowMeta>
                  <span className="flex min-w-0 items-center gap-2 wrap-anywhere">
                    <CalendarDays
                      aria-hidden="true"
                      className="size-[var(--screen-icon-size)] shrink-0 text-[var(--screen-muted)]"
                      strokeWidth={1.8}
                    />
                    <span className="min-w-0 wrap-anywhere">
                      {hkShortDateLabel(nextEvent.starts_at)}
                      {hkShortTimeRange(nextEvent.starts_at, nextEvent.ends_at)}
                    </span>
                  </span>
                  {nextLocation ? (
                    <span className="mt-1 flex min-w-0 items-center gap-2 wrap-anywhere">
                      <MapPin
                        aria-hidden="true"
                        className="size-[var(--screen-icon-size)] shrink-0 text-[var(--screen-muted)]"
                        strokeWidth={1.8}
                      />
                      <span className="min-w-0 wrap-anywhere">
                        {nextLocation}
                      </span>
                    </span>
                  ) : null}
                </ScreenRowMeta>
              </ScreenRowMain>
              {nextConflict && (
                <p
                  className="m-0 min-w-0 wrap-anywhere border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] px-3 py-2.5 text-sm leading-[1.5] text-[var(--screen-pending)]"
                  role="note"
                >
                  {nextConflict}
                </p>
              )}
              {canOpenEventDetail &&
                (eventHref || onOpenEvent) &&
                (eventHref ? (
                  <Button
                    asChild
                    className="h-auto min-h-11 w-full whitespace-normal border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-4 py-3 text-left text-base font-bold text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
                    variant="outline"
                  >
                    <Link
                      href={eventHref(nextEvent.event_id)}
                      aria-label={COPY.programs.viewEventDetail}
                      onClick={(event) => {
                        if (
                          !onOpenEvent ||
                          event.defaultPrevented ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return;
                        }
                        event.preventDefault();
                        onOpenEvent(nextEvent.event_id);
                      }}
                    >
                      {COPY.programs.viewEventDetail}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="h-auto min-h-11 w-full whitespace-normal border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-4 py-3 text-left text-base font-bold text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
                    variant="outline"
                    onClick={() => onOpenEvent?.(nextEvent.event_id)}
                    aria-label={COPY.programs.viewEventDetail}
                  >
                    {COPY.programs.viewEventDetail}
                  </Button>
                ))}
            </article>
          </ScreenCard>
        </ScreenSection>
      )}

      <ParticipantSchedule
        program={program}
        scheduleRules={scheduleRules}
        events={visibleEvents}
        totalEventCount={scheduledEvents.length}
        onExpandAll={() => setEventLimit(Number.MAX_SAFE_INTEGER)}
      />

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
