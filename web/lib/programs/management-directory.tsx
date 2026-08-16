"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { hasDepartmentManagementScope } from "@/lib/programs/capabilities";
import { getManagementDirectory } from "@/lib/programs/program-api";
import type {
  Department,
  ManagementProgram as ManagementProgramRecord,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { DepartmentManagerPicker } from "./department-manager-picker";
import { DepartmentSettingsPanel } from "./department-settings-panel";
import { useAsyncResource } from "./use-async-resource";

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
    const departmentScope = hasDepartmentManagementScope(department);
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

export interface ManagementDirectoryProps {
  onOpenProgram: (programId: string) => void;
  onCreateProgram?: (departments: Department[]) => void;
  departmentId?: string | null;
  departmentView?: "managers" | null;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenDepartmentManagers?: (departmentId: string) => void;
  onBackToDirectory?: () => void;
}
export const ManagementDirectory = ({
  onOpenProgram,
  onCreateProgram,
  departmentId,
  departmentView,
  onOpenDepartment,
  onOpenDepartmentManagers,
  onBackToDirectory,
}: ManagementDirectoryProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [localDepartmentId, setLocalDepartmentId] = useState<string | null>(
    null
  );
  const [localDepartmentView, setLocalDepartmentView] = useState<
    "managers" | null
  >(null);
  const routedDepartmentId =
    departmentId === undefined ? localDepartmentId : departmentId;
  const routedDepartmentView =
    departmentView === undefined ? localDepartmentView : departmentView;

  const openDepartment = (nextDepartmentId: string) => {
    if (onOpenDepartment) {
      onOpenDepartment(nextDepartmentId);
      return;
    }
    setLocalDepartmentId(nextDepartmentId);
    setLocalDepartmentView(null);
  };

  const openDepartmentManagers = (nextDepartmentId: string) => {
    if (onOpenDepartmentManagers) {
      onOpenDepartmentManagers(nextDepartmentId);
      return;
    }
    setLocalDepartmentId(nextDepartmentId);
    setLocalDepartmentView("managers");
  };

  const backToDirectory = () => {
    if (onBackToDirectory) {
      onBackToDirectory();
      return;
    }
    setLocalDepartmentId(null);
    setLocalDepartmentView(null);
  };
  const {
    state,
    run: loadDirectory,
    retry,
  } = useAsyncResource<
    { departments: Department[]; programs: ManagementProgramRecord[] },
    DirectoryState
  >(
    () => getManagementDirectory(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ departments, programs }) => {
        const programsByDepartment = departments.map(({ department_id }) =>
          programs.filter(({ department_id: id }) => id === department_id)
        );
        return {
          kind: "ready",
          departments,
          rows: projectManagementPrograms(departments, programsByDepartment),
        };
      },
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return null;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return {
          kind: "error",
          failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
          message,
        };
      },
      announceLoading: COPY.programs.managementDirectoryLoading,
      announceReady: () => COPY.programs.managementScopeReady,
      focusTarget: "#programs-management-directory-state",
    },
    [router]
  );

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

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
  const selectedDepartment =
    state.kind === "ready" && routedDepartmentId !== null
      ? (state.departments.find(
          ({ department_id }) => department_id === routedDepartmentId
        ) ?? null)
      : null;

  if (selectedDepartment) {
    if (
      routedDepartmentView === "managers" &&
      selectedDepartment.capabilities.manager_assign
    ) {
      return (
        <DepartmentManagerPicker
          department={selectedDepartment}
          onBack={() => openDepartment(selectedDepartment.department_id)}
        />
      );
    }
    return (
      <DepartmentSettingsPanel
        department={selectedDepartment}
        onClose={backToDirectory}
        onOpenManagerPicker={() =>
          openDepartmentManagers(selectedDepartment.department_id)
        }
      />
    );
  }
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
      {state.kind === "ready" &&
        state.departments.some(({ capabilities }) => capabilities.manage) &&
        onCreateProgram && (
          <div className={styles.workspaceActions}>
            <button
              className={styles.button}
              type="button"
              onClick={() => onCreateProgram(state.departments)}
            >
              {COPY.programs.createProgram}
            </button>
          </div>
        )}
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
        state.departments.some(hasDepartmentManagementScope) && (
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
                .filter(hasDepartmentManagementScope)
                .map((department) => (
                  <li
                    key={department.department_id}
                    className={styles.deptItem}
                  >
                    <button
                      className={styles.directoryCard}
                      type="button"
                      onClick={() => openDepartment(department.department_id)}
                    >
                      <span className={styles.directoryCardTitle}>
                        {department.name}
                      </span>
                      <span className={styles.directoryCardMeta}>
                        {department.code} · {COPY.programs.departmentSettings}
                      </span>
                    </button>
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
