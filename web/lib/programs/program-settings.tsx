"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  createScheduleException,
  createScheduleRule,
  deleteScheduleException,
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

import styles from "@/app/programs/programs.module.css";

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
  onTaskChange?: (task: "events" | null) => void;
}
const LIFECYCLE_LABEL: Record<Program["lifecycle"], string> = {
  Draft: COPY.programs.lifecycleDraft,
  Active: COPY.programs.lifecycleActive,
  Archived: COPY.programs.lifecycleArchived,
};

const WEEKDAY_LABELS = [
  COPY.programs.weekdaySunday,
  COPY.programs.weekdayMonday,
  COPY.programs.weekdayTuesday,
  COPY.programs.weekdayWednesday,
  COPY.programs.weekdayThursday,
  COPY.programs.weekdayFriday,
  COPY.programs.weekdaySaturday,
];

function errorMessage(error: unknown): string {
  if (error instanceof RpcError) {
    if (error.problem.code === "CONFLICT") {
      return COPY.programs.programConflict;
    }
    return errorCopyFor(error.problem.code, error.problem.detail);
  }
  return COPY.error.networkError;
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
  });
  const [exceptionRuleId, setExceptionRuleId] = useState<string | null>(null);
  const [exceptionDrafts, setExceptionDrafts] = useState<
    Record<string, ExceptionValues>
  >({});
  const [exceptions, setExceptions] = useState<
    Record<string, ScheduleException>
  >({});
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
    try {
      const result = await listScheduleRules(currentProgram.program_id);
      if (!mounted.current) {
        return;
      }
      setRules(result.rules);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setRuleError(errorMessage(error));
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
        const message = errorMessage(error);
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
    if (!basics.name.trim() || !Number.isSafeInteger(displayOrder) || displayOrder < 0) {
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
    async (operation: () => Promise<unknown>, success: string) => {
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
        setNotice(success);
        announce(success);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = errorMessage(error);
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
      COPY.programs.settingsSaved
    );
    setNewRule((previous) => ({ ...previous, startTime: "", endTime: "" }));
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
        COPY.programs.settingsSaved
      );
      setEditingRuleId(null);
    };

  const exceptionDraftFor = (ruleId: string): ExceptionValues =>
    exceptionDrafts[ruleId] ?? defaultExceptionValues();

  const submitException =
    (rule: ScheduleRule) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = exceptionDraftFor(rule.rule_id);
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
              [rule.rule_id]: result.exception,
            }));
          }
        },
        COPY.programs.settingsSaved
      );
      setExceptionRuleId(null);
    };

  const removeException = (exception: ScheduleException) => {
    void runScheduleMutation(
      async () => {
        await deleteScheduleException(
          currentProgram.program_id,
          exception.rule_id,
          exception.exception_id
        );
        setExceptions((previous) => {
          const next = { ...previous };
          delete next[exception.rule_id];
          return next;
        });
      },
      COPY.programs.settingsSaved
    );
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
        <output className={styles.panelError} role="alert" aria-live="assertive">
          {actionError}
        </output>
      )}
      {!canManage ? (
        <section
          className={styles.settingsUnavailable}
          aria-labelledby="program-settings-unavailable"
        >
          <h5 id="program-settings-unavailable" className={styles.workspaceSubheading}>
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
              <h5 id="program-settings-basics" className={styles.workspaceSubheading}>
                {COPY.programs.settingsBasics}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsBasicsLead}
              </p>
            </div>
            <form className={styles.settingsForm} onSubmit={saveBasics}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.programName}</span>
                <input
                  className={styles.input}
                  value={basics.name}
                  onChange={(event) =>
                    setBasics((previous) => ({ ...previous, name: event.target.value }))
                  }
                  required
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.programDescription}</span>
                <textarea
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
                <span className={styles.fieldLabel}>{COPY.programs.programCategory}</span>
                <input
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
                <span className={styles.fieldLabel}>{COPY.programs.programDisplayOrder}</span>
                <input
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
                <button className={styles.button} type="submit" disabled={busy}>
                  {COPY.programs.settingsSaveBasics}
                </button>
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
            <p className={styles.fieldHint}>{COPY.programs.settingsLifecycleHint}</p>
            <form className={styles.settingsForm} onSubmit={saveEnrollment}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.discoverabilityListed}</span>
                <select
                  className={styles.select}
                  aria-label={COPY.programs.discoverabilityListed}
                  value={enrollment.discoverability}
                  onChange={(event) =>
                    setEnrollment((previous) => ({
                      ...previous,
                      discoverability: event.target.value as Program["discoverability"],
                    }))
                  }
                  disabled={busy}
                >
                  <option value="Unlisted">{COPY.programs.discoverabilityUnlisted}</option>
                  <option value="Listed">{COPY.programs.discoverabilityListed}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.programEnrollmentMode}</span>
                <select
                  className={styles.select}
                  aria-label={COPY.programs.programEnrollmentMode}
                  value={enrollment.enrollmentMode}
                  onChange={(event) =>
                    setEnrollment((previous) => ({
                      ...previous,
                      enrollmentMode: event.target.value as Program["enrollment_mode"],
                    }))
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
              <div className={styles.settingsActions}>
                {!confirmingEnrollment && (
                  <button className={styles.button} type="submit" disabled={busy}>
                    {COPY.programs.settingsSaveEnrollment}
                  </button>
                )}
                {confirmingEnrollment && (
                  <div
                    className={styles.confirmRow}
                    role="alert"
                    aria-label={COPY.programs.settingsConfirmEnrollment}
                  >
                    <span>{COPY.programs.settingsConfirmEnrollment}</span>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={busy}
                      onClick={confirmEnrollment}
                    >
                      {COPY.programs.settingsConfirmChange}
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingEnrollment(false)}
                    >
                      {COPY.programs.settingsKeepCurrent}
                    </button>
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
              <h5 id="program-settings-schedule" className={styles.workspaceSubheading}>
                {COPY.programs.settingsSchedule}
              </h5>
              <p className={styles.settingsGroupLead}>
                {COPY.programs.settingsScheduleLead}
              </p>
            </div>
            {currentProgram.behavior_type === "OneOff" ? (
              <p className={styles.settingsReadonly}>{COPY.programs.settingsScheduleOneOff}</p>
            ) : !eventsEnabled ? (
              <p className={styles.settingsReadonly}>
                {COPY.programs.settingsScheduleUnavailable}
              </p>
            ) : (
              <>
                {ruleError !== null && (
                  <output className={styles.panelError} role="alert">
                    {ruleError}
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={() => void loadRules()}
                      disabled={busy}
                    >
                      {COPY.programs.settingsScheduleRetry}
                    </button>
                  </output>
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
                        const draft = ruleDrafts[rule.rule_id] ?? ruleValuesFrom(rule);
                        const exception = exceptions[rule.rule_id];
                        return (
                          <li key={rule.rule_id} className={styles.settingsRuleRow}>
                            {editingRuleId === rule.rule_id ? (
                              <form
                                className={styles.settingsForm}
                                onSubmit={submitRuleEdit(rule)}
                              >
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>{COPY.programs.behaviorType}</span>
                                  <select
                                    className={styles.select}
                                    value={draft.recurrence}
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          recurrence: event.target.value as RuleValues["recurrence"],
                                        },
                                      }))
                                    }
                                  >
                                    <option value="WEEKLY">{COPY.programs.ruleWeekly}</option>
                                    <option value="MONTHLY">{COPY.programs.ruleMonthly}</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>{COPY.programs.dayOfWeekLabel}</span>
                                  <select
                                    className={styles.select}
                                    value={draft.dayOfWeek}
                                    onChange={(event) =>
                                      setRuleDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: {
                                          ...draft,
                                          dayOfWeek: event.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    {WEEKDAY_LABELS.map((label, index) => (
                                      <option key={label} value={index}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span className={styles.fieldLabel}>{COPY.programs.monthDayLabel}</span>
                                  <input
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
                                  <span className={styles.fieldLabel}>{COPY.programs.startTime}</span>
                                  <input
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
                                  <span className={styles.fieldLabel}>{COPY.programs.endTime}</span>
                                  <input
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
                                <div className={styles.settingsActions}>
                                  <button className={styles.button} type="submit" disabled={busy}>
                                    {COPY.programs.settingsRuleSave}
                                  </button>
                                  <button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => setEditingRuleId(null)}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleCancel}
                                  </button>
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
                                  <button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => beginRuleEdit(rule)}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleEdit}
                                  </button>
                                  <button
                                    className={styles.secondaryButton}
                                    type="button"
                                    onClick={() => {
                                      setExceptionRuleId(rule.rule_id);
                                      setExceptionDrafts((previous) => ({
                                        ...previous,
                                        [rule.rule_id]: exceptionDraftFor(rule.rule_id),
                                      }));
                                    }}
                                    disabled={busy}
                                  >
                                    {COPY.programs.settingsRuleAddException}
                                  </button>
                                  {exception && (
                                    <button
                                      className={styles.successOutline}
                                      type="button"
                                      onClick={() => removeException(exception)}
                                      disabled={busy}
                                    >
                                      {COPY.programs.settingsExceptionRestore}
                                    </button>
                                  )}
                                </div>
                                {exception && (
                                  <p className={styles.settingsReadonly}>
                                    {exception.override_date} · {exception.action === "CANCEL" ? COPY.programs.settingsExceptionCancel : COPY.programs.settingsExceptionReschedule}
                                  </p>
                                )}
                                {exceptionRuleId === rule.rule_id && (
                                  <form
                                    className={styles.settingsForm}
                                    onSubmit={submitException(rule)}
                                  >
                                    <label className={styles.field}>
                                      <span className={styles.fieldLabel}>{COPY.programs.settingsExceptionDate}</span>
                                      <input
                                        className={styles.input}
                                        type="date"
                                        required
                                        value={exceptionDraftFor(rule.rule_id).overrideDate}
                                        onChange={(event) =>
                                          setExceptionDrafts((previous) => ({
                                            ...previous,
                                            [rule.rule_id]: {
                                              ...exceptionDraftFor(rule.rule_id),
                                              overrideDate: event.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                    <label className={styles.field}>
                                      <span className={styles.fieldLabel}>{COPY.programs.settingsExceptionAction}</span>
                                      <select
                                        className={styles.select}
                                        value={exceptionDraftFor(rule.rule_id).action}
                                        onChange={(event) =>
                                          setExceptionDrafts((previous) => ({
                                            ...previous,
                                            [rule.rule_id]: {
                                              ...exceptionDraftFor(rule.rule_id),
                                              action: event.target.value as ExceptionValues["action"],
                                            },
                                          }))
                                        }
                                      >
                                        <option value="CANCEL">{COPY.programs.settingsExceptionCancel}</option>
                                        <option value="RESCHEDULE">{COPY.programs.settingsExceptionReschedule}</option>
                                      </select>
                                    </label>
                                    {exceptionDraftFor(rule.rule_id).action === "RESCHEDULE" && (
                                      <>
                                        <label className={styles.field}>
                                          <span className={styles.fieldLabel}>{COPY.programs.settingsExceptionNewStart}</span>
                                          <input
                                            className={styles.input}
                                            type="time"
                                            required
                                            value={exceptionDraftFor(rule.rule_id).newStartTime}
                                            onChange={(event) =>
                                              setExceptionDrafts((previous) => ({
                                                ...previous,
                                                [rule.rule_id]: {
                                                  ...exceptionDraftFor(rule.rule_id),
                                                  newStartTime: event.target.value,
                                                },
                                              }))
                                            }
                                          />
                                        </label>
                                        <label className={styles.field}>
                                          <span className={styles.fieldLabel}>{COPY.programs.settingsExceptionNewEnd}</span>
                                          <input
                                            className={styles.input}
                                            type="time"
                                            required
                                            value={exceptionDraftFor(rule.rule_id).newEndTime}
                                            onChange={(event) =>
                                              setExceptionDrafts((previous) => ({
                                                ...previous,
                                                [rule.rule_id]: {
                                                  ...exceptionDraftFor(rule.rule_id),
                                                  newEndTime: event.target.value,
                                                },
                                              }))
                                            }
                                          />
                                        </label>
                                      </>
                                    )}
                                    <div className={styles.settingsActions}>
                                      <button className={styles.button} type="submit" disabled={busy}>
                                        {COPY.programs.settingsExceptionSave}
                                      </button>
                                      <button
                                        className={styles.secondaryButton}
                                        type="button"
                                        onClick={() => setExceptionRuleId(null)}
                                        disabled={busy}
                                      >
                                        {COPY.programs.settingsRuleCancel}
                                      </button>
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
                <form className={styles.settingsForm} onSubmit={submitNewRule}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{COPY.programs.behaviorType}</span>
                    <select
                      className={styles.select}
                      value={newRule.recurrence}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          recurrence: event.target.value as RuleValues["recurrence"],
                        }))
                      }
                      disabled={busy}
                    >
                      <option value="WEEKLY">{COPY.programs.ruleWeekly}</option>
                      <option value="MONTHLY">{COPY.programs.ruleMonthly}</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{COPY.programs.dayOfWeekLabel}</span>
                    <select
                      className={styles.select}
                      value={newRule.dayOfWeek}
                      onChange={(event) =>
                        setNewRule((previous) => ({
                          ...previous,
                          dayOfWeek: event.target.value,
                        }))
                      }
                      disabled={busy}
                    >
                      {WEEKDAY_LABELS.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{COPY.programs.monthDayLabel}</span>
                    <input
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
                    <span className={styles.fieldLabel}>{COPY.programs.startTime}</span>
                    <input
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
                    <span className={styles.fieldLabel}>{COPY.programs.endTime}</span>
                    <input
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
                  <div className={styles.settingsActions}>
                    <button className={styles.button} type="submit" disabled={busy}>
                      {COPY.programs.addRule}
                    </button>
                  </div>
                </form>
                <div className={styles.settingsActions}>
                  {onTaskChange && (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => onTaskChange("events")}
                    >
                      {COPY.programs.settingsScheduleEventsLink}
                    </button>
                  )}
                </div>
                <p className={styles.timeMarker}>{COPY.programs.hkTimeMarker}</p>
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
            <form className={styles.settingsForm} onSubmit={saveAttendance}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.settingsAttendanceOpens}</span>
                <input
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
                <span className={styles.fieldHint}>{COPY.programs.settingsAttendanceUnits}</span>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{COPY.programs.settingsAttendanceCloses}</span>
                <input
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
                <span className={styles.fieldHint}>{COPY.programs.settingsAttendanceUnits}</span>
              </label>
              <div className={styles.settingsActions}>
                <button className={styles.button} type="submit" disabled={busy}>
                  {COPY.programs.settingsSaveAttendance}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <button
        className={styles.programDetailBack}
        type="button"
        onClick={() => onTaskChange?.(null)}
      >
        {COPY.programs.backToOverview}
      </button>
    </section>
  );
};
