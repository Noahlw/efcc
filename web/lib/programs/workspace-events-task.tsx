"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  createEvent,
  createScheduleException,
  deleteScheduleException,
  generateEvents,
  listEvents,
  listScheduleRules,
  previewEvents,
} from "@/lib/programs/program-api";
import type {
  EventType,
  PreviewResult,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import {
  formatScheduleRuleLabel,
  hkWallDateTimeLabel,
  wallWeekday,
} from "@/lib/programs/recurrence";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenLoadingRows,
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

import { hkWallInputToIso } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";
import {
  eventWallParts,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

type EventsState =
  | { kind: "loading" }
  | { kind: "ready"; events: ProgramEvent[] }
  | { kind: "error"; message: string };

// EVT-02 (#252): server-owned preview plan lifecycle in the events task.
type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; plan: PreviewResult }
  | { kind: "empty" }
  | { kind: "error"; message: string; stale: boolean };

/**
 * Attribute a schedule row to one rule only when its HK wall date (and, when
 * needed, wall time) makes the source unambiguous. The server's event.exception
 * remains the authority for an existing exception; this helper is only used
 * to choose the rule for a new mutation.
 */
function ruleForEvent(
  event: ProgramEvent,
  rules: ScheduleRule[]
): ScheduleRule | null {
  if (event.source !== "SCHEDULE") {
    return null;
  }
  const { date, time } = eventWallParts(event.starts_at);
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

export const RecurringSchedulePanel = ({
  programId,
  rules,
  rulesError,
  onGenerated,
}: {
  programId: string;
  rules: ScheduleRule[] | null;
  rulesError: string | null;
  /** Invoked after a successful generation so the event list refreshes. */
  onGenerated: () => void;
}) => {
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generatePartial, setGeneratePartial] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submitPreview = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const raw = form.get("horizon_days");
    const horizonDays = Number(raw);
    if (
      !Number.isInteger(horizonDays) ||
      horizonDays < 1 ||
      horizonDays > 365
    ) {
      setPreview({ kind: "idle" });
      setGenerateError(COPY.programs.previewError);
      announce(COPY.programs.previewError);
      return;
    }
    setPreviewBusy(true);
    setPreview({ kind: "loading" });
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const plan = await previewEvents(programId, horizonDays);
      if (!mounted.current) {
        return;
      }
      if (plan.occurrences.length === 0) {
        setPreview({ kind: "empty" });
        announce(COPY.programs.previewEmpty);
        return;
      }
      setPreview({ kind: "ready", plan });
      announce(
        COPY.programs.previewed.replace(
          "{count}",
          String(plan.occurrences.length)
        )
      );
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setPreview({ kind: "error", message, stale: false });
      announce(message);
    } finally {
      if (mounted.current) {
        setPreviewBusy(false);
      }
    }
  };

  const submitGenerate = async () => {
    if (preview.kind !== "ready") {
      return;
    }
    const planId = preview.plan.plan.plan_id;
    setGenerateBusy(true);
    setGenerateError(null);
    setGenerateResult(null);
    setGeneratePartial(false);
    try {
      const { generated } = await generateEvents(programId, planId);
      if (!mounted.current) {
        return;
      }
      const result =
        generated.failed === 0
          ? generated.resumed
            ? COPY.programs.generatedResumed
                .replace("{created}", String(generated.created))
                .replace("{skipped}", String(generated.skipped))
            : COPY.programs.generated
                .replace("{created}", String(generated.created))
                .replace("{skipped}", String(generated.skipped))
          : COPY.programs.generatedPartial
              .replace("{created}", String(generated.created))
              .replace("{skipped}", String(generated.skipped))
              .replace("{failed}", String(generated.failed));
      // A partial/failed run is NOT a full success: surface the same text
      // through the alert treatment so the operator sees generation is
      // incomplete and can re-click Generate on the same plan to resume the
      // failed units (the server run is resumable by design). Keep the plan
      // and preview state untouched; only refresh the event directory with
      // whatever partial progress exists.
      setGeneratePartial(generated.failed > 0);
      setGenerateResult(result);
      announce(result);
      onGenerated();
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      if (error instanceof RpcError && error.problem.code === "STALE_PLAN") {
        // The schedule changed under the plan; require a fresh preview
        // before generation can run again.
        setPreview({ kind: "error", message, stale: true });
      } else {
        setGenerateError(message);
      }
      announce(message);
    } finally {
      if (mounted.current) {
        setGenerateBusy(false);
      }
    }
  };

  const rulesReady = rules !== null;
  const noRules = rulesReady && rules.length === 0;

  return (
    <ScreenSection
      title={COPY.programs.secondaryGeneratorLabel}
      headingId="programs-workspace-recurring-title"
    >
      <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.previewLead}
      </p>
      {rulesError !== null && <Alert variant="destructive">{rulesError}</Alert>}
      {noRules ? (
        <ScreenState
          kind="empty"
          title={`${COPY.programs.schedulePreviewTitle}：${COPY.programs.settingsScheduleNone}`}
        />
      ) : (
        <ScreenCard asChild>
          <ScreenEditor onSubmit={submitPreview}>
            <ScreenField
              htmlFor="programs-preview-horizon"
              label={COPY.programs.previewHorizon}
            >
              <Input
                id="programs-preview-horizon"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="number"
                name="horizon_days"
                min={1}
                max={365}
                defaultValue={90}
                required
              />
            </ScreenField>
            <Button
              type="submit"
              className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
              disabled={previewBusy || generateBusy}
            >
              {previewBusy
                ? COPY.programs.previewing
                : COPY.programs.previewEvents}
            </Button>
          </ScreenEditor>
        </ScreenCard>
      )}
      {preview.kind === "loading" && (
        <ScreenLoadingRows count={1} label={COPY.programs.previewing} />
      )}
      {preview.kind === "error" && (
        <ScreenState kind="error" title={preview.message} />
      )}
      {preview.kind === "empty" && (
        <ScreenState kind="empty" title={COPY.programs.previewEmpty} />
      )}
      {preview.kind === "ready" && (
        <ScreenSection title={COPY.programs.schedulePreviewTitle}>
          <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
            {COPY.programs.previewPlanLabel.replace(
              "{id}",
              preview.plan.plan.plan_id.slice(0, 8)
            )}
            {" · "}
            {COPY.programs.previewPlanMeta
              .replace("{rules}", String(preview.plan.plan.rule_count))
              .replace("{days}", String(preview.plan.plan.horizon_days))}
          </p>
          <ScreenRowList>
            <ul
              className="m-0 grid min-w-0 list-none gap-0 p-0"
              aria-label={COPY.programs.previewEvents}
            >
              {preview.plan.occurrences.map((occurrence) => {
                const rule = (rules ?? []).find(
                  (candidate) => candidate.rule_id === occurrence.rule_id
                );
                const skipped = occurrence.skip_reason !== null;
                return (
                  <li key={occurrence.occurrence_id} className="min-w-0">
                    <ScreenRow className="items-start">
                      <ScreenRowMain>
                        <ScreenRowTitle>
                          {hkWallDateTimeLabel(occurrence.starts_at)}
                        </ScreenRowTitle>
                        <ScreenRowMeta>
                          {occurrence.location?.trim()
                            ? occurrence.location
                            : COPY.programs.eventLocationPlaceholder}
                        </ScreenRowMeta>
                        <ScreenRowMeta>
                          {rule
                            ? formatScheduleRuleLabel(rule)
                            : occurrence.rule_id}
                        </ScreenRowMeta>
                      </ScreenRowMain>
                      <ScreenRowTrailing>
                        {occurrence.skip_reason === "CANCEL" && (
                          <ScreenStatus tone="danger">
                            {COPY.programs.previewOccurrenceSkipped}
                          </ScreenStatus>
                        )}
                        {occurrence.skip_reason === "DUPLICATE" && (
                          <ScreenStatus tone="danger">
                            {COPY.programs.previewOccurrenceDuplicate}
                          </ScreenStatus>
                        )}
                        {!skipped && occurrence.exception_id !== null && (
                          <ScreenStatus tone="pending">
                            {COPY.programs.previewOccurrenceRescheduled}
                          </ScreenStatus>
                        )}
                      </ScreenRowTrailing>
                    </ScreenRow>
                  </li>
                );
              })}
            </ul>
          </ScreenRowList>
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
            <Button
              type="button"
              className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
              onClick={() => void submitGenerate()}
              disabled={generateBusy || previewBusy}
            >
              {generateBusy
                ? COPY.programs.generating
                : COPY.programs.generateEvents}
            </Button>
            {generateResult !== null &&
              (generatePartial ? (
                <Alert variant="destructive">{generateResult}</Alert>
              ) : (
                <Alert tone="success" announcement="polite">
                  {generateResult}
                </Alert>
              ))}
          </div>
          {generateError !== null && (
            <Alert variant="destructive">{generateError}</Alert>
          )}
        </ScreenSection>
      )}
    </ScreenSection>
  );
};

export const EventsTask = () => {
  const {
    program,
    attention,
    departmentId,
    hash,
    onAttentionRefresh,
    onTaskChange,
    onOpenEvent,
  } = useWorkspaceTaskContext();
  const programId = program.program_id;
  const canManage = program.capabilities.manage;
  const recurring = program.behavior_type === "Recurring";
  const mounted = useRef(true);
  const previousEvents = useRef<ProgramEvent[] | null>(null);
  interface EventLoadOutcome {
    status: "pending" | "success" | "error" | "stale";
  }
  const eventLoadOutcomes = useRef(new WeakMap<object, EventLoadOutcome>());
  const latestEventLoadOutcome = useRef<EventLoadOutcome | null>(null);
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const { state, run, retry } = useAsyncResource<ProgramEvent[], EventsState>(
    async (request) => {
      const outcome: EventLoadOutcome = { status: "pending" };
      const previousOutcome = latestEventLoadOutcome.current;
      if (previousOutcome) {
        previousOutcome.status = "stale";
      }
      latestEventLoadOutcome.current = outcome;
      eventLoadOutcomes.current.set(request ?? outcome, outcome);
      try {
        const { events } = await listEvents(programId);
        outcome.status =
          latestEventLoadOutcome.current === outcome ? "success" : "stale";
        return events;
      } catch (error) {
        outcome.status =
          latestEventLoadOutcome.current === outcome ? "error" : "stale";
        throw error;
      }
    },
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (events) => {
        previousEvents.current = events;
        return { kind: "ready", events };
      },
      onError: (error) => {
        if (redirectToLoginIfRequired(error)) {
          return null;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        return {
          kind: "error",
          message:
            error instanceof RpcError
              ? errorCopyFor(code, error.problem.detail)
              : COPY.error.networkError,
        };
      },
    },
    [programId]
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reschedulingEventId, setReschedulingEventId] = useState<string | null>(
    null
  );
  const [confirmingOccurrenceId, setConfirmingOccurrenceId] = useState<
    string | null
  >(null);
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(
    null
  );
  const rescheduleFormRef = useRef<HTMLFormElement>(null);
  const confirmOccurrenceRef = useRef<HTMLDivElement>(null);
  const confirmEventRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    setRules(null);
    if (!canManage || !recurring) {
      return () => {
        cancelled = true;
      };
    }
    const loadRules = async () => {
      try {
        const { rules: nextRules } = await listScheduleRules(programId);
        if (!cancelled) {
          setRules(nextRules);
        }
      } catch {
        if (cancelled) {
          return;
        }
        // The focused Schedule task owns the schedule-rule error surface.
        // Events only uses this resource to decide which occurrence actions
        // can be shown, so preserve the failure as an empty rule set.
        setRules([]);
      }
    };
    void loadRules();
    return () => {
      cancelled = true;
    };
  }, [canManage, programId, recurring]);

  useEffect(() => {
    if (reschedulingEventId !== null) {
      rescheduleFormRef.current?.querySelector("input")?.focus();
    }
  }, [reschedulingEventId]);

  useEffect(() => {
    if (confirmingOccurrenceId !== null) {
      confirmOccurrenceRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingOccurrenceId]);

  useEffect(() => {
    if (confirmingEventId !== null) {
      confirmEventRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingEventId]);

  const eventAttention = attention?.programs.find(
    ({ program_id }) => program_id === programId
  );
  const eventsForActions =
    state.kind === "ready" ? state.events : (previousEvents.current ?? []);
  const dataReady = state.kind === "ready";
  const runEventAction = async (
    action: () => Promise<unknown>,
    successMessage: string
  ): Promise<boolean> => {
    setActionBusy(true);
    setActionError(null);
    setNotice(null);
    const request = { cancelled: false };
    try {
      await action();
      if (!mounted.current) {
        return false;
      }
      onAttentionRefresh();
      await run(request);
      const outcome = eventLoadOutcomes.current.get(request);
      if (!mounted.current || outcome?.status !== "success") {
        return false;
      }
      setNotice(successMessage);
      announce(successMessage);
      return true;
    } catch (error: unknown) {
      if (!mounted.current) {
        return false;
      }
      if (redirectToLoginIfRequired(error)) {
        return false;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setActionError(message);
      announce(message);
      return false;
    } finally {
      if (mounted.current) {
        setActionBusy(false);
      }
    }
  };

  const submitReschedule =
    (rule: ScheduleRule, wallDate: string) =>
    (formEvent: FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      const form = new FormData(formEvent.currentTarget);
      const newStartTime = String(form.get("new_start_time") ?? "").trim();
      const newEndTime = String(form.get("new_end_time") ?? "").trim();
      if (!newStartTime || !newEndTime) {
        const message = COPY.programs.exceptionCreateError;
        setActionError(message);
        announce(message);
        return;
      }
      void (async () => {
        const succeeded = await runEventAction(
          () =>
            createScheduleException(programId, rule.rule_id, {
              override_date: wallDate,
              action: "RESCHEDULE",
              new_start_time: newStartTime,
              new_end_time: newEndTime,
            }),
          COPY.programs.exceptionUpdatedNotice
        );
        if (succeeded && mounted.current) {
          setReschedulingEventId(null);
        }
      })();
    };

  const submitCancelOccurrence =
    (rule: ScheduleRule, wallDate: string, eventId: string) =>
    (formEvent: FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      if (confirmingOccurrenceId !== eventId) {
        setConfirmingOccurrenceId(eventId);
        return;
      }
      void (async () => {
        const succeeded = await runEventAction(
          () =>
            createScheduleException(programId, rule.rule_id, {
              override_date: wallDate,
              action: "CANCEL",
            }),
          COPY.programs.exceptionUpdatedNotice
        );
        if (succeeded && mounted.current) {
          setConfirmingOccurrenceId(null);
        }
      })();
    };

  const submitCancelEvent =
    (eventId: string) => (formEvent: FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      const currentEvent = eventsForActions.find(
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
      const form = new FormData(formEvent.currentTarget);
      const reason = String(form.get("cancel_reason") ?? "").trim() || null;
      void (async () => {
        const succeeded = await runEventAction(
          () => cancelEvent(programId, eventId, reason),
          COPY.programs.eventCancelledNotice
        );
        if (succeeded && mounted.current) {
          setConfirmingEventId(null);
        }
      })();
    };

  const removeException = (
    exception: NonNullable<ProgramEvent["exception"]>
  ): void => {
    void runEventAction(
      () =>
        deleteScheduleException(
          programId,
          exception.rule_id,
          exception.exception_id
        ),
      COPY.programs.exceptionRemovedNotice
    );
  };

  const submitCreate = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const date = String(form.get("event_date") ?? "").trim();
    const time = String(form.get("event_time") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    if (!date || !time || !name) {
      const message = COPY.programs.createMeetingValidation;
      setCreateError(message);
      announce(message);
      return;
    }
    const startsAt = hkWallInputToIso(`${date}T${time}`);
    if (!startsAt) {
      const message = COPY.programs.createMeetingValidation;
      setCreateError(message);
      announce(message);
      return;
    }
    const eventType = String(
      form.get("event_type") ?? COPY.programs.eventTypeOptions[0]
    ) as EventType;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { event } = await createEvent(programId, {
        name,
        event_type: eventType,
        starts_at: startsAt,
        ends_at: new Date(
          new Date(startsAt).getTime() + 60 * 60_000
        ).toISOString(),
      });
      announce(COPY.programs.eventCreatedNotice);
      setCreateOpen(false);
      await run();
      if (!mounted.current) {
        return;
      }
      onOpenEvent?.(event.event_id);
    } catch (error: unknown) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setCreateError(message);
      announce(message);
    } finally {
      setCreateBusy(false);
    }
  };
  const eventsForDisplay =
    state.kind === "ready" ? state.events : previousEvents.current;

  return (
    <ScreenSection
      title={COPY.programs.workspaceTaskEvents}
      headingId="programs-workspace-events-title"
      aria-busy={createBusy || actionBusy}
      action={
        canManage ? (
          <Button
            type="button"
            className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(null);
            }}
          >
            {COPY.programs.createMeeting}
          </Button>
        ) : undefined
      }
    >
      <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.repeatInformational}
      </p>
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          {notice}
        </Alert>
      )}
      {actionError !== null && (
        <Alert variant="destructive">{actionError}</Alert>
      )}
      {(eventAttention?.inactive_event_count ?? 0) > 0 ||
      (eventAttention?.cancelled_event_count ?? 0) > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          {(eventAttention?.inactive_event_count ?? 0) > 0 && (
            <ScreenStatus
              tone="accent"
              aria-label={COPY.programs.attentionEventCount.replace(
                "{count}",
                String(eventAttention?.inactive_event_count)
              )}
            >
              {eventAttention?.inactive_event_count}
            </ScreenStatus>
          )}
          {(eventAttention?.cancelled_event_count ?? 0) > 0 && (
            <ScreenStatus
              tone="danger"
              aria-label={COPY.programs.attentionCancelledCount.replace(
                "{count}",
                String(eventAttention?.cancelled_event_count)
              )}
            >
              {eventAttention?.cancelled_event_count}
            </ScreenStatus>
          )}
        </div>
      ) : null}
      {canManage && createOpen && (
        <ScreenCard asChild>
          <ScreenEditor
            aria-labelledby="programs-workspace-event-create-title"
            aria-busy={createBusy}
            noValidate
            onSubmit={submitCreate}
          >
            <h3
              id="programs-workspace-event-create-title"
              className="m-0 wrap-anywhere text-base font-bold leading-[var(--screen-section-title-leading)]"
            >
              {COPY.programs.createMeeting}
            </h3>
            {createError !== null && (
              <Alert variant="destructive">{createError}</Alert>
            )}
            <ScreenField
              htmlFor="programs-event-date"
              label={COPY.programs.eventDate}
            >
              <Input
                id="programs-event-date"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="date"
                name="event_date"
                aria-required="true"
              />
            </ScreenField>
            <ScreenField
              htmlFor="programs-event-time"
              label={COPY.programs.eventTime}
            >
              <Input
                id="programs-event-time"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="time"
                name="event_time"
                aria-required="true"
              />
            </ScreenField>
            <ScreenField
              htmlFor="programs-event-name"
              label={COPY.programs.eventName}
            >
              <Input
                id="programs-event-name"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="text"
                name="name"
                placeholder={COPY.programs.eventNamePlaceholder}
                aria-required="true"
              />
            </ScreenField>
            <ScreenField label={COPY.programs.eventType}>
              <Select
                name="event_type"
                defaultValue={COPY.programs.eventTypeOptions[0]}
              >
                <SelectTrigger
                  className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                  aria-label={COPY.programs.eventType}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COPY.programs.eventTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ScreenField>
            <ScreenField label={COPY.programs.recurrenceTag}>
              <Select
                name="recurrence_tag"
                defaultValue={COPY.programs.recurrenceNone}
              >
                <SelectTrigger
                  className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                  aria-label={COPY.programs.recurrenceTag}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COPY.programs.recurrenceNone}>
                    {COPY.programs.recurrenceNone}
                  </SelectItem>
                  <SelectItem value={COPY.programs.recurrenceWeekly}>
                    {COPY.programs.recurrenceWeekly}
                  </SelectItem>
                  <SelectItem value={COPY.programs.recurrenceMonthly}>
                    {COPY.programs.recurrenceMonthly}
                  </SelectItem>
                </SelectContent>
              </Select>
            </ScreenField>
            <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
              {COPY.programs.repeatFormInformational}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
              <Button
                type="submit"
                className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                disabled={createBusy}
              >
                {createBusy
                  ? COPY.programs.submitting
                  : COPY.programs.createMeeting}
              </Button>
              <Button
                type="button"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                disabled={createBusy}
                onClick={() => {
                  setCreateOpen(false);
                  setCreateError(null);
                }}
              >
                {COPY.programs.eventCreateCancel}
              </Button>
            </div>
          </ScreenEditor>
        </ScreenCard>
      )}
      {canManage && recurring && (
        <ScreenSection
          title={COPY.programs.settingsSchedule}
          headingId="programs-workspace-schedule-link-title"
        >
          <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
            {COPY.programs.settingsScheduleLead}
          </p>
          <ScreenRowList>
            <ScreenRow asChild density="settings">
              <Link
                href={buildProgramsHref({
                  mode: "management",
                  programId,
                  departmentId,
                  task: "schedule",
                  hash,
                })}
                onClick={(event) => {
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
                  onTaskChange("schedule");
                }}
              >
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {COPY.programs.settingsScheduleEventsLink}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {COPY.programs.settingsScheduleLead}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenRowTrailing>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                    strokeWidth={1.8}
                  />
                </ScreenRowTrailing>
              </Link>
            </ScreenRow>
          </ScreenRowList>
        </ScreenSection>
      )}
      {state.kind === "loading" && (
        <ScreenLoadingRows
          count={2}
          label={COPY.programs.workspaceTaskEventsLoading}
        />
      )}
      {state.kind === "error" && (
        <ScreenState
          kind="error"
          title={state.message}
          action={
            <Button
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              variant="outline"
              type="button"
              onClick={retry}
            >
              {COPY.programs.workspaceTaskEventsRetry}
            </Button>
          }
        />
      )}
      {state.kind === "ready" && state.events.length === 0 && (
        <ScreenState
          kind="empty"
          title={COPY.programs.workspaceTaskEventsEmpty}
        />
      )}
      {eventsForDisplay !== null && eventsForDisplay.length > 0 && (
        <ScreenRowList>
          <ul
            className="m-0 grid min-w-0 list-none gap-0 p-0"
            aria-label={COPY.programs.workspaceTaskEvents}
          >
            {(eventsForDisplay ?? []).map((event) => {
              const wall = eventWallParts(event.starts_at);
              const rule = ruleForEvent(event, rules ?? []);
              const exception = event.exception ?? null;
              const canEditOccurrence =
                canManage &&
                dataReady &&
                event.status === "Active" &&
                event.source === "SCHEDULE" &&
                (exception !== null || rule !== null);
              return (
                <li
                  key={event.event_id}
                  className="min-w-0"
                  data-event-id={event.event_id}
                >
                  <ScreenRow
                    className="items-start flex-wrap"
                    aria-busy={actionBusy}
                  >
                    <ScreenRowMain className="basis-full">
                      <ScreenRowTitle>
                        {event.name ?? hkWallDateTimeLabel(event.starts_at)}
                      </ScreenRowTitle>
                      <ScreenRowMeta>
                        {wall.date} · {wall.time} ·{" "}
                        {event.event_type ?? COPY.programs.eventTypeOptions[5]}{" "}
                        ·{" "}
                        {COPY.programs.repeatLabel.replace(
                          "{tag}",
                          event.recurrence_tag ?? COPY.programs.recurrenceNone
                        )}{" "}
                        ·{" "}
                        {event.status === "Active"
                          ? COPY.programs.eventActive
                          : COPY.programs.eventCancelled}
                      </ScreenRowMeta>
                      <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                        <ScreenStatus
                          tone={
                            event.source === "SCHEDULE" ? "accent" : "neutral"
                          }
                        >
                          {event.source === "SCHEDULE"
                            ? COPY.programs.eventScheduleSource
                            : COPY.programs.eventManualSource}
                        </ScreenStatus>
                        {exception !== null && (
                          <ScreenStatus tone="pending">
                            {exception.action === "RESCHEDULE"
                              ? COPY.programs.eventRescheduledBadge.replace(
                                  "{time}",
                                  exception.new_start_time ?? ""
                                )
                              : COPY.programs.eventCancelledBadge}
                          </ScreenStatus>
                        )}
                        {event.availability !== undefined &&
                          event.availability !== "Active" && (
                            <ScreenStatus tone="danger">
                              {COPY.programs.eventUnavailable}
                            </ScreenStatus>
                          )}
                      </div>
                      {event.status === "Cancelled" &&
                        event.cancel_reason !== null && (
                          <ScreenRowMeta className="text-[var(--screen-danger)]">
                            {COPY.programs.cancelledReason.replace(
                              "{reason}",
                              event.cancel_reason
                            )}
                          </ScreenRowMeta>
                        )}
                    </ScreenRowMain>
                    <div className="flex min-w-0 basis-full flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      {canEditOccurrence &&
                        (exception === null ? (
                          rule === null ? null : (
                            <>
                              {reschedulingEventId === event.event_id ? (
                                <ScreenEditor
                                  className="w-full min-w-0 grid-cols-1 sm:grid-cols-2"
                                  ref={rescheduleFormRef}
                                  onSubmit={submitReschedule(rule, wall.date)}
                                >
                                  <Input
                                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                    type="time"
                                    name="new_start_time"
                                    required
                                    disabled={actionBusy}
                                    aria-label={COPY.programs.rescheduleStart}
                                  />
                                  <Input
                                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                    type="time"
                                    name="new_end_time"
                                    required
                                    disabled={actionBusy}
                                    aria-label={COPY.programs.rescheduleEnd}
                                  />
                                  <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                                    <Button
                                      type="submit"
                                      disabled={actionBusy}
                                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                                    >
                                      {COPY.programs.confirmReschedule}
                                    </Button>
                                    <Button
                                      type="button"
                                      disabled={actionBusy}
                                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                      variant="outline"
                                      onClick={() =>
                                        setReschedulingEventId(null)
                                      }
                                    >
                                      {COPY.programs.cancelRevoke}
                                    </Button>
                                  </div>
                                </ScreenEditor>
                              ) : (
                                <Button
                                  type="button"
                                  disabled={actionBusy}
                                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                  variant="outline"
                                  onClick={() =>
                                    setReschedulingEventId(event.event_id)
                                  }
                                >
                                  {COPY.programs.rescheduleEvent}
                                </Button>
                              )}
                              <form
                                className="grid min-w-0 gap-2"
                                onSubmit={submitCancelOccurrence(
                                  rule,
                                  wall.date,
                                  event.event_id
                                )}
                              >
                                {confirmingOccurrenceId === event.event_id ? (
                                  <ScreenCard
                                    className="min-w-0"
                                    role="alert"
                                    ref={confirmOccurrenceRef}
                                  >
                                    <span>
                                      {COPY.programs.cancelOccurrenceConfirm}
                                    </span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                                      <Button
                                        type="submit"
                                        disabled={actionBusy}
                                        className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                                      >
                                        {COPY.programs.confirmCancelOccurrence}
                                      </Button>
                                      <Button
                                        type="button"
                                        disabled={actionBusy}
                                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                        variant="outline"
                                        onClick={() =>
                                          setConfirmingOccurrenceId(null)
                                        }
                                      >
                                        {COPY.programs.keepOccurrence}
                                      </Button>
                                    </div>
                                  </ScreenCard>
                                ) : (
                                  <Button
                                    type="submit"
                                    disabled={actionBusy}
                                    className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                    variant="outline"
                                  >
                                    {COPY.programs.cancelOccurrence}
                                  </Button>
                                )}
                              </form>
                            </>
                          )
                        ) : (
                          <Button
                            type="button"
                            className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                            variant="outline"
                            disabled={actionBusy}
                            onClick={() => removeException(exception)}
                          >
                            {COPY.programs.restoreOccurrence}
                          </Button>
                        ))}
                      <Button
                        asChild
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        variant="outline"
                      >
                        <Link
                          href={buildProgramsHref({
                            mode: "management",
                            departmentId,
                            programId,
                            task: "events",
                            eventId: event.event_id,
                            hash,
                          })}
                          aria-label={COPY.programs.eventDetailOpen}
                          onClick={(clickEvent) => {
                            if (
                              !onOpenEvent ||
                              clickEvent.defaultPrevented ||
                              clickEvent.button !== 0 ||
                              clickEvent.metaKey ||
                              clickEvent.ctrlKey ||
                              clickEvent.shiftKey ||
                              clickEvent.altKey
                            ) {
                              return;
                            }
                            clickEvent.preventDefault();
                            onOpenEvent(event.event_id);
                          }}
                        >
                          {COPY.programs.eventDetailOpen}
                        </Link>
                      </Button>
                      {canManage && dataReady && event.status === "Active" && (
                        <form
                          className="grid min-w-0 gap-2"
                          noValidate
                          onSubmit={submitCancelEvent(event.event_id)}
                        >
                          <Input
                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                            type="text"
                            name="cancel_reason"
                            placeholder={COPY.programs.cancelReasonPlaceholder}
                            aria-label={COPY.programs.cancelReason}
                            disabled={actionBusy}
                          />
                          {confirmingEventId === event.event_id ? (
                            <ScreenCard
                              className="min-w-0"
                              role="alert"
                              ref={confirmEventRef}
                            >
                              <strong>
                                {COPY.programs.cancelMeetingConfirmTitle}
                              </strong>
                              <span>
                                {COPY.programs.cancelMeetingConfirmBody}
                              </span>
                              <Button
                                type="submit"
                                disabled={actionBusy}
                                className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                              >
                                {COPY.programs.confirmCancel}
                              </Button>
                              <Button
                                type="button"
                                disabled={actionBusy}
                                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                variant="outline"
                                onClick={() => setConfirmingEventId(null)}
                              >
                                {COPY.programs.keepMeeting}
                              </Button>
                            </ScreenCard>
                          ) : (
                            <Button
                              type="submit"
                              disabled={actionBusy}
                              className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                              variant="outline"
                            >
                              {COPY.programs.cancelEvent}
                            </Button>
                          )}
                        </form>
                      )}
                    </div>
                  </ScreenRow>
                </li>
              );
            })}
          </ul>
        </ScreenRowList>
      )}
    </ScreenSection>
  );
};
