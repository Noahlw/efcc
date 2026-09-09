"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { createProgram, updateProgram } from "@/lib/programs/program-api";
import type {
  Department,
  Program,
  ProgramInput,
  ProgramPatch,
} from "@/lib/programs/program-api";

const styles = {
  workspaceTask: "grid min-w-0 gap-4",
  workspaceHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  secondaryButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  panelError:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  panelNotice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  form: "grid min-w-0 gap-4",
  field: "grid min-w-0 gap-1.5",
  fieldLabel: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  select:
    "min-h-11 min-w-0 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]",
  input:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  textarea:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  workspaceActions: "flex min-w-0 flex-wrap items-center gap-3",
  button:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
} as const;

interface FormValues {
  departmentId: string;
  name: string;
  description: string;
  category: string;
  behaviorType: Program["behavior_type"];
  lifecycle: Program["lifecycle"];
  discoverability: Program["discoverability"];
  enrollmentMode: Program["enrollment_mode"];
}

export interface ProgramFormProps {
  departments?: readonly Department[];
  initial?: Program;
  onSaved: (programId: string) => void;
  onCancel?: () => void;
}

const EMPTY_DEPARTMENTS: readonly Department[] = [];

function initialValues(
  departments: readonly Department[],
  initial?: Program
): FormValues {
  const defaults: FormValues = {
    departmentId:
      departments.find(({ capabilities }) => capabilities.manage)
        ?.department_id ??
      departments[0]?.department_id ??
      "",
    name: "",
    description: "",
    category: "",
    behaviorType: "Recurring",
    lifecycle: "Draft",
    discoverability: "Unlisted",
    enrollmentMode: "MemberRequest",
  };
  if (!initial) {
    return defaults;
  }
  return {
    departmentId: initial.department_id,
    name: initial.name,
    description: initial.description ?? "",
    category: initial.category ?? "",
    behaviorType: initial.behavior_type,
    lifecycle: initial.lifecycle,
    discoverability: initial.discoverability,
    enrollmentMode: initial.enrollment_mode,
  };
}

function mutationError(caught: unknown): string {
  if (!(caught instanceof RpcError)) {
    return COPY.programs.programTransportAmbiguous;
  }
  if (
    caught.problem.code === "NETWORK_ERROR" ||
    caught.problem.code === "MALFORMED_RESPONSE" ||
    caught.problem.code === "MALFORMED_REQUEST" ||
    caught.problem.code === "UNAVAILABLE"
  ) {
    return COPY.programs.programTransportAmbiguous;
  }
  if (caught.problem.code === "CONFLICT") {
    return COPY.programs.programConflict;
  }
  // PROGRAM_ARCHIVE_BLOCKED (and everything else) maps through errorCopyFor,
  // which distinguishes the 'already_archived' reason from commitment blocks.
  return errorCopyFor(caught.problem.code, caught.problem.detail);
}

function inputFrom(values: FormValues): ProgramInput {
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    category: values.category.trim() || undefined,
    behavior_type: values.behaviorType,
    lifecycle: values.lifecycle,
    discoverability: values.discoverability,
    enrollment_mode: values.enrollmentMode,
  };
}

function patchFrom(values: FormValues): ProgramPatch {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    category: values.category.trim() || null,
    lifecycle: values.lifecycle,
    discoverability: values.discoverability,
    enrollment_mode: values.enrollmentMode,
  };
}

// oxlint-disable-next-line eslint/complexity
export const ProgramForm = ({
  departments = EMPTY_DEPARTMENTS,
  initial,
  onSaved,
  onCancel,
}: ProgramFormProps) => {
  const [values, setValues] = useState(() =>
    initialValues(departments, initial)
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canCreate = departments.some(({ capabilities }) => capabilities.manage);
  const canActivate = initial
    ? (initial.capabilities.publish ?? false)
    : (departments.find(
        (department) => department.department_id === values.departmentId
      )?.capabilities.publish ?? false);

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!initial && !canCreate) {
      setFormError(COPY.programs.programCreateForbidden);
      return;
    }
    if (!initial && (!values.name.trim() || !values.description.trim())) {
      setFormError(COPY.programs.purposeRequired);
      return;
    }
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const result = initial
        ? await updateProgram(initial.program_id, patchFrom(values))
        : await createProgram(values.departmentId, inputFrom(values));
      const successMessage = initial
        ? COPY.programs.programSaved
        : COPY.programs.programCreatedNotice;
      setNotice(successMessage);
      announce(successMessage);
      onSaved(result.program.program_id);
    } catch (error) {
      setFormError(mutationError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!initial && departments.length === 0) {
    return (
      <section className={styles.workspaceTask} aria-live="polite">
        <h3 className={styles.workspaceHeading}>
          {COPY.programs.programCreateTitle}
        </h3>
        <p className={styles.programDetailMuted}>
          {COPY.programs.programCreateUnavailable}
        </p>
        {onCancel && (
          <Button
            className={styles.secondaryButton}
            type="button"
            onClick={onCancel}
          >
            {COPY.programs.cancelEdit}
          </Button>
        )}
      </section>
    );
  }

  return (
    <section
      className={styles.workspaceTask}
      aria-labelledby="program-form-title"
      aria-busy={busy}
    >
      <h3 id="program-form-title" className={styles.workspaceHeading}>
        {initial ? COPY.programs.programEdit : COPY.programs.programCreateTitle}
      </h3>
      <p className={styles.programDetailMuted}>
        {initial
          ? COPY.programs.programEditLead
          : COPY.programs.programCreateLead}
      </p>
      {formError && (
        <Alert className={styles.panelError} variant="destructive">
          {formError}
        </Alert>
      )}
      {notice && <output className={styles.panelNotice}>{notice}</output>}
      <form className={styles.form} onSubmit={submit}>
        {!initial && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              {COPY.programs.workspaceDepartment}
              <Select
                value={values.departmentId}
                onValueChange={(value) => update("departmentId", value)}
                disabled={busy}
              >
                <SelectTrigger
                  className={styles.select}
                  aria-label={COPY.programs.workspaceDepartment}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter(({ capabilities }) => capabilities.manage)
                    .map((department) => (
                      <SelectItem
                        key={department.department_id}
                        value={department.department_id}
                      >
                        {department.name} · {department.code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programName}
            <Input
              className={styles.input}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
              autoComplete="off"
              disabled={busy}
            />
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {initial
              ? COPY.programs.programDescription
              : COPY.programs.programPurpose}
            <Textarea
              className={styles.textarea}
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
              rows={3}
              disabled={busy}
              required={!initial}
            />
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programCategory}
            <Input
              className={styles.input}
              value={values.category}
              onChange={(event) => update("category", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.behaviorType}
            <Select
              value={values.behaviorType}
              onValueChange={(value) =>
                update("behaviorType", value as Program["behavior_type"])
              }
              disabled={busy || initial !== undefined}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.behaviorType}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Recurring">
                  {COPY.programs.behaviorRecurring}
                </SelectItem>
                <SelectItem value="OneOff">
                  {COPY.programs.behaviorOneOff}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programLifecycle}
            <Select
              value={values.lifecycle}
              onValueChange={(value) =>
                update("lifecycle", value as Program["lifecycle"])
              }
              disabled={busy || initial?.lifecycle === "Archived"}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.programLifecycle}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(!initial || initial.lifecycle === "Draft") && (
                  <SelectItem value="Draft">
                    {COPY.programs.lifecycleDraft}
                  </SelectItem>
                )}
                {(!initial ||
                  initial.lifecycle === "Draft" ||
                  initial.lifecycle === "Active") && (
                  <SelectItem
                    value="Active"
                    disabled={
                      busy ||
                      (initial === undefined
                        ? !canActivate
                        : initial.lifecycle !== "Active" && !canActivate)
                    }
                  >
                    {COPY.programs.lifecycleActive}
                  </SelectItem>
                )}
                {(initial?.lifecycle === "Active" ||
                  initial?.lifecycle === "Archived") && (
                  <SelectItem value="Archived">
                    {COPY.programs.lifecycleArchived}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </label>
        </div>
        {initial === undefined && !canActivate && (
          <p className={styles.programDetailMuted}>
            {COPY.programs.programCreateDraftOnlyHint}
          </p>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.discoverabilityListed}
            <Select
              value={values.discoverability}
              onValueChange={(value) =>
                update("discoverability", value as Program["discoverability"])
              }
              disabled={busy}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.discoverabilityListed}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Unlisted">
                  {COPY.programs.discoverabilityUnlisted}
                </SelectItem>
                <SelectItem value="Listed">
                  {COPY.programs.discoverabilityListed}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programEnrollmentMode}
            <Select
              value={values.enrollmentMode}
              onValueChange={(value) =>
                update("enrollmentMode", value as Program["enrollment_mode"])
              }
              disabled={busy}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={COPY.programs.programEnrollmentMode}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MemberRequest">
                  {COPY.programs.enrollmentModeMemberRequest}
                </SelectItem>
                <SelectItem value="ManagerOnly">
                  {COPY.programs.enrollmentModeManagerOnly}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className={styles.workspaceActions}>
          <Button className={styles.button} type="submit" disabled={busy}>
            {busy ? COPY.programs.submitting : COPY.programs.saveProgram}
          </Button>
          {onCancel && (
            <Button
              className={styles.secondaryButton}
              type="button"
              onClick={onCancel}
              disabled={busy}
            >
              {COPY.programs.cancelEdit}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
};
