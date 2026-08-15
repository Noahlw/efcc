"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  assistedEnroll,
  createEvent,
  decideEnrollmentRequest,
  getManagementProgram,
  listEnrollmentRequests,
  listEnrollmentSnapshot,
  generateEvents,
  listEnrollments,
  listEvents,
  getEvent,
  listScheduleRules,
  previewEvents,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  Enrollment,
  EnrollmentRequest,
  EventDetail as ProgramEventDetail,
  ManagementAttention,
  PreviewResult,
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";
import { hkWallDateTimeLabel, WEEKDAY_LABELS } from "@/lib/programs/recurrence";
import { ProgramSettings } from "./program-settings";

import { ProgramForm } from "./program-form";
import { EventDetail, hkWallInputToIso } from "./event-detail";
import { MemberPicker } from "./member-picker";
import type { ProgramsTask } from "./programs-intent";
import { LeadersPanel } from "./programs-leaders-panel";
import { useAsyncResource } from "./use-async-resource";
import styles from "@/app/programs/programs.module.css";

export interface ProgramWorkspaceProps {
  programId: string;
  task?: ProgramsTask;
  /** EVT-01 (#251): management Event deep link under the events task. */
  eventId?: string | null;
  /** NTF-01 (#256): fresh server-shaped attention counts from the shell. */
  attention?: ManagementAttention | null;
  onAttentionRefresh?: () => void;
  onBack: () => void;
  onTaskChange: (task: ProgramsTask | null) => void;
  /** EVT-01 (#251): navigate the Event deep link; null returns to the list. */
  onEventChange?: (eventId: string | null) => void;
}

type WorkspaceState =
  | { kind: "loading" }
  | {
      kind: "ready";
      program: Program;
      department: Department | null;
      modules: DepartmentModule[];
    }
  | {
      kind: "error";
      failure: "forbidden" | "unavailable" | "recoverable";
      message: string;
    };

type SummaryRead<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "unavailable"; message: string };
interface SummaryState {
  events: SummaryRead<ProgramEvent[]>;
  eventProgress: SummaryRead<ProgramEventDetail["participant_summary"] | null>;
  pendingRequests: SummaryRead<number>;
  activeParticipants: SummaryRead<number>;
}
function hasModule(
  modules: readonly DepartmentModule[],
  moduleKey: DepartmentModule["module_key"]
): boolean {
  return modules.some(
    ({ module_key, enabled }) => module_key === moduleKey && enabled === 1
  );
}

function initialSummary(
  modules: readonly DepartmentModule[] = []
): SummaryState {
  const eventsEnabled = hasModule(modules, "events");
  return {
    events: eventsEnabled
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
    eventProgress: eventsEnabled
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
    pendingRequests: hasModule(modules, "enrollment")
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
    activeParticipants: hasModule(modules, "enrollment")
      ? { status: "loading" }
      : {
          status: "unavailable",
          message: COPY.programs.workspaceTaskUnavailable,
        },
  };
}

function redirectToLoginIfRequired(error: unknown): boolean {
  if (!(error instanceof RpcError) || error.problem.code !== "AUTH_REQUIRED") {
    return false;
  }
  rememberDeepLink(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.assign("/");
  return true;
}
async function readSummary<TInput, TValue>(
  operation: Promise<TInput>,
  project: (input: TInput) => TValue
): Promise<SummaryRead<TValue>> {
  try {
    return { status: "ready", value: project(await operation) };
  } catch (error) {
    if (redirectToLoginIfRequired(error)) {
      return {
        status: "unavailable",
        message: COPY.nav.unauthorized,
      };
    }
    return {
      status: "unavailable",
      message:
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.programs.workspaceSummaryUnavailable,
    };
  }
}
function unavailableSummary<T>(message: string): SummaryRead<T> {
  return { status: "unavailable", message };
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function isFutureActiveEvent(event: ProgramEvent, now = Date.now()): boolean {
  const startsAt = new Date(event.starts_at).getTime();
  return (
    event.status === "Active" &&
    (event.availability === undefined || event.availability === "Active") &&
    Number.isFinite(startsAt) &&
    startsAt > now
  );
}

function lifecycleLabel(value: Program["lifecycle"]): string {
  return value === "Active"
    ? COPY.programs.filterActive
    : value === "Draft"
      ? COPY.programs.filterDraft
      : COPY.programs.filterArchived;
}

function behaviorLabel(value: Program["behavior_type"]): string {
  return value === "Recurring"
    ? COPY.programs.detailBehaviorRecurring
    : COPY.programs.detailBehaviorOneOff;
}

function discoverabilityLabel(value: Program["discoverability"]): string {
  return value === "Listed"
    ? COPY.programs.discoverabilityListed
    : COPY.programs.discoverabilityUnlisted;
}

function enrollmentLabel(value: Program["enrollment_mode"]): string {
  return value === "MemberRequest"
    ? COPY.programs.detailParticipationMemberRequest
    : COPY.programs.detailParticipationManagerOnly;
}

function taskLabel(task: ProgramsTask): string {
  return task === "events"
    ? COPY.programs.workspaceTaskEvents
    : task === "participants"
      ? COPY.programs.workspaceTaskParticipants
      : COPY.programs.workspaceTaskSettings;
}

const WorkspaceNavigation = ({
  programId,
  task,
  modules,
  onTaskChange,
}: {
  programId: string;
  task?: ProgramsTask;
  modules: DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null) => void;
}) => {
  const tasks: ProgramsTask[] = [
    ...(hasModule(modules, "events") ? ["events" as const] : []),
    ...(hasModule(modules, "enrollment") ? ["participants" as const] : []),
    "settings",
  ];
  return (
    <nav
      className={styles.workspaceTasks}
      aria-label={COPY.programs.workspaceTaskLabel}
    >
      <a
        className={styles.workspaceTaskLink}
        aria-current={task === undefined ? "page" : undefined}
        href={`/programs?mode=management&program=${encodeURIComponent(programId)}`}
        onClick={(event) => {
          event.preventDefault();
          onTaskChange(null);
        }}
      >
        {COPY.programs.workspaceTitle}
      </a>
      {tasks.map((value) => (
        <a
          key={value}
          className={styles.workspaceTaskLink}
          aria-current={task === value ? "page" : undefined}
          href={`/programs?mode=management&program=${encodeURIComponent(programId)}&task=${value}`}
          onClick={(event) => {
            event.preventDefault();
            onTaskChange(value);
          }}
        >
          {taskLabel(value)}
        </a>
      ))}
    </nav>
  );
};
const WorkspaceOverview = ({
  program,
  department,
  summary,
  onEdit,
  onTaskChange,
}: {
  program: Program;
  department: Department | null;
  summary: SummaryState;
  onEdit: () => void;
  onTaskChange: (task: ProgramsTask | null) => void;
}) => {
  const eventRead =
    summary.events.status === "ready" ? summary.events.value : null;
  const upcomingEvents = useMemo(
    () =>
      eventRead
        ?.filter((event) => isFutureActiveEvent(event))
        .sort(
          (left, right) =>
            new Date(left.starts_at).getTime() -
            new Date(right.starts_at).getTime()
        ) ?? [],
    [eventRead]
  );
  const nextEvent =
    program.behavior_type === "Recurring" ? (upcomingEvents[0] ?? null) : null;
  const activeParticipants =
    summary.activeParticipants.status === "ready"
      ? summary.activeParticipants.value
      : null;
  const pendingRequests =
    summary.pendingRequests.status === "ready"
      ? summary.pendingRequests.value
      : null;
  const eventCount =
    summary.events.status === "ready" ? upcomingEvents.length : null;
  const eventTaskHref = `/programs?mode=management&program=${encodeURIComponent(program.program_id)}&task=events`;
  const participantTaskHref = `/programs?mode=management&program=${encodeURIComponent(program.program_id)}&task=participants`;

  return (
    <>
      {nextEvent && (
        <section
          className={styles.workspaceHero}
          aria-labelledby="programs-workspace-next-event"
        >
          <h4
            id="programs-workspace-next-event"
            className={styles.workspaceHeroHeading}
          >
            {COPY.programs.workspaceNextEvent}
          </h4>
          <div className={styles.workspaceHeroMeta}>
            <strong>{formatEventTime(nextEvent.starts_at)}</strong>
            <span>
              {nextEvent.source === "SCHEDULE"
                ? COPY.programs.eventScheduleSource
                : COPY.programs.eventManualSource}
            </span>
          </div>
          <div className={styles.workspaceHeroProgress}>
            {summary.eventProgress.status === "ready" &&
            summary.eventProgress.value ? (
              <strong>
                {COPY.programs.workspaceCheckInProgress.replace(
                  "{checked}",
                  String(summary.eventProgress.value.checked_in)
                ).replace(
                  "{active}",
                  String(summary.eventProgress.value.active_enrollments)
                )}
              </strong>
            ) : summary.eventProgress.status === "loading" ? (
              <output aria-busy="true">
                {COPY.programs.workspaceSummaryLoading}
              </output>
            ) : (
              <output className={styles.programDetailMuted} aria-live="polite">
                {COPY.programs.workspaceSummaryUnavailable}
              </output>
            )}
          </div>
          <a
            className={`${styles.button} ${styles.workspaceHeroCta}`}
            href={`/events?eventId=${encodeURIComponent(nextEvent.event_id)}`}
          >
            {COPY.programs.workspaceRosterCta}
          </a>
        </section>
      )}

      <section
        className={styles.workspaceOperations}
        aria-labelledby="programs-workspace-operations"
      >
        <h4
          id="programs-workspace-operations"
          className={styles.workspaceHeading}
        >
          {COPY.programs.workspaceOperations}
        </h4>
        <div className={styles.workspaceOperationGrid}>
          <a
            className={styles.workspaceOperationTile}
            href={eventTaskHref}
            onClick={(event) => {
              event.preventDefault();
              onTaskChange("events");
            }}
          >
            <span className={styles.workspaceOperationLabel}>
              {COPY.programs.workspaceTaskEvents}
              <span className="sr-only">
                {COPY.programs.workspaceUpcomingEvents}
              </span>
            </span>
            <strong className={styles.workspaceOperationCount}>
              {eventCount === null
                ? COPY.programs.workspaceSummaryCountUnavailable
                : COPY.programs.workspaceUpcomingEventCount.replace(
                    "{count}",
                    String(eventCount)
                  )}
            </strong>
          </a>
          <a
            className={styles.workspaceOperationTile}
            href={participantTaskHref}
            onClick={(event) => {
              event.preventDefault();
              onTaskChange("participants");
            }}
          >
            <span className={styles.workspaceOperationLabel}>
              {COPY.programs.workspaceTaskParticipants}
              <span className="sr-only">
                {COPY.programs.workspaceActiveParticipants}
              </span>
            </span>
            <strong className={styles.workspaceOperationCount}>
              {activeParticipants === null
                ? COPY.programs.workspaceSummaryCountUnavailable
                : activeParticipants}
            </strong>
            {pendingRequests !== null && pendingRequests > 0 && (
              <span className={styles.workspaceOperationBadge}>
                <span className="sr-only">
                  {COPY.programs.workspacePendingRequests}
                </span>
                {COPY.programs.workspacePendingApprovals.replace(
                  "{count}",
                  String(pendingRequests)
                )}
              </span>
            )}
          </a>
        </div>
        {(summary.events.status === "loading" ||
          summary.pendingRequests.status === "loading" ||
          summary.activeParticipants.status === "loading") && (
          <output aria-busy="true">
            {COPY.programs.workspaceSummaryLoading}
          </output>
        )}
        {(summary.events.status === "unavailable" ||
          summary.pendingRequests.status === "unavailable" ||
          summary.activeParticipants.status === "unavailable") && (
          <output className={styles.programDetailMuted} aria-live="polite">
            {COPY.programs.workspaceSummaryUnavailable}
          </output>
        )}
      </section>

      <section
        className={styles.workspaceSection}
        aria-labelledby="programs-workspace-identity"
      >
        <h4
          id="programs-workspace-identity"
          className={styles.workspaceHeading}
        >
          {COPY.programs.workspaceIdentity}
        </h4>
        <div className={styles.workspaceActions}>
          {program.capabilities.manage && (
            <button className={styles.button} type="button" onClick={onEdit}>
              {COPY.programs.editProgram}
            </button>
          )}
        </div>
        {program.description ? (
          <p className={styles.programDetailDescription}>
            {program.description}
          </p>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.programDescriptionEmpty}
          </p>
        )}
        <dl className={styles.workspaceFacts}>
          <div>
            <dt>{COPY.programs.workspaceDepartment}</dt>
            <dd>{department?.name ?? COPY.programs.workspaceDepartment}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceBehavior}</dt>
            <dd>{behaviorLabel(program.behavior_type)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceLifecycle}</dt>
            <dd>{lifecycleLabel(program.lifecycle)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceDiscoverability}</dt>
            <dd>{discoverabilityLabel(program.discoverability)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceEnrollmentMode}</dt>
            <dd>{enrollmentLabel(program.enrollment_mode)}</dd>
          </div>
          {program.category && (
            <div>
              <dt>{COPY.programs.workspaceCategory}</dt>
              <dd>{program.category}</dd>
            </div>
          )}
        </dl>
      </section>
    </>
  );
};

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

function ruleLabel(rule: ScheduleRule): string {
  return rule.recurrence === "WEEKLY"
    ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0] ?? ""} ${rule.start_time}–${rule.end_time}`
    : `${COPY.programs.ruleMonthly} ${rule.month_day ?? ""}日 ${rule.start_time}–${rule.end_time}`;
}

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
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) {
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
        COPY.programs.previewed.replace("{count}", String(plan.occurrences.length))
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
      if (
        error instanceof RpcError &&
        error.problem.code === "STALE_PLAN"
      ) {
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
        {COPY.programs.previewLead}
      </h5>
      {rulesError !== null && (
        <output className={styles.panelError} role="alert">
          {rulesError}
        </output>
      )}
      {noRules ? (
        <p className={styles.programDetailMuted}>
          {COPY.programs.settingsScheduleNone}
        </p>
      ) : (
        <form className={styles.ruleForm} onSubmit={submitPreview}>
          <label className={styles.ruleField}>
            <span>{COPY.programs.previewHorizon}</span>
            <input
              type="number"
              name="horizon_days"
              min={1}
              max={365}
              defaultValue={90}
              required
              aria-label={COPY.programs.previewHorizon}
            />
          </label>
          <button
            type="submit"
            className={styles.button}
            disabled={previewBusy || generateBusy}
          >
            {previewBusy ? COPY.programs.previewing : COPY.programs.previewEvents}
          </button>
        </form>
      )}
      {preview.kind === "loading" && (
        <output aria-busy="true">{COPY.programs.previewing}</output>
      )}
      {preview.kind === "error" && (
        <output className={styles.panelError} role="alert">
          {preview.message}
        </output>
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
                  <span>{rule ? ruleLabel(rule) : occurrence.rule_id}</span>
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
            <button
              type="button"
              className={styles.button}
              onClick={() => void submitGenerate()}
              disabled={generateBusy || previewBusy}
            >
              {generateBusy ? COPY.programs.generating : COPY.programs.generateEvents}
            </button>
            {generateResult !== null &&
              (generatePartial ? (
                <output className={styles.panelError} role="alert">
                  {generateResult}
                </output>
              ) : (
                <output className={styles.panelNotice} aria-live="polite">
                  {generateResult}
                </output>
              ))}
          </div>
          {generateError !== null && (
            <output className={styles.panelError} role="alert">
              {generateError}
            </output>
          )}
        </>
      )}
    </section>
  );
};

const EventsTask = ({
  programId,
  canManage,
  attention,
  onAttentionRefresh,
  recurring,
  onOpenEvent,
}: {
  programId: string;
  canManage: boolean;
  attention: ManagementAttention | null;
  onAttentionRefresh: () => void;
  recurring: boolean;
  /** EVT-01 (#251): deep link into the Event operational detail screen. */
  onOpenEvent?: (eventId: string) => void;
}) => {
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
    const startsAt = hkWallInputToIso(String(form.get("starts_at") ?? ""));
    const endsAt = hkWallInputToIso(String(form.get("ends_at") ?? ""));
    const opensAt = hkWallInputToIso(String(form.get("opens_at") ?? ""));
    const closesAt = hkWallInputToIso(String(form.get("closes_at") ?? ""));
    if (!startsAt || !endsAt || !opensAt || !closesAt) {
      const message = errorCopyFor("VALIDATION");
      setCreateError(message);
      announce(message);
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { event } = await createEvent(programId, {
        name: String(form.get("name") ?? "").trim() || null,
        location: String(form.get("location") ?? "").trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        check_in_window_opens_at: opensAt,
        check_in_window_closes_at: closesAt,
      });
      announce(COPY.programs.eventCreatedNotice);
      setCreateOpen(false);
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

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-events-title"
    >
      <h4
        id="programs-workspace-events-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskEvents}
      </h4>
      {eventAttention && eventAttention.inactive_event_count > 0 && (
        <span
          className={`${styles.badge} ${styles.badgeActive}`}
          aria-label={COPY.programs.attentionEventCount.replace(
            "{count}",
            String(eventAttention.inactive_event_count)
          )}
        >
          {eventAttention.inactive_event_count}
        </span>
      )}
      {eventAttention && eventAttention.cancelled_event_count > 0 && (
        <span
          className={styles.badge}
          aria-label={COPY.programs.attentionCancelledCount.replace(
            "{count}",
            String(eventAttention.cancelled_event_count)
          )}
        >
          {eventAttention.cancelled_event_count}
        </span>
      )}
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskEventsLead}
      </p>
      {canManage && recurring && (
        <RecurringSchedulePanel
          programId={programId}
          onGenerated={() => {
            void run();
          }}
        />
      )}
      {canManage && (
        <>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(null);
            }}
          >
            {COPY.programs.eventCreate}
          </button>
          {createOpen && (
            <form
              className={`${styles.ruleForm} ${styles.eventCreateForm}`}
              aria-labelledby="programs-workspace-event-create-title"
              onSubmit={submitCreate}
            >
              <h5
                id="programs-workspace-event-create-title"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.eventCreateTitle}
              </h5>
              {createError !== null && (
                <output className={styles.panelError} role="alert">
                  {createError}
                </output>
              )}
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventName}</span>
                <input
                  type="text"
                  name="name"
                  placeholder={COPY.programs.eventNamePlaceholder}
                  aria-label={COPY.programs.eventName}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventLocation}</span>
                <input
                  type="text"
                  name="location"
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
                  aria-label={COPY.programs.eventStart}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventEnd}</span>
                <input
                  type="datetime-local"
                  name="ends_at"
                  required
                  aria-label={COPY.programs.eventEnd}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventCheckInWindowOpensAt}</span>
                <input
                  type="datetime-local"
                  name="opens_at"
                  required
                  aria-label={COPY.programs.eventCheckInWindowOpensAt}
                />
              </label>
              <label className={styles.ruleField}>
                <span>{COPY.programs.eventCheckInWindowClosesAt}</span>
                <input
                  type="datetime-local"
                  name="closes_at"
                  required
                  aria-label={COPY.programs.eventCheckInWindowClosesAt}
                />
              </label>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={createBusy}
                >
                  {COPY.programs.eventCreateSubmit}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={createBusy}
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateError(null);
                  }}
                >
                  {COPY.programs.eventCreateCancel}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {state.kind === "loading" && (
        <output aria-busy="true">
          {COPY.programs.workspaceTaskEventsLoading}
        </output>
      )}
      {state.kind === "error" && (
        <div className={styles.boundaryError} role="alert">
          <p>{state.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={retry}
          >
            {COPY.programs.workspaceTaskEventsRetry}
          </button>
        </div>
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
          {state.events.map((event) => (
            <li key={event.event_id} className={styles.workspaceTaskRow}>
              <strong>{formatEventTime(event.starts_at)}</strong>
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
                  <span className={styles.eventCancelled}>
                    {COPY.programs.eventUnavailable}
                  </span>
                )}
              {onOpenEvent && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => onOpenEvent(event.event_id)}
                >
                  {COPY.programs.eventDetailOpen}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

type ParticipantTab = "pending" | "active" | "history";
type ParticipantFailure = "forbidden" | "stale" | "conflict" | "server";

type ParticipantsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      requests: EnrollmentRequest[];
      enrollments: Enrollment[];
    }
  | {
      kind: "error";
      failure: ParticipantFailure;
      message: string;
    };

function participantIssue(error: unknown): {
  failure: ParticipantFailure;
  message: string;
} {
  const code = error instanceof RpcError ? error.problem.code : undefined;
  if (code === "FORBIDDEN") {
    return {
      failure: "forbidden",
      message: COPY.programs.workspaceParticipantsForbidden,
    };
  }
  if (code === "STALE") {
    return {
      failure: "stale",
      message: COPY.programs.workspaceParticipantsStale,
    };
  }
  if (code === "CONFLICT" || code === "ENROLLMENT_DUPLICATE") {
    return {
      failure: "conflict",
      message:
        code === "ENROLLMENT_DUPLICATE"
          ? `${COPY.programs.workspaceParticipantsConflict} ${COPY.programs.enrollmentDuplicate}`
          : COPY.programs.workspaceParticipantsConflict,
    };
  }
  return {
    failure: "server",
    message:
      error instanceof RpcError
        ? errorCopyFor(code, error.problem.detail)
        : COPY.error.networkError,
  };
}

function requestStatusLabel(status: EnrollmentRequest["status"]): string {
  if (status === "Pending") {
    return COPY.programs.requestPending;
  }
  if (status === "Approved") {
    return COPY.programs.requestApproved;
  }
  if (status === "Rejected") {
    return COPY.programs.requestRejected;
  }
  return COPY.programs.requestWithdrawn;
}

const ParticipantsTask = ({
  programId,
  canManage,
  enrollmentMode,
  attention,
  onAttentionRefresh,
}: {
  programId: string;
  canManage: boolean;
  enrollmentMode: Program["enrollment_mode"];
  attention: ManagementAttention | null;
  onAttentionRefresh: () => void;
}) => {
  const { state, run, retry } = useAsyncResource<
    { requests: EnrollmentRequest[]; enrollments: Enrollment[] },
    ParticipantsState
  >(
    async () => listEnrollmentSnapshot(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ requests, enrollments }) => ({
        kind: "ready",
        requests,
        enrollments,
      }),
      onError: (error) => {
        if (redirectToLoginIfRequired(error)) {
          return null;
        }
        return { kind: "error", ...participantIssue(error) };
      },
    },
    [programId]
  );
  const [refreshSuccess, setRefreshSuccess] = useState<string>(
    COPY.programs.decisionMade
  );
  const [tab, setTab] = useState<ParticipantTab>("pending");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingAction, setRefreshingAction] = useState<string | null>(null);
  const [assistedBusy, setAssistedBusy] = useState(false);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  // Most recent successful snapshot: a failed refresh after a successful
  // mutation keeps the queue rendered from the last-known data instead of
  // ejecting the operator into the full-panel error state.
  const lastReadyRef = useRef<Extract<ParticipantsState, { kind: "ready" }> | null>(
    null
  );

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    if (state.kind === "ready") {
      lastReadyRef.current = state;
    }
  }, [state]);

  useEffect(() => {
    if (refreshingAction === null || state.kind === "loading") {
      return;
    }
    if (state.kind === "ready") {
      setNotice(refreshSuccess);
      announce(refreshSuccess);
    } else {
      setNotice(null);
    }
    setRefreshingAction(null);
  }, [refreshSuccess, refreshingAction, state]);

  const queue = useMemo(() => {
    const snapshot =
      state.kind === "ready"
        ? state
        : state.kind === "error" && lastReadyRef.current
          ? lastReadyRef.current
          : null;
    if (snapshot === null) {
      return null;
    }
    const active = snapshot.enrollments.filter(
      ({ status }) => status === "Active"
    );
    // Every enrollment row (Active or Cancelled) tells the Approved
    // request's story once; an Approved request stays out of history as
    // long as ANY linked enrollment row exists.
    const enrolledRequestIds = new Set(
      snapshot.enrollments.flatMap(({ request_id }) =>
        request_id ? [request_id] : []
      )
    );
    const pending = snapshot.requests.filter(
      ({ status }) => status === "Pending"
    );
    const historyRequests = snapshot.requests.filter(
      ({ status, request_id }) =>
        status !== "Pending" &&
        !(status === "Approved" && enrolledRequestIds.has(request_id))
    );
    const historyEnrollments = snapshot.enrollments.filter(
      ({ status }) => status === "Cancelled"
    );
    return {
      pending,
      active,
      historyRequests,
      historyEnrollments,
      counts: {
        pending: pending.length,
        active: active.length,
        history: historyRequests.length + historyEnrollments.length,
      },
    };
  }, [state]);

  const pendingAttentionCount = attention?.programs.find(
    ({ program_id }) => program_id === programId
  )?.pending_enrollment_count;

  const handleDecision = async (
    request: EnrollmentRequest,
    action: "Approved" | "Rejected"
  ) => {
    setBusyRequestId(request.request_id);
    setNotice(null);
    setActionErrors((current) => {
      const next = { ...current };
      delete next[request.request_id];
      return next;
    });
    try {
      await decideEnrollmentRequest(
        programId,
        request.request_id,
        action,
        notes[request.request_id],
        request.request_version
      );
      onAttentionRefresh();
      setRefreshSuccess(COPY.programs.decisionMade);
      setRefreshingAction(request.request_id);
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const issue = participantIssue(error);
      setActionErrors((current) => ({
        ...current,
        [request.request_id]: issue.message,
      }));
      announce(issue.message);
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleAssisted = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const memberUserId = String(
      new FormData(event.currentTarget).get("member_user_id") ?? ""
    ).trim();
    if (!memberUserId) {
      setAssistedError(COPY.programs.memberSearchHint);
      return;
    }
    setAssistedBusy(true);
    setAssistedError(null);
    setNotice(null);
    try {
      await assistedEnroll(programId, memberUserId);
      onAttentionRefresh();
      setRefreshSuccess(COPY.programs.assistedSubmitted);
      setRefreshingAction("assisted");
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      const issue = participantIssue(error);
      setAssistedError(issue.message);
      announce(issue.message);
    } finally {
      setAssistedBusy(false);
    }
  };

  const renderPending = () => {
    if (queue === null || queue.pending.length === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsPendingEmpty}
        </p>
      );
    }
    return (
      <ul className={styles.workspaceTaskList} aria-label={COPY.programs.requests}>
        {queue.pending.map((request) => {
          const member =
            request.member_name ??
            request.member_username ??
            request.member_user_id;
          return (
            <li
              key={request.request_id}
              className={styles.workspaceTaskRow}
              aria-busy={busyRequestId === request.request_id}
            >
              <strong>{member}</strong>
              <span>{requestStatusLabel(request.status)}</span>
              <span>{formatEventTime(request.submitted_at)}</span>
              {canManage && (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.decisionNote}
                    </span>
                    <input
                      className={styles.input}
                      type="text"
                      value={notes[request.request_id] ?? ""}
                      aria-label={COPY.programs.decisionNote}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request.request_id]: event.target.value,
                        }))
                      }
                      disabled={busyRequestId !== null}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.successOutline}
                    onClick={() => void handleDecision(request, "Approved")}
                    disabled={busyRequestId !== null}
                  >
                    {COPY.programs.approve}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerOutline}
                    onClick={() => void handleDecision(request, "Rejected")}
                    disabled={busyRequestId !== null}
                  >
                    {COPY.programs.reject}
                  </button>
                </>
              )}
              {actionErrors[request.request_id] && (
                <output className={styles.panelError} role="alert">
                  {actionErrors[request.request_id]}
                </output>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const renderActive = () => {
    if (queue === null || queue.active.length === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsActiveEmpty}
        </p>
      );
    }
    return (
      <ul
        className={styles.workspaceTaskList}
        aria-label={COPY.programs.workspaceActiveParticipants}
      >
        {queue.active.map((enrollment) => {
          const request = state.kind === "ready"
            ? state.requests.find(
                ({ request_id }) => request_id === enrollment.request_id
              )
            : undefined;
          return (
            <li key={enrollment.enrollment_id} className={styles.workspaceTaskRow}>
              <strong>
                {enrollment.member_name ??
                  enrollment.member_username ??
                  enrollment.member_user_id}
              </strong>
              <span>{COPY.programs.enrollmentActive}</span>
              {request && <span>{requestStatusLabel(request.status)}</span>}
              <span>{formatEventTime(enrollment.enrolled_at)}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderHistory = () => {
    if (queue === null || queue.counts.history === 0) {
      return (
        <p className={styles.programDetailMuted}>
          {COPY.programs.workspaceParticipantsHistoryEmpty}
        </p>
      );
    }
    return (
      <ul className={styles.workspaceTaskList} aria-label={COPY.programs.enrollmentHistory}>
        {queue.historyRequests.map((request) => (
          <li key={`request-${request.request_id}`} className={styles.workspaceTaskRow}>
            <strong>
              {request.member_name ??
                request.member_username ??
                request.member_user_id}
            </strong>
            <span>{requestStatusLabel(request.status)}</span>
            {request.decision_note && <span>{request.decision_note}</span>}
            <span>{formatEventTime(request.decided_at ?? request.submitted_at)}</span>
          </li>
        ))}
        {queue.historyEnrollments.map((enrollment) => (
          <li
            key={`enrollment-${enrollment.enrollment_id}`}
            className={styles.workspaceTaskRow}
          >
            <strong>
              {enrollment.member_name ??
                enrollment.member_username ??
                enrollment.member_user_id}
            </strong>
            <span>{COPY.programs.enrollmentCancelled}</span>
            <span>{formatEventTime(enrollment.cancelled_at ?? enrollment.enrolled_at)}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-participants-title"
      aria-busy={state.kind === "loading"}
    >
      <h4
        id="programs-workspace-participants-title"
        className={styles.workspaceHeading}
      >
        {COPY.programs.workspaceTaskParticipants}
      </h4>
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskParticipantsLead}
      </p>
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {state.kind === "error" && lastReadyRef.current !== null && (
        <output className={styles.panelNotice}>
          {COPY.programs.workspaceParticipantsRefreshFailed}
        </output>
      )}
      {canManage && enrollmentMode === "ManagerOnly" && (
        <form className={styles.ruleForm} onSubmit={handleAssisted}>
          <MemberPicker
            programId={programId}
            name="member_user_id"
            label={COPY.programs.memberId}
            placeholder={COPY.programs.memberIdPlaceholder}
            excludeEnrolled
          />
          <button
            type="submit"
            className={styles.actionButton}
            disabled={assistedBusy || busyRequestId !== null}
          >
            {assistedBusy ? COPY.programs.submitting : COPY.programs.assistedEnroll}
          </button>
          {assistedError !== null && (
            <output className={styles.panelError} role="alert">
              {assistedError}
            </output>
          )}
        </form>
      )}
      {state.kind === "loading" && (
        <output aria-busy="true">
          {COPY.programs.workspaceTaskParticipantsLoading}
        </output>
      )}
      {state.kind === "error" && lastReadyRef.current === null && (
        <div className={styles.boundaryError} role="alert">
          <p>{state.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => {
              setActionErrors({});
              retry();
            }}
          >
            {COPY.programs.workspaceTaskParticipantsRetry}
          </button>
        </div>
      )}
      {queue !== null && (
        <>
          <div className={styles.workspaceActions}>
            <div role="tablist" aria-label={COPY.programs.workspaceTaskParticipants}>
              {(
                [
                  [
                    "pending",
                    COPY.programs.workspacePendingRequests,
                    pendingAttentionCount ?? queue.counts.pending,
                  ],
                  ["active", COPY.programs.workspaceActiveParticipants, queue.counts.active],
                  ["history", COPY.programs.enrollmentHistory, queue.counts.history],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`participants-${value}-tab`}
                  aria-selected={tab === value}
                  aria-controls={`participants-${value}-panel`}
                  className={styles.taskButton}
                  onClick={() => setTab(value)}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setActionErrors({});
                setNotice(null);
                setRefreshSuccess(COPY.programs.workspaceParticipantsRefreshSuccess);
                setRefreshingAction("refresh");
                void run();
              }}
            >
              {COPY.programs.workspaceParticipantsRefresh}
            </button>
          </div>
          {queue.counts.pending + queue.counts.active + queue.counts.history === 0 && (
            <p className={styles.programDetailMuted}>
              {COPY.programs.workspaceTaskParticipantsEmpty}
            </p>
          )}
          <section
            id={`participants-${tab}-panel`}
            role="tabpanel"
            aria-labelledby={`participants-${tab}-tab`}
          >
            {tab === "pending"
              ? renderPending()
              : tab === "active"
                ? renderActive()
                : renderHistory()}
          </section>
        </>
      )}
    </section>
  );
};

const SettingsTask = ({
  program,
  modules,
  onTaskChange,
  onAttentionRefresh,
}: {
  program: Program;
  modules: readonly DepartmentModule[];
  onTaskChange: (task: ProgramsTask | null) => void;
  onAttentionRefresh: () => void;
}) => (
  <>
    <ProgramSettings
      program={program}
      eventsEnabled={hasModule(modules, "events")}
      attendanceEnabled={hasModule(modules, "attendance")}
      onTaskChange={onTaskChange}
    />
    {(program.capabilities.manage || program.capabilities.leader_assign) && (
      <LeadersPanel
        program={program}
        canManage={program.capabilities.leader_assign}
        onAttentionRefresh={onAttentionRefresh}
      />
    )}
  </>
);
const TaskUnavailable = ({ task }: { task: ProgramsTask }) => (
  <section
    className={styles.workspaceTask}
    aria-labelledby="programs-workspace-task-unavailable"
  >
    <h4
      id="programs-workspace-task-unavailable"
      className={styles.workspaceHeading}
    >
      {taskLabel(task)}
    </h4>
    <output className={styles.programDetailMuted} aria-live="polite">
      {COPY.programs.workspaceTaskUnavailable}
    </output>
  </section>
);
const WorkspaceTask = ({
  program,
  task,
  modules,
  attention,
  onAttentionRefresh,
  onTaskChange,
  onOpenEvent,
}: {
  program: Program;
  task: ProgramsTask;
  modules: readonly DepartmentModule[];
  attention: ManagementAttention | null;
  onAttentionRefresh: () => void;
  onTaskChange: (task: ProgramsTask | null) => void;
  onOpenEvent?: (eventId: string) => void;
}) => {
  if (task === "events") {
    return hasModule(modules, "events") ? (
      <EventsTask
        programId={program.program_id}
        canManage={program.capabilities.manage}
        attention={attention}
        onAttentionRefresh={onAttentionRefresh}
        recurring={program.behavior_type === "Recurring"}
        onOpenEvent={onOpenEvent}
      />
    ) : (
      <TaskUnavailable task={task} />
    );
  }
  if (task === "participants") {
    return hasModule(modules, "enrollment") ? (
      <ParticipantsTask
        programId={program.program_id}
        canManage={program.capabilities.manage}
        enrollmentMode={program.enrollment_mode}
        attention={attention}
        onAttentionRefresh={onAttentionRefresh}
      />
    ) : (
      <TaskUnavailable task={task} />
    );
  }
  return (
    <SettingsTask
      program={program}
      modules={modules}
      onTaskChange={onTaskChange}
      onAttentionRefresh={onAttentionRefresh}
    />
  );
};

export const ProgramWorkspace = ({
  programId,
  task,
  eventId,
  attention = null,
  onAttentionRefresh = () => {},
  onBack,
  onTaskChange,
  onEventChange,
}: ProgramWorkspaceProps) => {
  const [summary, setSummary] = useState<SummaryState>(() => initialSummary());
  const [editing, setEditing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { state, run: loadWorkspace, retry } = useAsyncResource<
    { program: Program; department: Department | null; modules: DepartmentModule[] },
    WorkspaceState
  >(
    async () => getManagementProgram(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ program, department, modules }) => ({
        kind: "ready",
        program,
        department,
        modules,
      }),
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          window.location.assign("/");
          return null;
        }
        if (error instanceof RpcError && error.problem.code === "FORBIDDEN") {
          announce(COPY.programs.workspaceForbidden);
          return {
            kind: "error",
            failure: "forbidden",
            message: COPY.programs.workspaceUnavailableHint,
          };
        }
        if (
          error instanceof RpcError &&
          (error.problem.code === "NOT_FOUND" || error.problem.status === 404)
        ) {
          announce(COPY.programs.workspaceUnavailable);
          return {
            kind: "error",
            failure: "unavailable",
            message: COPY.programs.workspaceUnavailableHint,
          };
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return { kind: "error", failure: "recoverable", message };
      },
      announceLoading: COPY.programs.workspaceLoading,
      announceReady: ({ program }) => program.name,
      focusTarget: "#programs-workspace-state",
    },
    [programId]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const loadSummary = useCallback(
    async (
      modules: readonly DepartmentModule[],
      behaviorType: Program["behavior_type"]
    ) => {
      const events = hasModule(modules, "events")
        ? readSummary(listEvents(programId), ({ events: value }) => value)
        : Promise.resolve(
            unavailableSummary<ProgramEvent[]>(
              COPY.programs.workspaceTaskUnavailable
            )
          );
      const pendingRequests = hasModule(modules, "enrollment")
        ? readSummary(
            listEnrollmentRequests(programId),
            ({ requests }) =>
              requests.filter(({ status }) => status === "Pending").length
          )
        : Promise.resolve(
            unavailableSummary<number>(COPY.programs.workspaceTaskUnavailable)
          );
      const activeParticipants = hasModule(modules, "enrollment")
        ? readSummary(
            listEnrollments(programId),
            ({ enrollments }) =>
              enrollments.filter(({ status }) => status === "Active").length
          )
        : Promise.resolve(
            unavailableSummary<number>(COPY.programs.workspaceTaskUnavailable)
          );
      setSummary(initialSummary(modules));
      const [eventRead, pendingRead, activeRead] = await Promise.all([
        events,
        pendingRequests,
        activeParticipants,
      ]);
      let eventProgress: SummaryRead<
        ProgramEventDetail["participant_summary"] | null
      >;
      if (!hasModule(modules, "events")) {
        eventProgress = unavailableSummary(
          COPY.programs.workspaceTaskUnavailable
        );
      } else if (eventRead.status === "loading") {
        eventProgress = { status: "loading" };
      } else if (eventRead.status === "unavailable") {
        eventProgress = unavailableSummary(eventRead.message);
      } else {
        const nextEvent =
          behaviorType === "Recurring"
            ? eventRead.value.find((event) => isFutureActiveEvent(event))
            : undefined;
        eventProgress = nextEvent
          ? await readSummary(
              getEvent(programId, nextEvent.event_id),
              ({ participant_summary }) => participant_summary
            )
          : { status: "ready", value: null };
      }
      if (!mounted.current) {
        return;
      }
      setSummary({
        events: eventRead,
        eventProgress,
        pendingRequests: pendingRead,
        activeParticipants: activeRead,
      });
    },
    [programId]
  );

  useEffect(() => {
    if (state.kind !== "ready" || task !== undefined) {
      return;
    }
    void loadSummary(state.modules, state.program.behavior_type);
  }, [loadSummary, state, task]);


  if (state.kind === "loading") {
    return (
      <output
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryState}
        aria-busy="true"
      >
        {COPY.programs.workspaceLoading}
      </output>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryError}
        role="alert"
      >
        <h3 className={styles.boundaryTitle}>
          {state.failure === "forbidden"
            ? COPY.programs.workspaceForbidden
            : state.failure === "unavailable"
              ? COPY.programs.workspaceUnavailable
              : COPY.programs.workspaceLoadError}
        </h3>
        <p>{state.message}</p>
        <div className={styles.workspaceActions}>
          <button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.workspaceRetry}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onBack}
          >
            {COPY.programs.workspaceBack}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.managementWorkspace}
      aria-labelledby="programs-workspace-title"
    >
      <button
        className={styles.programDetailBack}
        type="button"
        onClick={onBack}
      >
        {COPY.programs.workspaceBack}
      </button>
      <header className={styles.workspaceHeader}>
        <p className={styles.programDetailEyebrow}>
          {state.department
            ? `${state.department.name} · ${state.department.code}`
            : COPY.programs.workspaceDepartment}
        </p>
        <h3 id="programs-workspace-title" className={styles.boundaryTitle}>
          {state.program.name}
        </h3>
        <p className={styles.boundaryLead}>{COPY.programs.workspaceLead}</p>
      </header>

      <WorkspaceNavigation
        programId={programId}
        task={task}
        modules={state.modules}
        onTaskChange={(nextTask) => {
          setEditing(false);
          onTaskChange(nextTask);
        }}
      />

      {editing ? (
        <ProgramForm
          initial={state.program}
          onSaved={() => {
            setEditing(false);
            void loadWorkspace();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : task && task === "events" && eventId ? (
        <EventDetail
          programId={programId}
          eventId={eventId}
          canManage={state.program.capabilities.manage}
          onAttentionRefresh={onAttentionRefresh}
          onBack={() => onEventChange?.(null)}
        />
      ) : task ? (
        <WorkspaceTask
          program={state.program}
          task={task}
          modules={state.modules}
          attention={attention}
          onAttentionRefresh={onAttentionRefresh}
          onTaskChange={onTaskChange}
          onOpenEvent={(id) => onEventChange?.(id)}
        />
      ) : (
        <WorkspaceOverview
          program={state.program}
          department={state.department}
          summary={summary}
          onEdit={() => setEditing(true)}
          onTaskChange={onTaskChange}
        />
      )}
    </section>
  );
};
