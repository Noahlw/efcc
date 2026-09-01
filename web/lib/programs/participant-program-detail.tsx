"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEventHandler } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RpcError } from "@/lib/api";
import { ContextualTaskHeader } from "@/lib/contextual-task-header";
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
import { rememberDeepLink } from "@/lib/session";
import { cn } from "@/lib/utils";

import { EventFactIcon } from "./event-detail";
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

const detailStatusVariants = cva(
  "inline-flex min-h-6 w-fit items-center rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-bold tracking-[0.02em]",
  {
    variants: {
      tone: {
        success:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        pending:
          "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)]",
        neutral:
          "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]",
        danger:
          "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

type DetailStatusTone = NonNullable<
  VariantProps<typeof detailStatusVariants>["tone"]
>;

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
  <section
    className="grid min-w-0 gap-2 px-1 pt-2"
    aria-labelledby="program-detail-schedule"
  >
    <h3
      id="program-detail-schedule"
      className="m-0 px-2 text-[0.8125rem] font-extrabold tracking-[0.1em] text-[var(--ink-muted)]"
    >
      {COPY.programs.scheduleTitle}
    </h3>
    {scheduleRules.length > 0 && (
      <div className="grid min-w-0 overflow-hidden rounded-[1.125rem] bg-[var(--surface-raised)] shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]">
        <h4 id="program-detail-schedule-rules" className="sr-only">
          {COPY.programs.scheduleRulesGroup}
        </h4>
        <ul
          className="m-0 grid min-w-0 list-none gap-2 p-0 leading-[1.6]"
          aria-label={COPY.programs.scheduleRulesGroup}
        >
          {scheduleRules.map((rule) => (
            <li
              key={rule.rule_id}
              className="flex min-w-0 items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
            >
              <span className="min-w-0 wrap-anywhere">
                {formatScheduleRuleLabel(rule)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
    {events.length > 0 && (
      <div className="grid min-w-0 overflow-hidden rounded-[1.125rem] bg-[var(--surface-raised)] shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]">
        <h4 id="program-detail-schedule-events" className="sr-only">
          {COPY.programs.scheduleEventsGroup}
        </h4>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0 leading-[1.6]"
          aria-label={COPY.programs.scheduleEventsGroup}
        >
          {events.map((event, index) => {
            const location = eventLocation(event);
            const selfCheckInAvailable =
              event.self_check_in_available === true &&
              program.lifecycle !== "Archived" &&
              program.enrollment_mode !== "ManagerOnly";
            return (
              <li
                key={event.event_id}
                className="flex min-w-0 items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
              >
                <time
                  className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-[0.75rem] bg-[var(--surface)] py-1.5 text-center [font-variant-numeric:tabular-nums] leading-[1.1]"
                  dateTime={event.starts_at}
                >
                  <b className="block text-[1.0625rem] font-extrabold text-[var(--ink)]">
                    {hkDayPadded(event.starts_at)}
                  </b>
                  <span className="mt-0.5 block text-[0.6875rem] text-[var(--ink-muted)]">
                    {hkMonthWeekdayLabel(event.starts_at)}
                  </span>
                </time>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="min-w-0 wrap-anywhere text-[0.9375rem] font-bold">
                    {eventTitle(event, index)}
                  </strong>
                  <span className="min-w-0 wrap-anywhere text-[0.8125rem] text-[var(--ink-muted)]">
                    {eventWhen(event)}
                    {location ? ` · ${location}` : ""}
                  </span>
                  <span className="inline-flex w-fit min-w-0 items-center gap-1.5 wrap-anywhere text-xs font-bold text-[var(--ink-muted)]">
                    <span
                      className="size-2 shrink-0 rounded-full bg-[var(--ink-muted)]"
                      aria-hidden="true"
                    />
                    {COPY.programs.eventActive}
                  </span>
                  {selfCheckInAvailable && (
                    <Badge
                      className={cn(
                        detailStatusVariants({ tone: "neutral" }),
                        "w-fit"
                      )}
                      variant="outline"
                      role="status"
                      aria-label={COPY.programs.checkInAvailable}
                    >
                      {COPY.programs.checkInAvailable}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {totalEventCount > events.length && onExpandAll && (
          <Button
            type="button"
            className="h-auto min-h-11 w-full whitespace-normal rounded-none border-0 px-4 py-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--surface)] hover:text-[var(--accent-deep)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
            variant="ghost"
            onClick={onExpandAll}
          >
            {COPY.programs.scheduleExpandAll.replace(
              "{count}",
              String(totalEventCount)
            )}
          </Button>
        )}
      </div>
    )}
    {scheduleRules.length === 0 && events.length === 0 && (
      <p className="m-0 min-w-0 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
        {COPY.programs.detailEventsNone}
      </p>
    )}
  </section>
);

export const ParticipantProgramDetail = ({
  programId,
  backHref,
  onBack,
  canManage,
  onOpenEvent,
  eventHref,
  managementHref,
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
    async () => getParticipantProgramDetail(programId),
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
      <section
        id="program-detail-state"
        className="grid min-w-0 max-w-[60ch] gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)]"
        tabIndex={-1}
        role="status"
        aria-busy="true"
      >
        <h1 className="m-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight">
          {COPY.programs.detailLoading}
        </h1>
        <Skeleton className="h-16 w-full" aria-hidden="true" />
      </section>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <section
        id="program-detail-state"
        className="grid min-w-0 max-w-[60ch] gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)]"
        tabIndex={-1}
        role="status"
      >
        <h1 className="m-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight">
          {COPY.programs.detailUnavailable}
        </h1>
        <p className="m-0 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
          {COPY.programs.detailUnavailableHint}
        </p>
        <Button
          asChild
          className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
          variant="outline"
        >
          <Link href={backHref} replace onClick={handleBack}>
            {COPY.programs.detailBack}
          </Link>
        </Button>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert
        id="program-detail-state"
        className="grid min-w-0 max-w-[60ch] gap-1.5 border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-[var(--ink)]"
        tabIndex={-1}
        variant="destructive"
      >
        <h1 className="m-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight">
          {COPY.programs.detailLoadError}
        </h1>
        <p className="m-0 wrap-anywhere leading-[1.6]">{state.message}</p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-3 max-[799px]:flex-col">
          <Button
            className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
            type="button"
            onClick={retryDetail}
          >
            {COPY.programs.detailRetry}
          </Button>
          <Button
            asChild
            className="h-auto min-h-11 w-full whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] sm:w-fit"
            variant="outline"
          >
            <Link href={backHref} replace onClick={handleBack}>
              {COPY.programs.detailBack}
            </Link>
          </Button>
        </div>
      </Alert>
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
      className="grid min-w-0 gap-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--ink)]"
      aria-labelledby="program-detail-title"
    >
      <ContextualTaskHeader
        backHref={backHref}
        backLabel={COPY.programs.detailBack}
        backReplace
        onBack={handleBack}
        title={program.name}
        lead={program.description ?? COPY.programs.programDescriptionEmpty}
        headingId="program-detail-title"
        status={
          <Badge
            className={cn(
              detailStatusVariants({
                tone: status.kind as DetailStatusTone,
              })
            )}
            variant="outline"
            role="status"
          >
            {status.label}
          </Badge>
        }
        className="min-w-0 [&_h1]:min-w-0 [&_h1]:wrap-anywhere [&_p]:min-w-0 [&_p]:wrap-anywhere"
      />

      {nextEvent && (
        <article
          className="grid min-w-0 gap-3 rounded-[1.125rem] bg-[var(--surface-raised)] px-4 py-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]"
          aria-labelledby="program-detail-next-event"
        >
          <span className="min-w-0 wrap-anywhere text-xs font-semibold tracking-[0.05em] text-[var(--ink-muted)]">
            {COPY.programs.nextMeeting}
          </span>
          <h3
            id="program-detail-next-event"
            className="m-0 min-w-0 wrap-anywhere text-[1.0625rem] font-bold leading-[1.35]"
          >
            {eventTitle(nextEvent, 0)}
          </h3>
          <Card className="m-0 grid min-w-0 gap-2 border-0 bg-transparent p-0 shadow-none">
            <p className="m-0 flex min-w-0 items-center gap-2 wrap-anywhere text-[0.9375rem] leading-[1.5]">
              <EventFactIcon name="calendar" />
              <span className="min-w-0 wrap-anywhere">
                {hkShortDateLabel(nextEvent.starts_at)}
                {hkShortTimeRange(nextEvent.starts_at, nextEvent.ends_at)}
              </span>
            </p>
            {nextLocation ? (
              <p className="m-0 flex min-w-0 items-center gap-2 wrap-anywhere text-[0.9375rem] leading-[1.5]">
                <EventFactIcon name="pin" />
                <span className="min-w-0 wrap-anywhere">{nextLocation}</span>
              </p>
            ) : null}
          </Card>
          {nextConflict && (
            <p
              className="m-0 min-w-0 wrap-anywhere rounded-[var(--radius-sm)] border border-[var(--pending-border)] bg-[var(--pending-surface)] px-3 py-2.5 text-sm leading-[1.5] text-[var(--pending)]"
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
                className="h-auto min-h-11 w-full whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-left text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
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
                className="h-auto min-h-11 w-full whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-left text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                variant="outline"
                onClick={() => onOpenEvent?.(nextEvent.event_id)}
                aria-label={COPY.programs.viewEventDetail}
              >
                {COPY.programs.viewEventDetail}
              </Button>
            ))}
        </article>
      )}

      <ParticipantSchedule
        program={program}
        scheduleRules={scheduleRules}
        events={visibleEvents}
        totalEventCount={scheduledEvents.length}
        onExpandAll={() => setEventLimit(Number.MAX_SAFE_INTEGER)}
      />

      {canManage && (
        <div className="mt-1 flex min-w-0 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 max-[799px]:flex-col max-[799px]:items-stretch">
          <div className="min-w-0">
            <h3 className="m-0 wrap-anywhere text-base font-extrabold">
              {COPY.programs.managementMode}
            </h3>
            <p className="m-0 mt-1 wrap-anywhere leading-[1.5] text-[var(--ink-muted)]">
              {COPY.programs.managementLead}
            </p>
          </div>
          <Button
            asChild
            className="h-auto min-h-11 whitespace-normal px-4 py-3 text-base font-extrabold max-[799px]:w-full"
          >
            <Link href={managementHref}>{COPY.programs.enterManagement}</Link>
          </Button>
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
