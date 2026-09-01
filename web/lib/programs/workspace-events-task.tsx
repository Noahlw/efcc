"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

import { hkWallInputToIso } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";
import {
  eventWallParts,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

const styles = {
  input:
    "h-auto min-h-11 min-w-0 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] text-base text-[var(--ink)]",
  workspaceSection: "grid min-w-0 gap-4",
  workspaceSubheading:
    "m-0 text-base font-bold leading-6 [overflow-wrap:anywhere]",
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  panelError:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  ruleForm:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4",
  ruleField: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  select:
    "min-h-11 min-w-0 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]",
  button:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  workspaceTaskList: "m-0 grid min-w-0 list-none gap-2 p-0",
  workspaceTaskRow:
    "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-3 [overflow-wrap:anywhere]",
  eventCancelled: "text-[var(--error)]",
  exceptionBadge: "w-fit whitespace-normal text-[var(--pending)]",
  formActions: "flex min-w-0 flex-wrap items-center gap-3",
  panelNotice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  workspaceHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  badge: "shrink-0 whitespace-normal",
  badgeActive: "border-transparent bg-[var(--accent)] text-white",
  eventCreateForm: "grid-cols-1 md:grid-cols-2",
  secondaryButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  boundaryError:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-[var(--error)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  eventActions: "flex min-w-0 flex-wrap items-center gap-2",
  cancelForm: "grid min-w-0 gap-2",
  confirmation:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--pending-border)] bg-[var(--pending-surface)] p-3 [overflow-wrap:anywhere]",
  dangerButton:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--error)] px-4 py-2 text-white whitespace-normal hover:opacity-90",
  dangerOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--error)] bg-transparent px-4 py-2 text-[var(--error)] whitespace-normal hover:bg-[var(--error-surface)]",
  successOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--success-border)] bg-transparent px-4 py-2 text-[var(--success)] whitespace-normal hover:bg-[var(--success-surface)]",
  eventReason:
    "min-w-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  eventDate: "min-w-0 [overflow-wrap:anywhere]",
} as const;

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

const RecurringSchedulePanel = ({
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
    <section
      className={styles.workspaceSection}
      aria-labelledby="programs-workspace-recurring-title"
    >
      <h5
        id="programs-workspace-recurring-title"
        className={styles.workspaceSubheading}
      >
        {COPY.programs.secondaryGeneratorLabel}
      </h5>
      <p className={styles.programDetailMuted}>{COPY.programs.previewLead}</p>
      {rulesError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {rulesError}
        </Alert>
      )}
      {noRules ? (
        <p className={styles.programDetailMuted}>
          {COPY.programs.settingsScheduleNone}
        </p>
      ) : (
        <form className={styles.ruleForm} onSubmit={submitPreview}>
          <label className={styles.ruleField}>
            <span>{COPY.programs.previewHorizon}</span>
            <Input
              className={styles.input}
              type="number"
              name="horizon_days"
              min={1}
              max={365}
              defaultValue={90}
              required
              aria-label={COPY.programs.previewHorizon}
            />
          </label>
          <Button
            type="submit"
            className={styles.button}
            disabled={previewBusy || generateBusy}
          >
            {previewBusy
              ? COPY.programs.previewing
              : COPY.programs.previewEvents}
          </Button>
        </form>
      )}
      {preview.kind === "loading" && (
        <>
          <output aria-busy="true">{COPY.programs.previewing}</output>
          <Skeleton className="h-8 w-full" aria-hidden="true" />
        </>
      )}
      {preview.kind === "error" && (
        <Alert className={styles.panelError} variant="destructive">
          {preview.message}
        </Alert>
      )}
      {preview.kind === "empty" && (
        <p className={styles.programDetailMuted} aria-live="polite">
          {COPY.programs.previewEmpty}
        </p>
      )}
      {preview.kind === "ready" && (
        <>
          <p className={styles.programDetailMuted}>
            {COPY.programs.previewPlanLabel.replace(
              "{id}",
              preview.plan.plan.plan_id.slice(0, 8)
            )}
            {" · "}
            {COPY.programs.previewPlanMeta
              .replace("{rules}", String(preview.plan.plan.rule_count))
              .replace("{days}", String(preview.plan.plan.horizon_days))}
          </p>
          <ul
            className={styles.workspaceTaskList}
            aria-label={COPY.programs.previewEvents}
          >
            {preview.plan.occurrences.map((occurrence) => {
              const rule = (rules ?? []).find(
                (candidate) => candidate.rule_id === occurrence.rule_id
              );
              return (
                <li
                  key={occurrence.occurrence_id}
                  className={styles.workspaceTaskRow}
                >
                  <strong>{hkWallDateTimeLabel(occurrence.starts_at)}</strong>
                  <span>
                    {occurrence.location?.trim()
                      ? occurrence.location
                      : COPY.programs.eventLocationPlaceholder}
                  </span>
                  <span>
                    {rule ? formatScheduleRuleLabel(rule) : occurrence.rule_id}
                  </span>
                  {occurrence.skip_reason === "CANCEL" && (
                    <span className={styles.eventCancelled}>
                      {COPY.programs.previewOccurrenceSkipped}
                    </span>
                  )}
                  {occurrence.skip_reason === "DUPLICATE" && (
                    <span className={styles.eventCancelled}>
                      {COPY.programs.previewOccurrenceDuplicate}
                    </span>
                  )}
                  {occurrence.skip_reason === null &&
                    occurrence.exception_id !== null && (
                      <span className={styles.exceptionBadge}>
                        {COPY.programs.previewOccurrenceRescheduled}
                      </span>
                    )}
                </li>
              );
            })}
          </ul>
          <div className={styles.formActions}>
            <Button
              type="button"
              className={styles.button}
              onClick={() => void submitGenerate()}
              disabled={generateBusy || previewBusy}
            >
              {generateBusy
                ? COPY.programs.generating
                : COPY.programs.generateEvents}
            </Button>
            {generateResult !== null &&
              (generatePartial ? (
                <Alert className={styles.panelError} variant="destructive">
                  {generateResult}
                </Alert>
              ) : (
                <output className={styles.panelNotice} aria-live="polite">
                  {generateResult}
                </output>
              ))}
          </div>
          {generateError !== null && (
            <Alert className={styles.panelError} variant="destructive">
              {generateError}
            </Alert>
          )}
        </>
      )}
    </section>
  );
};

export const EventsTask = () => {
  const {
    program,
    attention,
    departmentId,
    hash,
    onAttentionRefresh,
    onOpenEvent,
  } = useWorkspaceTaskContext();
  const programId = program.program_id;
  const canManage = program.capabilities.manage;
  const recurring = program.behavior_type === "Recurring";
  const mounted = useRef(true);
  const previousEvents = useRef<ProgramEvent[] | null>(null);
  type EventLoadOutcome = {
    status: "pending" | "success" | "error" | "stale";
  };
  const eventLoadOutcomes = useRef(new WeakMap<object, EventLoadOutcome>());
  const latestEventLoadOutcome = useRef<EventLoadOutcome | null>(null);
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
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
    setRulesError(null);
    if (!canManage || !recurring) {
      return () => {
        cancelled = true;
      };
    }
    void listScheduleRules(programId)
      .then(({ rules: nextRules }) => {
        if (!cancelled) {
          setRules(nextRules);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setRulesError(
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.error.networkError
        );
      });
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
    <section
      aria-labelledby="programs-workspace-events-title"
      aria-busy={createBusy || actionBusy}
    >
      <h4
        id="programs-workspace-events-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskEvents}
      </h4>
      {notice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          {notice}
        </output>
      )}
      {actionError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {actionError}
        </Alert>
      )}
      {eventAttention && eventAttention.inactive_event_count > 0 && (
        <Badge
          className={`${styles.badge} ${styles.badgeActive}`}
          variant="default"
          aria-label={COPY.programs.attentionEventCount.replace(
            "{count}",
            String(eventAttention.inactive_event_count)
          )}
        >
          {eventAttention.inactive_event_count}
        </Badge>
      )}
      {eventAttention && eventAttention.cancelled_event_count > 0 && (
        <Badge
          className={styles.badge}
          variant="outline"
          aria-label={COPY.programs.attentionCancelledCount.replace(
            "{count}",
            String(eventAttention.cancelled_event_count)
          )}
        >
          {eventAttention.cancelled_event_count}
        </Badge>
      )}
      <p className={styles.programDetailMuted}>
        {COPY.programs.repeatInformational}
      </p>
      {canManage && (
        <>
          <Button
            type="button"
            className={styles.button}
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(null);
            }}
          >
            {COPY.programs.createMeeting}
          </Button>
          {createOpen && (
            <form
              className={`${styles.ruleForm} ${styles.eventCreateForm}`}
              aria-labelledby="programs-workspace-event-create-title"
              aria-busy={createBusy}
              noValidate
              onSubmit={submitCreate}
            >
              <h5
                id="programs-workspace-event-create-title"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.createMeeting}
              </h5>
              {createError !== null && (
                <Alert className={styles.panelError} variant="destructive">
                  {createError}
                </Alert>
              )}
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventDate}</span>
                <Input
                  className={styles.input}
                  type="date"
                  name="event_date"
                  aria-label={COPY.programs.eventDate}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventTime}</span>
                <Input
                  className={styles.input}
                  type="time"
                  name="event_time"
                  aria-label={COPY.programs.eventTime}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventName}</span>
                <Input
                  className={styles.input}
                  type="text"
                  name="name"
                  placeholder={COPY.programs.eventNamePlaceholder}
                  aria-label={COPY.programs.eventName}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventType}</span>
                <Select
                  name="event_type"
                  defaultValue={COPY.programs.eventTypeOptions[0]}
                >
                  <SelectTrigger
                    className={styles.select}
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
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.recurrenceTag}</span>
                <Select
                  name="recurrence_tag"
                  defaultValue={COPY.programs.recurrenceNone}
                >
                  <SelectTrigger
                    className={styles.select}
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
              </label>
              <p className={styles.programDetailMuted}>
                {COPY.programs.repeatFormInformational}
              </p>
              <div className={styles.formActions}>
                <Button
                  type="submit"
                  className={styles.button}
                  disabled={createBusy}
                >
                  {createBusy
                    ? COPY.programs.submitting
                    : COPY.programs.createMeeting}
                </Button>
                <Button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={createBusy}
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateError(null);
                  }}
                >
                  {COPY.programs.eventCreateCancel}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {canManage && recurring && (
        <RecurringSchedulePanel
          programId={programId}
          rules={rules}
          rulesError={rulesError}
          onGenerated={() => {
            void run();
          }}
        />
      )}
      {state.kind === "loading" && (
        <>
          <output aria-busy="true">
            {COPY.programs.workspaceTaskEventsLoading}
          </output>
          <Skeleton className="h-8 w-full" aria-hidden="true" />
        </>
      )}
      {state.kind === "error" && (
        <Alert className={styles.boundaryError} variant="destructive">
          <p>{state.message}</p>
          <Button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.workspaceTaskEventsRetry}
          </Button>
        </Alert>
      )}
      {state.kind === "ready" && state.events.length === 0 && (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceTaskEventsEmpty}
        </p>
      )}
      {eventsForDisplay !== null && eventsForDisplay.length > 0 && (
        <ul
          className={styles.workspaceTaskList}
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
                className={styles.workspaceTaskRow}
                data-event-id={event.event_id}
              >
                <strong>
                  {event.name ?? hkWallDateTimeLabel(event.starts_at)}
                </strong>
                <span className={styles.eventDate}>{wall.date}</span>
                <span className={styles.eventDate}>{wall.time}</span>
                <span>
                  {event.event_type ?? COPY.programs.eventTypeOptions[5]}
                </span>
                <span>
                  {COPY.programs.repeatLabel.replace(
                    "{tag}",
                    event.recurrence_tag ?? COPY.programs.recurrenceNone
                  )}
                </span>
                <span>
                  {event.status === "Active"
                    ? COPY.programs.eventActive
                    : COPY.programs.eventCancelled}
                </span>
                <span>
                  {event.source === "SCHEDULE"
                    ? COPY.programs.eventScheduleSource
                    : COPY.programs.eventManualSource}
                </span>
                {exception !== null && (
                  <Badge className={styles.exceptionBadge} variant="secondary">
                    {exception.action === "RESCHEDULE"
                      ? COPY.programs.eventRescheduledBadge.replace(
                          "{time}",
                          exception.new_start_time ?? ""
                        )
                      : COPY.programs.eventCancelledBadge}
                  </Badge>
                )}
                {event.availability !== undefined &&
                  event.availability !== "Active" && (
                    <Badge className={styles.eventCancelled} variant="outline">
                      {COPY.programs.eventUnavailable}
                    </Badge>
                  )}
                {canEditOccurrence && (
                  <div className={styles.eventActions}>
                    {exception !== null ? (
                      <Button
                        type="button"
                        className={styles.successOutline}
                        disabled={actionBusy}
                        onClick={() => removeException(exception)}
                      >
                        {COPY.programs.restoreOccurrence}
                      </Button>
                    ) : rule !== null ? (
                      <>
                        {reschedulingEventId === event.event_id ? (
                          <form
                            className={styles.ruleForm}
                            ref={rescheduleFormRef}
                            onSubmit={submitReschedule(rule, wall.date)}
                          >
                            <Input
                              className={styles.input}
                              type="time"
                              name="new_start_time"
                              required
                              disabled={actionBusy}
                              aria-label={COPY.programs.rescheduleStart}
                            />
                            <Input
                              className={styles.input}
                              type="time"
                              name="new_end_time"
                              required
                              disabled={actionBusy}
                              aria-label={COPY.programs.rescheduleEnd}
                            />
                            <Button
                              type="submit"
                              disabled={actionBusy}
                              className={styles.button}
                            >
                              {COPY.programs.confirmReschedule}
                            </Button>
                            <Button
                              type="button"
                              disabled={actionBusy}
                              className={styles.secondaryButton}
                              onClick={() => setReschedulingEventId(null)}
                            >
                              {COPY.programs.cancelRevoke}
                            </Button>
                          </form>
                        ) : (
                          <Button
                            type="button"
                            disabled={actionBusy}
                            className={styles.secondaryButton}
                            onClick={() =>
                              setReschedulingEventId(event.event_id)
                            }
                          >
                            {COPY.programs.rescheduleEvent}
                          </Button>
                        )}
                        <form
                          className={styles.cancelForm}
                          onSubmit={submitCancelOccurrence(
                            rule,
                            wall.date,
                            event.event_id
                          )}
                        >
                          {confirmingOccurrenceId === event.event_id ? (
                            <div
                              className={styles.confirmation}
                              role="alert"
                              ref={confirmOccurrenceRef}
                            >
                              <span>
                                {COPY.programs.cancelOccurrenceConfirm}
                              </span>
                              <Button
                                type="submit"
                                disabled={actionBusy}
                                className={styles.dangerButton}
                              >
                                {COPY.programs.confirmCancelOccurrence}
                              </Button>
                              <Button
                                type="button"
                                disabled={actionBusy}
                                className={styles.secondaryButton}
                                onClick={() => setConfirmingOccurrenceId(null)}
                              >
                                {COPY.programs.keepOccurrence}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="submit"
                              disabled={actionBusy}
                              className={styles.secondaryButton}
                            >
                              {COPY.programs.cancelOccurrence}
                            </Button>
                          )}
                        </form>
                      </>
                    ) : null}
                  </div>
                )}
                {event.status === "Cancelled" &&
                  event.cancel_reason !== null && (
                    <span className={styles.eventReason}>
                      {COPY.programs.cancelledReason.replace(
                        "{reason}",
                        event.cancel_reason
                      )}
                    </span>
                  )}
                <Button
                  asChild
                  className={styles.secondaryButton}
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
                    className={styles.cancelForm}
                    noValidate
                    onSubmit={submitCancelEvent(event.event_id)}
                  >
                    <Input
                      className={styles.input}
                      type="text"
                      name="cancel_reason"
                      placeholder={COPY.programs.cancelReasonPlaceholder}
                      aria-label={COPY.programs.cancelReason}
                      disabled={actionBusy}
                    />
                    {confirmingEventId === event.event_id ? (
                      <div
                        className={styles.confirmation}
                        role="alert"
                        ref={confirmEventRef}
                      >
                        <strong>
                          {COPY.programs.cancelMeetingConfirmTitle}
                        </strong>
                        <span>{COPY.programs.cancelMeetingConfirmBody}</span>
                        <Button
                          type="submit"
                          disabled={actionBusy}
                          className={styles.dangerButton}
                        >
                          {COPY.programs.confirmCancel}
                        </Button>
                        <Button
                          type="button"
                          disabled={actionBusy}
                          className={styles.secondaryButton}
                          onClick={() => setConfirmingEventId(null)}
                        >
                          {COPY.programs.keepMeeting}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="submit"
                        disabled={actionBusy}
                        className={styles.dangerOutline}
                      >
                        {COPY.programs.cancelEvent}
                      </Button>
                    )}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
