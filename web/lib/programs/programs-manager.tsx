"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
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

const styles = {
  form: "grid min-w-0 gap-4",
  field: "grid min-w-0 gap-1.5",
  fieldLabel: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  input:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  textarea:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  select:
    "min-h-11 min-w-0 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]",
  button:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  card: "grid min-w-0 gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-5",
  cardTitle:
    "m-0 min-w-0 text-xl font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]",
  stateCenter: "grid min-w-0 gap-3 p-4 [overflow-wrap:anywhere]",
  error:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  cardLead:
    "m-0 max-w-prose text-base leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  notice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  sectionLabel:
    "m-0 text-sm font-bold uppercase tracking-[0.08em] text-[var(--ink-muted)]",
  deptList: "m-0 grid list-none gap-3 p-0",
  deptRow:
    "flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 [overflow-wrap:anywhere]",
  deptName: "m-0 min-w-0 text-base font-extrabold [overflow-wrap:anywhere]",
  deptCode: "mt-1 text-sm text-[var(--ink-muted)]",
  deptItem: "min-w-0 overflow-hidden rounded-lg border border-[var(--line)]",
  deptActions: "flex min-w-0 flex-wrap items-center gap-2",
  badge: "shrink-0 whitespace-normal",
  badgeActive: "border-transparent bg-[var(--accent)] text-white",
  toggle:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-3 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  detail: "grid min-w-0 gap-4 p-4",
  moduleSection:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4",
  moduleRow:
    "flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0",
  moduleName: "min-w-0 text-sm [overflow-wrap:anywhere]",
  toggleOn: "border-[var(--success-border)] bg-[var(--success-surface)]",
  programList: "m-0 grid min-w-0 list-none gap-2 p-0",
  programItem: "min-w-0 rounded-lg border border-[var(--line)]",
  programSummary:
    "flex min-w-0 flex-wrap items-center justify-between gap-3 p-3 [overflow-wrap:anywhere]",
  programName: "m-0 min-w-0 font-bold [overflow-wrap:anywhere]",
  programMeta: "mt-2 flex min-w-0 flex-wrap gap-2",
  tag: "rounded-full border border-[var(--line)] px-2 py-1 text-xs text-[var(--ink-muted)]",
  programDetail: "grid min-w-0 gap-4 border-t border-[var(--line)] p-4",
  taskNav: "flex min-w-0 flex-wrap gap-2",
  taskButton:
    "min-h-11 min-w-11 rounded-lg border border-[var(--line-strong)] bg-transparent px-3 py-2 text-[var(--ink)] whitespace-normal aria-pressed:bg-[var(--accent)] aria-pressed:text-white",
  programOverview:
    "grid min-w-0 gap-2 text-sm leading-6 [overflow-wrap:anywhere]",
  programOverviewMeta:
    "m-0 text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  panelHeading:
    "m-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
} as const;

type View =
  | { kind: "loading" }
  | { kind: "ready"; departments: Department[] }
  | { kind: "error"; message: string };

type ProgramFormValues = ProgramInput;
type ProgramTask = "overview" | "edit" | "events" | "enrollment";

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
        <Input
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
        <Textarea
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
        <Input
          name="category"
          className={styles.input}
          defaultValue={initial?.category ?? ""}
        />
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.behaviorType}
        <Select
          name="behavior_type"
          defaultValue={initial?.behavior_type ?? "Recurring"}
          disabled={initial !== undefined}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={COPY.programs.behaviorType}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Recurring">
              {COPY.programs.behaviorRecurring}
            </SelectItem>
            <SelectItem value="OneOff">
              {COPY.programs.behaviorOneOff}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programLifecycle}
        <Select
          name="lifecycle"
          defaultValue={initial?.lifecycle ?? "Draft"}
          disabled={initial?.lifecycle === "Archived"}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={COPY.programs.programLifecycle}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Draft">
              {COPY.programs.lifecycleDraft}
            </SelectItem>
            <SelectItem value="Active">
              {COPY.programs.lifecycleActive}
            </SelectItem>
            <SelectItem value="Archived">
              {COPY.programs.lifecycleArchived}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.discoverabilityListed}
        <Select
          name="discoverability"
          defaultValue={initial?.discoverability ?? "Unlisted"}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={COPY.programs.discoverabilityListed}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Unlisted">
              {COPY.programs.discoverabilityUnlisted}
            </SelectItem>
            <SelectItem value="Listed">
              {COPY.programs.discoverabilityListed}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programEnrollmentMode}
        <Select
          name="enrollment_mode"
          defaultValue={initial?.enrollment_mode ?? "MemberRequest"}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={COPY.programs.programEnrollmentMode}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MemberRequest">
              {COPY.programs.enrollmentModeMemberRequest}
            </SelectItem>
            <SelectItem value="ManagerOnly">
              {COPY.programs.enrollmentModeManagerOnly}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {COPY.programs.programDisplayOrder}
        <Input
          name="display_order"
          className={styles.input}
          type="number"
          min={0}
          step={1}
          defaultValue={initial?.display_order ?? 0}
        />
      </label>
    </div>
    <Button className={styles.button} type="submit" disabled={busy}>
      {busy ? COPY.programs.submitting : submitLabel}
    </Button>
  </form>
);

const ProgramsManager = () => {
  const { bootstrap } = useApp();
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
          <Skeleton className="mt-3 h-8 w-full" aria-hidden="true" />
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
          <Alert className={styles.error} variant="destructive">
            {view.message}
          </Alert>
          <Button
            className={styles.retry}
            type="button"
            onClick={() => void load()}
          >
            {COPY.error.retry}
          </Button>
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
        <Alert className={styles.error} variant="destructive">
          {actionError}
        </Alert>
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
                    <Badge
                      className={`${styles.badge} ${department.lifecycle === "Active" ? styles.badgeActive : ""}`}
                      variant={
                        department.lifecycle === "Active"
                          ? "default"
                          : "outline"
                      }
                    >
                      {DEPARTMENT_LIFECYCLE_LABEL[department.lifecycle]}
                    </Badge>
                    {department.capabilities.publish &&
                      department.lifecycle !== "Active" &&
                      department.lifecycle !== "Archived" && (
                        <Button
                          className={styles.toggle}
                          type="button"
                          disabled={busy}
                          onClick={() => void handlePublish(department)}
                        >
                          {COPY.programs.lifecycleActive}
                        </Button>
                      )}
                    <Button
                      className={styles.toggle}
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        void toggleDepartment(department.department_id)
                      }
                    >
                      {isOpen ? COPY.programs.collapse : COPY.programs.expand}
                    </Button>
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
                              <Button
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
                              </Button>
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
                                <Button
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
                                </Button>
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
                                    ].map(({ task, label, enabled }) =>
                                      enabled ? (
                                        <Button
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
                                        </Button>
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
    </section>
  );
};

export { ProgramsManager };
