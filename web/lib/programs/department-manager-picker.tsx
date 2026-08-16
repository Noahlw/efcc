"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  assignDepartmentManager,
  listDepartmentManagers,
  revokeDepartmentManager,
  searchDepartmentMemberOptions,
} from "@/lib/programs/program-api";
import type { Department, DepartmentManager } from "@/lib/programs/program-api";

import { MemberPicker } from "./member-picker";

import styles from "@/app/programs/programs.module.css";

export const DepartmentManagerPicker = ({
  department,
  onBack,
}: {
  department: Department;
  onBack: () => void;
}) => {
  const [managers, setManagers] = useState<DepartmentManager[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const mounted = useRef(true);
  const searchManagers = useCallback(
    (query: string) =>
      searchDepartmentMemberOptions(department.department_id, query),
    [department.department_id]
  );

  const load = useCallback(async () => {
    setManagers(null);
    setActionError(null);
    try {
      const nextManagers = await listDepartmentManagers(
        department.department_id
      );
      if (mounted.current) {
        setManagers(nextManagers.managers);
      }
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

  return (
    <section
      id={`${department.department_id}-manager-picker`}
      tabIndex={-1}
      className={styles.moduleSection}
      aria-labelledby={`${department.department_id}-manager-picker-heading`}
    >
      <div className={styles.programSummary}>
        <div>
          <h3
            id={`${department.department_id}-manager-picker-heading`}
            className={styles.sectionLabel}
          >
            {COPY.programs.departmentManagers}: {department.name}
          </h3>
        </div>
        <button className={styles.toggle} type="button" onClick={onBack}>
          {COPY.programs.departmentSettings}
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
      {managers === null ? (
        <p aria-live="polite">{COPY.nav.loading}</p>
      ) : (
        <>
          <form className={styles.ruleForm} onSubmit={assignManager}>
            <MemberPicker
              programId=""
              name="user_id"
              label={COPY.programs.departmentManagerUserId}
              placeholder={COPY.programs.departmentManagerUserIdPlaceholder}
              searchOptions={searchManagers}
            />
            <button
              className={styles.actionButton}
              type="submit"
              disabled={busy}
            >
              {COPY.programs.assignDepartmentManager}
            </button>
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
                  {confirmingUserId === manager.user_id ? (
                    <div className={styles.confirmRow}>
                      <span>
                        {COPY.programs.confirmRevokeDepartmentManager}
                      </span>
                      <button
                        className={styles.dangerButton}
                        type="button"
                        disabled={busy}
                        onClick={() => revokeManager(manager.user_id)}
                      >
                        {COPY.programs.confirmRevoke}
                      </button>
                      <button
                        className={styles.toggle}
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingUserId(null)}
                      >
                        {COPY.programs.cancelRevoke}
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.actionButton}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingUserId(manager.user_id)}
                    >
                      {COPY.programs.revokeDepartmentManager}
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  );
};
