"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getManagementProgram,
  listEnrollmentRequests,
  listEnrollments,
  listEvents,
  updateProgram,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  ManagementAttention,
  ManagementCockpitView,
  Program,
  ProgramEvent,
} from "@/lib/programs/program-api";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenHeader,
  ScreenLoadingRows,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { EventDetail } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsTask } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";
import {
  hasModule,
  redirectToLoginIfRequired,
  useWorkspaceRouteContext,
} from "./workspace-context";
import {
  TaskUnavailable,
  WorkspaceNavigation,
  WorkspaceOverview,
  WorkspaceTask,
  type WorkspaceSummaryRead,
  type WorkspaceSummaryState,
} from "./workspace-task";

export interface ProgramWorkspaceProps {
  programId: string;
  task?: ProgramsTask;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  /** EVT-01 (#251): management Event deep link under the events or participants task. */
  eventId?: string | null;
  /** NTF-01 (#256): fresh server-shaped attention counts from the shell. */
  attention?: ManagementAttention | null;
  onAttentionRefresh?: () => void;
  onBack: () => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
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
      cockpit?: ManagementCockpitView | null;
    }
  | {
      kind: "error";
      failure: "forbidden" | "unavailable" | "recoverable";
      message: string;
    };

function initialSummary(
  modules: readonly DepartmentModule[] = []
): WorkspaceSummaryState {
  return {
    events: hasModule(modules, "events")
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

async function readSummary<TInput, TValue>(
  operation: Promise<TInput>,
  project: (input: TInput) => TValue
): Promise<WorkspaceSummaryRead<TValue>> {
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
function unavailableSummary<T>(message: string): WorkspaceSummaryRead<T> {
  return { status: "unavailable", message };
}

function lifecycleLabel(value: Program["lifecycle"]): string {
  return value === "Active"
    ? COPY.programs.lifecycleActive
    : value === "Draft"
      ? COPY.programs.lifecycleDraft
      : COPY.programs.lifecycleArchived;
}

function lifecycleTone(value: Program["lifecycle"]): "success" | "neutral" {
  return value === "Active" ? "success" : "neutral";
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

function courseMutationError(caught: unknown): string {
  if (!(caught instanceof RpcError)) {
    return COPY.programs.programTransportAmbiguous;
  }
  if (
    caught.problem.code === "NETWORK_ERROR" ||
    caught.problem.code === "MALFORMED_RESPONSE" ||
    caught.problem.code === "MALFORMED_REQUEST" ||
    caught.problem.code === "UNAVAILABLE"
  ) {
    return COPY.programs.programTransportAmbiguous;
  }
  if (caught.problem.code === "CONFLICT") {
    return COPY.programs.programConflict;
  }
  return errorCopyFor(caught.problem.code, caught.problem.detail);
}

const CourseFacts = ({
  program,
  department,
  notice,
  onBack,
  onEdit,
}: {
  program: Program;
  department: Department | null;
  notice: string | null;
  onBack: () => void;
  onEdit: () => void;
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <ScreenSection
      title={COPY.programs.courseFacts}
      headingId="programs-workspace-facts-title"
      headingRef={headingRef}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
          onClick={onBack}
        >
          {COPY.programs.backToOverview}
        </Button>
      </div>
      {notice !== null && (
        <output
          className="block rounded-[var(--screen-radius-control)] border border-[var(--screen-success)] bg-[var(--screen-success-surface)] p-3 text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
        >
          {notice}
        </output>
      )}
      <ScreenCard>
        <dl className="grid min-w-0 gap-3 [overflow-wrap:anywhere]">
          <div>
            <dt>{COPY.programs.factsName}</dt>
            <dd>{program.name}</dd>
          </div>
          <div>
            <dt>{COPY.programs.factsDepartment}</dt>
            <dd>{department?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>{COPY.programs.factsPurpose}</dt>
            <dd>
              {program.description ?? COPY.programs.programDescriptionEmpty}
            </dd>
          </div>
          <div>
            <dt>{COPY.programs.factsLifecycle}</dt>
            <dd>{lifecycleLabel(program.lifecycle)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.factsDiscoverability}</dt>
            <dd>{discoverabilityLabel(program.discoverability)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.factsEnrollmentMode}</dt>
            <dd>{enrollmentLabel(program.enrollment_mode)}</dd>
          </div>
          <div>
            <dt>{COPY.programs.workspaceBehavior}</dt>
            <dd>{behaviorLabel(program.behavior_type)}</dd>
          </div>
        </dl>
      </ScreenCard>
      {program.capabilities.manage && (
        <Button
          type="button"
          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
          onClick={onEdit}
        >
          {COPY.programs.editTitle}
        </Button>
      )}
    </ScreenSection>
  );
};

const CourseEdit = ({
  program,
  onBack,
  onSaved,
}: {
  program: Program;
  onBack: () => void;
  onSaved: (program: Program) => void;
}) => {
  const [name, setName] = useState(program.name);
  const [purpose, setPurpose] = useState(program.description ?? "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPurpose = purpose.trim();
    if (!trimmedName || !trimmedPurpose) {
      setFormError(COPY.programs.editRequired);
      announce(COPY.programs.editRequired);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const result = await updateProgram(program.program_id, {
        name: trimmedName,
        description: trimmedPurpose,
      });
      if (mounted.current) {
        onSaved(result.program);
      }
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      if (mounted.current) {
        const message = courseMutationError(error);
        setFormError(message);
        announce(message);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const invalidName = formError !== null && !name.trim();
  const invalidPurpose = formError !== null && !purpose.trim();

  return (
    <ScreenSection
      title={COPY.programs.editTitle}
      headingId="programs-workspace-course-edit-title"
      headingRef={headingRef}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
          onClick={onBack}
          aria-label={COPY.programs.backToOverview}
        >
          {COPY.programs.backToOverview}
        </Button>
      </div>
      {formError !== null && (
        <ScreenState
          id="programs-workspace-course-edit-error"
          kind="error"
          title={formError}
        />
      )}
      <ScreenEditor onSubmit={submit} noValidate>
        <ScreenField
          htmlFor="programs-course-name"
          label={COPY.programs.editNameLabel}
        >
          <Input
            id="programs-course-name"
            className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={busy}
            aria-invalid={invalidName || undefined}
            aria-describedby={
              formError !== null
                ? "programs-workspace-course-edit-error"
                : undefined
            }
          />
        </ScreenField>
        <ScreenField
          htmlFor="programs-course-purpose"
          label={COPY.programs.editPurposeLabel}
        >
          <Textarea
            id="programs-course-purpose"
            className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            rows={4}
            required
            disabled={busy}
            aria-invalid={invalidPurpose || undefined}
            aria-describedby={
              formError !== null
                ? "programs-workspace-course-edit-error"
                : undefined
            }
          />
        </ScreenField>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            className="w-fit bg-[var(--screen-accent)] text-white whitespace-normal hover:bg-[var(--screen-accent-deep)]"
            type="submit"
            disabled={busy}
          >
            {busy ? COPY.programs.submitting : COPY.programs.saveCourse}
          </Button>
        </div>
      </ScreenEditor>
    </ScreenSection>
  );
};
export const ProgramWorkspace = ({
  programId,
  task,
  eventId,
  created = false,
  attention = null,
  onAttentionRefresh = () => {},
  onBack,
  onTaskChange,
  onEventChange,
}: ProgramWorkspaceProps) => {
  const { departmentId, hash } = useWorkspaceRouteContext();
  const [summary, setSummary] = useState<WorkspaceSummaryState>(() =>
    initialSummary()
  );
  const [courseView, setCourseView] = useState<"overview" | "facts" | "edit">(
    "overview"
  );
  const [courseProgramOverride, setCourseProgramOverride] =
    useState<Program | null>(null);
  const [courseNotice, setCourseNotice] = useState<string | null>(null);
  const createdFlash = created && courseView === "overview" && !task;
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(
    createdFlash ? COPY.programs.programCreatedNotice : null
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setCourseView("overview");
    setCourseProgramOverride(null);
    setCourseNotice(null);
    setWorkspaceNotice(created ? COPY.programs.programCreatedNotice : null);
  }, [programId]);
  useEffect(() => {
    setCourseView("overview");
    setCourseProgramOverride(null);
    setCourseNotice(null);
    if (task) {
      setWorkspaceNotice(null);
    }
  }, [task]);
  const {
    state,
    run: loadWorkspace,
    retry,
  } = useAsyncResource<
    {
      program: Program;
      department: Department | null;
      modules: DepartmentModule[];
      cockpit?: ManagementCockpitView | null;
    },
    WorkspaceState
  >(
    async () => getManagementProgram(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ program, department, modules, cockpit }) => ({
        kind: "ready",
        program,
        department,
        modules,
        cockpit,
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
    async (modules: readonly DepartmentModule[]) => {
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
      if (!mounted.current) {
        return;
      }
      setSummary({
        events: eventRead,
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
    void loadSummary(state.modules);
  }, [loadSummary, state, task]);
  const openCourseFacts = () => {
    setCourseNotice(null);
    setCourseView("facts");
    announce(COPY.programs.courseFacts);
  };
  const openCourseEdit = () => {
    setCourseNotice(null);
    setCourseView("edit");
    announce(COPY.programs.editTitle);
  };
  const returnToCockpit = () => {
    setCourseNotice(null);
    setCourseView("overview");
    announce(COPY.programs.workspaceTitle);
  };
  const returnToFacts = () => {
    setCourseNotice(null);
    setCourseView("facts");
    announce(COPY.programs.courseFacts);
  };
  const handleCourseSaved = (updatedProgram: Program) => {
    setCourseProgramOverride(updatedProgram);
    setCourseNotice(COPY.programs.courseSaved);
    setCourseView("facts");
    announce(COPY.programs.courseSaved);
  };

  if (state.kind === "loading") {
    return (
      <ScreenLoadingRows
        id="programs-workspace-state"
        tabIndex={-1}
        label={COPY.programs.workspaceLoading}
        density="collection"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ScreenState
        id="programs-workspace-state"
        tabIndex={-1}
        kind={state.failure === "forbidden" ? "forbidden" : "error"}
        title={
          <h2 className="m-0 wrap-anywhere text-base font-bold">
            {state.failure === "forbidden"
              ? COPY.programs.workspaceForbidden
              : state.failure === "unavailable"
                ? COPY.programs.workspaceUnavailable
                : COPY.programs.workspaceLoadError}
          </h2>
        }
        description={state.message}
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              className="w-fit bg-[var(--screen-accent)] text-white whitespace-normal hover:bg-[var(--screen-accent-deep)]"
              type="button"
              onClick={retry}
            >
              {COPY.programs.workspaceRetry}
            </Button>
            <Button
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
              type="button"
              onClick={onBack}
            >
              {COPY.programs.workspaceBack}
            </Button>
          </div>
        }
      />
    );
  }
  const workspaceProgram = courseProgramOverride ?? state.program;
  const canAccessSettings =
    workspaceProgram.capabilities.manage ||
    workspaceProgram.capabilities.leader_assign;
  const canRenderTask =
    task === "settings"
      ? canAccessSettings
      : workspaceProgram.capabilities.manage;
  const focusedSchedule = task === "schedule";

  const handleWorkspaceBack = (event: MouseEvent<HTMLAnchorElement>) => {
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
    if (focusedSchedule) {
      onTaskChange("events");
      return;
    }
    onBack();
  };
  const handleWorkspaceTaskChange = (
    nextTask: ProgramsTask | null,
    nextEventId?: string | null
  ) => {
    setCourseView("overview");
    setCourseNotice(null);
    if (nextEventId === undefined) {
      onTaskChange(nextTask);
    } else {
      onTaskChange(nextTask, nextEventId);
    }
  };

  return (
    <section
      className="grid min-w-0"
      aria-labelledby="programs-workspace-title"
    >
      <ScreenHeader
        headingId="programs-workspace-title"
        level="child"
        title={
          focusedSchedule
            ? COPY.programs.schedulePageTitle
            : workspaceProgram.name
        }
        lead={
          <>
            <span>
              {focusedSchedule
                ? `${workspaceProgram.name} · ${state.department?.name ?? COPY.programs.workspaceDepartment}`
                : state.department
                  ? `${state.department.name} · ${state.department.code}`
                  : COPY.programs.workspaceDepartment}
            </span>
            {!focusedSchedule && (
              <span aria-hidden="true">
                {` · ${behaviorLabel(workspaceProgram.behavior_type)}`}
              </span>
            )}
          </>
        }
        backHref={buildProgramsHref({
          mode: "management",
          programId: focusedSchedule ? programId : null,
          departmentId,
          task: focusedSchedule ? "events" : null,
          hash,
        })}
        backLabel={COPY.programs.workspaceBack}
        onBack={handleWorkspaceBack}
        status={
          focusedSchedule ? undefined : (
            <ScreenStatus tone={lifecycleTone(workspaceProgram.lifecycle)}>
              {lifecycleLabel(workspaceProgram.lifecycle)}
            </ScreenStatus>
          )
        }
        action={
          !focusedSchedule &&
          task === undefined &&
          courseView === "overview" &&
          workspaceProgram.capabilities.manage ? (
            <Button
              className="w-fit bg-[var(--screen-accent)] text-white whitespace-normal hover:bg-[var(--screen-accent-deep)]"
              type="button"
              onClick={openCourseEdit}
            >
              {COPY.programs.cockpitEditProgram}
            </Button>
          ) : undefined
        }
      />

      {workspaceNotice !== null && (
        <output
          className="block rounded-[var(--screen-radius-control)] border border-[var(--screen-success)] bg-[var(--screen-success-surface)] p-3 text-[var(--screen-ink)] [overflow-wrap:anywhere]"
          aria-live="polite"
        >
          {workspaceNotice}
        </output>
      )}
      {!focusedSchedule && (
        <WorkspaceNavigation
          programId={programId}
          task={task}
          modules={state.modules}
          departmentId={departmentId}
          hash={hash}
          canManage={workspaceProgram.capabilities.manage}
          canAccessSettings={canAccessSettings}
          onTaskChange={handleWorkspaceTaskChange}
        />
      )}

      {courseView === "facts" ? (
        <CourseFacts
          program={workspaceProgram}
          department={state.department}
          notice={courseNotice}
          onBack={returnToCockpit}
          onEdit={openCourseEdit}
        />
      ) : courseView === "edit" ? (
        <CourseEdit
          program={workspaceProgram}
          onBack={returnToFacts}
          onSaved={handleCourseSaved}
        />
      ) : task &&
        task === "events" &&
        eventId &&
        workspaceProgram.capabilities.manage ? (
        <EventDetail
          programId={programId}
          eventId={eventId}
          canManage={workspaceProgram.capabilities.manage}
          departmentId={departmentId}
          hash={hash}
          backHref={buildProgramsHref({
            mode: "management",
            programId,
            departmentId,
            task: "events",
            hash,
          })}
          onAttentionRefresh={onAttentionRefresh}
          onBack={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              !onEventChange
            ) {
              return;
            }
            event.preventDefault();
            onEventChange(null);
          }}
        />
      ) : task && canRenderTask ? (
        <WorkspaceTask
          program={workspaceProgram}
          task={task}
          modules={state.modules}
          departmentId={departmentId}
          hash={hash}
          attention={attention}
          onAttentionRefresh={onAttentionRefresh}
          onTaskChange={handleWorkspaceTaskChange}
          onOpenEvent={onEventChange ? (id) => onEventChange(id) : undefined}
        />
      ) : task ? (
        <TaskUnavailable task={task} />
      ) : (
        <WorkspaceOverview
          program={workspaceProgram}
          cockpit={state.cockpit}
          summary={summary}
          onOpenFacts={openCourseFacts}
          departmentId={departmentId}
          hash={hash}
          onTaskChange={handleWorkspaceTaskChange}
        />
      )}
    </section>
  );
};
