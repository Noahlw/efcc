"use client";

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
  assignDepartmentManager,
  getDepartment,
  listDepartmentManagers,
  revokeDepartmentManager,
  searchDepartmentMemberOptions,
  setDepartmentModule,
  updateDepartment,
} from "@/lib/programs/program-api";
import type {
  Department,
  DepartmentDetail,
  DepartmentManager,
  DepartmentModule,
} from "@/lib/programs/program-api";

import { MemberPicker } from "./member-picker";
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
  const [managers, setManagers] = useState<DepartmentManager[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const mounted = useRef(true);
  const searchManagers = useCallback(
    (query: string) =>
      searchDepartmentMemberOptions(department.department_id, query),
    [department.department_id]
  );

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

  const assignManager = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const userId = String(data.get("user_id") ?? "").trim();
    if (!userId) {
      return;
    }
    event.currentTarget.reset();
    void runAction(
      () => assignDepartmentManager(department.department_id, userId),
      COPY.programs.departmentManagerAssignedNotice
    );
  };

  const revokeManager = (userId: string) => {
    setConfirmingUserId(null);
    void runAction(
      () => revokeDepartmentManager(department.department_id, userId),
      COPY.programs.departmentManagerRevokedNotice
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
      {detail === null || managers === null ? (
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
                  aria-labelledby={`${department.department_id}-managers-heading`}
                >
                  <h4
                    id={`${department.department_id}-managers-heading`}
                    className={styles.panelHeading}
                  >
                    {COPY.programs.departmentManagers}
                  </h4>
                  <form className={styles.ruleForm} onSubmit={assignManager}>
                    <MemberPicker
                      programId=""
                      name="user_id"
                      label={COPY.programs.departmentManagerUserId}
                      placeholder={
                        COPY.programs.departmentManagerUserIdPlaceholder
                      }
                      searchOptions={searchManagers}
                    />
                    <Button
                      className={styles.actionButton}
                      type="submit"
                      disabled={busy}
                    >
                      {COPY.programs.assignDepartmentManager}
                    </Button>
                  </form>
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
                          <Button asChild className={styles.toggle}>
                            <a
                              href={`/management?module=accounts&account=${encodeURIComponent(manager.user_id)}&view=access&return=${encodeURIComponent("/management?module=accounts")}`}
                            >
                              查看身份組
                            </a>
                          </Button>
                          {confirmingUserId === manager.user_id ? (
                            <div className={styles.confirmRow}>
                              <span>
                                {COPY.programs.confirmRevokeDepartmentManager}
                              </span>
                              <Button
                                className={styles.dangerButton}
                                type="button"
                                disabled={busy}
                                onClick={() => revokeManager(manager.user_id)}
                              >
                                {COPY.programs.confirmRevoke}
                              </Button>
                              <Button
                                className={styles.toggle}
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmingUserId(null)}
                              >
                                {COPY.programs.cancelRevoke}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              className={styles.actionButton}
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setConfirmingUserId(manager.user_id)
                              }
                            >
                              {COPY.programs.revokeDepartmentManager}
                            </Button>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};
