"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  previewEvents,
} from "@/lib/programs/program-api";
import type {
  EventType,
  PreviewResult,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import {
  addWallDays,
  addWallMonths,
  formatScheduleRuleLabel,
  hkTodayWallDate,
  hkWallDateTimeLabel,
  isValidWallDate,
  wallDaySpan,
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

import { hkWallInputToIso, hkWallInputValue } from "./event-detail";
import { ProgramDatePicker } from "./program-date-picker";
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

type ExceptionDraft = {
  action: "CANCEL" | "RESCHEDULE";
  newDate: string;
  newStartTime: string;
  newEndTime: string;
};

function hkWallTimeOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60_000)
    .toISOString()
    .slice(11, 16);
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
  const [previewFromDate, setPreviewFromDate] = useState(() =>
    hkTodayWallDate()
  );
  const [previewUntilDate, setPreviewUntilDate] = useState(() =>
    addWallDays(addWallMonths(hkTodayWallDate(), 3), -1)
  );
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generationIdentity, setGenerationIdentity] = useState<{
    runId: string;
    planId: string;
  } | null>(null);
  const [generatePartial, setGeneratePartial] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [exceptionDrafts, setExceptionDrafts] = useState<
    Record<string, ExceptionDraft>
  >({});
  const [exceptionBusy, setExceptionBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadPreview = async (fromDate: string, untilDate: string) => {
    const horizonDays =
      isValidWallDate(fromDate) && isValidWallDate(untilDate)
        ? wallDaySpan(fromDate, untilDate)
        : 0;
    if (
      !isValidWallDate(fromDate) ||
      !isValidWallDate(untilDate) ||
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
    setGenerationIdentity(null);
    setGenerateError(null);
    try {
      const plan = await previewEvents(programId, {
        from_date: fromDate,
        until_date: untilDate,
      });
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

  const submitPreview = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const fromDate = String(form.get("from_date") ?? "").trim();
    const untilDate = String(form.get("until_date") ?? "").trim();
    await loadPreview(fromDate, untilDate);
  };

  const startExceptionDraft = (
    occurrence: PreviewResult["occurrences"][number],
    action: ExceptionDraft["action"]
  ) => {
    const rule = (rules ?? []).find(
      (candidate) => candidate.rule_id === occurrence.rule_id
    );
    setExceptionDrafts((previous) => ({
      ...previous,
      [occurrence.occurrence_id]: {
        action,
        newDate: occurrence.replacement_date ?? occurrence.occurs_on,
        newStartTime: rule?.start_time ?? hkWallTimeOf(occurrence.starts_at),
        newEndTime: rule?.end_time ?? hkWallTimeOf(occurrence.ends_at),
      },
    }));
    setGenerateError(null);
  };

  const clearExceptionDraft = (occurrenceId: string) => {
    setExceptionDrafts((previous) => {
      const next = { ...previous };
      delete next[occurrenceId];
      return next;
    });
  };

  const saveExceptionDraft = async (
    occurrence: PreviewResult["occurrences"][number]
  ) => {
    const draft = exceptionDrafts[occurrence.occurrence_id];
    if (!draft) {
      return;
    }
    setExceptionBusy(true);
    setGenerateError(null);
    try {
      await createScheduleException(programId, occurrence.rule_id, {
        override_date: occurrence.occurs_on,
        action: draft.action,
        ...(draft.action === "RESCHEDULE"
          ? {
              ...(draft.newDate && draft.newDate !== occurrence.occurs_on
                ? { new_date: draft.newDate }
                : {}),
              new_start_time: draft.newStartTime,
              new_end_time: draft.newEndTime,
            }
          : {}),
      });
      clearExceptionDraft(occurrence.occurrence_id);
      await loadPreview(previewFromDate, previewUntilDate);
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
      setGenerateError(message);
      announce(message);
    } finally {
      if (mounted.current) {
        setExceptionBusy(false);
      }
    }
  };

  const removeSavedException = async (
    occurrence: PreviewResult["occurrences"][number]
  ) => {
    const rule = (rules ?? []).find(
      (candidate) => candidate.rule_id === occurrence.rule_id
    );
    if (!rule || !occurrence.exception_id) {
      return;
    }
    setExceptionBusy(true);
    setGenerateError(null);
    try {
      await deleteScheduleException(
        programId,
        rule.rule_id,
        occurrence.exception_id
      );
      await loadPreview(previewFromDate, previewUntilDate);
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
      setGenerateError(message);
      announce(message);
    } finally {
      if (mounted.current) {
        setExceptionBusy(false);
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
      setGenerationIdentity({
        runId: generated.run_id,
        planId: generated.plan_id,
      });
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
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-sm font-semibold text-[var(--screen-ink)]">
                {COPY.programs.previewHorizon}
              </legend>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <ScreenField
                  htmlFor="programs-preview-from-date"
                  label={COPY.programs.previewFromDate}
                >
                  <Input
                    id="programs-preview-from-date"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                    type="date"
                    name="from_date"
                    value={previewFromDate}
                    onChange={(event) => setPreviewFromDate(event.target.value)}
                    required
                  />
                </ScreenField>
                <ScreenField
                  htmlFor="programs-preview-until-date"
                  label={COPY.programs.previewUntilDate}
                >
                  <Input
                    id="programs-preview-until-date"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                    type="date"
                    name="until_date"
                    min={previewFromDate}
                    value={previewUntilDate}
                    onChange={(event) =>
                      setPreviewUntilDate(event.target.value)
                    }
                    required
                  />
                </ScreenField>
              </div>
              <p className="m-0 text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                {COPY.programs.hkTimeMarker}
              </p>
            </fieldset>
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
              .replace("{from}", preview.plan.plan.from_date)
              .replace(
                "{to}",
                preview.plan.plan.to_date ??
                  addWallDays(
                    preview.plan.plan.from_date,
                    preview.plan.plan.horizon_days - 1
                  )
              )
              .replace("{days}", String(preview.plan.plan.horizon_days))}
          </p>
          {rules?.some(
            (rule) =>
              rule.recurrence === "MONTHLY" && (rule.month_day ?? 0) >= 29
          ) && (
            <p className="m-0 text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
              {COPY.programs.previewMonthlyOmission.replace(
                "{day}",
                String(
                  rules.find(
                    (rule) =>
                      rule.recurrence === "MONTHLY" &&
                      (rule.month_day ?? 0) >= 29
                  )?.month_day ?? ""
                )
              )}
            </p>
          )}
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
                const draft = exceptionDrafts[occurrence.occurrence_id];
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
                        {occurrence.replacement_date !== null &&
                          occurrence.replacement_date !== undefined && (
                            <ScreenRowMeta>
                              {COPY.programs.previewOccurrenceOriginal.replace(
                                "{date}",
                                occurrence.occurs_on
                              )}{" "}
                              ·{" "}
                              {COPY.programs.previewOccurrenceReplacement.replace(
                                "{date}",
                                occurrence.replacement_date
                              )}
                            </ScreenRowMeta>
                          )}
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
                    {occurrence.skip_reason !== "DUPLICATE" && (
                      <div className="grid min-w-0 gap-2 border-t border-[var(--screen-line)] p-3">
                        {draft ? (
                          <fieldset className="grid min-w-0 gap-2">
                            <legend className="text-sm font-semibold text-[var(--screen-ink)]">
                              {COPY.programs.previewExceptionDraft}
                            </legend>
                            {draft.action === "RESCHEDULE" && (
                              <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                                <ScreenField
                                  htmlFor={`preview-exception-${occurrence.occurrence_id}-date`}
                                  label={COPY.programs.settingsExceptionNewDate}
                                >
                                  <Input
                                    id={`preview-exception-${occurrence.occurrence_id}-date`}
                                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                    type="date"
                                    value={draft.newDate}
                                    onChange={(event) =>
                                      setExceptionDrafts((previous) => ({
                                        ...previous,
                                        [occurrence.occurrence_id]: {
                                          ...draft,
                                          newDate: event.target.value,
                                        },
                                      }))
                                    }
                                    disabled={exceptionBusy}
                                  />
                                </ScreenField>
                                <ScreenField
                                  htmlFor={`preview-exception-${occurrence.occurrence_id}-start`}
                                  label={
                                    COPY.programs.settingsExceptionNewStart
                                  }
                                >
                                  <Input
                                    id={`preview-exception-${occurrence.occurrence_id}-start`}
                                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                    type="time"
                                    value={draft.newStartTime}
                                    onChange={(event) =>
                                      setExceptionDrafts((previous) => ({
                                        ...previous,
                                        [occurrence.occurrence_id]: {
                                          ...draft,
                                          newStartTime: event.target.value,
                                        },
                                      }))
                                    }
                                    disabled={exceptionBusy}
                                  />
                                </ScreenField>
                                <ScreenField
                                  htmlFor={`preview-exception-${occurrence.occurrence_id}-end`}
                                  label={COPY.programs.settingsExceptionNewEnd}
                                >
                                  <Input
                                    id={`preview-exception-${occurrence.occurrence_id}-end`}
                                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                    type="time"
                                    value={draft.newEndTime}
                                    onChange={(event) =>
                                      setExceptionDrafts((previous) => ({
                                        ...previous,
                                        [occurrence.occurrence_id]: {
                                          ...draft,
                                          newEndTime: event.target.value,
                                        },
                                      }))
                                    }
                                    disabled={exceptionBusy}
                                  />
                                </ScreenField>
                              </div>
                            )}
                            {rule?.effective_end_date &&
                              draft.newDate > rule.effective_end_date && (
                                <Alert tone="warning" announcement="polite">
                                  {COPY.programs.settingsExceptionBeyondRuleEnd}
                                </Alert>
                              )}
                            <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                              <Button
                                type="button"
                                className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                                onClick={() =>
                                  void saveExceptionDraft(occurrence)
                                }
                                disabled={exceptionBusy}
                              >
                                {exceptionBusy
                                  ? COPY.programs.submitting
                                  : COPY.programs.previewSaveException}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                onClick={() =>
                                  clearExceptionDraft(occurrence.occurrence_id)
                                }
                                disabled={exceptionBusy}
                              >
                                {COPY.programs.previewCancelDraft}
                              </Button>
                            </div>
                          </fieldset>
                        ) : occurrence.exception_id !== null ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                            onClick={() =>
                              void removeSavedException(occurrence)
                            }
                            disabled={exceptionBusy}
                          >
                            {COPY.programs.previewRemoveException}
                          </Button>
                        ) : (
                          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                              onClick={() =>
                                startExceptionDraft(occurrence, "CANCEL")
                              }
                              disabled={exceptionBusy}
                            >
                              {COPY.programs.previewSkipOccurrence}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                              onClick={() =>
                                startExceptionDraft(occurrence, "RESCHEDULE")
                              }
                              disabled={exceptionBusy}
                            >
                              {COPY.programs.previewRescheduleOccurrence}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
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
                <Alert
                  data-generation-plan-id={generationIdentity?.planId}
                  data-generation-result="true"
                  data-generation-run-id={generationIdentity?.runId}
                  variant="destructive"
                >
                  {generateResult}
                </Alert>
              ) : (
                <Alert
                  data-generation-plan-id={generationIdentity?.planId}
                  data-generation-result="true"
                  data-generation-run-id={generationIdentity?.runId}
                  announcement="polite"
                  tone="success"
                >
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
  const [createDate, setCreateDate] = useState("");
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
  const [createEndAuto, setCreateEndAuto] = useState(true);
  const [createLocation, setCreateLocation] = useState("");
  const [createEventType, setCreateEventType] = useState<EventType>(
    COPY.programs.eventTypeOptions[0]
  );
  const [createWindowOverride, setCreateWindowOverride] = useState(false);
  const [createWindowOpens, setCreateWindowOpens] = useState("");
  const [createWindowCloses, setCreateWindowCloses] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(
    null
  );
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
    if (confirmingEventId !== null) {
      confirmEventRef.current?.querySelector("button")?.focus();
    }
  }, [confirmingEventId]);

  const eventAttention = attention?.programs.find(
    ({ program_id }) => program_id === programId
  );
  const resetCreateForm = () => {
    setCreateDate(hkTodayWallDate());
    setCreateStartTime("");
    setCreateEndTime("");
    setCreateEndAuto(true);
    setCreateLocation("");
    setCreateEventType(COPY.programs.eventTypeOptions[0]);
    setCreateWindowOverride(false);
    setCreateWindowOpens("");
    setCreateWindowCloses("");
  };
  const toggleCreateForm = (open: boolean) => {
    if (open) {
      resetCreateForm();
    }
    setCreateOpen(open);
    setCreateError(null);
  };
  const changeCreateStartTime = (value: string) => {
    setCreateStartTime(value);
    if (!createEndAuto) {
      return;
    }
    const startsAt = hkWallInputToIso(`${createDate}T${value}`);
    if (!startsAt) {
      setCreateEndTime("");
      return;
    }
    setCreateEndTime(
      hkWallTimeOf(
        new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString()
      )
    );
  };
  const eventsForActions =
    state.kind === "ready" ? state.events : (previousEvents.current ?? []);
  const dataReady = state.kind === "ready";
  const defaultWindow = (() => {
    const startsAt = hkWallInputToIso(`${createDate}T${createStartTime}`);
    const endsAt = hkWallInputToIso(`${createDate}T${createEndTime}`);
    if (!startsAt || !endsAt) {
      return null;
    }
    const opens = new Date(
      new Date(startsAt).getTime() -
        (program.check_in_opens_at_minutes_before_start ?? 15) * 60_000
    );
    const closes = new Date(
      new Date(endsAt).getTime() +
        (program.check_in_closes_at_minutes_after_end ?? 0) * 60_000
    );
    return {
      opensAt: opens.toISOString(),
      closesAt: closes.toISOString(),
    };
  })();
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

  const submitCreate = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!createDate || !createStartTime || !createEndTime || !name) {
      const message = COPY.programs.createMeetingValidation;
      setCreateError(message);
      announce(message);
      return;
    }
    const startsAt = hkWallInputToIso(`${createDate}T${createStartTime}`);
    const endsAt = hkWallInputToIso(`${createDate}T${createEndTime}`);
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      const message = COPY.programs.createMeetingValidation;
      setCreateError(message);
      announce(message);
      return;
    }
    const overrideOpens = createWindowOverride
      ? hkWallInputToIso(createWindowOpens)
      : null;
    const overrideCloses = createWindowOverride
      ? hkWallInputToIso(createWindowCloses)
      : null;
    if (
      createWindowOverride &&
      (!overrideOpens || !overrideCloses || overrideCloses <= overrideOpens)
    ) {
      const message = COPY.programs.createMeetingValidation;
      setCreateError(message);
      announce(message);
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { event } = await createEvent(programId, {
        name,
        event_type: createEventType,
        starts_at: startsAt,
        ends_at: endsAt,
        location: createLocation.trim() || null,
        check_in_window_opens_at: overrideOpens,
        check_in_window_closes_at: overrideCloses,
      });
      announce(COPY.programs.eventCreatedNotice);
      toggleCreateForm(false);
      if (!mounted.current) {
        return;
      }
      if (onOpenEvent) {
        onOpenEvent(event.event_id);
      } else {
        await run();
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
            onClick={() => toggleCreateForm(!createOpen)}
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
              <ProgramDatePicker
                id="programs-event-date"
                name="event_date"
                label={COPY.programs.eventDate}
                placeholder={COPY.programs.eventDate}
                value={createDate}
                onChange={setCreateDate}
                disabled={createBusy}
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
                value={createStartTime}
                onChange={(event) => changeCreateStartTime(event.target.value)}
                aria-required="true"
                disabled={createBusy}
              />
            </ScreenField>
            <ScreenField
              htmlFor="programs-event-end-time"
              label={COPY.programs.eventEnd}
            >
              <Input
                id="programs-event-end-time"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="time"
                name="event_end_time"
                value={createEndTime}
                onChange={(event) => {
                  setCreateEndTime(event.target.value);
                  setCreateEndAuto(false);
                }}
                aria-required="true"
                disabled={createBusy}
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
                disabled={createBusy}
              />
            </ScreenField>
            <ScreenField
              htmlFor="programs-event-type"
              label={COPY.programs.eventType}
            >
              <Select
                name="event_type"
                value={createEventType}
                onValueChange={(value) =>
                  setCreateEventType(value as EventType)
                }
                disabled={createBusy}
              >
                <SelectTrigger
                  id="programs-event-type"
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
            <ScreenField
              htmlFor="programs-event-location"
              label={COPY.programs.eventLocation}
            >
              <Input
                id="programs-event-location"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="text"
                name="location"
                value={createLocation}
                onChange={(event) => setCreateLocation(event.target.value)}
                placeholder={COPY.programs.eventLocationPlaceholder}
                disabled={createBusy}
              />
            </ScreenField>
            <div className="grid min-w-0 gap-2 rounded-[var(--screen-radius-card)] border border-[var(--screen-line)] bg-[var(--screen-surface-soft)] p-3">
              <div className="flex min-w-0 items-start gap-3">
                <Checkbox
                  id="programs-event-window-override"
                  checked={createWindowOverride}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setCreateWindowOverride(next);
                    if (next && defaultWindow) {
                      setCreateWindowOpens(
                        hkWallInputValue(defaultWindow.opensAt)
                      );
                      setCreateWindowCloses(
                        hkWallInputValue(defaultWindow.closesAt)
                      );
                    }
                  }}
                  disabled={createBusy}
                />
                <label
                  className="min-w-0 cursor-pointer text-sm leading-6 text-[var(--screen-ink)]"
                  htmlFor="programs-event-window-override"
                >
                  {COPY.programs.eventCheckInWindowOverride}
                </label>
              </div>
              {createWindowOverride ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <ScreenField
                    htmlFor="programs-event-window-opens"
                    label={COPY.programs.eventCheckInWindowOpensAt}
                  >
                    <Input
                      id="programs-event-window-opens"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      value={createWindowOpens}
                      onChange={(event) =>
                        setCreateWindowOpens(event.target.value)
                      }
                      disabled={createBusy}
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor="programs-event-window-closes"
                    label={COPY.programs.eventCheckInWindowClosesAt}
                  >
                    <Input
                      id="programs-event-window-closes"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="datetime-local"
                      value={createWindowCloses}
                      onChange={(event) =>
                        setCreateWindowCloses(event.target.value)
                      }
                      disabled={createBusy}
                    />
                  </ScreenField>
                </div>
              ) : (
                <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                  {defaultWindow
                    ? `${COPY.programs.eventCheckInWindowOpensAt} ${hkWallDateTimeLabel(defaultWindow.opensAt)}；${COPY.programs.eventCheckInWindowClosesAt} ${hkWallDateTimeLabel(defaultWindow.closesAt)}`
                    : COPY.programs.eventCheckInWindowCalculated}
                </p>
              )}
            </div>
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
                  toggleCreateForm(false);
                }}
              >
                {COPY.programs.eventCreateCancel}
              </Button>
            </div>
          </ScreenEditor>
        </ScreenCard>
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
              const exception = event.exception ?? null;
              const eventHref = buildProgramsHref({
                mode: "management",
                departmentId,
                programId,
                task: "events",
                eventId: event.event_id,
                hash,
              });
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
                      <Button
                        asChild
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        variant="outline"
                      >
                        <Link
                          href={eventHref}
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
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={COPY.programs.eventMoreActions}
                              disabled={actionBusy}
                              className="border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!onOpenEvent}
                              onSelect={() => onOpenEvent?.(event.event_id)}
                            >
                              {COPY.programs.eventEdit}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!onOpenEvent}
                              onSelect={() => onOpenEvent?.(event.event_id)}
                            >
                              {COPY.programs.eventReschedule}
                            </DropdownMenuItem>
                            {dataReady && event.status === "Active" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    if (event.has_attendance) {
                                      const message =
                                        COPY.programs
                                          .cancelBlockedWithAttendance;
                                      setActionError(message);
                                      announce(message);
                                      return;
                                    }
                                    setConfirmingEventId(event.event_id);
                                  }}
                                >
                                  {COPY.programs.cancelEvent}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {canManage &&
                        dataReady &&
                        event.status === "Active" &&
                        confirmingEventId === event.event_id && (
                          <form
                            className="grid min-w-0 basis-full gap-2"
                            noValidate
                            onSubmit={submitCancelEvent(event.event_id)}
                          >
                            <Input
                              className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                              type="text"
                              name="cancel_reason"
                              placeholder={
                                COPY.programs.cancelReasonPlaceholder
                              }
                              aria-label={COPY.programs.cancelReason}
                              disabled={actionBusy}
                            />
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
    </ScreenSection>
  );
};
