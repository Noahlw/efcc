"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { rememberDeepLink } from "@/lib/session";

import { EventDetail } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsTask } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";
import { hasModule, redirectToLoginIfRequired } from "./workspace-context";
import {
  WorkspaceNavigation,
  WorkspaceOverview,
  WorkspaceTask,
  type WorkspaceSummaryRead,
  type WorkspaceSummaryState,
} from "./workspace-task";

import styles from "@/app/programs/programs.module.css";

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
    <section
      className={styles.workspaceSection}
      aria-labelledby="programs-workspace-facts-title"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Button
          type="button"
          className={styles.programDetailBack}
          onClick={onBack}
        >
          {COPY.programs.backToOverview}
        </Button>
        <h4
          id="programs-workspace-facts-title"
          className={styles.workspaceHeading}
          ref={headingRef}
          tabIndex={-1}
        >
          {COPY.programs.courseFacts}
        </h4>
      </div>
      {notice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          {notice}
        </output>
      )}
      <dl className={styles.workspaceFacts}>
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
      {program.capabilities.manage && (
        <Button
          type="button"
          className={styles.secondaryButton}
          onClick={onEdit}
        >
          {COPY.programs.editTitle}
        </Button>
      )}
    </section>
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
    <section
      className={styles.workspaceTask}
      aria-labelledby="programs-workspace-course-edit-title"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Button
          type="button"
          className={styles.programDetailBack}
          onClick={onBack}
          aria-label={COPY.programs.backToOverview}
        >
          {COPY.programs.backToOverview}
        </Button>
        <h4
          id="programs-workspace-course-edit-title"
          className={styles.workspaceHeading}
          ref={headingRef}
          tabIndex={-1}
        >
          {COPY.programs.editTitle}
        </h4>
      </div>
      {formError !== null && (
        <Alert
          className={styles.panelError}
          id="programs-workspace-course-edit-error"
          variant="destructive"
        >
          {formError}
        </Alert>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="programs-course-name">
            {COPY.programs.editNameLabel}
          </label>
          <Input
            id="programs-course-name"
            className={styles.input}
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
        </div>
        <div className={styles.field}>
          <label
            className={styles.fieldLabel}
            htmlFor="programs-course-purpose"
          >
            {COPY.programs.editPurposeLabel}
          </label>
          <Textarea
            id="programs-course-purpose"
            className={styles.textarea}
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
        </div>
        <div className={styles.workspaceActions}>
          <Button className={styles.button} type="submit" disabled={busy}>
            {busy ? COPY.programs.submitting : COPY.programs.saveCourse}
          </Button>
        </div>
      </form>
    </section>
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
      <output
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryState}
        aria-busy="true"
      >
        {COPY.programs.workspaceLoading}
        <Skeleton className="mt-3 h-8 w-full" aria-hidden="true" />
      </output>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert
        id="programs-workspace-state"
        tabIndex={-1}
        className={styles.boundaryError}
        variant="destructive"
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
          <Button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.workspaceRetry}
          </Button>
          <Button
            className={styles.secondaryButton}
            type="button"
            onClick={onBack}
          >
            {COPY.programs.workspaceBack}
          </Button>
        </div>
      </Alert>
    );
  }
  const workspaceProgram = courseProgramOverride ?? state.program;

  return (
    <section
      className={styles.managementWorkspace}
      aria-labelledby="programs-workspace-title"
    >
      <Button
        className={styles.programDetailBack}
        type="button"
        onClick={onBack}
      >
        {COPY.programs.workspaceBack}
      </Button>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceHeaderMain}>
          <h3 id="programs-workspace-title" className={styles.boundaryTitle}>
            {workspaceProgram.name}
          </h3>
          {task === undefined &&
            courseView === "overview" &&
            workspaceProgram.capabilities.manage && (
              <Button
                className={styles.button}
                type="button"
                onClick={openCourseEdit}
              >
                {COPY.programs.cockpitEditProgram}
              </Button>
            )}
        </div>
        <div className={styles.workspaceHeaderMeta}>
          <Badge
            className={`${styles.directoryStatus} ${styles.workspaceDepartmentBadge}`}
            variant="outline"
          >
            {state.department
              ? `${state.department.name} · ${state.department.code}`
              : COPY.programs.workspaceDepartment}
          </Badge>
          <Badge
            className={`${styles.directoryStatus} ${styles[`directoryStatus${workspaceProgram.lifecycle}`]}`}
            variant={
              workspaceProgram.lifecycle === "Active" ? "default" : "outline"
            }
          >
            {lifecycleLabel(workspaceProgram.lifecycle)}
          </Badge>
        </div>
      </header>

      {workspaceNotice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          {workspaceNotice}
        </output>
      )}
      {task && (
        <WorkspaceNavigation
          programId={programId}
          task={task}
          modules={state.modules}
          onTaskChange={(nextTask) => {
            setCourseView("overview");
            setCourseNotice(null);
            onTaskChange(nextTask);
          }}
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
      ) : task && task === "events" && eventId ? (
        <EventDetail
          programId={programId}
          eventId={eventId}
          canManage={workspaceProgram.capabilities.manage}
          backHref={buildProgramsHref({
            mode: "management",
            programId,
            task: "events",
          })}
          onAttentionRefresh={onAttentionRefresh}
          onBack={() => onEventChange?.(null)}
        />
      ) : task ? (
        <WorkspaceTask
          program={workspaceProgram}
          task={task}
          modules={state.modules}
          attention={attention}
          onAttentionRefresh={onAttentionRefresh}
          onTaskChange={(nextTask, nextEventId) => {
            setCourseView("overview");
            setCourseNotice(null);
            if (nextEventId === undefined) {
              onTaskChange(nextTask);
            } else {
              onTaskChange(nextTask, nextEventId);
            }
          }}
          onOpenEvent={(id) => onEventChange?.(id)}
        />
      ) : (
        <WorkspaceOverview
          program={workspaceProgram}
          cockpit={state.cockpit}
          summary={summary}
          onOpenFacts={openCourseFacts}
          onTaskChange={onTaskChange}
        />
      )}
    </section>
  );
};
