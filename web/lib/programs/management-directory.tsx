"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { getManagementDirectory } from "@/lib/programs/program-api";
import type {
  Department,
  ManagementProgram as ManagementProgramRecord,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { DepartmentSettingsPanel } from "./department-settings-panel";

import styles from "@/app/programs/programs.module.css";

export interface ManagementProgram {
  program: ManagementProgramRecord;
  department: Department;
  scope: "department" | "program";
}

/**
 * Keep the Directory projection at the server-shaped capability seam. A
 * Department capability includes current and future Programs; otherwise only
 * a Program capability can place one row in the management collection.
 */
export function projectManagementPrograms(
  departments: readonly Department[],
  programsByDepartment: readonly (readonly ManagementProgramRecord[])[]
): ManagementProgram[] {
  const seen = new Set<string>();
  const rows: ManagementProgram[] = [];

  for (const [departmentIndex, department] of departments.entries()) {
    const departmentScope =
      department.capabilities.manage ||
      department.capabilities.publish ||
      department.capabilities.module_configure;
    for (const program of programsByDepartment[departmentIndex] ?? []) {
      if (seen.has(program.program_id)) {
        continue;
      }
      const programScope =
        program.capabilities.manage ||
        program.capabilities.publish ||
        program.capabilities.leader_assign;
      if (!departmentScope && !programScope) {
        continue;
      }
      seen.add(program.program_id);
      rows.push({
        program,
        department,
        scope: departmentScope ? "department" : "program",
      });
    }
  }

  return rows.sort(
    (left, right) =>
      left.program.display_order - right.program.display_order ||
      left.program.name.localeCompare(right.program.name, "zh-Hant")
  );
}

type DirectoryState =
  | { kind: "loading" }
  | {
      kind: "ready";
      rows: ManagementProgram[];
      departments: Department[];
    }
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };
const DepartmentSettingsLauncher = ({
  department,
}: {
  department: Department;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [returnFocusPending, setReturnFocusPending] = useState(false);

  useEffect(() => {
    if (!open) {
      if (returnFocusPending) {
        triggerRef.current?.focus();
        setReturnFocusPending(false);
      }
      return;
    }
    const panel = document.querySelector<HTMLElement>(
      `#${department.department_id}-settings-panel`
    );
    panel?.focus();
  }, [open, department.department_id, returnFocusPending]);

  const close = () => {
    setReturnFocusPending(true);
    setOpen(false);
  };

  return open ? (
    <DepartmentSettingsPanel department={department} onClose={close} />
  ) : (
    <button
      ref={triggerRef}
      className={styles.directoryCard}
      type="button"
      onClick={() => setOpen(true)}
    >
      <span className={styles.directoryCardTitle}>{department.name}</span>
      <span className={styles.directoryCardMeta}>
        {department.code} · {COPY.programs.departmentSettings}
      </span>
    </button>
  );
};

export interface ManagementDirectoryProps {
  onOpenProgram: (programId: string) => void;
}

export const ManagementDirectory = ({
  onOpenProgram,
}: ManagementDirectoryProps) => {
  const router = useRouter();
  const [state, setState] = useState<DirectoryState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const mounted = useRef(true);
  const requestId = useRef(0);
  const retryFocusPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadDirectory = useCallback(async () => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    setState({ kind: "loading" });
    announce(COPY.programs.managementDirectoryLoading);
    try {
      const { departments, programs } = await getManagementDirectory();
      const programsByDepartment = departments.map(({ department_id }) =>
        programs.filter(({ department_id: id }) => id === department_id)
      );
      if (!mounted.current || requestId.current !== currentRequest) {
        return;
      }
      setState({
        kind: "ready",
        rows: projectManagementPrograms(departments, programsByDepartment),
        departments,
      });
      announce(COPY.programs.managementScopeReady);
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
        return;
      }
      const code = error instanceof RpcError ? error.problem.code : undefined;
      const message =
        error instanceof RpcError
          ? errorCopyFor(code, error.problem.detail)
          : COPY.error.networkError;
      setState({
        kind: "error",
        failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
        message,
      });
      announce(message);
    }
  }, [router]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (!retryFocusPending.current || state.kind !== "error") {
      return;
    }
    const panel = document.querySelector<HTMLElement>(
      "#programs-management-directory-state"
    );
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  const retry = () => {
    retryFocusPending.current = true;
    void loadDirectory();
  };

  const filteredRows = useMemo(() => {
    if (state.kind !== "ready") {
      return [];
    }
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) {
      return state.rows;
    }
    return state.rows.filter(({ program, department }) =>
      [
        program.name,
        program.description,
        program.category,
        department.name,
        department.code,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(needle))
    );
  }, [query, state]);

  return (
    <section aria-labelledby="programs-management-directory-title">
      <h2
        id="programs-management-directory-title"
        className={styles.boundaryTitle}
      >
        {COPY.programs.managementDirectoryTitle}
      </h2>
      <p className={styles.boundaryLead}>
        {COPY.programs.managementDirectoryLead}
      </p>

      {state.kind === "loading" && (
        <output
          id="programs-management-directory-state"
          tabIndex={-1}
          className={styles.boundaryState}
          aria-busy="true"
        >
          {COPY.programs.managementDirectoryLoading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          id="programs-management-directory-state"
          tabIndex={-1}
          className={styles.boundaryError}
          role="alert"
        >
          <h3 className={styles.boundaryTitle}>
            {state.failure === "forbidden"
              ? COPY.programs.managementDirectoryForbidden
              : COPY.programs.managementDirectoryLoadError}
          </h3>
          <p>
            {state.failure === "forbidden"
              ? COPY.programs.managementDirectoryForbiddenHint
              : state.message}
          </p>
          <button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.managementDirectoryRetry}
          </button>
        </section>
      )}
      {state.kind === "ready" &&
        state.departments.some(
          (department) =>
            department.capabilities.manage ||
            department.capabilities.module_configure ||
            department.capabilities.manager_assign
        ) && (
          <section
            className={styles.moduleSection}
            aria-labelledby="programs-management-department-settings"
          >
            <h3
              id="programs-management-department-settings"
              className={styles.sectionLabel}
            >
              {COPY.programs.managementScopeDepartment}
            </h3>
            <p className={styles.fieldHint}>
              {COPY.programs.departmentScopeHint}
            </p>
            <ul className={styles.deptList}>
              {state.departments
                .filter(
                  (department) =>
                    department.capabilities.manage ||
                    department.capabilities.module_configure ||
                    department.capabilities.manager_assign
                )
                .map((department) => (
                  <li
                    key={department.department_id}
                    className={styles.deptItem}
                  >
                    <DepartmentSettingsLauncher department={department} />
                  </li>
                ))}
            </ul>
          </section>
        )}

      {state.kind === "ready" && state.rows.length === 0 && (
        <section
          id="programs-management-directory-state"
          className={styles.boundaryState}
        >
          <h3 className={styles.boundaryTitle}>
            {COPY.programs.managementDirectoryEmpty}
          </h3>
          <p>{COPY.programs.managementDirectoryEmptyHint}</p>
        </section>
      )}

      {state.kind === "ready" && state.rows.length > 0 && (
        <>
          <div className={styles.directorySearch}>
            <label
              className={styles.directorySearchLabel}
              htmlFor="programs-management-directory-search"
            >
              {COPY.programs.managementDirectorySearchLabel}
            </label>
            <div className={styles.directorySearchRow}>
              <input
                id="programs-management-directory-search"
                className={styles.input}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={COPY.programs.managementDirectorySearchPlaceholder}
                autoComplete="off"
              />
              {query.trim() && (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => setQuery("")}
                >
                  {COPY.programs.managementDirectoryClearSearch}
                </button>
              )}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <section
              id="programs-management-directory-state"
              className={styles.boundaryState}
            >
              <h3 className={styles.boundaryTitle}>
                {COPY.programs.managementDirectoryNoMatches}
              </h3>
              <p>{COPY.programs.managementDirectoryNoMatchesHint}</p>
              <button
                className={styles.retry}
                type="button"
                onClick={() => setQuery("")}
              >
                {COPY.programs.managementDirectoryClearSearch}
              </button>
            </section>
          ) : (
            <ul
              className={styles.directoryList}
              aria-label={COPY.programs.managementDirectoryListLabel}
            >
              {filteredRows.map(({ program, department, scope }) => (
                <li key={program.program_id} className={styles.directoryItem}>
                  <button
                    className={styles.directoryCard}
                    type="button"
                    onClick={() => onOpenProgram(program.program_id)}
                  >
                    <span className={styles.directoryCardTitle}>
                      {program.name}
                    </span>
                    {program.description && (
                      <span className={styles.directoryCardDescription}>
                        {program.description}
                      </span>
                    )}
                    <span className={styles.directoryCardMeta}>
                      <span className={styles.directoryMetaItem}>
                        {department.name} · {department.code}
                      </span>
                      {program.category && (
                        <span className={styles.directoryMetaItem}>
                          {program.category}
                        </span>
                      )}
                      <span className={styles.directoryStatus}>
                        {scope === "department"
                          ? COPY.programs.managementScopeDepartment
                          : COPY.programs.managementScopeProgram}
                      </span>
                      <span
                        className={`${styles.directoryStatus} ${styles[`directoryStatus${program.lifecycle}`]}`}
                      >
                        {program.lifecycle === "Active"
                          ? COPY.programs.filterActive
                          : program.lifecycle === "Draft"
                            ? COPY.programs.filterDraft
                            : COPY.programs.filterArchived}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
