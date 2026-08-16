"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getDepartment,
  listDepartmentManagers,
  setDepartmentModule,
  updateDepartment,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentDetail,
  DepartmentManager,
} from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

const MODULE_LABEL: Record<
  DepartmentDetail["modules"][number]["module_key"],
  string
> = {
  program_catalog: COPY.programs.moduleProgramCatalog,
  enrollment: COPY.programs.moduleEnrollment,
  events: COPY.programs.moduleEvents,
  attendance: COPY.programs.moduleAttendance,
  custom_forms: COPY.programs.moduleCustomForms,
};

export const DepartmentSettingsPanel = ({
  department,
  onClose,
  onOpenManagerPicker,
}: {
  department: Department;
  onClose: () => void;
  onOpenManagerPicker?: () => void;
}) => {
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [managers, setManagers] = useState<DepartmentManager[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setDetail(null);
    setManagers(null);
    setActionError(null);
    try {
      const [nextDetail, nextManagers] = await Promise.all([
        getDepartment(department.department_id),
        department.capabilities.manager_assign
          ? listDepartmentManagers(department.department_id)
          : Promise.resolve({ managers: [] }),
      ]);
      if (!mounted.current) {
        return;
      }
      setDetail(nextDetail);
      setManagers(nextManagers.managers);
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    }
  }, [department.capabilities.manager_assign, department.department_id]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const runAction = async (
    operation: () => Promise<unknown>,
    message: string
  ) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await operation();
      await load();
      if (!mounted.current) {
        return;
      }
      setNotice(message);
      announce(message);
    } catch (error) {
      if (mounted.current) {
        const mappedMessage = errorMessage(error);
        setActionError(mappedMessage);
        announce(mappedMessage);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const saveDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void runAction(
      () =>
        updateDepartment(department.department_id, {
          name: String(data.get("name") ?? "").trim(),
          description: String(data.get("description") ?? "").trim(),
        }),
      COPY.programs.updated
    );
  };

  return (
    <section
      id={`${department.department_id}-settings-panel`}
      tabIndex={-1}
      className={styles.moduleSection}
      aria-labelledby={`${department.department_id}-settings-heading`}
    >
      <div className={styles.programSummary}>
        <div>
          <h3
            id={`${department.department_id}-settings-heading`}
            className={styles.sectionLabel}
          >
            {COPY.programs.departmentSettings}: {department.name}
          </h3>
        </div>
        <button className={styles.toggle} type="button" onClick={onClose}>
          {COPY.programs.collapse}
        </button>
      </div>

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
      {detail === null || managers === null ? (
        <p aria-live="polite">{COPY.nav.loading}</p>
      ) : (
        <>
          {department.capabilities.manage && (
            <form className={styles.form} onSubmit={saveDetails}>
              <label
                className={styles.field}
                htmlFor={`${department.department_id}-name`}
              >
                <span className={styles.fieldLabel}>
                  {COPY.programs.deptName}
                </span>
                <input
                  id={`${department.department_id}-name`}
                  className={styles.input}
                  name="name"
                  defaultValue={detail.department.name}
                  required
                />
              </label>
              <label
                className={styles.field}
                htmlFor={`${department.department_id}-description`}
              >
                <span className={styles.fieldLabel}>
                  {COPY.programs.departmentDetails}
                </span>
                <textarea
                  id={`${department.department_id}-description`}
                  className={styles.input}
                  name="description"
                  defaultValue={detail.department.description ?? ""}
                  rows={3}
                />
              </label>
              <button className={styles.button} type="submit" disabled={busy}>
                {COPY.programs.saveDepartment}
              </button>
            </form>
          )}
          {department.capabilities.module_configure && (
            <section
              aria-labelledby={`${department.department_id}-modules-heading`}
            >
              <h4
                id={`${department.department_id}-modules-heading`}
                className={styles.panelHeading}
              >
                {COPY.programs.modules}
              </h4>
              <ul className={styles.workspaceTaskList}>
                {detail.modules.map((module) => (
                  <li
                    key={module.module_key}
                    className={styles.workspaceTaskRow}
                  >
                    <span>{MODULE_LABEL[module.module_key]}</span>
                    <button
                      className={styles.toggle}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            setDepartmentModule(
                              department.department_id,
                              module.module_key,
                              module.enabled !== 1
                            ),
                          COPY.programs.updated
                        )
                      }
                    >
                      {module.enabled === 1
                        ? COPY.programs.disable
                        : COPY.programs.enable}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {department.capabilities.manager_assign && (
            <section
              aria-labelledby={`${department.department_id}-managers-heading`}
            >
              <div className={styles.programSummary}>
                <h4
                  id={`${department.department_id}-managers-heading`}
                  className={styles.panelHeading}
                >
                  {COPY.programs.departmentManagers}
                </h4>
                <button
                  className={styles.actionButton}
                  type="button"
                  onClick={() => onOpenManagerPicker?.()}
                >
                  {COPY.programs.departmentManagers}
                </button>
              </div>
              <ul
                className={styles.eventList}
                aria-label={COPY.programs.departmentManagers}
              >
                {managers.length === 0 ? (
                  <li className={styles.emptyLine}>
                    {COPY.programs.noDepartmentManagers}
                  </li>
                ) : (
                  managers.map((manager) => (
                    <li key={manager.user_id} className={styles.eventRow}>
                      <span className={styles.eventDate}>
                        {manager.user_name ?? manager.user_id}
                        {manager.username ? ` (${manager.username})` : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
};
