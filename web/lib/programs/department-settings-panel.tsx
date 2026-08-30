"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getDepartment,
  setDepartmentModule,
  updateDepartment,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentDetail,
  DepartmentModule,
} from "@/lib/programs/program-api";

import { ProgramForm } from "./program-form";

import styles from "@/app/programs/programs.module.css";

const MODULE_KEYS: readonly DepartmentModule["module_key"][] = [
  "program_catalog",
  "enrollment",
  "events",
  "attendance",
  "custom_forms",
];

const MODULE_LABEL: Record<DepartmentModule["module_key"], string> = {
  program_catalog: COPY.programs.moduleProgramCatalog,
  enrollment: COPY.programs.moduleEnrollment,
  events: COPY.programs.moduleEvents,
  attendance: COPY.programs.moduleAttendance,
  custom_forms: COPY.programs.moduleCustomForms,
};

export const DepartmentSettingsPanel = ({
  department,
  onClose,
  onOpenProgram,
}: {
  department: Department;
  onClose: () => void;
  onOpenProgram?: (programId: string, created?: boolean) => void;
}) => {
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setDetail(null);
    setActionError(null);
    try {
      const nextDetail = await getDepartment(department.department_id);
      if (!mounted.current) {
        return;
      }
      setDetail(nextDetail);
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    }
  }, [department.department_id]);

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
    setNotice(null);
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
        const mappedMessage =
          error instanceof RpcError && error.problem.code === "NETWORK_ERROR"
            ? COPY.programs.offlineError
            : errorMessage(error);
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

  const handleProgramSaved = (programId: string) => {
    if (onOpenProgram) {
      onOpenProgram(programId, true);
      return;
    }
    setCreating(false);
    setNotice(COPY.programs.programCreatedNotice);
    announce(COPY.programs.programCreatedNotice);
  };

  const moduleRows =
    detail === null
      ? []
      : MODULE_KEYS.map((moduleKey) =>
          detail.modules.find(({ module_key }) => module_key === moduleKey)
        ).filter((module): module is DepartmentModule => module !== undefined);

  return (
    <section
      id={`${department.department_id}-settings-panel`}
      tabIndex={-1}
      className={styles.moduleSection}
      aria-labelledby={`${department.department_id}-settings-heading`}
      aria-busy={busy}
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
        <Button className={styles.toggle} type="button" onClick={onClose}>
          {COPY.programs.collapse}
        </Button>
      </div>

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
      {detail === null ? (
        <div className="flex items-center gap-2">
          <p aria-live="polite">{COPY.nav.loading}</p>
          <Skeleton className="h-6 w-24" aria-hidden="true" />
        </div>
      ) : (
        <>
          {creating ? (
            <ProgramForm
              departments={[department]}
              onSaved={handleProgramSaved}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <>
              {department.capabilities.manage && (
                <div className={styles.workspaceActions}>
                  <Button
                    className={styles.button}
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setActionError(null);
                      setCreating(true);
                    }}
                    disabled={busy}
                  >
                    {COPY.programs.createProgram}
                  </Button>
                  <p className={styles.fieldHint}>
                    {COPY.programs.createProgramInDepartmentHint}
                  </p>
                </div>
              )}
              {department.capabilities.manage && (
                <form className={styles.form} onSubmit={saveDetails}>
                  <label
                    className={styles.field}
                    htmlFor={`${department.department_id}-name`}
                  >
                    <span className={styles.fieldLabel}>
                      {COPY.programs.deptName}
                    </span>
                    <Input
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
                    <Textarea
                      id={`${department.department_id}-description`}
                      className={styles.input}
                      name="description"
                      defaultValue={detail.department.description ?? ""}
                      rows={3}
                    />
                  </label>
                  <Button
                    className={styles.button}
                    type="submit"
                    disabled={busy}
                  >
                    {COPY.programs.saveDepartment}
                  </Button>
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
                    {moduleRows.map((module) => (
                      <li
                        key={module.module_key}
                        className={styles.workspaceTaskRow}
                      >
                        <span>{MODULE_LABEL[module.module_key]}</span>
                        <Button
                          className={styles.toggle}
                          type="button"
                          aria-pressed={module.enabled === 1}
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
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {department.capabilities.manager_assign && (
                <section
                  className="mt-4 grid gap-2"
                  aria-labelledby={`${department.department_id}-identity-heading`}
                >
                  <h4
                    id={`${department.department_id}-identity-heading`}
                    className={styles.panelHeading}
                  >
                    身份組指派
                  </h4>
                  <p className={styles.fieldHint}>
                    帳戶身份組指派及撤銷現由帳戶存取管理統一處理。
                  </p>
                  <Button asChild className="min-h-11 w-fit">
                    <Link
                      href={`/management?module=accounts&department=${encodeURIComponent(department.department_id)}&return=${encodeURIComponent(`/programs?department=${department.department_id}`)}`}
                    >
                      管理帳戶身份組
                    </Link>
                  </Button>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};
