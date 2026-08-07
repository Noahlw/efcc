"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  createDepartment,
  createProgram,
  getDepartment,
  listDepartments,
  listPrograms,
  setDepartmentModule,
  updateDepartment,
  updateProgram,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  Program,
  ProgramInput,
} from "@/lib/programs/program-api";
import { EnrollmentPanel } from "@/lib/programs/programs-enrollment-panel";
import { EventsPanel } from "@/lib/programs/programs-events-panel";
import { LeadersPanel } from "@/lib/programs/programs-leaders-panel";

import styles from "@/app/programs/programs.module.css";

type View =
  | { kind: "loading" }
  | { kind: "ready"; departments: Department[] }
  | { kind: "error"; message: string };

type ProgramFormValues = ProgramInput;
type ProgramTask = "overview" | "edit" | "events" | "enrollment" | "leaders";

const LIFECYCLE_LABEL: Record<Program["lifecycle"], string> = {
  Draft: COPY.programs.lifecycleDraft,
  Active: COPY.programs.lifecycleActive,
  Archived: COPY.programs.lifecycleArchived,
};

const DEPARTMENT_LIFECYCLE_LABEL: Record<Department["lifecycle"], string> = {
  Draft: COPY.programs.lifecycleDraft,
  PendingDevelopment: COPY.programs.lifecyclePending,
  Active: COPY.programs.lifecycleActive,
  Archived: COPY.programs.lifecycleArchived,
};

const MODULE_LABEL: Record<DepartmentModule["module_key"], string> = {
  program_catalog: COPY.programs.moduleProgramCatalog,
  enrollment: COPY.programs.moduleEnrollment,
  events: COPY.programs.moduleEvents,
  attendance: COPY.programs.moduleAttendance,
  custom_forms: COPY.programs.moduleCustomForms,
};

function errorMessage(err: unknown): string {
  return err instanceof RpcError
    ? errorCopyFor(err.problem.code)
    : COPY.error.networkError;
}

function readProgramForm(
  form: HTMLFormElement,
  initialBehaviorType?: Program["behavior_type"]
): ProgramFormValues {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? "").trim(),
    description: String(data.get("description") ?? "").trim() || undefined,
    category: String(data.get("category") ?? "").trim() || undefined,
    behavior_type:
      data.get("behavior_type") === "OneOff"
        ? "OneOff"
        : (initialBehaviorType ?? "Recurring"),
    lifecycle:
      data.get("lifecycle") === "Active"
        ? "Active"
        : data.get("lifecycle") === "Archived"
          ? "Archived"
          : "Draft",
    discoverability:
      data.get("discoverability") === "Listed" ? "Listed" : "Unlisted",
    enrollment_mode:
      data.get("enrollment_mode") === "ManagerOnly"
        ? "ManagerOnly"
        : "MemberRequest",
    display_order: Math.max(0, Number(data.get("display_order") ?? 0)),
  };
}

const ProgramForm = ({
  initial,
  busy,
  onSubmit,
  submitLabel,
}: {
  initial?: Program;
  busy: boolean;
  onSubmit: (values: ProgramFormValues, form: HTMLFormElement) => void;
  submitLabel: string;
}) => (
  <form
    className={styles.form}
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit(
        readProgramForm(event.currentTarget, initial?.behavior_type),
        event.currentTarget
      );
    }}
  >
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programName}
        <input
          name="name"
          className={styles.input}
          defaultValue={initial?.name ?? ""}
          placeholder={COPY.programs.programNamePlaceholder}
          required
        />
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programDescription}
        <textarea
          name="description"
          className={styles.textarea}
          defaultValue={initial?.description ?? ""}
          rows={2}
        />
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programCategory}
        <input
          name="category"
          className={styles.input}
          defaultValue={initial?.category ?? ""}
        />
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.behaviorType}
        <select
          name="behavior_type"
          className={styles.select}
          defaultValue={initial?.behavior_type ?? "Recurring"}
          disabled={initial !== undefined}
        >
          <option value="Recurring">{COPY.programs.behaviorRecurring}</option>
          <option value="OneOff">{COPY.programs.behaviorOneOff}</option>
        </select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programLifecycle}
        <select
          name="lifecycle"
          className={styles.select}
          defaultValue={initial?.lifecycle ?? "Draft"}
          disabled={initial?.lifecycle === "Archived"}
        >
          <option value="Draft">{COPY.programs.lifecycleDraft}</option>
          <option value="Active">{COPY.programs.lifecycleActive}</option>
          <option value="Archived">{COPY.programs.lifecycleArchived}</option>
        </select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.discoverabilityListed}
        <select
          name="discoverability"
          className={styles.select}
          defaultValue={initial?.discoverability ?? "Unlisted"}
        >
          <option value="Unlisted">
            {COPY.programs.discoverabilityUnlisted}
          </option>
          <option value="Listed">{COPY.programs.discoverabilityListed}</option>
        </select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programEnrollmentMode}
        <select
          name="enrollment_mode"
          className={styles.select}
          defaultValue={initial?.enrollment_mode ?? "MemberRequest"}
        >
          <option value="MemberRequest">
            {COPY.programs.enrollmentModeMemberRequest}
          </option>
          <option value="ManagerOnly">
            {COPY.programs.enrollmentModeManagerOnly}
          </option>
        </select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programDisplayOrder}
        <input
          name="display_order"
          className={styles.input}
          type="number"
          min={0}
          step={1}
          defaultValue={initial?.display_order ?? 0}
        />
      </label>
    </div>
    <button className={styles.button} type="submit" disabled={busy}>
      {busy ? COPY.programs.submitting : submitLabel}
    </button>
  </form>
);

const ProgramsManager = () => {
  const { bootstrap } = useApp();
  const canCreateDepartment =
    bootstrap.profile.role === "Admin" || bootstrap.profile.role === "Staff";
  const [view, setView] = useState<View>({ kind: "loading" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modules, setModules] = useState<
    Record<string, DepartmentModule[] | null>
  >({});
  const [programs, setPrograms] = useState<Record<string, Program[] | null>>(
    {}
  );
  const [programTasks, setProgramTasks] = useState<Record<string, ProgramTask>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const { departments } = await listDepartments();
      if (!mounted.current) {
        return;
      }
      setView({ kind: "ready", departments });
    } catch (error) {
      if (mounted.current) {
        setView({ kind: "error", message: errorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDepartment = useCallback(async (departmentId: string) => {
    try {
      const [detail, programRows] = await Promise.all([
        getDepartment(departmentId),
        listPrograms(departmentId),
      ]);
      if (!mounted.current) {
        return;
      }
      setModules((prev) => ({ ...prev, [departmentId]: detail.modules }));
      setPrograms((prev) => ({
        ...prev,
        [departmentId]: programRows.programs,
      }));
    } catch (error) {
      if (mounted.current) {
        setExpanded((prev) => ({ ...prev, [departmentId]: false }));
        setActionError(errorMessage(error));
      }
    }
  }, []);

  const toggleDepartment = useCallback(
    async (departmentId: string) => {
      if (expanded[departmentId]) {
        setExpanded((prev) => ({ ...prev, [departmentId]: false }));
        return;
      }
      setExpanded((prev) => ({ ...prev, [departmentId]: true }));
      if (
        Object.hasOwn(modules, departmentId) &&
        Object.hasOwn(programs, departmentId)
      ) {
        return;
      }
      await loadDepartment(departmentId);
    },
    [expanded, loadDepartment, modules, programs]
  );

  const handleCreateDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const code = String(data.get("code") ?? "").trim();
    const name = String(data.get("name") ?? "").trim();
    if (!code || !name) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await createDepartment({ code, name, lifecycle: "Draft" });
      announce(COPY.programs.created);
      setNotice(COPY.programs.created);
      form.reset();
      await load();
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handleCreateProgram = async (
    departmentId: string,
    values: ProgramFormValues,
    form: HTMLFormElement
  ) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await createProgram(departmentId, values);
      announce(COPY.programs.created);
      setNotice(COPY.programs.created);
      form.reset();
      await loadDepartment(departmentId);
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handleUpdateProgram = async (
    program: Program,
    values: ProgramFormValues
  ) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const { program: updated } = await updateProgram(program.program_id, {
        ...values,
        description: values.description ?? null,
        category: values.category ?? null,
      });
      if (!mounted.current) {
        return;
      }
      setPrograms((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([departmentId, rows]) => [
            departmentId,
            rows?.map((row) =>
              row.program_id === updated.program_id ? updated : row
            ) ?? null,
          ])
        )
      );
      announce(COPY.programs.updated);
      setNotice(COPY.programs.updated);
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handlePublish = async (department: Department) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await updateDepartment(department.department_id, { lifecycle: "Active" });
      announce(COPY.programs.updated);
      setNotice(COPY.programs.updated);
      await load();
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handleToggleModule = async (
    departmentId: string,
    moduleKey: DepartmentModule["module_key"],
    enabled: number
  ) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await setDepartmentModule(departmentId, moduleKey, enabled === 0);
      announce(COPY.programs.updated);
      setNotice(COPY.programs.updated);
      await loadDepartment(departmentId);
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  if (view.kind === "loading") {
    return (
      <section
        className={styles.card}
        aria-busy="true"
        aria-labelledby="programs-title"
      >
        <h1 id="programs-title" className={styles.cardTitle}>
          {COPY.programs.pageTitle}
        </h1>
        <div className={styles.stateCenter}>
          <p aria-live="polite">{COPY.nav.loading}</p>
        </div>
      </section>
    );
  }

  if (view.kind === "error") {
    return (
      <section className={styles.card} aria-labelledby="programs-title">
        <h1 id="programs-title" className={styles.cardTitle}>
          {COPY.programs.pageTitle}
        </h1>
        <div className={styles.stateCenter}>
          <p role="alert">{view.message}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => void load()}
          >
            {COPY.error.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="programs-title">
      <h1 id="programs-title" className={styles.cardTitle}>
        {COPY.programs.pageTitle}
      </h1>
      <p className={styles.cardLead}>{COPY.programs.lead}</p>

      {notice !== null && (
        <output className={styles.notice} aria-live="polite">
          {notice}
        </output>
      )}
      {actionError !== null && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      <h2 className={styles.sectionLabel}>{COPY.programs.departments}</h2>
      {view.departments.length === 0 ? (
        <p className={styles.stateCenter}>{COPY.programs.noDepartments}</p>
      ) : (
        <ul className={styles.deptList}>
          {view.departments.map((department) => {
            const isOpen = expanded[department.department_id] === true;
            const departmentModules = modules[department.department_id] ?? null;
            const departmentPrograms =
              programs[department.department_id] ?? null;
            const catalogEnabled = departmentModules?.some(
              (module) =>
                module.module_key === "program_catalog" && module.enabled === 1
            );
            const eventsEnabled = departmentModules?.some(
              (module) => module.module_key === "events" && module.enabled === 1
            );
            const enrollmentEnabled = departmentModules?.some(
              (module) =>
                module.module_key === "enrollment" && module.enabled === 1
            );
            return (
              <li key={department.department_id} className={styles.deptItem}>
                <div className={styles.deptRow}>
                  <div>
                    <p className={styles.deptName}>{department.name}</p>
                    <p className={styles.deptCode}>{department.code}</p>
                  </div>
                  <div className={styles.deptActions}>
                    <span
                      className={`${styles.badge} ${department.lifecycle === "Active" ? styles.badgeActive : ""}`}
                    >
                      {DEPARTMENT_LIFECYCLE_LABEL[department.lifecycle]}
                    </span>
                    {department.capabilities.publish &&
                      department.lifecycle !== "Active" &&
                      department.lifecycle !== "Archived" && (
                        <button
                          className={styles.toggle}
                          type="button"
                          disabled={busy}
                          onClick={() => void handlePublish(department)}
                        >
                          {COPY.programs.lifecycleActive}
                        </button>
                      )}
                    <button
                      className={styles.toggle}
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        void toggleDepartment(department.department_id)
                      }
                    >
                      {isOpen ? COPY.programs.collapse : COPY.programs.expand}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.detail}>
                    {department.capabilities.module_configure && (
                      <section className={styles.moduleSection}>
                        <h3 className={styles.sectionLabel}>
                          {COPY.programs.modules}
                        </h3>
                        {departmentModules === null ? (
                          <p aria-live="polite">{COPY.nav.loading}</p>
                        ) : (
                          departmentModules.map((module) => (
                            <div
                              key={module.module_key}
                              className={styles.moduleRow}
                            >
                              <span className={styles.moduleName}>
                                {MODULE_LABEL[module.module_key]}
                              </span>
                              <button
                                className={`${styles.toggle} ${module.enabled === 1 ? styles.toggleOn : ""}`}
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void handleToggleModule(
                                    department.department_id,
                                    module.module_key,
                                    module.enabled
                                  )
                                }
                              >
                                {module.enabled === 1
                                  ? COPY.programs.disable
                                  : COPY.programs.enable}
                              </button>
                            </div>
                          ))
                        )}
                      </section>
                    )}

                    <h3 className={styles.sectionLabel}>
                      {COPY.programs.programs}
                    </h3>
                    {departmentModules === null ? (
                      <p aria-live="polite">{COPY.nav.loading}</p>
                    ) : catalogEnabled === false ? (
                      <p className={styles.moduleName}>
                        {COPY.programs.moduleDisabled}
                      </p>
                    ) : departmentPrograms === null ? (
                      <p aria-live="polite">{COPY.nav.loading}</p>
                    ) : departmentPrograms.length === 0 ? (
                      <p className={styles.moduleName}>
                        {COPY.programs.noPrograms}
                      </p>
                    ) : (
                      <ul className={styles.programList}>
                        {departmentPrograms.map((program) => {
                          const activeTask =
                            programTasks[program.program_id] ?? "overview";
                          const detailOpen = Object.hasOwn(
                            programTasks,
                            program.program_id
                          );
                          return (
                            <li
                              key={program.program_id}
                              className={styles.programItem}
                            >
                              <div className={styles.programSummary}>
                                <div>
                                  <p className={styles.programName}>
                                    {program.name}
                                  </p>
                                  <div className={styles.programMeta}>
                                    <span className={styles.tag}>
                                      {program.behavior_type === "Recurring"
                                        ? COPY.programs.behaviorRecurring
                                        : COPY.programs.behaviorOneOff}
                                    </span>
                                    <span className={styles.tag}>
                                      {program.discoverability === "Listed"
                                        ? COPY.programs.discoverabilityListed
                                        : COPY.programs.discoverabilityUnlisted}
                                    </span>
                                    <span className={styles.tag}>
                                      {LIFECYCLE_LABEL[program.lifecycle]}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  className={styles.toggle}
                                  type="button"
                                  aria-expanded={detailOpen}
                                  onClick={() =>
                                    setProgramTasks((prev) => {
                                      const next = { ...prev };
                                      if (detailOpen) {
                                        return Object.fromEntries(
                                          Object.entries(next).filter(
                                            ([key]) =>
                                              key !== program.program_id
                                          )
                                        );
                                      }
                                      next[program.program_id] = "overview";
                                      return next;
                                    })
                                  }
                                >
                                  {detailOpen
                                    ? COPY.programs.collapse
                                    : COPY.programs.programDetails}
                                </button>
                              </div>
                              {detailOpen && (
                                <div className={styles.programDetail}>
                                  <nav
                                    className={styles.taskNav}
                                    aria-label={COPY.programs.programTasks}
                                  >
                                    {[
                                      {
                                        task: "overview" as const,
                                        label: COPY.programs.programOverview,
                                        enabled: true,
                                      },
                                      {
                                        task: "edit" as const,
                                        label: COPY.programs.programEdit,
                                        enabled: program.capabilities.manage,
                                      },
                                      {
                                        task: "events" as const,
                                        label: COPY.programs.programEvents,
                                        enabled: eventsEnabled,
                                      },
                                      {
                                        task: "enrollment" as const,
                                        label: COPY.programs.programEnrollment,
                                        enabled: enrollmentEnabled,
                                      },
                                      {
                                        task: "leaders" as const,
                                        label: COPY.programs.programLeaders,
                                        enabled:
                                          program.capabilities.leader_assign,
                                      },
                                    ].map(({ task, label, enabled }) =>
                                      enabled ? (
                                        <button
                                          key={task}
                                          type="button"
                                          className={styles.taskButton}
                                          aria-pressed={activeTask === task}
                                          onClick={() =>
                                            setProgramTasks((prev) => ({
                                              ...prev,
                                              [program.program_id]: task,
                                            }))
                                          }
                                        >
                                          {label}
                                        </button>
                                      ) : null
                                    )}
                                  </nav>
                                  {activeTask === "overview" && (
                                    <div className={styles.programOverview}>
                                      <p>
                                        {program.description ??
                                          COPY.programs.programDescriptionEmpty}
                                      </p>
                                      {program.category && (
                                        <p
                                          className={styles.programOverviewMeta}
                                        >
                                          {COPY.programs.programCategory}:{" "}
                                          {program.category}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {activeTask === "edit" &&
                                    program.capabilities.manage && (
                                      <>
                                        <h4 className={styles.panelHeading}>
                                          {COPY.programs.editProgram}
                                        </h4>
                                        <ProgramForm
                                          key={`${program.program_id}-${program.updated_at}`}
                                          initial={program}
                                          busy={busy}
                                          submitLabel={
                                            COPY.programs.saveProgram
                                          }
                                          onSubmit={(values) =>
                                            void handleUpdateProgram(
                                              program,
                                              values
                                            )
                                          }
                                        />
                                      </>
                                    )}
                                  {activeTask === "events" && eventsEnabled && (
                                    <EventsPanel
                                      program={program}
                                      canManage={program.capabilities.manage}
                                    />
                                  )}
                                  {activeTask === "enrollment" &&
                                    enrollmentEnabled && (
                                      <EnrollmentPanel
                                        program={program}
                                        canManage={program.capabilities.manage}
                                        currentUserId={bootstrap.profile.userId}
                                      />
                                    )}
                                  {activeTask === "leaders" &&
                                    program.capabilities.leader_assign && (
                                      <LeadersPanel
                                        program={program}
                                        canManage
                                      />
                                    )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {department.capabilities.manage && catalogEnabled && (
                      <>
                        <h3 className={styles.sectionLabel}>
                          {COPY.programs.createProgram}
                        </h3>
                        <ProgramForm
                          busy={busy}
                          submitLabel={COPY.programs.createProgram}
                          onSubmit={(values, form) =>
                            void handleCreateProgram(
                              department.department_id,
                              values,
                              form
                            )
                          }
                        />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canCreateDepartment && (
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreateDepartment(event)}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              {COPY.programs.deptCode}
              <input
                name="code"
                className={styles.input}
                placeholder={COPY.programs.deptCodePlaceholder}
                required
              />
            </label>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              {COPY.programs.deptName}
              <input
                name="name"
                className={styles.input}
                placeholder={COPY.programs.deptNamePlaceholder}
                required
              />
            </label>
          </div>
          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? COPY.programs.submitting : COPY.programs.createDepartment}
          </button>
        </form>
      )}
    </section>
  );
};

export { ProgramsManager };
