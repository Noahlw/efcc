"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";

import { DepartmentSettingsPanel } from "./department-settings-panel";
import { buildProgramsHref } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";

const styles = {
  directoryCard:
    "group flex h-auto min-h-11 w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-left whitespace-normal transition-colors hover:border-[var(--accent)] [overflow-wrap:anywhere]",
  directoryCardTitle:
    "block min-w-0 text-base font-extrabold leading-6 whitespace-normal [overflow-wrap:anywhere]",
  directoryCardMeta:
    "flex min-w-0 flex-wrap items-center gap-2 text-sm leading-6 text-[var(--ink-muted)] whitespace-normal [overflow-wrap:anywhere]",
  boundaryTitle:
    "m-0 min-w-0 text-xl font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]",
  boundaryLead:
    "mt-1 mb-5 max-w-prose text-base leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  boundaryState:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 [overflow-wrap:anywhere]",
  boundaryError:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-[var(--error)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--error-border)] bg-transparent px-4 py-2 text-[var(--error)] whitespace-normal hover:bg-[var(--error-surface)]",
  moduleSection:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4",
  sectionLabel:
    "m-0 text-sm font-bold uppercase tracking-[0.08em] text-[var(--ink-muted)]",
  fieldHint:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  deptList: "m-0 mb-7 grid list-none gap-3 p-0",
  deptItem: "min-w-0 overflow-hidden rounded-lg border border-[var(--line)]",
  directorySearch: "mb-5 grid min-w-0 gap-2",
  directorySearchLabel: "text-sm font-bold leading-5 text-[var(--ink)]",
  directorySearchRow: "flex min-w-0 flex-wrap items-center gap-3",
  input:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  clearButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  directoryList: "m-0 grid list-none gap-3 p-0",
  directoryItem: "m-0 min-w-0",
  directoryCardDescription:
    "block min-w-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  directoryMetaItem: "min-w-0 [overflow-wrap:anywhere]",
  directoryStatus: "shrink-0 whitespace-normal",
} as const;

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
const DepartmentSettingsLauncher = ({
  department,
  onOpenProgram,
}: {
  department: Department;
  onOpenProgram: (programId: string, created?: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [returnFocusPending, setReturnFocusPending] = useState(false);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      document
        .getElementById(`${department.department_id}-settings-trigger`)
        ?.focus();
      setReturnFocusPending(false);
      return;
    }
    // getElementById, not querySelector: department_id is a UUID and can
    // start with a digit, which is not a valid leading character for an
    // unescaped CSS id selector (throws SyntaxError at runtime).
    const panel = document.getElementById(
      `${department.department_id}-settings-panel`
    );
    panel?.focus();
  }, [open, department.department_id, returnFocusPending]);

  const close = () => {
    setReturnFocusPending(true);
    setOpen(false);
  };

  return open ? (
    <DepartmentSettingsPanel
      department={department}
      onClose={close}
      onOpenProgram={onOpenProgram}
    />
  ) : (
    <Button
      id={`${department.department_id}-settings-trigger`}
      className={styles.directoryCard}
      type="button"
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        setOpen(true);
      }}
    >
      <span className={styles.directoryCardTitle}>{department.name}</span>
      <span className={styles.directoryCardMeta}>
        {department.code} · {COPY.programs.departmentSettings}
      </span>
    </Button>
  );
};
export interface ManagementDirectoryProps {
  onOpenProgram: (programId: string, created?: boolean) => void;
  /** Optional Department context restored from a safe return URL. */
  departmentId?: string | null;
  /** Hash fragment restored with the current Programs intent. */
  hash?: string | null;
  /** Render only the scoped Departments administration surface. */
  departmentOnly?: boolean;
  /** Preserve the directory search while a Program workspace is open. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Program row to focus after returning from its workspace. */
  focusProgramId?: string | null;
}
export const ManagementDirectory = ({
  onOpenProgram,
  departmentId = null,
  hash = null,
  departmentOnly = false,
  query,
  onQueryChange,
  focusProgramId = null,
}: ManagementDirectoryProps) => {
  const [localQuery, setLocalQuery] = useState("");
  const directoryQuery = query ?? localQuery;
  const updateQuery = (value: string) => {
    if (onQueryChange) {
      onQueryChange(value);
    } else {
      setLocalQuery(value);
    }
  };
  const router = useRouter();
  const {
    state,
    run: loadDirectory,
    retry,
  } = useAsyncResource<
    { departments: Department[]; programs: ManagementProgramRecord[] },
    DirectoryState
  >(
    async () => getManagementDirectory(),
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
    const needle = directoryQuery.trim().toLocaleLowerCase();
    const rows = departmentId
      ? state.rows.filter(
          ({ department }) => department.department_id === departmentId
        )
      : state.rows;
    if (!needle) {
      return rows;
    }
    return rows.filter(({ program, department }) =>
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
  }, [departmentId, directoryQuery, state]);
  useEffect(() => {
    if (state.kind !== "ready" || !focusProgramId) {
      return;
    }
    const row = [
      ...document.querySelectorAll<HTMLElement>("[data-program-id]"),
    ].find((candidate) => candidate.dataset.programId === focusProgramId);
    row?.focus();
  }, [filteredRows, focusProgramId, state.kind]);
  const scopedDepartments =
    state.kind === "ready"
      ? state.departments.filter(
          (department) =>
            hasDepartmentManagementScope(department) &&
            (!departmentId || department.department_id === departmentId)
        )
      : [];
  return (
    <section aria-labelledby="programs-management-directory-title">
      <h2
        id="programs-management-directory-title"
        className={styles.boundaryTitle}
      >
        {departmentOnly
          ? COPY.programs.departmentsTitle
          : COPY.programs.managementDirectoryTitle}
      </h2>
      <p className={styles.boundaryLead}>
        {departmentOnly
          ? COPY.programs.departmentsLead
          : COPY.programs.managementDirectoryLead}
      </p>
      {state.kind === "loading" && (
        <output
          id="programs-management-directory-state"
          tabIndex={-1}
          className={styles.boundaryState}
          aria-busy="true"
        >
          {COPY.programs.managementDirectoryLoading}
          <Skeleton className="mt-3 h-8 w-full" aria-hidden="true" />
        </output>
      )}

      {state.kind === "error" && (
        <Alert
          id="programs-management-directory-state"
          tabIndex={-1}
          className={styles.boundaryError}
          variant="destructive"
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
          <Button className={styles.retry} type="button" onClick={retry}>
            {COPY.programs.managementDirectoryRetry}
          </Button>
        </Alert>
      )}
      {state.kind === "ready" && scopedDepartments.length > 0 && (
        <section
          className={styles.moduleSection}
          aria-labelledby="programs-management-department-settings"
        >
          <h3
            id="programs-management-department-settings"
            className={styles.sectionLabel}
          >
            {departmentOnly
              ? COPY.programs.departments
              : COPY.programs.managementScopeDepartment}
          </h3>
          <p className={styles.fieldHint}>
            {departmentOnly
              ? COPY.programs.departmentsLead
              : COPY.programs.departmentScopeHint}
          </p>
          <ul className={styles.deptList}>
            {scopedDepartments.map((department) => (
              <li key={department.department_id} className={styles.deptItem}>
                <DepartmentSettingsLauncher
                  department={department}
                  onOpenProgram={onOpenProgram}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.kind === "ready" &&
        (departmentOnly
          ? scopedDepartments.length === 0
          : state.rows.length === 0) && (
          <section
            id="programs-management-directory-state"
            tabIndex={-1}
            className={styles.boundaryState}
            aria-live="polite"
          >
            <h3 className={styles.boundaryTitle}>
              {departmentOnly
                ? COPY.programs.noDepartments
                : state.departments.length === 0
                  ? COPY.programs.cockpitEmptyScopeTitle
                  : COPY.programs.managementDirectoryEmpty}
            </h3>
            <p>
              {departmentOnly
                ? COPY.programs.departmentsLead
                : state.departments.length === 0
                  ? COPY.programs.cockpitEmptyScopeHint
                  : COPY.programs.managementDirectoryEmptyHint}
            </p>
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
              <Input
                id="programs-management-directory-search"
                className={styles.input}
                type="search"
                value={directoryQuery}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder={COPY.programs.managementDirectorySearchPlaceholder}
                autoComplete="off"
              />
              {directoryQuery.trim() && (
                <Button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => updateQuery("")}
                >
                  {COPY.programs.managementDirectoryClearSearch}
                </Button>
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
              <Button
                className={styles.retry}
                type="button"
                onClick={() => updateQuery("")}
              >
                {COPY.programs.managementDirectoryClearSearch}
              </Button>
            </section>
          ) : (
            <ul
              className={styles.directoryList}
              aria-label={COPY.programs.managementDirectoryListLabel}
            >
              {filteredRows.map(({ program, department, scope }) => (
                <li key={program.program_id} className={styles.directoryItem}>
                  <Button asChild className={styles.directoryCard}>
                    <Link
                      href={buildProgramsHref({
                        mode: "management",
                        programId: program.program_id,
                        departmentId,
                        hash,
                      })}
                      data-program-id={program.program_id}
                      onClick={(event) => {
                        if (
                          event.defaultPrevented ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return;
                        }
                        event.preventDefault();
                        onOpenProgram(program.program_id);
                      }}
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
                        <Badge
                          className={styles.directoryStatus}
                          variant="outline"
                        >
                          {scope === "department"
                            ? COPY.programs.managementScopeDepartment
                            : COPY.programs.managementScopeProgram}
                        </Badge>
                        <Badge
                          className={styles.directoryStatus}
                          variant={
                            program.lifecycle === "Active"
                              ? "default"
                              : program.lifecycle === "Draft"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {program.lifecycle === "Active"
                            ? COPY.programs.lifecycleActive
                            : program.lifecycle === "Draft"
                              ? COPY.programs.lifecycleDraft
                              : COPY.programs.lifecycleArchived}
                        </Badge>
                      </span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
