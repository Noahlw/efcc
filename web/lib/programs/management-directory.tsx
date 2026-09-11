"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { hasDepartmentManagementScope } from "@/lib/programs/capabilities";
import { getManagementDirectory } from "@/lib/programs/program-api";
import type {
  Department,
  ManagementProgram as ManagementProgramRecord,
} from "@/lib/programs/program-api";
import {
  ScreenHeader,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSearch,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { DepartmentSettingsPanel } from "./department-settings-panel";
import { buildProgramsHref } from "./programs-intent";
import { useAsyncResource } from "./use-async-resource";

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
  compact = false,
}: {
  department: Department;
  onOpenProgram: (programId: string, created?: boolean) => void;
  compact?: boolean;
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
  ) : compact ? (
    <Button
      id={`${department.department_id}-settings-trigger`}
      className="h-auto min-h-11 w-fit max-w-full whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-3 py-2 text-left text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
      type="button"
      onClick={(event) => {
        triggerRef.current = event.currentTarget;
        setOpen(true);
      }}
    >
      {department.name} · {COPY.programs.departmentSettings}
    </Button>
  ) : (
    <ScreenRow asChild density="settings">
      <Button
        id={`${department.department_id}-settings-trigger`}
        className="rounded-none border-0 bg-transparent px-0 text-left hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
        type="button"
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setOpen(true);
        }}
      >
        <ScreenRowMain>
          <ScreenRowTitle>{department.name}</ScreenRowTitle>
          <ScreenRowMeta>
            {department.code} · {COPY.programs.departmentSettings}
          </ScreenRowMeta>
        </ScreenRowMain>
        <ScreenRowTrailing>
          <ChevronRight
            aria-hidden="true"
            className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
            strokeWidth={1.8}
          />
        </ScreenRowTrailing>
      </Button>
    </ScreenRow>
  );
};

const DepartmentSettingsAction = ({
  departments,
  onOpenDepartment,
  settingsOpen,
}: {
  departments: readonly Department[];
  onOpenDepartment: (
    department: Department,
    trigger: HTMLButtonElement
  ) => void;
  settingsOpen: boolean;
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const returnFocusPending = useRef(false);
  const pickerId = "programs-management-department-settings-picker";

  useEffect(() => {
    if (pickerOpen) {
      pickerRef.current?.focus();
      return;
    }
    if (returnFocusPending.current) {
      triggerRef.current?.focus();
      returnFocusPending.current = false;
    }
  }, [pickerOpen]);

  if (departments.length === 0) {
    return null;
  }

  const closePicker = () => {
    returnFocusPending.current = true;
    setPickerOpen(false);
  };

  const openDepartment = (department: Department) => {
    const trigger = triggerRef.current;
    setPickerOpen(false);
    if (trigger) {
      onOpenDepartment(department, trigger);
    }
  };

  return (
    <div className="relative inline-block max-w-full">
      <Button
        aria-controls={pickerOpen ? pickerId : undefined}
        aria-expanded={pickerOpen || settingsOpen}
        aria-haspopup={departments.length > 1 ? "dialog" : undefined}
        className="h-auto min-h-11 w-fit max-w-full whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-3 py-2 text-left text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
        type="button"
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          if (departments.length === 1) {
            onOpenDepartment(departments[0], event.currentTarget);
          } else {
            setPickerOpen(true);
          }
        }}
      >
        {COPY.programs.departmentSettings}
      </Button>
      {pickerOpen && (
        <div
          ref={pickerRef}
          id={pickerId}
          aria-label={COPY.programs.departmentSettings}
          className="absolute top-[calc(100%+0.5rem)] right-0 z-20 grid min-w-56 max-w-[calc(100vw-2rem)] gap-3 border border-[var(--screen-line-strong)] bg-[var(--screen-surface)] p-3 text-left text-[var(--screen-ink)] shadow-lg"
          role="dialog"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePicker();
            }
          }}
        >
          <strong className="wrap-anywhere text-sm font-bold">
            {COPY.programs.departmentSettings}
          </strong>
          <div className="grid gap-1">
            {departments.map((department) => (
              <Button
                key={department.department_id}
                className="h-auto min-h-11 w-full justify-start whitespace-normal border-[var(--screen-line)] bg-transparent px-3 py-2 text-left text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
                type="button"
                variant="outline"
                onClick={() => openDepartment(department)}
              >
                {department.name}
              </Button>
            ))}
          </div>
          <Button
            className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-3 py-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
            type="button"
            variant="outline"
            onClick={closePicker}
          >
            {COPY.programs.collapse}
          </Button>
        </div>
      )}
    </div>
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
  /** Compact action rendered in the shared route header. */
  headerAction?: ReactNode;
}
export const ManagementDirectory = ({
  onOpenProgram,
  departmentId = null,
  hash = null,
  departmentOnly = false,
  query,
  onQueryChange,
  focusProgramId = null,
  headerAction,
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
  const [openDepartmentSettings, setOpenDepartmentSettings] =
    useState<Department | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsReturnFocusPending = useRef(false);

  useEffect(() => {
    if (openDepartmentSettings !== null) {
      document
        .getElementById(
          `${openDepartmentSettings.department_id}-settings-panel`
        )
        ?.focus();
      return;
    }
    if (settingsReturnFocusPending.current) {
      settingsTriggerRef.current?.focus();
      settingsReturnFocusPending.current = false;
    }
  }, [openDepartmentSettings]);

  const openSettings = (department: Department, trigger: HTMLButtonElement) => {
    settingsTriggerRef.current = trigger;
    setOpenDepartmentSettings(department);
  };

  const closeSettings = () => {
    settingsReturnFocusPending.current = true;
    setOpenDepartmentSettings(null);
  };
  return (
    <div className="min-w-0 text-[var(--screen-ink)]">
      <ScreenHeader
        headingId="programs-management-directory-title"
        lead={
          departmentOnly
            ? COPY.programs.departmentsLead
            : COPY.programs.managementPageLead
        }
        title={
          departmentOnly
            ? COPY.programs.departmentsTitle
            : COPY.programs.managementPageTitle
        }
        action={headerAction}
      />

      {state.kind === "loading" && (
        <ScreenLoadingRows
          id="programs-management-directory-state"
          tabIndex={-1}
          label={COPY.programs.managementDirectoryLoading}
          density="collection"
        />
      )}

      {state.kind === "error" && (
        <ScreenState
          id="programs-management-directory-state"
          tabIndex={-1}
          kind={state.failure === "forbidden" ? "forbidden" : "error"}
          title={
            <h2 className="m-0 wrap-anywhere text-base font-bold">
              {state.failure === "forbidden"
                ? COPY.programs.managementDirectoryForbidden
                : COPY.programs.managementDirectoryLoadError}
            </h2>
          }
          description={
            <p className="m-0 wrap-anywhere leading-[1.6]">
              {state.failure === "forbidden"
                ? COPY.programs.managementDirectoryForbiddenHint
                : state.message}
            </p>
          }
          action={
            <Button
              className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)] hover:text-[var(--screen-danger)]"
              type="button"
              onClick={retry}
            >
              {COPY.programs.managementDirectoryRetry}
            </Button>
          }
        />
      )}

      {state.kind === "ready" &&
        openDepartmentSettings !== null &&
        !departmentOnly && (
          <div className="mb-5 min-w-0">
            <DepartmentSettingsPanel
              department={openDepartmentSettings}
              onClose={closeSettings}
              onOpenProgram={onOpenProgram}
            />
          </div>
        )}

      {state.kind === "ready" &&
        departmentOnly &&
        scopedDepartments.length > 0 && (
          <ScreenSection
            title={
              departmentOnly
                ? COPY.programs.departments
                : COPY.programs.managementScopeDepartment
            }
          >
            <p className="m-0 -mt-1 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
              {departmentOnly
                ? COPY.programs.departmentsLead
                : COPY.programs.departmentScopeHint}
            </p>
            <ScreenRowList>
              <ul className="m-0 grid list-none gap-0 p-0">
                {scopedDepartments.map((department) => (
                  <li key={department.department_id} className="min-w-0">
                    <DepartmentSettingsLauncher
                      department={department}
                      onOpenProgram={onOpenProgram}
                    />
                  </li>
                ))}
              </ul>
            </ScreenRowList>
          </ScreenSection>
        )}

      {state.kind === "ready" &&
        (departmentOnly
          ? scopedDepartments.length === 0
          : state.rows.length === 0) && (
          <ScreenState
            id="programs-management-directory-state"
            tabIndex={-1}
            kind="empty"
            title={
              <h2 className="m-0 wrap-anywhere text-base font-bold">
                {departmentOnly
                  ? COPY.programs.noDepartments
                  : state.departments.length === 0
                    ? COPY.programs.cockpitEmptyScopeTitle
                    : COPY.programs.managementDirectoryEmpty}
              </h2>
            }
            description={
              <p className="m-0 wrap-anywhere leading-[1.6]">
                {departmentOnly
                  ? COPY.programs.departmentsLead
                  : state.departments.length === 0
                    ? COPY.programs.cockpitEmptyScopeHint
                    : COPY.programs.managementDirectoryEmptyHint}
              </p>
            }
          />
        )}

      {state.kind === "ready" && state.rows.length > 0 && (
        <>
          <div className="mb-5 flex min-w-0 gap-2 max-[799px]:flex-col">
            <ScreenSearch
              id="programs-management-directory-search"
              aria-label={COPY.programs.managementDirectorySearchLabel}
              placeholder={COPY.programs.managementDirectorySearchPlaceholder}
              value={directoryQuery}
              onChange={(event) => updateQuery(event.target.value)}
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            {directoryQuery.trim() && (
              <Button
                className="h-auto min-h-[var(--screen-touch-target)] w-fit whitespace-normal border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-[var(--screen-control-padding-inline)] py-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)] max-[799px]:w-full"
                type="button"
                variant="outline"
                onClick={() => updateQuery("")}
              >
                {COPY.programs.managementDirectoryClearSearch}
              </Button>
            )}
          </div>

          <ScreenSection
            title={COPY.programs.catalogSectionTitle}
            action={
              !departmentOnly && scopedDepartments.length > 0 ? (
                <DepartmentSettingsAction
                  departments={scopedDepartments}
                  onOpenDepartment={openSettings}
                  settingsOpen={openDepartmentSettings !== null}
                />
              ) : undefined
            }
          >
            {filteredRows.length === 0 ? (
              <ScreenState
                id="programs-management-directory-state"
                kind="empty"
                title={
                  <h2 className="m-0 wrap-anywhere text-base font-bold">
                    {COPY.programs.managementDirectoryNoMatches}
                  </h2>
                }
                description={
                  <p className="m-0 wrap-anywhere leading-[1.6]">
                    {COPY.programs.managementDirectoryNoMatchesHint}
                  </p>
                }
                action={
                  <Button
                    className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                    type="button"
                    variant="outline"
                    onClick={() => updateQuery("")}
                  >
                    {COPY.programs.managementDirectoryClearSearch}
                  </Button>
                }
              />
            ) : (
              <ScreenRowList>
                <ul
                  className="m-0 grid min-w-0 list-none gap-0 p-0"
                  aria-label={COPY.programs.managementDirectoryListLabel}
                >
                  {filteredRows.map(({ program, department, scope }) => (
                    <li key={program.program_id} className="min-w-0">
                      <ScreenRow asChild>
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
                          <ScreenRowMain>
                            <ScreenRowTitle>{program.name}</ScreenRowTitle>
                            <ScreenRowMeta>
                              {department.name} · {department.code}
                              {program.category ? ` · ${program.category}` : ""}
                              {" · "}
                              {scope === "department"
                                ? COPY.programs.managementScopeDepartment
                                : COPY.programs.managementScopeProgram}
                            </ScreenRowMeta>
                          </ScreenRowMain>
                          <ScreenRowTrailing>
                            <ScreenStatus
                              tone={
                                program.lifecycle === "Active"
                                  ? "success"
                                  : program.lifecycle === "Draft"
                                    ? "neutral"
                                    : "neutral"
                              }
                            >
                              {program.lifecycle === "Active"
                                ? COPY.programs.lifecycleActive
                                : program.lifecycle === "Draft"
                                  ? COPY.programs.lifecycleDraft
                                  : COPY.programs.lifecycleArchived}
                            </ScreenStatus>
                            <ChevronRight
                              aria-hidden="true"
                              className="size-[var(--screen-icon-size)] shrink-0 text-[var(--screen-muted)]"
                              strokeWidth={1.8}
                            />
                          </ScreenRowTrailing>
                        </Link>
                      </ScreenRow>
                    </li>
                  ))}
                </ul>
              </ScreenRowList>
            )}
          </ScreenSection>
        </>
      )}
    </div>
  );
};
