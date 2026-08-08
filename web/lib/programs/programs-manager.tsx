"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentModule,
  Program,
} from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

type View =
  | { kind: "loading" }
  | { kind: "ready"; departments: Department[] }
  | { kind: "error"; message: string };

const LIFECYCLE_LABEL: Record<Department["lifecycle"], string> = {
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

const ProgramsManager = () => {
  const { bootstrap } = useApp();
  const canManage =
    bootstrap.profile.role === "Admin" || bootstrap.profile.role === "Staff";

  const [view, setView] = useState<View>({ kind: "loading" });
  const [expanded, setExpanded] = useState<
    Record<string, DepartmentModule[] | null>
  >({});
  const [programs, setPrograms] = useState<Record<string, Program[] | null>>(
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
      if (!mounted.current) {
        return;
      }
      setView({ kind: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expand = useCallback(
    async (departmentId: string) => {
      setExpanded((prev) => ({
        ...prev,
        [departmentId]: prev[departmentId] ?? null,
      }));
      if (expanded[departmentId] !== undefined) {
        return;
      }
      try {
        const [detail, programRows] = await Promise.all([
          getDepartment(departmentId),
          listPrograms(departmentId),
        ]);
        if (!mounted.current) {
          return;
        }
        setExpanded((prev) => ({ ...prev, [departmentId]: detail.modules }));
        setPrograms((prev) => ({
          ...prev,
          [departmentId]: programRows.programs,
        }));
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setNotice(errorMessage(error));
      }
    },
    [expanded]
  );

  const handleCreateDepartment = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
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
      await createDepartment({ code, name });
      if (!mounted.current) {
        return;
      }
      announce(COPY.programs.created);
      setNotice(COPY.programs.created);
      form.reset();
      await load();
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const handleCreateProgram = async (
    departmentId: string,
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await createProgram(departmentId, {
        name,
        behavior_type:
          data.get("behavior_type") === "OneOff" ? "OneOff" : "Recurring",
        discoverability:
          data.get("discoverability") === "Listed" ? "Listed" : "Unlisted",
      });
      if (!mounted.current) {
        return;
      }
      announce(COPY.programs.created);
      setNotice(COPY.programs.created);
      form.reset();
      const { programs: rows } = await listPrograms(departmentId);
      if (!mounted.current) {
        return;
      }
      setPrograms((prev) => ({ ...prev, [departmentId]: rows }));
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
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
      if (!mounted.current) {
        return;
      }
      announce(COPY.programs.updated);
      setNotice(COPY.programs.updated);
      await load();
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
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
      if (!mounted.current) {
        return;
      }
      announce(COPY.programs.updated);
      setNotice(COPY.programs.updated);
      const detail = await getDepartment(departmentId);
      if (!mounted.current) {
        return;
      }
      setExpanded((prev) => ({ ...prev, [departmentId]: detail.modules }));
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
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
          <p>{COPY.nav.loading}</p>
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
          <p>{view.message}</p>
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

      {notice !== null && <output className={styles.notice}>{notice}</output>}
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
            const isOpen = expanded[department.department_id] !== undefined;
            const modules = expanded[department.department_id] ?? null;
            const rows = programs[department.department_id] ?? null;
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
                      {LIFECYCLE_LABEL[department.lifecycle]}
                    </span>
                    {canManage &&
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
                      onClick={() => void expand(department.department_id)}
                    >
                      {isOpen ? COPY.programs.collapse : COPY.programs.expand}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.detail}>
                    {canManage && (
                      <>
                        <h3 className={styles.sectionLabel}>
                          {COPY.programs.modules}
                        </h3>
                        {modules === null ? (
                          <p>{COPY.nav.loading}</p>
                        ) : (
                          modules.map((module) => (
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
                      </>
                    )}

                    <h3 className={styles.sectionLabel}>
                      {COPY.programs.programs}
                    </h3>
                    {rows === null ? (
                      <p>{COPY.nav.loading}</p>
                    ) : rows.length === 0 ? (
                      <p className={styles.moduleName}>
                        {COPY.programs.noPrograms}
                      </p>
                    ) : (
                      <ul className={styles.programList}>
                        {rows.map((program) => (
                          <li
                            key={program.program_id}
                            className={styles.programItem}
                          >
                            <p className={styles.programName}>{program.name}</p>
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
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {canManage && (
                      <form
                        className={styles.form}
                        onSubmit={(event) =>
                          void handleCreateProgram(
                            department.department_id,
                            event
                          )
                        }
                      >
                        <div className={styles.field}>
                          <label
                            className={styles.fieldLabel}
                            htmlFor={`program-name-${department.department_id}`}
                          >
                            {COPY.programs.programName}
                          </label>
                          <input
                            id={`program-name-${department.department_id}`}
                            name="name"
                            className={styles.input}
                            placeholder={COPY.programs.programNamePlaceholder}
                            required
                          />
                        </div>
                        <div className={styles.field}>
                          <label
                            className={styles.fieldLabel}
                            htmlFor={`behavior-${department.department_id}`}
                          >
                            {COPY.programs.behaviorType}
                          </label>
                          <select
                            id={`behavior-${department.department_id}`}
                            name="behavior_type"
                            className={styles.select}
                          >
                            <option value="Recurring">
                              {COPY.programs.behaviorRecurring}
                            </option>
                            <option value="OneOff">
                              {COPY.programs.behaviorOneOff}
                            </option>
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label
                            className={styles.fieldLabel}
                            htmlFor={`disc-${department.department_id}`}
                          >
                            {COPY.programs.discoverabilityListed}
                          </label>
                          <select
                            id={`disc-${department.department_id}`}
                            name="discoverability"
                            className={styles.select}
                          >
                            <option value="Unlisted">
                              {COPY.programs.discoverabilityUnlisted}
                            </option>
                            <option value="Listed">
                              {COPY.programs.discoverabilityListed}
                            </option>
                          </select>
                        </div>
                        <button
                          className={styles.button}
                          type="submit"
                          disabled={busy}
                        >
                          {busy
                            ? COPY.programs.submitting
                            : COPY.programs.createProgram}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreateDepartment(event)}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="dept-code">
              {COPY.programs.deptCode}
            </label>
            <input
              id="dept-code"
              name="code"
              className={styles.input}
              placeholder={COPY.programs.deptCodePlaceholder}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="dept-name">
              {COPY.programs.deptName}
            </label>
            <input
              id="dept-name"
              name="name"
              className={styles.input}
              placeholder={COPY.programs.deptNamePlaceholder}
              required
            />
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
