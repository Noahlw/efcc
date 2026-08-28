"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  createEvent,
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
} from "@/lib/programs/recurrence";

import { hkWallInputToIso } from "./event-detail";
import { useAsyncResource } from "./use-async-resource";
import {
  eventWallParts,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

import styles from "@/app/programs/programs.module.css";

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

const RecurringSchedulePanel = ({
  programId,
  onGenerated,
}: {
  programId: string;
  /** Invoked after a successful generation so the event list refreshes. */
  onGenerated: () => void;
}) => {
  const [rules, setRules] = useState<ScheduleRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setRules(null);
      setRulesError(null);
      try {
        const result = await listScheduleRules(programId);
        if (!cancelled) {
          setRules(result.rules);
        }
      } catch (error) {
        if (!cancelled) {
          setRulesError(
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.error.networkError
          );
          // Leave rules as null on failure: the no-rules empty state must
          // only reflect a SUCCESSFUL load of zero rules, never a transport
          // or auth failure, or the Preview form would be hidden behind a
          // misleading "no schedule" message on a recoverable error.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

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
  const { program, attention, onOpenEvent } = useWorkspaceTaskContext();
  const programId = program.program_id;
  const canManage = program.capabilities.manage;
  const recurring = program.behavior_type === "Recurring";
  const { state, run, retry } = useAsyncResource<ProgramEvent[], EventsState>(
    async () => {
      const { events } = await listEvents(programId);
      return events;
    },
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (events) => ({ kind: "ready", events }),
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

  useEffect(() => {
    void run();
  }, [run]);

  const eventAttention = attention?.programs.find(
    ({ program_id }) => program_id === programId
  );

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
      if (onOpenEvent) {
        onOpenEvent(event.event_id);
      } else {
        void run();
      }
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

  return (
    <section
      aria-labelledby="programs-workspace-events-title"
      aria-busy={createBusy}
    >
      <h4
        id="programs-workspace-events-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskEvents}
      </h4>
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
                  type="date"
                  name="event_date"
                  aria-label={COPY.programs.eventDate}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventTime}</span>
                <Input
                  type="time"
                  name="event_time"
                  aria-label={COPY.programs.eventTime}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventName}</span>
                <Input
                  type="text"
                  name="name"
                  placeholder={COPY.programs.eventNamePlaceholder}
                  aria-label={COPY.programs.eventName}
                  aria-required="true"
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventType}</span>
                <select name="event_type" aria-label={COPY.programs.eventType}>
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
                  defaultValue={COPY.programs.recurrenceNone}
                  aria-label={COPY.programs.recurrenceTag}
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
      {state.kind === "ready" && state.events.length > 0 && (
        <ul
          className={styles.workspaceTaskList}
          aria-label={COPY.programs.workspaceTaskEvents}
        >
          {state.events.map((event) => {
            const wall = eventWallParts(event.starts_at);
            return (
              <li key={event.event_id} className={styles.workspaceTaskRow}>
                <strong>
                  {event.name ?? hkWallDateTimeLabel(event.starts_at)}
                </strong>
                <span>{wall.date}</span>
                <span>{wall.time}</span>
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
                {event.availability !== undefined &&
                  event.availability !== "Active" && (
                    <Badge className={styles.eventCancelled} variant="outline">
                      {COPY.programs.eventUnavailable}
                    </Badge>
                  )}
                {onOpenEvent && (
                  <Button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => onOpenEvent(event.event_id)}
                  >
                    {COPY.programs.eventDetailOpen}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
