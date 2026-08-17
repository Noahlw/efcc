"use client";

import { useState } from "react";
import type { FormEvent } from "react";

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

import styles from "@/app/programs/programs.module.css";

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
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onCancel}
          >
            {COPY.programs.cancelEdit}
          </button>
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
        <p className={styles.panelError} role="alert">
          {formError}
        </p>
      )}
      {notice && <output className={styles.panelNotice}>{notice}</output>}
      <form className={styles.form} onSubmit={submit}>
        {!initial && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              {COPY.programs.workspaceDepartment}
              <select
                className={styles.select}
                value={values.departmentId}
                onChange={(event) => update("departmentId", event.target.value)}
                required
                disabled={busy}
              >
                {departments
                  .filter(({ capabilities }) => capabilities.manage)
                  .map((department) => (
                    <option
                      key={department.department_id}
                      value={department.department_id}
                    >
                      {department.name} · {department.code}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programName}
            <input
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
            <textarea
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
            <input
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
            <select
              className={styles.select}
              value={values.behaviorType}
              onChange={(event) =>
                update(
                  "behaviorType",
                  event.target.value as Program["behavior_type"]
                )
              }
              disabled={busy || initial !== undefined}
            >
              <option value="Recurring">
                {COPY.programs.behaviorRecurring}
              </option>
              <option value="OneOff">{COPY.programs.behaviorOneOff}</option>
            </select>
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programLifecycle}
            <select
              className={styles.select}
              value={values.lifecycle}
              onChange={(event) =>
                update("lifecycle", event.target.value as Program["lifecycle"])
              }
              disabled={busy || initial?.lifecycle === "Archived"}
            >
              {(!initial || initial.lifecycle === "Draft") && (
                <option value="Draft">{COPY.programs.lifecycleDraft}</option>
              )}
              {(!initial ||
                initial.lifecycle === "Draft" ||
                initial.lifecycle === "Active") && (
                <option
                  value="Active"
                  disabled={
                    busy ||
                    (initial === undefined
                      ? !canActivate
                      : initial.lifecycle !== "Active" && !canActivate)
                  }
                >
                  {COPY.programs.lifecycleActive}
                </option>
              )}
              {(initial?.lifecycle === "Active" ||
                initial?.lifecycle === "Archived") && (
                <option value="Archived">
                  {COPY.programs.lifecycleArchived}
                </option>
              )}
            </select>
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
            <select
              className={styles.select}
              value={values.discoverability}
              onChange={(event) =>
                update(
                  "discoverability",
                  event.target.value as Program["discoverability"]
                )
              }
              disabled={busy}
            >
              <option value="Unlisted">
                {COPY.programs.discoverabilityUnlisted}
              </option>
              <option value="Listed">
                {COPY.programs.discoverabilityListed}
              </option>
            </select>
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {COPY.programs.programEnrollmentMode}
            <select
              className={styles.select}
              value={values.enrollmentMode}
              onChange={(event) =>
                update(
                  "enrollmentMode",
                  event.target.value as Program["enrollment_mode"]
                )
              }
              disabled={busy}
            >
              <option value="MemberRequest">
                {COPY.programs.enrollmentModeMemberRequest}
              </option>
              <option value="ManagerOnly">
                {COPY.programs.enrollmentModeManagerOnly}
              </option>
            </select>
          </label>
        </div>
        <div className={styles.workspaceActions}>
          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? COPY.programs.submitting : COPY.programs.saveProgram}
          </button>
          {onCancel && (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onCancel}
              disabled={busy}
            >
              {COPY.programs.cancelEdit}
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
