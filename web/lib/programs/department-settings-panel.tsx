"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
} from "@/lib/screen-foundations";

import { ProgramForm } from "./program-form";

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
    <ScreenCard asChild className="min-w-0">
      <section
        id={`${department.department_id}-settings-panel`}
        tabIndex={-1}
        aria-labelledby={`${department.department_id}-settings-heading`}
        aria-busy={busy}
      >
        <ScreenSection
          className="mt-0"
          title={`${COPY.programs.departmentSettings}: ${department.name}`}
          headingId={`${department.department_id}-settings-heading`}
          action={
            <Button
              variant="outline"
              className="h-auto w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
              type="button"
              onClick={onClose}
            >
              {COPY.programs.collapse}
            </Button>
          }
        >
          {notice !== null && (
            <Alert tone="success" announcement="polite">
              {notice}
            </Alert>
          )}
          {actionError !== null && (
            <ScreenState kind="error" title={actionError} />
          )}
          {detail === null ? (
            <ScreenState
              kind="loading"
              title={COPY.nav.loading}
              description={
                <div className="grid gap-2 py-2" aria-hidden="true">
                  <span className="h-4 w-2/3 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
                  <span className="h-12 w-full rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
                </div>
              }
            />
          ) : creating ? (
            <ProgramForm
              departments={[department]}
              onSaved={handleProgramSaved}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <>
              {department.capabilities.manage && (
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <Button
                    className="h-auto w-fit whitespace-normal bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
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
                  <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                    {COPY.programs.createProgramInDepartmentHint}
                  </p>
                </div>
              )}
              {department.capabilities.manage && (
                <ScreenEditor className="min-w-0" onSubmit={saveDetails}>
                  <ScreenField
                    htmlFor={`${department.department_id}-name`}
                    label={COPY.programs.deptName}
                  >
                    <Input
                      id={`${department.department_id}-name`}
                      className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
                      name="name"
                      defaultValue={detail.department.name}
                      required
                    />
                  </ScreenField>
                  <ScreenField
                    htmlFor={`${department.department_id}-description`}
                    label={COPY.programs.departmentDetails}
                  >
                    <Textarea
                      id={`${department.department_id}-description`}
                      className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
                      name="description"
                      defaultValue={detail.department.description ?? ""}
                      rows={3}
                    />
                  </ScreenField>
                  <Button
                    className="h-auto w-fit whitespace-normal bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                    type="submit"
                    disabled={busy}
                  >
                    {COPY.programs.saveDepartment}
                  </Button>
                </ScreenEditor>
              )}
              {department.capabilities.module_configure && (
                <ScreenSection
                  title={COPY.programs.modules}
                  headingId={`${department.department_id}-modules-heading`}
                >
                  <ScreenRowList>
                    <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
                      {moduleRows.map((module) => (
                        <li key={module.module_key} className="min-w-0">
                          <ScreenRow density="settings">
                            <ScreenRowMain>
                              <ScreenRowTitle>
                                {MODULE_LABEL[module.module_key]}
                              </ScreenRowTitle>
                            </ScreenRowMain>
                            <ScreenRowTrailing>
                              <Button
                                variant="outline"
                                className="h-auto w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
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
                            </ScreenRowTrailing>
                          </ScreenRow>
                        </li>
                      ))}
                    </ul>
                  </ScreenRowList>
                </ScreenSection>
              )}
              {department.capabilities.manager_assign &&
                department.capabilities.role_read === true &&
                (department.capabilities.role_assign === true ||
                  department.capabilities.role_revoke === true) && (
                  <ScreenSection
                    title="身份組指派"
                    headingId={`${department.department_id}-identity-heading`}
                  >
                    <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                      帳戶身份組指派及撤銷現由帳戶存取管理統一處理。
                    </p>
                    <Button
                      asChild
                      className="h-auto w-fit whitespace-normal bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                    >
                      <Link
                        href={`/management?module=accounts&scopeKind=Department&scopeId=${encodeURIComponent(department.department_id)}&view=access&return=${encodeURIComponent(`/programs?mode=management&department=${encodeURIComponent(department.department_id)}`)}`}
                      >
                        管理帳戶身份組
                      </Link>
                    </Button>
                  </ScreenSection>
                )}
            </>
          )}
        </ScreenSection>
      </section>
    </ScreenCard>
  );
};
