"use client";

import {
  Archive,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Eye,
  Pencil,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
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
  ProgramPatch,
  ScheduleException,
  ScheduleRule,
  ScheduleRuleInput,
} from "@/lib/programs/program-api";
import { isWallDate, WEEKDAY_LABELS } from "@/lib/programs/recurrence";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStickyActions,
} from "@/lib/screen-foundations";

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

interface PublishingValues {
  lifecycle: Program["lifecycle"];
  discoverability: Program["discoverability"];
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
  onTaskChange?: (task: "events" | "schedule" | null) => void;
  /** Render one focused editor, or all legacy editor groups for direct callers. */
  section?: "all" | ProgramSettingsSection;
  /** Let a route-owned ScreenHeader provide the page title for a focused editor. */
  showHeading?: boolean;
  /** Optional focused-Schedule companion that consumes this editor's rule read. */
  scheduleAddon?: (resource: {
    rules: ScheduleRule[] | null;
    rulesError: string | null;
  }) => React.ReactNode;
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

function isRetryableSettingsMutation(error: unknown): boolean {
  if (!(error instanceof RpcError)) {
    return true;
  }
  return (
    error.problem.status === 0 ||
    error.problem.code === "NETWORK_ERROR" ||
    error.problem.code === "MALFORMED_RESPONSE" ||
    error.problem.code === "MALFORMED_REQUEST" ||
    error.problem.code === "UNAVAILABLE"
  );
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

function publishingFrom(program: Program): PublishingValues {
  return {
    lifecycle: program.lifecycle,
    discoverability: program.discoverability,
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

export type ProgramSettingsSection =
  | "basics"
  | "publishing"
  | "enrollment"
  | "schedule"
  | "attendance";

export interface SettingsHubProps {
  program: Program;
  eventsEnabled?: boolean;
  attendanceEnabled?: boolean;
  onSelect: (section: ProgramSettingsSection) => void;
  accessHref?: string;
  scheduleHref?: string;
  notificationsHref?: string;
}

const SettingsHubRow = ({
  icon,
  title,
  description,
  onClick,
  href,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
}) => {
  const content = (
    <>
      {icon}
      <ScreenRowMain>
        <ScreenRowTitle>{title}</ScreenRowTitle>
        <ScreenRowMeta>{description}</ScreenRowMeta>
      </ScreenRowMain>
      <ScreenRowTrailing>
        <ChevronRight
          aria-hidden="true"
          className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
          strokeWidth={1.8}
        />
      </ScreenRowTrailing>
    </>
  );

  return (
    <ScreenRow asChild density="settings">
      {href ? (
        <Link
          href={href}
          aria-label={title}
          className="text-left"
          data-screen-settings-row={tone}
        >
          {content}
        </Link>
      ) : (
        <Button
          type="button"
          className="border-0 bg-transparent hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-ink)]"
          onClick={onClick}
          data-screen-settings-row={tone}
          size="row"
          shape="square"
          variant="ghost"
        >
          {content}
        </Button>
      )}
    </ScreenRow>
  );
};

export const SettingsHub = ({
  program,
  eventsEnabled = true,
  attendanceEnabled = true,
  onSelect,
  accessHref,
  scheduleHref,
  notificationsHref,
}: SettingsHubProps) => {
  const canManage = program.capabilities.manage;
  const showSchedule =
    canManage &&
    program.behavior_type === "Recurring" &&
    eventsEnabled &&
    scheduleHref !== undefined;
  const showAttendance = canManage && attendanceEnabled;
  const showArchive = canManage && program.lifecycle === "Active";
  const showCommunication = canManage && notificationsHref !== undefined;

  return (
    <section
      className="grid min-w-0 gap-[var(--screen-section-gap)]"
      aria-labelledby="program-settings-title"
    >
      <div>
        <h2
          id="program-settings-title"
          className="m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]"
        >
          {COPY.programs.settingsHubTitle}
        </h2>
        <p className="m-0 mt-1 text-sm leading-6 text-[var(--screen-muted)] [overflow-wrap:anywhere]">
          {COPY.programs.settingsHubLead}
        </p>
      </div>
      {canManage && (
        <ScreenSection title="課程">
          <ScreenRowList>
            <SettingsHubRow
              icon={
                <Pencil
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                  strokeWidth={1.8}
                />
              }
              title={COPY.programs.settingsHubBasics}
              description={COPY.programs.settingsHubBasicsHint}
              onClick={() => onSelect("basics")}
            />
            <SettingsHubRow
              icon={
                <Eye
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                  strokeWidth={1.8}
                />
              }
              title={COPY.programs.settingsHubPublishing}
              description={COPY.programs.settingsHubPublishingHint}
              onClick={() => onSelect("publishing")}
            />
          </ScreenRowList>
        </ScreenSection>
      )}
      {(canManage || accessHref !== undefined) && (
        <ScreenSection title="參與">
          <ScreenRowList>
            {canManage && (
              <SettingsHubRow
                icon={
                  <Users
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                    strokeWidth={1.8}
                  />
                }
                title={COPY.programs.settingsHubEnrollment}
                description={COPY.programs.settingsHubEnrollmentHint}
                onClick={() => onSelect("enrollment")}
              />
            )}
            {accessHref !== undefined && (
              <SettingsHubRow
                icon={
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                    strokeWidth={1.8}
                  />
                }
                title={COPY.programs.settingsHubAccess}
                description={COPY.programs.settingsHubAccessHint}
                href={accessHref}
              />
            )}
          </ScreenRowList>
        </ScreenSection>
      )}
      {(showSchedule || showAttendance) && (
        <ScreenSection title="聚會">
          <ScreenRowList>
            {showSchedule && (
              <SettingsHubRow
                icon={
                  <CalendarDays
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                    strokeWidth={1.8}
                  />
                }
                title={COPY.programs.settingsHubSchedule}
                description={COPY.programs.settingsHubScheduleHint}
                href={scheduleHref}
              />
            )}
            {showAttendance && (
              <SettingsHubRow
                icon={
                  <Clock3
                    aria-hidden="true"
                    className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                    strokeWidth={1.8}
                  />
                }
                title={COPY.programs.settingsHubAttendance}
                description={COPY.programs.settingsHubAttendanceHint}
                onClick={() => onSelect("attendance")}
              />
            )}
          </ScreenRowList>
        </ScreenSection>
      )}
      {showCommunication && (
        <ScreenSection title="溝通">
          <ScreenRowList>
            <SettingsHubRow
              icon={
                <Bell
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
                  strokeWidth={1.8}
                />
              }
              title={COPY.programs.settingsHubNotifications}
              description={COPY.programs.settingsHubNotificationsHint}
              href={notificationsHref}
            />
          </ScreenRowList>
        </ScreenSection>
      )}
      {showArchive && (
        <ScreenSection title="高風險操作">
          <ScreenRowList>
            <SettingsHubRow
              icon={
                <Archive
                  aria-hidden="true"
                  className="size-[var(--screen-icon-size)] text-[var(--screen-danger)]"
                  strokeWidth={1.8}
                />
              }
              title={COPY.programs.settingsHubArchive}
              description={COPY.programs.settingsHubArchiveHint}
              tone="danger"
              onClick={() => onSelect("publishing")}
            />
          </ScreenRowList>
        </ScreenSection>
      )}
    </section>
  );
};

// oxlint-disable-next-line eslint/complexity
export const ProgramSettings = ({
  program,
  eventsEnabled = true,
  attendanceEnabled = true,
  onTaskChange,
  section = "all",
  showHeading = true,
  scheduleAddon,
}: ProgramSettingsProps) => {
  const [currentProgram, setCurrentProgram] = useState(program);
  const [basics, setBasics] = useState(() => basicsFrom(program));
  const [publishing, setPublishing] = useState(() => publishingFrom(program));
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
  const [confirmingPublishing, setConfirmingPublishing] = useState(false);
  const [confirmingEnrollment, setConfirmingEnrollment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryPatch, setRetryPatch] = useState<ProgramPatch | null>(null);
  const mounted = useRef(true);
  const canManage = currentProgram.capabilities.manage;
  const focusedSection = section !== "all";
  const focusedSchedule = section === "schedule";
  const focusedEditor = focusedSection && !focusedSchedule;
  const showStickyActions = focusedEditor && canManage;
  const showBasics = !focusedSection || section === "basics";
  const showPublishing = section === "publishing";
  const showEnrollment = !focusedSection || section === "enrollment";
  const showSchedule = !focusedSection || focusedSchedule;
  const showAttendance = !focusedSection || section === "attendance";
  const basicsDirty =
    JSON.stringify(basics) !== JSON.stringify(basicsFrom(currentProgram));
  const publishingDirty =
    JSON.stringify(publishing) !==
    JSON.stringify(publishingFrom(currentProgram));
  const enrollmentDirty =
    JSON.stringify(enrollment) !==
    JSON.stringify(enrollmentFrom(currentProgram));
  const attendanceDirty =
    JSON.stringify(attendance) !==
    JSON.stringify(attendanceFrom(currentProgram));
  const focusedDirty =
    section === "basics"
      ? basicsDirty
      : section === "publishing"
        ? publishingDirty
        : section === "enrollment"
          ? enrollmentDirty
          : section === "attendance"
            ? attendanceDirty
            : false;
  const focusedFormId = focusedEditor
    ? `program-settings-${section}-form`
    : undefined;
  const focusedSaveLabel =
    section === "basics"
      ? COPY.programs.settingsSaveBasics
      : section === "publishing"
        ? COPY.programs.settingsSavePublishing
        : section === "enrollment"
          ? COPY.programs.settingsSaveEnrollment
          : COPY.programs.settingsSaveAttendance;

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
      // Keep the editor in an unresolved state after a failed read. An empty
      // list is reserved for an authoritative successful response with no
      // configured rules, so recovery never lies with a "no rules" state.
      setRules(null);
    }
  }, [
    canManage,
    currentProgram.behavior_type,
    currentProgram.program_id,
    eventsEnabled,
  ]);

  useEffect(() => {
    if (focusedSection && !focusedSchedule) {
      return;
    }
    void loadRules();
  }, [focusedSchedule, focusedSection, loadRules]);

  const applyProgram = useCallback((next: Program) => {
    setCurrentProgram(next);
    setBasics(basicsFrom(next));
    setPublishing(publishingFrom(next));
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
        setRetryPatch(null);
        setNotice(COPY.programs.settingsSaved);
        announce(COPY.programs.settingsSaved);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = settingsErrorMessage(error);
        const retryable = isRetryableSettingsMutation(error);
        setRetryPatch(retryable ? patch : null);
        setActionError(
          retryable ? COPY.programs.programTransportAmbiguous : message
        );
        announce(retryable ? COPY.programs.programTransportAmbiguous : message);
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
    setRetryPatch(null);
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
    setRetryPatch(null);
    if (
      enrollment.discoverability === currentProgram.discoverability &&
      enrollment.enrollmentMode === currentProgram.enrollment_mode
    ) {
      setNotice(COPY.programs.settingsSaved);
      return;
    }
    setConfirmingEnrollment(true);
  };

  const savePublishing = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRetryPatch(null);
    if (
      publishing.lifecycle === currentProgram.lifecycle &&
      publishing.discoverability === currentProgram.discoverability
    ) {
      setNotice(COPY.programs.settingsSaved);
      return;
    }
    setConfirmingPublishing(true);
  };

  const confirmPublishing = () => {
    setConfirmingPublishing(false);
    void runProgramMutation(
      publishing.lifecycle === "Archived"
        ? { lifecycle: "Archived" }
        : {
            lifecycle: publishing.lifecycle,
            discoverability: publishing.discoverability,
          }
    );
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
    setRetryPatch(null);
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

  const discardFocusedChanges = () => {
    if (section === "basics") {
      setBasics(basicsFrom(currentProgram));
    } else if (section === "publishing") {
      setPublishing(publishingFrom(currentProgram));
      setConfirmingPublishing(false);
    } else if (section === "enrollment") {
      setEnrollment(enrollmentFrom(currentProgram));
      setConfirmingEnrollment(false);
    } else if (section === "attendance") {
      setAttendance(attendanceFrom(currentProgram));
    }
    setRetryPatch(null);
    setActionError(null);
    setNotice(null);
  };

  return (
    <section
      className={`grid min-w-0 gap-4 ${showStickyActions ? "pb-[calc(var(--screen-bottom-nav-height)+env(safe-area-inset-bottom,0px))]" : ""}`}
      aria-labelledby={
        showHeading
          ? focusedSection
            ? "program-settings-focused-title"
            : "program-settings-title"
          : "program-settings-schedule"
      }
    >
      {showHeading && (
        <div>
          <h2
            id={
              focusedSection
                ? "program-settings-focused-title"
                : "program-settings-title"
            }
            className="m-0 min-w-0 wrap-anywhere text-[length:var(--screen-child-title-size)] font-extrabold leading-[var(--screen-child-title-leading)] tracking-[-0.02em]"
          >
            {focusedSchedule
              ? COPY.programs.schedulePageTitle
              : section === "basics"
                ? COPY.programs.settingsBasics
                : section === "publishing"
                  ? COPY.programs.settingsPublishing
                  : section === "enrollment"
                    ? COPY.programs.settingsEnrollment
                    : section === "attendance"
                      ? COPY.programs.settingsAttendance
                      : COPY.programs.workspaceTaskSettings}
          </h2>
          <p className="m-0 mt-1 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
            {focusedSchedule
              ? COPY.programs.schedulePageLead
              : section === "basics"
                ? COPY.programs.settingsBasicsLead
                : section === "publishing"
                  ? COPY.programs.settingsPublishingLead
                  : section === "enrollment"
                    ? COPY.programs.settingsEnrollmentLead
                    : section === "attendance"
                      ? COPY.programs.settingsAttendanceLead
                      : COPY.programs.workspaceTaskSettingsLead}
          </p>
        </div>
      )}
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          {notice}
        </Alert>
      )}
      {actionError !== null && (
        <ScreenState
          kind="error"
          title={actionError}
          action={
            retryPatch !== null ? (
              <Button
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                type="button"
                onClick={() => void runProgramMutation(retryPatch)}
                disabled={busy}
              >
                {COPY.programs.settingsRetrySave}
              </Button>
            ) : undefined
          }
        />
      )}
      {!canManage ? (
        <ScreenState
          id="program-settings-unavailable"
          kind="forbidden"
          title={COPY.programs.settingsNoManagement}
          description={COPY.programs.settingsNoManagementHint}
        />
      ) : (
        <div className="grid min-w-0 gap-4">
          {showBasics && (
            <ScreenSection
              className="mt-0"
              headingId={focusedEditor ? undefined : "program-settings-basics"}
              title={focusedEditor ? undefined : COPY.programs.settingsBasics}
            >
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsBasicsLead}
              </p>
              <ScreenEditor
                id="program-settings-basics-form"
                onSubmit={saveBasics}
              >
                <ScreenField
                  htmlFor="program-settings-basics-name"
                  label={COPY.programs.programName}
                >
                  <Input
                    id="program-settings-basics-name"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                </ScreenField>
                <ScreenField
                  htmlFor="program-settings-basics-description"
                  label={COPY.programs.programDescription}
                >
                  <Textarea
                    id="program-settings-basics-description"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                </ScreenField>
                <ScreenField
                  htmlFor="program-settings-basics-category"
                  label={COPY.programs.programCategory}
                >
                  <Input
                    id="program-settings-basics-category"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                    value={basics.category}
                    onChange={(event) =>
                      setBasics((previous) => ({
                        ...previous,
                        category: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                </ScreenField>
                <ScreenField
                  htmlFor="program-settings-basics-display-order"
                  label={COPY.programs.programDisplayOrder}
                >
                  <Input
                    id="program-settings-basics-display-order"
                    className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                </ScreenField>
                {!focusedEditor && (
                  <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                    <Button
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                      type="submit"
                      disabled={busy}
                    >
                      {COPY.programs.settingsSaveBasics}
                    </Button>
                  </div>
                )}
              </ScreenEditor>
            </ScreenSection>
          )}

          {showPublishing && (
            <ScreenSection
              className="mt-0"
              headingId={
                focusedEditor ? undefined : "program-settings-publishing"
              }
              title={
                focusedEditor ? undefined : COPY.programs.settingsPublishing
              }
            >
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsPublishingLead}
              </p>
              <ScreenEditor
                id="program-settings-publishing-form"
                onSubmit={savePublishing}
              >
                <ScreenField
                  htmlFor="program-settings-publishing-lifecycle"
                  label={COPY.programs.settingsLifecycle}
                >
                  <Select
                    value={publishing.lifecycle}
                    onValueChange={(value) =>
                      setPublishing((previous) => ({
                        ...previous,
                        lifecycle: value as Program["lifecycle"],
                      }))
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      id="program-settings-publishing-lifecycle"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      aria-label={COPY.programs.settingsLifecycle}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">
                        {COPY.programs.lifecycleDraft}
                      </SelectItem>
                      <SelectItem value="Active">
                        {COPY.programs.lifecycleActive}
                      </SelectItem>
                      <SelectItem value="Archived">
                        {COPY.programs.lifecycleArchived}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </ScreenField>
                <ScreenField
                  htmlFor="program-settings-publishing-discoverability"
                  label={COPY.programs.discoverabilityListed}
                >
                  <Select
                    value={publishing.discoverability}
                    onValueChange={(value) =>
                      setPublishing((previous) => ({
                        ...previous,
                        discoverability: value as Program["discoverability"],
                      }))
                    }
                    disabled={busy}
                  >
                    <SelectTrigger
                      id="program-settings-publishing-discoverability"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                  {COPY.programs.settingsConfirmPublishing}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                  {!focusedEditor && !confirmingPublishing && (
                    <Button
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                      type="submit"
                      disabled={busy}
                    >
                      {COPY.programs.settingsSavePublishing}
                    </Button>
                  )}
                  {confirmingPublishing && (
                    <div
                      className="grid min-w-0 gap-[var(--screen-utility-gap)] border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] p-3"
                      role="alert"
                      aria-label={COPY.programs.settingsConfirmPublishing}
                    >
                      <span>{COPY.programs.settingsConfirmPublishing}</span>
                      <Button
                        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                        type="button"
                        disabled={busy}
                        onClick={confirmPublishing}
                      >
                        {COPY.programs.settingsConfirmPublishingChange}
                      </Button>
                      <Button
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingPublishing(false)}
                      >
                        {COPY.programs.settingsKeepPublishing}
                      </Button>
                    </div>
                  )}
                </div>
              </ScreenEditor>
            </ScreenSection>
          )}

          {showEnrollment && (
            <ScreenSection
              className="mt-0"
              headingId={
                focusedEditor ? undefined : "program-settings-enrollment"
              }
              title={
                focusedEditor ? undefined : COPY.programs.settingsEnrollment
              }
            >
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsEnrollmentLead}
              </p>
              <ScreenCard>
                <dl className="grid min-w-0 gap-2">
                  <div>
                    <dt>{COPY.programs.settingsLifecycle}</dt>
                    <dd>{LIFECYCLE_LABEL[currentProgram.lifecycle]}</dd>
                  </div>
                </dl>
              </ScreenCard>
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsLifecycleHint}
              </p>
              <ScreenEditor
                id="program-settings-enrollment-form"
                onSubmit={saveEnrollment}
              >
                <ScreenField
                  htmlFor="program-settings-enrollment-discoverability"
                  label={COPY.programs.discoverabilityListed}
                >
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
                      id="program-settings-enrollment-discoverability"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                  htmlFor="program-settings-enrollment-mode"
                  label={COPY.programs.programEnrollmentMode}
                >
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
                      id="program-settings-enrollment-mode"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                  {!focusedEditor && !confirmingEnrollment && (
                    <Button
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                      type="submit"
                      disabled={busy}
                    >
                      {COPY.programs.settingsSaveEnrollment}
                    </Button>
                  )}
                  {confirmingEnrollment && (
                    <div
                      className="grid min-w-0 gap-[var(--screen-utility-gap)] border border-[var(--screen-pending)] bg-[var(--screen-pending-surface)] p-3"
                      role="alert"
                      aria-label={COPY.programs.settingsConfirmEnrollment}
                    >
                      <span>{COPY.programs.settingsConfirmEnrollment}</span>
                      <Button
                        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                        type="button"
                        disabled={busy}
                        onClick={confirmEnrollment}
                      >
                        {COPY.programs.settingsConfirmChange}
                      </Button>
                      <Button
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingEnrollment(false)}
                      >
                        {COPY.programs.settingsKeepCurrent}
                      </Button>
                    </div>
                  )}
                </div>
              </ScreenEditor>
            </ScreenSection>
          )}

          {showSchedule && (
            <ScreenSection
              className="mt-0"
              headingId="program-settings-schedule"
              title={
                focusedSchedule
                  ? COPY.programs.scheduleRulesTitle
                  : COPY.programs.settingsSchedule
              }
            >
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsScheduleLead}
              </p>
              {currentProgram.behavior_type === "OneOff" ? (
                <ScreenState
                  kind="empty"
                  title={COPY.programs.settingsScheduleOneOff}
                />
              ) : !eventsEnabled ? (
                <ScreenState
                  kind="empty"
                  title={COPY.programs.settingsScheduleUnavailable}
                />
              ) : (
                <>
                  {ruleError !== null && (
                    <Alert tone="error" announcement="assertive">
                      {ruleError}
                      <Button
                        type="button"
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        variant="outline"
                        onClick={() => void loadRules()}
                        disabled={busy}
                      >
                        {COPY.programs.settingsScheduleRetry}
                      </Button>
                    </Alert>
                  )}
                  {rules === null ? (
                    <ScreenLoadingRows
                      density="settings"
                      label={COPY.programs.settingsScheduleLoading}
                    />
                  ) : (
                    <ScreenRowList>
                      {rules.length === 0 ? (
                        <ScreenState
                          kind="empty"
                          title={COPY.programs.settingsScheduleNone}
                        />
                      ) : (
                        <ul
                          className="m-0 grid min-w-0 list-none gap-0 p-0"
                          aria-label={COPY.programs.settingsSchedule}
                        >
                          {rules.map((rule) => {
                            const draft =
                              ruleDrafts[rule.rule_id] ?? ruleValuesFrom(rule);
                            const ruleExceptions =
                              exceptions[rule.rule_id] ?? [];
                            return (
                              <li
                                key={rule.rule_id}
                                className="min-w-0 list-none border-b border-[var(--screen-line)] last:border-b-0"
                              >
                                <ScreenRow
                                  className="items-start flex-wrap border-b-0"
                                  aria-busy={busy}
                                >
                                  {editingRuleId === rule.rule_id ? (
                                    <ScreenEditor
                                      className="basis-full"
                                      onSubmit={submitRuleEdit(rule)}
                                    >
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-recurrence`}
                                        label={COPY.programs.behaviorType}
                                      >
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
                                            id={`program-settings-rule-${rule.rule_id}-recurrence`}
                                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                            aria-label={
                                              COPY.programs.behaviorType
                                            }
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
                                      </ScreenField>
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-day-of-week`}
                                        label={COPY.programs.dayOfWeekLabel}
                                      >
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
                                            id={`program-settings-rule-${rule.rule_id}-day-of-week`}
                                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                            aria-label={
                                              COPY.programs.dayOfWeekLabel
                                            }
                                          >
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {WEEKDAY_LABELS.map(
                                              (label, index) => (
                                                <SelectItem
                                                  key={label}
                                                  value={String(index)}
                                                >
                                                  {label}
                                                </SelectItem>
                                              )
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </ScreenField>
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-month-day`}
                                        label={COPY.programs.monthDayLabel}
                                      >
                                        <Input
                                          id={`program-settings-rule-${rule.rule_id}-month-day`}
                                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                                      </ScreenField>
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-start-time`}
                                        label={COPY.programs.startTime}
                                      >
                                        <Input
                                          id={`program-settings-rule-${rule.rule_id}-start-time`}
                                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                                      </ScreenField>
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-end-time`}
                                        label={COPY.programs.endTime}
                                      >
                                        <Input
                                          id={`program-settings-rule-${rule.rule_id}-end-time`}
                                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                                      </ScreenField>
                                      <ScreenField
                                        htmlFor={`program-settings-rule-${rule.rule_id}-location`}
                                        label={COPY.programs.ruleLocation}
                                      >
                                        <Input
                                          id={`program-settings-rule-${rule.rule_id}-location`}
                                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                          type="text"
                                          value={draft.location}
                                          placeholder={
                                            COPY.programs
                                              .ruleLocationPlaceholder
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
                                      </ScreenField>
                                      <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                                        <Button
                                          className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                                          type="submit"
                                          disabled={busy}
                                        >
                                          {COPY.programs.settingsRuleSave}
                                        </Button>
                                        <Button
                                          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                          type="button"
                                          variant="outline"
                                          onClick={() => setEditingRuleId(null)}
                                          disabled={busy}
                                        >
                                          {COPY.programs.settingsRuleCancel}
                                        </Button>
                                      </div>
                                    </ScreenEditor>
                                  ) : (
                                    <>
                                      <ScreenRowMain>
                                        <ScreenRowTitle>
                                          {rule.recurrence === "WEEKLY"
                                            ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0]}`
                                            : `${COPY.programs.ruleMonthly} ${rule.month_day}`}
                                        </ScreenRowTitle>
                                        <ScreenRowMeta>
                                          {rule.start_time}–{rule.end_time}
                                          {rule.location
                                            ? ` · ${rule.location}`
                                            : ""}
                                        </ScreenRowMeta>
                                      </ScreenRowMain>
                                      <ScreenRowTrailing>
                                        <Button
                                          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                          type="button"
                                          variant="outline"
                                          onClick={() => beginRuleEdit(rule)}
                                          disabled={busy}
                                        >
                                          {COPY.programs.settingsRuleEdit}
                                        </Button>
                                        <Button
                                          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                          type="button"
                                          variant="outline"
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
                                          {
                                            COPY.programs
                                              .settingsRuleAddException
                                          }
                                        </Button>
                                      </ScreenRowTrailing>
                                    </>
                                  )}
                                </ScreenRow>
                                {editingRuleId !== rule.rule_id && (
                                  <>
                                    {ruleExceptions.length > 0 && (
                                      <ScreenRowList className="border-t-0 pl-4">
                                        <ul
                                          className="m-0 grid min-w-0 list-none gap-0 p-0"
                                          aria-label={
                                            COPY.programs
                                              .settingsExistingExceptions
                                          }
                                        >
                                          {ruleExceptions.map((exception) => (
                                            <li
                                              key={exception.exception_id}
                                              className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--screen-utility-gap)] border-b border-[var(--screen-line)] py-2 last:border-b-0"
                                            >
                                              <ScreenRowMeta>
                                                {exception.override_date} ·{" "}
                                                {exception.action === "CANCEL"
                                                  ? COPY.programs
                                                      .settingsExceptionCancel
                                                  : COPY.programs
                                                      .settingsExceptionReschedule}
                                              </ScreenRowMeta>
                                              <Button
                                                className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                                                type="button"
                                                variant="outline"
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
                                      </ScreenRowList>
                                    )}
                                    {exceptionRuleId === rule.rule_id && (
                                      <ScreenEditor
                                        className="basis-full px-4 pb-4"
                                        onSubmit={submitException(rule)}
                                      >
                                        <ScreenField
                                          htmlFor={`program-settings-exception-${rule.rule_id}-date`}
                                          label={
                                            COPY.programs.settingsExceptionDate
                                          }
                                        >
                                          <Input
                                            id={`program-settings-exception-${rule.rule_id}-date`}
                                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                            type="date"
                                            required
                                            value={
                                              exceptionDraftFor(rule.rule_id)
                                                .overrideDate
                                            }
                                            onChange={(event) =>
                                              setExceptionDrafts(
                                                (previous) => ({
                                                  ...previous,
                                                  [rule.rule_id]: {
                                                    ...exceptionDraftFor(
                                                      rule.rule_id
                                                    ),
                                                    overrideDate:
                                                      event.target.value,
                                                  },
                                                })
                                              )
                                            }
                                            onInput={(event) => {
                                              const overrideDate =
                                                event.currentTarget.value;
                                              setExceptionDrafts(
                                                (previous) => ({
                                                  ...previous,
                                                  [rule.rule_id]: {
                                                    ...exceptionDraftFor(
                                                      rule.rule_id
                                                    ),
                                                    overrideDate,
                                                  },
                                                })
                                              );
                                            }}
                                          />
                                        </ScreenField>
                                        <ScreenField
                                          htmlFor={`program-settings-exception-${rule.rule_id}-action`}
                                          label={
                                            COPY.programs
                                              .settingsExceptionAction
                                          }
                                        >
                                          <Select
                                            value={
                                              exceptionDraftFor(rule.rule_id)
                                                .action
                                            }
                                            onValueChange={(value) =>
                                              setExceptionDrafts(
                                                (previous) => ({
                                                  ...previous,
                                                  [rule.rule_id]: {
                                                    ...exceptionDraftFor(
                                                      rule.rule_id
                                                    ),
                                                    action:
                                                      value as ExceptionValues["action"],
                                                  },
                                                })
                                              )
                                            }
                                          >
                                            <SelectTrigger
                                              id={`program-settings-exception-${rule.rule_id}-action`}
                                              className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                                        </ScreenField>
                                        {exceptionDraftFor(rule.rule_id)
                                          .action === "RESCHEDULE" && (
                                          <>
                                            <ScreenField
                                              htmlFor={`program-settings-exception-${rule.rule_id}-new-start`}
                                              label={
                                                COPY.programs
                                                  .settingsExceptionNewStart
                                              }
                                            >
                                              <Input
                                                id={`program-settings-exception-${rule.rule_id}-new-start`}
                                                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                                type="time"
                                                required
                                                value={
                                                  exceptionDraftFor(
                                                    rule.rule_id
                                                  ).newStartTime
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
                                            </ScreenField>
                                            <ScreenField
                                              htmlFor={`program-settings-exception-${rule.rule_id}-new-end`}
                                              label={
                                                COPY.programs
                                                  .settingsExceptionNewEnd
                                              }
                                            >
                                              <Input
                                                id={`program-settings-exception-${rule.rule_id}-new-end`}
                                                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                                                type="time"
                                                required
                                                value={
                                                  exceptionDraftFor(
                                                    rule.rule_id
                                                  ).newEndTime
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
                                            </ScreenField>
                                          </>
                                        )}
                                        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                                          <Button
                                            className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                                            type="submit"
                                            disabled={busy}
                                          >
                                            {
                                              COPY.programs
                                                .settingsExceptionSave
                                            }
                                          </Button>
                                          <Button
                                            className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                              setExceptionRuleId(null)
                                            }
                                            disabled={busy}
                                          >
                                            {COPY.programs.settingsRuleCancel}
                                          </Button>
                                        </div>
                                      </ScreenEditor>
                                    )}
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </ScreenRowList>
                  )}
                  {exceptionError !== null && (
                    <Alert tone="error" announcement="assertive">
                      {COPY.programs.settingsExceptionsLoadError}
                    </Alert>
                  )}
                  <ScreenEditor onSubmit={submitNewRule}>
                    <ScreenField
                      htmlFor="program-settings-new-rule-recurrence"
                      label={COPY.programs.behaviorType}
                    >
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
                          id="program-settings-new-rule-recurrence"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <ScreenField
                      htmlFor="program-settings-new-rule-day-of-week"
                      label={COPY.programs.dayOfWeekLabel}
                    >
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
                          id="program-settings-new-rule-day-of-week"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <ScreenField
                      htmlFor="program-settings-new-rule-month-day"
                      label={COPY.programs.monthDayLabel}
                    >
                      <Input
                        id="program-settings-new-rule-month-day"
                        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <ScreenField
                      htmlFor="program-settings-new-rule-start-time"
                      label={COPY.programs.startTime}
                    >
                      <Input
                        id="program-settings-new-rule-start-time"
                        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <ScreenField
                      htmlFor="program-settings-new-rule-end-time"
                      label={COPY.programs.endTime}
                    >
                      <Input
                        id="program-settings-new-rule-end-time"
                        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <ScreenField
                      htmlFor="program-settings-new-rule-location"
                      label={COPY.programs.ruleLocation}
                    >
                      <Input
                        id="program-settings-new-rule-location"
                        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                    </ScreenField>
                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      <Button
                        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                        type="submit"
                        disabled={busy}
                      >
                        {COPY.programs.addRule}
                      </Button>
                    </div>
                  </ScreenEditor>
                  <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                    {onTaskChange && (
                      <Button
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        type="button"
                        variant="outline"
                        onClick={() => onTaskChange("events")}
                      >
                        {COPY.programs.settingsScheduleEventsLink}
                      </Button>
                    )}
                  </div>
                  <p className="m-0 text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
                    {COPY.programs.hkTimeMarker}
                  </p>
                </>
              )}
            </ScreenSection>
          )}
          {showAttendance && (
            <ScreenSection
              className="mt-0"
              headingId={
                focusedEditor ? undefined : "program-settings-attendance"
              }
              title={
                focusedEditor ? undefined : COPY.programs.settingsAttendance
              }
            >
              <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
                {COPY.programs.settingsAttendanceLead}
              </p>
              {!attendanceEnabled ? (
                <ScreenState
                  kind="empty"
                  title={COPY.programs.settingsAttendanceUnavailable}
                />
              ) : (
                <ScreenEditor
                  id="program-settings-attendance-form"
                  onSubmit={saveAttendance}
                >
                  <ScreenField
                    htmlFor="program-settings-attendance-opens"
                    label={COPY.programs.settingsAttendanceOpens}
                    help={COPY.programs.settingsAttendanceUnits}
                  >
                    <Input
                      id="program-settings-attendance-opens"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                  </ScreenField>
                  <ScreenField
                    htmlFor="program-settings-attendance-closes"
                    label={COPY.programs.settingsAttendanceCloses}
                    help={COPY.programs.settingsAttendanceUnits}
                  >
                    <Input
                      id="program-settings-attendance-closes"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
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
                  </ScreenField>
                  {!focusedEditor && (
                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      <Button
                        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                        type="submit"
                        disabled={busy}
                      >
                        {COPY.programs.settingsSaveAttendance}
                      </Button>
                    </div>
                  )}
                </ScreenEditor>
              )}
            </ScreenSection>
          )}
        </div>
      )}
      {focusedSchedule &&
        canManage &&
        currentProgram.behavior_type === "Recurring" &&
        eventsEnabled &&
        scheduleAddon?.({ rules, rulesError: ruleError })}
      {showStickyActions && (
        <>
          {focusedDirty && (
            <output
              className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]"
              data-screen-settings-dirty="true"
              aria-live="polite"
            >
              {COPY.programs.settingsUnsaved}
            </output>
          )}
          <ScreenStickyActions>
            <Button
              className="w-full border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              type="button"
              variant="outline"
              onClick={discardFocusedChanges}
              disabled={!focusedDirty || busy}
            >
              {COPY.programs.settingsDiscard}
            </Button>
            <Button
              className="w-full bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
              type="submit"
              form={focusedFormId}
              disabled={!focusedDirty || busy}
            >
              {focusedSaveLabel}
            </Button>
          </ScreenStickyActions>
        </>
      )}
      {!focusedSection && (
        <Button
          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
          variant="outline"
          type="button"
          onClick={() => onTaskChange?.(null)}
        >
          {COPY.programs.backToOverview}
        </Button>
      )}
    </section>
  );
};
