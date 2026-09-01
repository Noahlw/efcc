"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  createScheduleException,
  createScheduleRule,
  deleteScheduleException,
  listScheduleExceptions,
  listScheduleRules,
  updateProgram,
  updateScheduleRule,
} from "@/lib/programs/program-api";
import type {
  Program,
  ScheduleException,
  ScheduleRule,
  ScheduleRuleInput,
} from "@/lib/programs/program-api";
import { isWallDate, WEEKDAY_LABELS } from "@/lib/programs/recurrence";

const styles = {
  workspaceTask: "grid min-w-0 gap-4",
  settingsSurface: "gap-4",
  workspaceHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  programDetailMuted:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  panelNotice:
    "block rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-[var(--ink)] [overflow-wrap:anywhere]",
  panelError:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-3 text-[var(--error)] [overflow-wrap:anywhere]",
  settingsUnavailable:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4",
  workspaceSubheading:
    "m-0 text-base font-bold leading-6 [overflow-wrap:anywhere]",
  settingsGroups: "grid min-w-0 gap-5",
  settingsGroup:
    "grid min-w-0 gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4",
  settingsGroupLead:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  settingsForm: "grid min-w-0 gap-4",
  field: "grid min-w-0 gap-1.5",
  fieldLabel: "grid min-w-0 gap-1.5 text-sm font-bold text-[var(--ink)]",
  input:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  textarea:
    "min-h-11 min-w-0 rounded-lg border-[var(--line-strong)] bg-[var(--surface-raised)] text-base",
  settingsActions: "flex min-w-0 flex-wrap items-center gap-3",
  button:
    "min-h-11 min-w-11 w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-white whitespace-normal hover:bg-[var(--accent-deep)]",
  settingsCurrent:
    "grid min-w-0 gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3",
  fieldHint:
    "m-0 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  select:
    "min-h-11 min-w-0 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]",
  confirmRow:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--pending-border)] bg-[var(--pending-surface)] p-3 [overflow-wrap:anywhere]",
  secondaryButton:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  settingsReadonly:
    "m-0 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  settingsRuleList: "m-0 grid min-w-0 list-none gap-3 p-0",
  settingsRuleRow:
    "grid min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 [overflow-wrap:anywhere]",
  settingsRuleSummary:
    "flex min-w-0 flex-wrap items-center justify-between gap-3 [overflow-wrap:anywhere]",
  settingsExceptionList: "m-0 grid min-w-0 list-none gap-2 p-0",
  successOutline:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] px-4 py-2 text-[var(--success)] whitespace-normal",
  timeMarker: "m-0 text-xs text-[var(--ink-muted)]",
  programDetailBack:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
} as const;

interface BasicsValues {
  name: string;
  description: string;
  category: string;
  displayOrder: string;
}

interface EnrollmentValues {
  discoverability: Program["discoverability"];
  enrollmentMode: Program["enrollment_mode"];
}

interface AttendanceValues {
  opensBefore: string;
  closesAfter: string;
}

interface RuleValues {
  recurrence: ScheduleRuleInput["recurrence"];
  dayOfWeek: string;
  monthDay: string;
  startTime: string;
  endTime: string;
  location: string;
}

interface ExceptionValues {
  overrideDate: string;
  action: ScheduleException["action"];
  newStartTime: string;
  newEndTime: string;
}

export interface ProgramSettingsProps {
  program: Program;
  eventsEnabled?: boolean;
  attendanceEnabled?: boolean;
  onTaskChange?: (task: "events" | null) => void;
}
const LIFECYCLE_LABEL: Record<Program["lifecycle"], string> = {
  Draft: COPY.programs.lifecycleDraft,
  Active: COPY.programs.lifecycleActive,
  Archived: COPY.programs.lifecycleArchived,
};

function settingsErrorMessage(error: unknown): string {
  if (error instanceof RpcError) {
    if (
      error.problem.code === "CONFLICT" &&
      error.problem.detail?.includes("Schedule exception already exists")
    ) {
      return COPY.programs.settingsExceptionDuplicate;
    }
    if (error.problem.code === "CONFLICT") {
      return COPY.programs.programConflict;
    }
  }
  return errorMessage(error);
}

function basicsFrom(program: Program): BasicsValues {
  return {
    name: program.name,
    description: program.description ?? "",
    category: program.category ?? "",
    displayOrder: String(program.display_order),
  };
}

function enrollmentFrom(program: Program): EnrollmentValues {
  return {
    discoverability: program.discoverability,
    enrollmentMode: program.enrollment_mode,
  };
}

function attendanceFrom(program: Program): AttendanceValues {
  return {
    opensBefore: String(program.check_in_opens_at_minutes_before_start ?? 15),
    closesAfter: String(program.check_in_closes_at_minutes_after_end ?? 0),
  };
}

function ruleValuesFrom(rule: ScheduleRule): RuleValues {
  return {
    recurrence: rule.recurrence,
    dayOfWeek: String(rule.day_of_week ?? 0),
    monthDay: String(rule.month_day ?? 1),
    startTime: rule.start_time,
    endTime: rule.end_time,
    location: rule.location ?? "",
  };
}

function defaultExceptionValues(): ExceptionValues {
  return {
    overrideDate: "",
    action: "CANCEL",
    newStartTime: "",
    newEndTime: "",
  };
}

function ruleInputFrom(values: RuleValues): ScheduleRuleInput {
  return {
    recurrence: values.recurrence,
    day_of_week:
      values.recurrence === "WEEKLY" ? Number(values.dayOfWeek) : undefined,
    month_day:
      values.recurrence === "MONTHLY" ? Number(values.monthDay) : undefined,
    start_time: values.startTime,
    end_time: values.endTime,
    location: values.location.trim() || null,
  };
}

function exceptionInputFrom(values: ExceptionValues): {
  override_date: string;
  action: ScheduleException["action"];
  new_start_time?: string;
  new_end_time?: string;
} {
  return {
    override_date: values.overrideDate,
    action: values.action,
    ...(values.action === "RESCHEDULE"
      ? {
          new_start_time: values.newStartTime,
          new_end_time: values.newEndTime,
        }
      : {}),
  };
}

// oxlint-disable-next-line eslint/complexity
export const ProgramSettings = ({
  program,
  eventsEnabled = true,
  attendanceEnabled = true,
  onTaskChange,
}: ProgramSettingsProps) => {
  const [currentProgram, setCurrentProgram] = useState(program);
  const [basics, setBasics] = useState(() => basicsFrom(program));
  const [enrollment, setEnrollment] = useState(() => enrollmentFrom(program));
  const [attendance, setAttendance] = useState(() => attendanceFrom(program));
  const [rules, setRules] = useState<ScheduleRule[] | null>(
    program.behavior_type === "Recurring" &&
      program.capabilities.manage &&
      eventsEnabled
      ? null
      : []
  );
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleValues>>({});
  const [newRule, setNewRule] = useState<RuleValues>({
    recurrence: "WEEKLY",
    dayOfWeek: "3",
    monthDay: "1",
    startTime: "",
    endTime: "",
    location: "",
  });
  const [exceptionRuleId, setExceptionRuleId] = useState<string | null>(null);
  const [exceptionDrafts, setExceptionDrafts] = useState<
    Record<string, ExceptionValues>
  >({});
  const [exceptions, setExceptions] = useState<
    Record<string, ScheduleException[]>
  >({});
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [confirmingEnrollment, setConfirmingEnrollment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const canManage = currentProgram.capabilities.manage;

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const loadRules = useCallback(async () => {
    if (
      currentProgram.behavior_type !== "Recurring" ||
      !canManage ||
      !eventsEnabled
    ) {
      return;
    }
    setRules(null);
    setRuleError(null);
    setExceptionError(null);
    setExceptions({});
    try {
      const result = await listScheduleRules(currentProgram.program_id);
      if (!mounted.current) {
        return;
      }
      setRules(result.rules);
      try {
        const exceptionEntries = await Promise.all(
          result.rules.map(async (rule) => {
            const exceptionsResult = await listScheduleExceptions(
              currentProgram.program_id,
              rule.rule_id
            );
            return [rule.rule_id, exceptionsResult.exceptions] as const;
          })
        );
        if (!mounted.current) {
          return;
        }
        setExceptions(Object.fromEntries(exceptionEntries));
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setExceptionError(settingsErrorMessage(error));
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setRuleError(settingsErrorMessage(error));
      setRules([]);
    }
  }, [
    canManage,
    currentProgram.behavior_type,
    currentProgram.program_id,
    eventsEnabled,
  ]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const applyProgram = useCallback((next: Program) => {
    setCurrentProgram(next);
    setBasics(basicsFrom(next));
    setEnrollment(enrollmentFrom(next));
    setAttendance(attendanceFrom(next));
  }, []);

  const runProgramMutation = useCallback(
    async (patch: Parameters<typeof updateProgram>[1]) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const result = await updateProgram(currentProgram.program_id, patch);
        if (!mounted.current) {
          return;
        }
        applyProgram({ ...currentProgram, ...result.program });
        setNotice(COPY.programs.settingsSaved);
        announce(COPY.programs.settingsSaved);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = settingsErrorMessage(error);
        setActionError(message);
        announce(message);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [applyProgram, currentProgram]
  );

  const saveBasics = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayOrder = Number(basics.displayOrder);
    if (
      !basics.name.trim() ||
      !Number.isSafeInteger(displayOrder) ||
      displayOrder < 0
    ) {
      setActionError(COPY.programs.settingsBasicsValidation);
      return;
    }
    void runProgramMutation({
      name: basics.name.trim(),
      description: basics.description.trim() || null,
      category: basics.category.trim() || null,
      display_order: displayOrder,
    });
  };

  const saveEnrollment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      enrollment.discoverability === currentProgram.discoverability &&
      enrollment.enrollmentMode === currentProgram.enrollment_mode
    ) {
      setNotice(COPY.programs.settingsSaved);
      return;
    }
    setConfirmingEnrollment(true);
  };

  const confirmEnrollment = () => {
    setConfirmingEnrollment(false);
    void runProgramMutation({
      discoverability: enrollment.discoverability,
      enrollment_mode: enrollment.enrollmentMode,
    });
  };

  const saveAttendance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const opensBefore = Number(attendance.opensBefore);
    const closesAfter = Number(attendance.closesAfter);
    if (
      !Number.isSafeInteger(opensBefore) ||
      opensBefore < 0 ||
      !Number.isSafeInteger(closesAfter) ||
      closesAfter < 0
    ) {
      setActionError(COPY.programs.settingsAttendanceValidation);
      return;
    }
    void runProgramMutation({
      check_in_opens_at_minutes_before_start: opensBefore,
      check_in_closes_at_minutes_after_end: closesAfter,
    });
  };

  const runScheduleMutation = useCallback(
    async (
      operation: () => Promise<unknown>,
      success: string,
      afterSuccess?: () => void
    ) => {
      setBusy(true);
      setActionError(null);
      setRuleError(null);
      setNotice(null);
      try {
        await operation();
        await loadRules();
        if (!mounted.current) {
          return;
        }
        afterSuccess?.();
        setNotice(success);
        announce(success);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = settingsErrorMessage(error);
        setActionError(message);
        announce(message);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [loadRules]
  );

  const submitNewRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runScheduleMutation(
      () =>
        createScheduleRule(currentProgram.program_id, ruleInputFrom(newRule)),
      COPY.programs.settingsSaved,
      () =>
        setNewRule((previous) => ({ ...previous, startTime: "", endTime: "" }))
    );
  };

  const beginRuleEdit = (rule: ScheduleRule) => {
    setEditingRuleId(rule.rule_id);
    setRuleDrafts((previous) => ({
      ...previous,
      [rule.rule_id]: ruleValuesFrom(rule),
    }));
  };

  const submitRuleEdit =
    (rule: ScheduleRule) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = ruleDrafts[rule.rule_id] ?? ruleValuesFrom(rule);
      void runScheduleMutation(
        () =>
          updateScheduleRule(
            currentProgram.program_id,
            rule.rule_id,
            ruleInputFrom(draft)
          ),
        COPY.programs.settingsSaved,
        () => setEditingRuleId(null)
      );
    };

  const exceptionDraftFor = (ruleId: string): ExceptionValues =>
    exceptionDrafts[ruleId] ?? defaultExceptionValues();

  const submitException =
    (rule: ScheduleRule) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = exceptionDraftFor(rule.rule_id);
      if (!isWallDate(draft.overrideDate)) {
        setActionError(COPY.programs.settingsExceptionDateValidation);
        announce(COPY.programs.settingsExceptionDateValidation);
        return;
      }
      void runScheduleMutation(
        async () => {
          const result = await createScheduleException(
            currentProgram.program_id,
            rule.rule_id,
            exceptionInputFrom(draft)
          );
          if ("exception" in result) {
            setExceptions((previous) => ({
              ...previous,
              [rule.rule_id]: [
                ...(previous[rule.rule_id] ?? []).filter(
                  (exception) =>
                    exception.exception_id !== result.exception.exception_id
                ),
                result.exception,
              ],
            }));
          }
        },
        COPY.programs.settingsSaved,
        () => setExceptionRuleId(null)
      );
    };

  const removeException = (exception: ScheduleException) => {
    void runScheduleMutation(async () => {
      await deleteScheduleException(
        currentProgram.program_id,
        exception.rule_id,
        exception.exception_id
      );
      setExceptions((previous) => {
        const next = { ...previous };
        next[exception.rule_id] = (next[exception.rule_id] ?? []).filter(
          ({ exception_id }) => exception_id !== exception.exception_id
        );
        return next;
      });
    }, COPY.programs.settingsSaved);
  };

  return (
    <section
      className={`${styles.workspaceTask} ${styles.settingsSurface}`}
      aria-labelledby="program-settings-title"
    >
      <h4 id="program-settings-title" className={styles.workspaceHeading}>
        {COPY.programs.workspaceTaskSettings}
      </h4>
      <p className={styles.programDetailMuted}>
        {COPY.programs.workspaceTaskSettingsLead}
      </p>
      {notice !== null && (
        <output className={styles.panelNotice} aria-live="polite">
          {notice}
        </output>
      )}
      {actionError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {actionError}
        </Alert>
      )}
      {!canManage ? (
        <section
          className={styles.settingsUnavailable}
          aria-labelledby="program-settings-unavailable"
        >
          <h5
            id="program-settings-unavailable"
            className={styles.workspaceSubheading}
          >
            {COPY.programs.settingsNoManagement}
          </h5>
          <p className={styles.programDetailMuted}>
            {COPY.programs.settingsNoManagementHint}
          </p>
        </section>
      ) : (
        <div className={styles.settingsGroups}>
          <section
            className={styles.settingsGroup}
            aria-labelledby="program-settings-basics"
          >
            <div>
              <h5
                id="program-settings-basics"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.settingsBasics}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsBasicsLead}
              </p>
            </div>
            <form className={styles.settingsForm} onSubmit={saveBasics}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.programName}
                </span>
                <Input
                  className={styles.input}
                  value={basics.name}
                  onChange={(event) =>
                    setBasics((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  required
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.programDescription}
                </span>
                <Textarea
                  className={styles.textarea}
                  value={basics.description}
                  onChange={(event) =>
                    setBasics((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.programCategory}
                </span>
                <Input
                  className={styles.input}
                  value={basics.category}
                  onChange={(event) =>
                    setBasics((previous) => ({
                      ...previous,
                      category: event.target.value,
                    }))
                  }
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.programDisplayOrder}
                </span>
                <Input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1}
                  value={basics.displayOrder}
                  onChange={(event) =>
                    setBasics((previous) => ({
                      ...previous,
                      displayOrder: event.target.value,
                    }))
                  }
                  disabled={busy}
                />
              </label>
              <div className={styles.settingsActions}>
                <Button className={styles.button} type="submit" disabled={busy}>
                  {COPY.programs.settingsSaveBasics}
                </Button>
              </div>
            </form>
          </section>

          <section
            className={styles.settingsGroup}
            aria-labelledby="program-settings-enrollment"
          >
            <div>
              <h5
                id="program-settings-enrollment"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.settingsEnrollment}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsEnrollmentLead}
              </p>
            </div>
            <dl className={styles.settingsCurrent}>
              <div>
                <dt>{COPY.programs.settingsLifecycle}</dt>
                <dd>{LIFECYCLE_LABEL[currentProgram.lifecycle]}</dd>
              </div>
            </dl>
            <p className={styles.fieldHint}>
              {COPY.programs.settingsLifecycleHint}
            </p>
            <form className={styles.settingsForm} onSubmit={saveEnrollment}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.discoverabilityListed}
                </span>
                <Select
                  value={enrollment.discoverability}
                  onValueChange={(value) =>
                    setEnrollment((previous) => ({
                      ...previous,
                      discoverability: value as Program["discoverability"],
                    }))
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
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {COPY.programs.programEnrollmentMode}
                </span>
                <Select
                  value={enrollment.enrollmentMode}
                  onValueChange={(value) =>
                    setEnrollment((previous) => ({
                      ...previous,
                      enrollmentMode: value as Program["enrollment_mode"],
                    }))
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
              <div className={styles.settingsActions}>
                {!confirmingEnrollment && (
                  <Button
                    className={styles.button}
                    type="submit"
                    disabled={busy}
                  >
                    {COPY.programs.settingsSaveEnrollment}
                  </Button>
                )}
                {confirmingEnrollment && (
                  <div
                    className={styles.confirmRow}
                    role="alert"
                    aria-label={COPY.programs.settingsConfirmEnrollment}
                  >
                    <span>{COPY.programs.settingsConfirmEnrollment}</span>
                    <Button
                      className={styles.button}
                      type="button"
                      disabled={busy}
                      onClick={confirmEnrollment}
                    >
                      {COPY.programs.settingsConfirmChange}
                    </Button>
                    <Button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingEnrollment(false)}
                    >
                      {COPY.programs.settingsKeepCurrent}
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </section>

          <section
            className={styles.settingsGroup}
            aria-labelledby="program-settings-schedule"
          >
            <div>
              <h5
                id="program-settings-schedule"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.settingsSchedule}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsScheduleLead}
              </p>
            </div>
            {currentProgram.behavior_type === "OneOff" ? (
              <p className={styles.settingsReadonly}>
                {COPY.programs.settingsScheduleOneOff}
              </p>
            ) : !eventsEnabled ? (
              <p className={styles.settingsReadonly}>
                {COPY.programs.settingsScheduleUnavailable}
              </p>
            ) : (
              <>
                {ruleError !== null && (
                  <Alert className={styles.panelError} variant="destructive">
                    {ruleError}
                    <Button
                      type="button"
                      className={styles.retry}
                      onClick={() => void loadRules()}
                      disabled={busy}
                    >
                      {COPY.programs.settingsScheduleRetry}
                    </Button>
                  </Alert>
                )}
                {rules === null ? (
                  <p className={styles.settingsReadonly} aria-live="polite">
                    {COPY.programs.settingsScheduleLoading}
                  </p>
                ) : (
                  <ul className={styles.settingsRuleList}>
                    {rules.length === 0 ? (
                      <li className={styles.settingsReadonly}>
                        {COPY.programs.settingsScheduleNone}
                      </li>
                    ) : (
                      rules.map((rule) => {
                        const draft =
                          ruleDrafts[rule.rule_id] ?? ruleValuesFrom(rule);
                        const ruleExceptions = exceptions[rule.rule_id] ?? [];
                        return (
                          <li
                            key={rule.rule_id}
                            className={styles.settingsRuleRow}
                          >
                            {editingRuleId === rule.rule_id ? (
                              <form
                                className={styles.settingsForm}
                                onSubmit={submitRuleEdit(rule)}
                              >
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.behaviorType}
                                  </span>
                                  <Select
                                    value={draft.recurrence}
                                    onValueChange={(value) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          recurrence:
                                            value as RuleValues["recurrence"],
                                        },
                                      }))
                                    }
                                  >
                                    <SelectTrigger
                                      className={styles.select}
                                      aria-label={COPY.programs.behaviorType}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="WEEKLY">
                                        {COPY.programs.ruleWeekly}
                                      </SelectItem>
                                      <SelectItem value="MONTHLY">
                                        {COPY.programs.ruleMonthly}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.dayOfWeekLabel}
                                  </span>
                                  <Select
                                    value={draft.dayOfWeek}
                                    onValueChange={(value) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          dayOfWeek: value,
                                        },
                                      }))
                                    }
                                  >
                                    <SelectTrigger
                                      className={styles.select}
                                      aria-label={COPY.programs.dayOfWeekLabel}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {WEEKDAY_LABELS.map((label, index) => (
                                        <SelectItem
                                          key={label}
                                          value={String(index)}
                                        >
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.monthDayLabel}
                                  </span>
                                  <Input
                                    className={styles.input}
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={draft.monthDay}
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          monthDay: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.startTime}
                                  </span>
                                  <Input
                                    className={styles.input}
                                    type="time"
                                    required
                                    value={draft.startTime}
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          startTime: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.endTime}
                                  </span>
                                  <Input
                                    className={styles.input}
                                    type="time"
                                    required
                                    value={draft.endTime}
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          endTime: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>
                                    {COPY.programs.ruleLocation}
                                  </span>
                                  <Input
                                    className={styles.input}
                                    type="text"
                                    value={draft.location}
                                    placeholder={
                                      COPY.programs.ruleLocationPlaceholder
                                    }
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          location: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <div className={styles.settingsActions}>
                                  <Button
                                    className={styles.button}
                                    type="submit"
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleSave}
                                  </Button>
                                  <Button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => setEditingRuleId(null)}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleCancel}
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className={styles.settingsRuleSummary}>
                                  <strong>
                                    {rule.recurrence === "WEEKLY"
                                      ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0]}`
                                      : `${COPY.programs.ruleMonthly} ${rule.month_day}`}
                                  </strong>
                                  <span>
                                    {rule.start_time}–{rule.end_time}
                                  </span>
                                </div>
                                <div className={styles.settingsActions}>
                                  <Button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => beginRuleEdit(rule)}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleEdit}
                                  </Button>
                                  <Button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => {
                                      setExceptionRuleId(rule.rule_id);
                                      setExceptionDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: exceptionDraftFor(
                                          rule.rule_id
                                        ),
                                      }));
                                    }}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleAddException}
                                  </Button>
                                </div>
                                {ruleExceptions.length > 0 && (
                                  <ul
                                    className={styles.settingsExceptionList}
                                    aria-label={
                                      COPY.programs.settingsExistingExceptions
                                    }
                                  >
                                    {ruleExceptions.map((exception) => (
                                      <li key={exception.exception_id}>
                                        <span>
                                          {exception.override_date} ·{" "}
                                          {exception.action === "CANCEL"
                                            ? COPY.programs
                                                .settingsExceptionCancel
                                            : COPY.programs
                                                .settingsExceptionReschedule}
                                        </span>
                                        <Button
                                          className={styles.successOutline}
                                          type="button"
                                          onClick={() =>
                                            removeException(exception)
                                          }
                                          disabled={busy}
                                          aria-label={`${COPY.programs.settingsExceptionRestore} ${exception.override_date}`}
                                        >
                                          {
                                            COPY.programs
                                              .settingsExceptionRestore
                                          }
                                        </Button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {exceptionRuleId === rule.rule_id && (
                                  <form
                                    className={styles.settingsForm}
                                    onSubmit={submitException(rule)}
                                  >
                                    <label className={styles.field}>
                                      <span className={styles.fieldLabel}>
                                        {COPY.programs.settingsExceptionDate}
                                      </span>
                                      <Input
                                        className={styles.input}
                                        type="date"
                                        required
                                        value={
                                          exceptionDraftFor(rule.rule_id)
                                            .overrideDate
                                        }
                                        onChange={(event) =>
                                          setExceptionDrafts((previous) => ({
                                            ...previous,
                                            [rule.rule_id]: {
                                              ...exceptionDraftFor(
                                                rule.rule_id
                                              ),
                                              overrideDate: event.target.value,
                                            },
                                          }))
                                        }
                                        onInput={(event) => {
                                          const overrideDate =
                                            event.currentTarget.value;
                                          setExceptionDrafts((previous) => ({
                                            ...previous,
                                            [rule.rule_id]: {
                                              ...exceptionDraftFor(
                                                rule.rule_id
                                              ),
                                              overrideDate,
                                            },
                                          }));
                                        }}
                                      />
                                    </label>
                                    <label className={styles.field}>
                                      <span className={styles.fieldLabel}>
                                        {COPY.programs.settingsExceptionAction}
                                      </span>
                                      <Select
                                        value={
                                          exceptionDraftFor(rule.rule_id).action
                                        }
                                        onValueChange={(value) =>
                                          setExceptionDrafts((previous) => ({
                                            ...previous,
                                            [rule.rule_id]: {
                                              ...exceptionDraftFor(
                                                rule.rule_id
                                              ),
                                              action:
                                                value as ExceptionValues["action"],
                                            },
                                          }))
                                        }
                                      >
                                        <SelectTrigger
                                          className={styles.select}
                                          aria-label={
                                            COPY.programs
                                              .settingsExceptionAction
                                          }
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="CANCEL">
                                            {
                                              COPY.programs
                                                .settingsExceptionCancel
                                            }
                                          </SelectItem>
                                          <SelectItem value="RESCHEDULE">
                                            {
                                              COPY.programs
                                                .settingsExceptionReschedule
                                            }
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </label>
                                    {exceptionDraftFor(rule.rule_id).action ===
                                      "RESCHEDULE" && (
                                      <>
                                        <label className={styles.field}>
                                          <span className={styles.fieldLabel}>
                                            {
                                              COPY.programs
                                                .settingsExceptionNewStart
                                            }
                                          </span>
                                          <Input
                                            className={styles.input}
                                            type="time"
                                            required
                                            value={
                                              exceptionDraftFor(rule.rule_id)
                                                .newStartTime
                                            }
                                            onChange={(event) =>
                                              setExceptionDrafts(
                                                (previous) => ({
                                                  ...previous,
                                                  [rule.rule_id]: {
                                                    ...exceptionDraftFor(
                                                      rule.rule_id
                                                    ),
                                                    newStartTime:
                                                      event.target.value,
                                                  },
                                                })
                                              )
                                            }
                                          />
                                        </label>
                                        <label className={styles.field}>
                                          <span className={styles.fieldLabel}>
                                            {
                                              COPY.programs
                                                .settingsExceptionNewEnd
                                            }
                                          </span>
                                          <Input
                                            className={styles.input}
                                            type="time"
                                            required
                                            value={
                                              exceptionDraftFor(rule.rule_id)
                                                .newEndTime
                                            }
                                            onChange={(event) =>
                                              setExceptionDrafts(
                                                (previous) => ({
                                                  ...previous,
                                                  [rule.rule_id]: {
                                                    ...exceptionDraftFor(
                                                      rule.rule_id
                                                    ),
                                                    newEndTime:
                                                      event.target.value,
                                                  },
                                                })
                                              )
                                            }
                                          />
                                        </label>
                                      </>
                                    )}
                                    <div className={styles.settingsActions}>
                                      <Button
                                        className={styles.button}
                                        type="submit"
                                        disabled={busy}
                                      >
                                        {COPY.programs.settingsExceptionSave}
                                      </Button>
                                      <Button
                                        className={styles.secondaryButton}
                                        type="button"
                                        onClick={() => setExceptionRuleId(null)}
                                        disabled={busy}
                                      >
                                        {COPY.programs.settingsRuleCancel}
                                      </Button>
                                    </div>
                                  </form>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
                {exceptionError !== null && (
                  <Alert className={styles.panelError} variant="destructive">
                    {COPY.programs.settingsExceptionsLoadError}
                  </Alert>
                )}
                <form className={styles.settingsForm} onSubmit={submitNewRule}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.behaviorType}
                    </span>
                    <Select
                      value={newRule.recurrence}
                      onValueChange={(value) =>
                        setNewRule((previous) => ({
                          ...previous,
                          recurrence: value as RuleValues["recurrence"],
                        }))
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        className={styles.select}
                        aria-label={COPY.programs.behaviorType}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEKLY">
                          {COPY.programs.ruleWeekly}
                        </SelectItem>
                        <SelectItem value="MONTHLY">
                          {COPY.programs.ruleMonthly}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.dayOfWeekLabel}
                    </span>
                    <Select
                      value={newRule.dayOfWeek}
                      onValueChange={(value) =>
                        setNewRule((previous) => ({
                          ...previous,
                          dayOfWeek: value,
                        }))
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        className={styles.select}
                        aria-label={COPY.programs.dayOfWeekLabel}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_LABELS.map((label, index) => (
                          <SelectItem key={label} value={String(index)}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.monthDayLabel}
                    </span>
                    <Input
                      className={styles.input}
                      type="number"
                      min={1}
                      max={31}
                      value={newRule.monthDay}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          monthDay: event.target.value,
                        }))
                      }
                      disabled={busy}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.startTime}
                    </span>
                    <Input
                      className={styles.input}
                      type="time"
                      required
                      value={newRule.startTime}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          startTime: event.target.value,
                        }))
                      }
                      disabled={busy}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.endTime}
                    </span>
                    <Input
                      className={styles.input}
                      type="time"
                      required
                      value={newRule.endTime}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          endTime: event.target.value,
                        }))
                      }
                      disabled={busy}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {COPY.programs.ruleLocation}
                    </span>
                    <Input
                      className={styles.input}
                      type="text"
                      value={newRule.location}
                      placeholder={COPY.programs.ruleLocationPlaceholder}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          location: event.target.value,
                        }))
                      }
                      disabled={busy}
                    />
                  </label>
                  <div className={styles.settingsActions}>
                    <Button
                      className={styles.button}
                      type="submit"
                      disabled={busy}
                    >
                      {COPY.programs.addRule}
                    </Button>
                  </div>
                </form>
                <div className={styles.settingsActions}>
                  {onTaskChange && (
                    <Button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => onTaskChange("events")}
                    >
                      {COPY.programs.settingsScheduleEventsLink}
                    </Button>
                  )}
                </div>
                <p className={styles.timeMarker}>
                  {COPY.programs.hkTimeMarker}
                </p>
              </>
            )}
          </section>

          <section
            className={styles.settingsGroup}
            aria-labelledby="program-settings-attendance"
          >
            <div>
              <h5
                id="program-settings-attendance"
                className={styles.workspaceSubheading}
              >
                {COPY.programs.settingsAttendance}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsAttendanceLead}
              </p>
            </div>
            {!attendanceEnabled ? (
              <p className={styles.settingsReadonly}>
                {COPY.programs.settingsAttendanceUnavailable}
              </p>
            ) : (
              <form className={styles.settingsForm} onSubmit={saveAttendance}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {COPY.programs.settingsAttendanceOpens}
                  </span>
                  <Input
                    className={styles.input}
                    type="number"
                    aria-label={COPY.programs.settingsAttendanceOpens}
                    min={0}
                    step={1}
                    required
                    value={attendance.opensBefore}
                    onChange={(event) =>
                      setAttendance((previous) => ({
                        ...previous,
                        opensBefore: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                  <span className={styles.fieldHint}>
                    {COPY.programs.settingsAttendanceUnits}
                  </span>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {COPY.programs.settingsAttendanceCloses}
                  </span>
                  <Input
                    className={styles.input}
                    type="number"
                    aria-label={COPY.programs.settingsAttendanceCloses}
                    min={0}
                    step={1}
                    required
                    value={attendance.closesAfter}
                    onChange={(event) =>
                      setAttendance((previous) => ({
                        ...previous,
                        closesAfter: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                  <span className={styles.fieldHint}>
                    {COPY.programs.settingsAttendanceUnits}
                  </span>
                </label>
                <div className={styles.settingsActions}>
                  <Button
                    className={styles.button}
                    type="submit"
                    disabled={busy}
                  >
                    {COPY.programs.settingsSaveAttendance}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      <Button
        className={styles.programDetailBack}
        type="button"
        onClick={() => onTaskChange?.(null)}
      >
        {COPY.programs.backToOverview}
      </Button>
    </section>
  );
};
