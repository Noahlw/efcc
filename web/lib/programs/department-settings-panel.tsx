"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getDepartment,
  isUnknownMutationOutcome,
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

import {
  clearManagementDraft,
  readManagementDraft,
  writeManagementDraft,
} from "./management-draft";
import { ProgramForm } from "./program-form";

const DEPARTMENT_DRAFT_ACTION = "department-settings";

interface DepartmentDraft {
  name: string;
  description: string;
}

function isDepartmentDraft(value: unknown): value is DepartmentDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DepartmentDraft).name === "string" &&
    typeof (value as DepartmentDraft).description === "string"
  );
}

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
  onDirtyChange,
}: {
  department: Department;
  onClose: () => void;
  onOpenProgram?: (programId: string, created?: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) => {
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const [draftRecoveryOpen, setDraftRecoveryOpen] = useState(false);
  const [mutationRecoveryRequired, setMutationRecoveryRequired] =
    useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const mounted = useRef(true);

  const load = useCallback(
    async (preserveDetail = false): Promise<boolean> => {
      if (!preserveDetail) {
        setDetail(null);
      }
      setLoadError(null);
      setActionError(null);
      try {
        const nextDetail = await getDepartment(department.department_id);
        if (!mounted.current) {
          return false;
        }
        setDetail(nextDetail);
        const stored = readManagementDraft<unknown>(
          department.department_id,
          DEPARTMENT_DRAFT_ACTION
        );
        if (isDepartmentDraft(stored)) {
          setName(stored.name);
          setDescription(stored.description);
          if (!preserveDetail) {
            setDraftRecoveryOpen(true);
          }
        } else {
          setName(nextDetail.department.name);
          setDescription(nextDetail.department.description ?? "");
        }
        return true;
      } catch (error) {
        if (mounted.current) {
          const message = errorMessage(error);
          setLoadError(message);
        }
        return false;
      }
    },
    [department.department_id]
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const isDirty =
    detail !== null &&
    (name !== detail.department.name ||
      description !== (detail.department.description ?? ""));

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!detail) {
      return;
    }
    if (isDirty) {
      writeManagementDraft(department.department_id, DEPARTMENT_DRAFT_ACTION, {
        name,
        description,
      });
    } else {
      clearManagementDraft(department.department_id, DEPARTMENT_DRAFT_ACTION);
    }
  }, [department.department_id, description, detail, isDirty, name]);

  const runAction = async <T,>(
    operation: () => Promise<T>,
    message: string,
    afterSuccess?: (result: T) => void
  ) => {
    if (busy || mutationRecoveryRequired) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await operation();
      afterSuccess?.(result);
      const refreshed = await load(true);
      if (!mounted.current) {
        return;
      }
      if (!refreshed) {
        // The write already settled successfully. Keep the committed local
        // result and expose the existing readback retry without relabelling
        // the known outcome as an ambiguous mutation.
        setActionError(null);
      }
      const noticeMessage = refreshed
        ? message
        : COPY.programs.departmentSavedRefreshPending;
      setNotice(noticeMessage);
      announce(noticeMessage);
    } catch (error) {
      if (mounted.current) {
        if (isUnknownMutationOutcome(error)) {
          setMutationRecoveryRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          return;
        }
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

  const retryMutationRecovery = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    const refreshed = await load(true);
    if (refreshed) {
      setMutationRecoveryRequired(false);
      setActionError(null);
      setNotice(COPY.programs.departmentMutationReconciled);
      announce(COPY.programs.departmentMutationReconciled);
    } else {
      setActionError(COPY.programs.programTransportAmbiguous);
      announce(COPY.programs.programTransportAmbiguous);
    }
    setBusy(false);
  };

  const saveDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAction(
      () =>
        updateDepartment(department.department_id, {
          name: name.trim(),
          description: description.trim(),
        }),
      COPY.programs.updated,
      (result) => {
        clearManagementDraft(department.department_id, DEPARTMENT_DRAFT_ACTION);
        const nextDepartment = result.department;
        setDetail((previous) =>
          previous ? { ...previous, department: nextDepartment } : previous
        );
        setName(nextDepartment.name);
        setDescription(nextDepartment.description ?? "");
      }
    );
  };

  const runModuleAction = (operation: () => Promise<unknown>) => {
    if (isDirty) {
      const message = COPY.programs.departmentDraftBlocking;
      setActionError(message);
      announce(message);
      return;
    }
    void runAction(operation, COPY.programs.updated);
  };

  const closePanel = () => {
    if (isDirty) {
      setCloseConfirmationOpen(true);
      return;
    }
    onClose();
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
    <>
      <AlertDialog open={draftRecoveryOpen} onOpenChange={setDraftRecoveryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.departmentDraftRecoveryTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.departmentDraftRecoveryDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.programs.draftRecover}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearManagementDraft(
                  department.department_id,
                  DEPARTMENT_DRAFT_ACTION
                );
                if (detail) {
                  setName(detail.department.name);
                  setDescription(detail.department.description ?? "");
                }
                setDraftRecoveryOpen(false);
              }}
            >
              {COPY.programs.draftDiscard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                onClick={closePanel}
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
            {mutationRecoveryRequired && (
              <Alert tone="warning" announcement="polite">
                <span>{COPY.programs.departmentSavedRefreshPending}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void retryMutationRecovery()}
                  disabled={busy}
                >
                  {COPY.programs.departmentSettingsRetry}
                </Button>
              </Alert>
            )}
            {loadError !== null && detail !== null && (
              <Alert tone="warning" announcement="polite">
                <span>{COPY.programs.departmentSavedRefreshPending}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load(true)}
                  disabled={busy}
                >
                  {COPY.programs.departmentSettingsRetry}
                </Button>
              </Alert>
            )}
            {detail === null ? (
              <ScreenState
                kind={loadError === null ? "loading" : "error"}
                title={
                  loadError === null
                    ? COPY.nav.loading
                    : COPY.programs.departmentSettingsLoadError
                }
                description={
                  loadError ?? (
                    <div className="grid gap-2 py-2" aria-hidden="true">
                      <span className="h-4 w-2/3 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
                      <span className="h-12 w-full rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
                    </div>
                  )
                }
                action={
                  loadError !== null ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void load()}
                    >
                      {COPY.programs.departmentSettingsRetry}
                    </Button>
                  ) : undefined
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
                      disabled={busy || mutationRecoveryRequired}
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
                        value={name}
                        onChange={(event) => setName(event.target.value)}
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
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                      />
                    </ScreenField>
                    <Button
                      className="h-auto w-fit whitespace-normal bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                      type="submit"
                      disabled={busy || mutationRecoveryRequired}
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
                                  disabled={busy || mutationRecoveryRequired}
                                  onClick={() =>
                                    runModuleAction(() =>
                                      setDepartmentModule(
                                        department.department_id,
                                        module.module_key,
                                        module.enabled !== 1
                                      )
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
      <AlertDialog
        open={closeConfirmationOpen}
        onOpenChange={setCloseConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.departmentDraftLeaveTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.departmentDraftLeaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {COPY.programs.settingsContinueEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearManagementDraft(
                  department.department_id,
                  DEPARTMENT_DRAFT_ACTION
                );
                onClose();
              }}
            >
              {COPY.programs.settingsDiscardAndLeave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
