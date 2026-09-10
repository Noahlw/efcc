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
import {
  ScreenEditor,
  ScreenField,
  ScreenSection,
  ScreenState,
} from "@/lib/screen-foundations";

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
      <ScreenSection
        className="min-w-0"
        title={COPY.programs.programCreateTitle}
        headingId="program-form-title"
        aria-live="polite"
      >
        <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
          {COPY.programs.programCreateUnavailable}
        </p>
        {onCancel && (
          <Button
            variant="outline"
            className="h-auto w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
            type="button"
            onClick={onCancel}
          >
            {COPY.programs.cancelEdit}
          </Button>
        )}
      </ScreenSection>
    );
  }

  return (
    <ScreenSection
      className="min-w-0"
      title={
        initial ? COPY.programs.programEdit : COPY.programs.programCreateTitle
      }
      headingId="program-form-title"
      aria-labelledby="program-form-title"
      aria-busy={busy}
    >
      <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {initial
          ? COPY.programs.programEditLead
          : COPY.programs.programCreateLead}
      </p>
      {formError && <ScreenState kind="error" title={formError} />}
      {notice && (
        <Alert tone="success" announcement="polite">
          {notice}
        </Alert>
      )}
      <ScreenEditor className="min-w-0" onSubmit={submit}>
        {!initial && (
          <ScreenField
            htmlFor="program-form-department"
            label={COPY.programs.workspaceDepartment}
          >
            <Select
              value={values.departmentId}
              onValueChange={(value) => update("departmentId", value)}
              disabled={busy}
            >
              <SelectTrigger
                id="program-form-department"
                className="min-w-0 w-full border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
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
          </ScreenField>
        )}
        <ScreenField
          htmlFor="program-form-name"
          label={COPY.programs.programName}
        >
          <Input
            id="program-form-name"
            className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
            autoComplete="off"
            disabled={busy}
          />
        </ScreenField>
        <ScreenField
          htmlFor="program-form-description"
          label={
            initial
              ? COPY.programs.programDescription
              : COPY.programs.programPurpose
          }
        >
          <Textarea
            id="program-form-description"
            className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            rows={3}
            disabled={busy}
            required={!initial}
          />
        </ScreenField>
        <ScreenField
          htmlFor="program-form-category"
          label={COPY.programs.programCategory}
        >
          <Input
            id="program-form-category"
            className="min-w-0 border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
            value={values.category}
            onChange={(event) => update("category", event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </ScreenField>
        <ScreenField
          htmlFor="program-form-behavior"
          label={COPY.programs.behaviorType}
        >
          <Select
            value={values.behaviorType}
            onValueChange={(value) =>
              update("behaviorType", value as Program["behavior_type"])
            }
            disabled={busy || initial !== undefined}
          >
            <SelectTrigger
              id="program-form-behavior"
              className="min-w-0 w-full border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
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
        </ScreenField>
        <ScreenField
          htmlFor="program-form-lifecycle"
          label={COPY.programs.programLifecycle}
        >
          <Select
            value={values.lifecycle}
            onValueChange={(value) =>
              update("lifecycle", value as Program["lifecycle"])
            }
            disabled={busy || initial?.lifecycle === "Archived"}
          >
            <SelectTrigger
              id="program-form-lifecycle"
              className="min-w-0 w-full border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
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
        </ScreenField>
        {initial === undefined && !canActivate && (
          <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
            {COPY.programs.programCreateDraftOnlyHint}
          </p>
        )}
        <ScreenField
          htmlFor="program-form-discoverability"
          label={COPY.programs.discoverabilityListed}
        >
          <Select
            value={values.discoverability}
            onValueChange={(value) =>
              update("discoverability", value as Program["discoverability"])
            }
            disabled={busy}
          >
            <SelectTrigger
              id="program-form-discoverability"
              className="min-w-0 w-full border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
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
        </ScreenField>
        <ScreenField
          htmlFor="program-form-enrollment-mode"
          label={COPY.programs.programEnrollmentMode}
        >
          <Select
            value={values.enrollmentMode}
            onValueChange={(value) =>
              update("enrollmentMode", value as Program["enrollment_mode"])
            }
            disabled={busy}
          >
            <SelectTrigger
              id="program-form-enrollment-mode"
              className="min-w-0 w-full border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base text-[var(--screen-ink)]"
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
        </ScreenField>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            className="h-auto w-fit whitespace-normal bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
            type="submit"
            disabled={busy}
          >
            {busy ? COPY.programs.submitting : COPY.programs.saveProgram}
          </Button>
          {onCancel && (
            <Button
              variant="outline"
              className="h-auto w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
              type="button"
              onClick={onCancel}
              disabled={busy}
            >
              {COPY.programs.cancelEdit}
            </Button>
          )}
        </div>
      </ScreenEditor>
    </ScreenSection>
  );
};
