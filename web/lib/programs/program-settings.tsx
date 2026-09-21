"use client";

import {
  Archive,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Pencil,
  Printer,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEventHandler } from "react";

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
  getProgramAttendanceArtifact,
  isUnknownMutationWriteOutcome,
  listScheduleExceptions,
  listScheduleRules,
  retireScheduleRule,
  rotateProgramAttendanceArtifact,
  updateProgram,
  updateScheduleRule,
} from "@/lib/programs/program-api";
import type {
  Program,
  ProgramPatch,
  ProgramAttendanceArtifact,
  ScheduleException,
  ScheduleRule,
  ScheduleRuleInput,
} from "@/lib/programs/program-api";
import {
  hkTodayWallDate,
  isValidWallDate,
  WEEKDAY_LABELS,
} from "@/lib/programs/recurrence";
import { qrDataUrl } from "@/lib/qr";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenHeader,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";

import {
  clearManagementDraft,
  clearManagementDraftsForEntity,
  readManagementDraft,
  writeManagementDraft,
} from "./management-draft";
import {
  clearWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
  writeWorkspaceMutationRecovery,
} from "./mutation-recovery";
import type {
  ProgramSettingsMutationRecovery,
  ScheduleMutationRecovery,
} from "./mutation-recovery";
import type { ProgramsScheduleEditor } from "./programs-intent";

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

interface AttendanceErrors {
  opensBefore?: string;
  closesAfter?: string;
}

interface RuleValues {
  recurrence: ScheduleRuleInput["recurrence"];
  dayOfWeek: string;
  monthDay: string;
  startTime: string;
  endTime: string;
  location: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
}

interface ExceptionValues {
  overrideDate: string;
  action: ScheduleException["action"];
  newDate: string;
  newStartTime: string;
  newEndTime: string;
}

export const SETTINGS_DRAFT_ACTION = {
  basics: "settings-basics",
  publishing: "settings-publishing",
  enrollment: "settings-enrollment",
  attendance: "settings-attendance",
  newRule: "settings-new-rule",
  rule: "settings-rule",
  exception: "settings-exception",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBasicsValues(value: unknown): value is BasicsValues {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    typeof value.displayOrder === "string"
  );
}

function isPublishingValues(value: unknown): value is PublishingValues {
  return (
    isRecord(value) &&
    (value.lifecycle === "Draft" ||
      value.lifecycle === "Active" ||
      value.lifecycle === "Archived") &&
    (value.discoverability === "Listed" || value.discoverability === "Unlisted")
  );
}

function isEnrollmentValues(value: unknown): value is EnrollmentValues {
  return (
    isRecord(value) &&
    (value.discoverability === "Listed" ||
      value.discoverability === "Unlisted") &&
    (value.enrollmentMode === "MemberRequest" ||
      value.enrollmentMode === "ManagerOnly")
  );
}

function isAttendanceValues(value: unknown): value is AttendanceValues {
  return (
    isRecord(value) &&
    typeof value.opensBefore === "string" &&
    typeof value.closesAfter === "string"
  );
}

function isRuleValues(value: unknown): value is RuleValues {
  return (
    isRecord(value) &&
    (value.recurrence === "WEEKLY" || value.recurrence === "MONTHLY") &&
    typeof value.dayOfWeek === "string" &&
    typeof value.monthDay === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string" &&
    typeof value.location === "string" &&
    typeof value.effectiveStartDate === "string" &&
    typeof value.effectiveEndDate === "string"
  );
}

function isExceptionValues(value: unknown): value is ExceptionValues {
  return (
    isRecord(value) &&
    typeof value.overrideDate === "string" &&
    (value.action === "CANCEL" || value.action === "RESCHEDULE") &&
    typeof value.newDate === "string" &&
    typeof value.newStartTime === "string" &&
    typeof value.newEndTime === "string"
  );
}

function readSettingsDraft<T>(
  programId: string,
  action: string,
  guard: (value: unknown) => value is T
): T | null {
  const value = readManagementDraft<unknown>(programId, action);
  return guard(value) ? value : null;
}

function hasSettingsDraft(programId: string): boolean {
  return (
    readSettingsDraft(
      programId,
      SETTINGS_DRAFT_ACTION.basics,
      isBasicsValues
    ) !== null ||
    readSettingsDraft(
      programId,
      SETTINGS_DRAFT_ACTION.publishing,
      isPublishingValues
    ) !== null ||
    readSettingsDraft(
      programId,
      SETTINGS_DRAFT_ACTION.enrollment,
      isEnrollmentValues
    ) !== null ||
    readSettingsDraft(
      programId,
      SETTINGS_DRAFT_ACTION.attendance,
      isAttendanceValues
    ) !== null ||
    readSettingsDraft(
      programId,
      SETTINGS_DRAFT_ACTION.newRule,
      isRuleValues
    ) !== null
  );
}

export interface ProgramSettingsProps {
  program: Program;
  eventsEnabled?: boolean;
  attendanceEnabled?: boolean;
  onTaskChange?: (task: "events" | "schedule" | null) => void;
  /** Let the route owner protect navigation while a focused draft is dirty. */
  onDirtyChange?: (dirty: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Show the existing editor actions when navigation is blocked by a draft. */
  navigationBlocked?: boolean;
  /** Explicitly reload the route-owned workspace after a 409 conflict. */
  onReload?: () => void | Promise<Program | void>;
  /** Block workspace navigation while a write outcome is unknown. */
  onMutationBlockChange?: (blocked: boolean) => void;
  /** Render one focused editor, or all legacy editor groups for direct callers. */
  section?: "all" | ProgramSettingsSection;
  /** Let a route-owned ScreenHeader provide the page title for a focused editor. */
  showHeading?: boolean;
  /** Inline dirty from the focused-Schedule companion (union with Settings). */
  scheduleAddonDirty?: boolean;
  /** Optional focused-Schedule companion that consumes this editor's rule read. */
  scheduleAddon?: (resource: {
    rules: ScheduleRule[] | null;
    rulesError: string | null;
    exceptions: Record<string, ScheduleException[]>;
    scheduleMutationVersion: number;
    onScheduleRefresh: () => Promise<boolean>;
  }) => React.ReactNode;
  /** Canonical focused Schedule URL used by the child editor Back affordance. */
  scheduleBackHref?: string;
  /** Route-owned focused Schedule editor identity, including reload recovery. */
  scheduleEditor?: ProgramsScheduleEditor;
  scheduleRuleId?: string;
  onScheduleEditorChange?: (
    editor: ProgramsScheduleEditor | null,
    ruleId?: string | null
  ) => void;
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
  return isUnknownMutationWriteOutcome(error);
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

function attendanceFieldError(value: string): string | undefined {
  if (value.trim() === "") {
    return COPY.programs.settingsAttendanceValidation;
  }
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) && minutes >= 0
    ? undefined
    : COPY.programs.settingsAttendanceValidation;
}

function programCheckInUrl(token: string): string {
  const path = `/guest-check-in?program_token=${encodeURIComponent(token)}`;
  return typeof window === "undefined"
    ? path
    : `${window.location.origin}${path}`;
}

function programArtifactFileName(programName: string): string {
  const safeName = programName
    .trim()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 48);
  return `${safeName || "program"}-qr.svg`;
}

const ProgramAttendanceQrCard = ({
  artifact,
  busy,
  onRotate,
}: {
  artifact: ProgramAttendanceArtifact;
  busy: boolean;
  onRotate: () => void;
}) => {
  const [qr, setQr] = useState<string | null>(null);
  const [qrState, setQrState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [actionNotice, setActionNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [encodeAttempt, setEncodeAttempt] = useState(0);
  const [rotateOpen, setRotateOpen] = useState(false);
  const checkInUrl = programCheckInUrl(artifact.check_in_token);

  useEffect(() => {
    let active = true;
    setQr(null);
    setQrState("loading");
    void (async () => {
      try {
        const dataUrl = await qrDataUrl(checkInUrl);
        if (active) {
          setQr(dataUrl);
          setQrState("loading");
        }
      } catch {
        if (active) {
          setQr(null);
          setQrState("error");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [checkInUrl, encodeAttempt]);

  function downloadQr() {
    if (!qr || qrState !== "ready") {
      setActionNotice({
        tone: "error",
        message: COPY.programs.settingsAttendanceQrDownloadError,
      });
      return;
    }
    setActionNotice(null);
    const link = document.createElement("a");
    link.href = qr;
    link.download = programArtifactFileName(artifact.program_name);
    try {
      document.body.append(link);
      link.click();
      setActionNotice({
        tone: "success",
        message: COPY.programs.settingsAttendanceQrDownloadSuccess,
      });
    } catch {
      setActionNotice({
        tone: "error",
        message: COPY.programs.settingsAttendanceQrDownloadError,
      });
    } finally {
      link.remove();
    }
  }

  async function printSign() {
    if (!qr || qrState !== "ready") {
      setActionNotice({
        tone: "error",
        message: COPY.programs.settingsAttendanceQrPrintError,
      });
      return;
    }
    const printWindow = window.open("", "_blank", "popup,width=640,height=720");
    if (!printWindow) {
      setActionNotice({
        tone: "error",
        message: COPY.programs.settingsAttendanceQrPrintError,
      });
      return;
    }
    setActionNotice(null);
    try {
      const doc = printWindow.document;
      doc.open();
      doc.write(
        "<!doctype html><html><head><title>EFCC Program QR</title></head><body></body></html>"
      );
      const style = doc.createElement("style");
      style.textContent =
        "body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:32px;box-sizing:border-box;text-align:center}main{max-width:520px}img{display:block;width:min(100%,360px);height:auto;margin:24px auto}h1{font-size:32px;margin:0 0 12px}p{font-size:18px;line-height:1.5;margin:8px 0}@media print{body{padding:0}}";
      doc.head.append(style);
      const main = doc.createElement("main");
      const title = doc.createElement("h1");
      title.textContent = artifact.program_name;
      const lead = doc.createElement("p");
      lead.textContent = COPY.programs.settingsAttendanceQrLabel;
      const image = doc.createElement("img");
      image.alt = COPY.programs.settingsAttendanceQrLabel;
      const instruction = doc.createElement("p");
      instruction.textContent = COPY.programs.settingsAttendanceQrLead;
      main.append(title, lead, image, instruction);
      doc.body.append(main);
      doc.close();
      const imageReady =
        /* oxlint-disable-next-line promise/avoid-new -- DOM load/error/timeout events need one settling promise. */ new Promise<void>(
          (resolve, reject) => {
            let settled = false;
            const finish = (error?: Error) => {
              if (settled) {
                return;
              }
              settled = true;
              window.clearTimeout(timeoutId);
              image.removeEventListener("load", onLoad);
              image.removeEventListener("error", onError);
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            };
            const onLoad = async () => {
              if (typeof image.decode !== "function") {
                finish();
                return;
              }
              try {
                await image.decode();
                finish();
              } catch {
                finish(new Error("program-qr-decode-failed"));
              }
            };
            const onError = () => finish(new Error("program-qr-load-failed"));
            const timeoutId = window.setTimeout(
              () => finish(new Error("program-qr-timeout")),
              5000
            );
            image.addEventListener("load", onLoad, { once: true });
            image.addEventListener("error", onError, { once: true });
          }
        );
      image.src = qr;
      await imageReady;
      printWindow.focus();
      printWindow.print();
      setActionNotice({
        tone: "success",
        message: COPY.programs.settingsAttendanceQrPrintSuccess,
      });
    } catch {
      printWindow.close?.();
      setActionNotice({
        tone: "error",
        message: COPY.programs.settingsAttendanceQrPrintError,
      });
    }
  }

  return (
    <ScreenCard
      className="grid min-w-0 gap-3"
      data-testid="program-attendance-qr"
    >
      <div className="grid min-w-0 gap-1">
        <h3 className="m-0 wrap-anywhere text-base font-bold">
          {COPY.programs.settingsAttendanceQrTitle}
        </h3>
        <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
          {COPY.programs.settingsAttendanceQrLead}
        </p>
      </div>
      {qr !== null && qrState !== "error" ? (
        <img
          src={qr}
          alt={COPY.programs.settingsAttendanceQrLabel}
          className="mx-auto size-56 max-w-full rounded border border-[var(--screen-line)] bg-white p-2"
          onLoad={(event) => {
            const image = event.currentTarget;
            if (typeof image.decode !== "function") {
              setQrState("ready");
              return;
            }
            void (async () => {
              try {
                await image.decode();
                setQrState("ready");
              } catch {
                setQrState("error");
              }
            })();
          }}
          onError={() => setQrState("error")}
        />
      ) : qrState === "error" ? (
        <div className="grid min-w-0 justify-items-start gap-2">
          <Alert tone="error" announcement="polite">
            {COPY.programs.settingsAttendanceQrUnavailable}
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setEncodeAttempt((attempt) => attempt + 1)}
          >
            {COPY.programs.settingsAttendanceQrRetry}
          </Button>
        </div>
      ) : (
        <output
          className="text-sm text-[var(--screen-muted)]"
          aria-live="polite"
        >
          {COPY.programs.settingsAttendanceQrLoading}
        </output>
      )}
      <p className="m-0 wrap-anywhere text-center text-sm font-semibold">
        {artifact.program_name}
      </p>
      {actionNotice !== null && (
        <Alert
          tone={actionNotice.tone}
          announcement={actionNotice.tone === "error" ? "assertive" : "polite"}
        >
          {actionNotice.message}
        </Alert>
      )}
      <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={!qr || qrState !== "ready" || busy}
          onClick={downloadQr}
        >
          <Download aria-hidden="true" />
          {COPY.programs.settingsAttendanceQrDownload}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={!qr || qrState !== "ready" || busy}
          onClick={printSign}
        >
          <Printer aria-hidden="true" />
          {COPY.programs.settingsAttendanceQrPrint}
        </Button>
        {artifact.can_rotate && (
          <Button
            type="button"
            variant="outline"
            className="w-fit border-[var(--screen-danger)] text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
            disabled={busy}
            onClick={() => setRotateOpen(true)}
          >
            {COPY.programs.settingsAttendanceQrRotate}
          </Button>
        )}
      </div>
      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.settingsAttendanceQrRotateTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.settingsAttendanceQrRotateBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {COPY.programs.settingsAttendanceQrRotateCancel}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onRotate}>
              {COPY.programs.settingsAttendanceQrRotateConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenCard>
  );
};
ProgramAttendanceQrCard.displayName = "ProgramAttendanceQrCard";

function ruleValuesFrom(rule: ScheduleRule): RuleValues {
  return {
    recurrence: rule.recurrence,
    dayOfWeek: String(rule.day_of_week ?? 0),
    monthDay: String(rule.month_day ?? 1),
    startTime: rule.start_time,
    endTime: rule.end_time,
    location: rule.location ?? "",
    effectiveStartDate: rule.effective_start_date ?? hkTodayWallDate(),
    effectiveEndDate: rule.effective_end_date ?? "",
  };
}

function defaultExceptionValues(): ExceptionValues {
  return {
    overrideDate: "",
    action: "CANCEL",
    newDate: "",
    newStartTime: "",
    newEndTime: "",
  };
}

function defaultRuleValues(): RuleValues {
  return {
    recurrence: "WEEKLY",
    dayOfWeek: "3",
    monthDay: "1",
    startTime: "",
    endTime: "",
    location: "",
    effectiveStartDate: hkTodayWallDate(),
    effectiveEndDate: "",
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
    effective_start_date: values.effectiveStartDate,
    effective_end_date: values.effectiveEndDate || null,
  };
}

function exceptionInputFrom(values: ExceptionValues): {
  override_date: string;
  action: ScheduleException["action"];
  new_date?: string;
  new_start_time?: string;
  new_end_time?: string;
} {
  return {
    override_date: values.overrideDate,
    action: values.action,
    ...(values.action === "RESCHEDULE"
      ? {
          ...(values.newDate ? { new_date: values.newDate } : {}),
          new_start_time: values.newStartTime,
          new_end_time: values.newEndTime,
        }
      : {}),
  };
}

interface ScheduleSnapshot {
  rules: ScheduleRule[];
  exceptions: Record<string, ScheduleException[]>;
}

const EMPTY_SCHEDULE_SNAPSHOT: ScheduleSnapshot = {
  rules: [],
  exceptions: {},
};

interface ScheduleMutationResolution {
  matches: (snapshot: ScheduleSnapshot) => boolean;
  onConfirmed: () => void;
}

type SettingsMutationAction =
  | "basics"
  | "publishing"
  | "enrollment"
  | "attendance";

async function readScheduleSnapshot(
  programId: string
): Promise<ScheduleSnapshot> {
  const { rules } = await listScheduleRules(programId);
  const exceptionEntries = await Promise.all(
    rules.map(async (rule) => {
      const result = await listScheduleExceptions(programId, rule.rule_id);
      return [rule.rule_id, result.exceptions] as const;
    })
  );
  return { rules, exceptions: Object.fromEntries(exceptionEntries) };
}

function sameRuleInput(rule: ScheduleRule, input: ScheduleRuleInput): boolean {
  return (
    rule.recurrence === input.recurrence &&
    (rule.day_of_week ?? null) === (input.day_of_week ?? null) &&
    (rule.month_day ?? null) === (input.month_day ?? null) &&
    rule.start_time === input.start_time &&
    rule.end_time === input.end_time &&
    (rule.location ?? null) === (input.location ?? null) &&
    (rule.effective_start_date ?? null) ===
      (input.effective_start_date ?? null) &&
    (rule.effective_end_date ?? null) === (input.effective_end_date ?? null)
  );
}

function sameExceptionInput(
  exception: ScheduleException,
  input: ReturnType<typeof exceptionInputFrom>
): boolean {
  return (
    exception.override_date === input.override_date &&
    exception.action === input.action &&
    (exception.new_date ?? null) === (input.new_date ?? null) &&
    (exception.new_start_time ?? null) === (input.new_start_time ?? null) &&
    (exception.new_end_time ?? null) === (input.new_end_time ?? null)
  );
}

function programMatchesPatch(program: Program, patch: ProgramPatch): boolean {
  return Object.entries(patch).every(([key, expected]) => {
    const actual = program[key as keyof Program] as unknown;
    return (actual ?? null) === (expected ?? null);
  });
}

function settingsActionForPatch(patch: ProgramPatch): SettingsMutationAction {
  if (
    "name" in patch ||
    "description" in patch ||
    "category" in patch ||
    "display_order" in patch
  ) {
    return "basics";
  }
  if ("lifecycle" in patch || "discoverability" in patch) {
    return "lifecycle" in patch ? "publishing" : "enrollment";
  }
  return "attendance";
}

function scheduleResolutionForRecovery(
  recovery: ScheduleMutationRecovery,
  onConfirmed: () => void
): ScheduleMutationResolution {
  const { mutation } = recovery;
  switch (mutation.kind) {
    case "create-rule": {
      return {
        matches: (snapshot) =>
          snapshot.rules.some(
            (candidate) =>
              (candidate.retired_at === null ||
                candidate.retired_at === undefined) &&
              sameRuleInput(candidate, mutation.expected)
          ),
        onConfirmed,
      };
    }
    case "update-rule": {
      return {
        matches: (snapshot) => {
          const candidate = snapshot.rules.find(
            ({ rule_id }) => rule_id === mutation.ruleId
          );
          return (
            candidate !== undefined &&
            sameRuleInput(candidate, mutation.expected)
          );
        },
        onConfirmed,
      };
    }
    case "retire-rule": {
      return {
        matches: (snapshot) => {
          const candidate = snapshot.rules.find(
            ({ rule_id }) => rule_id === mutation.ruleId
          );
          return (
            candidate?.retired_at !== null &&
            candidate?.retired_at !== undefined
          );
        },
        onConfirmed,
      };
    }
    case "create-exception": {
      return {
        matches: (snapshot) =>
          (snapshot.exceptions[mutation.ruleId] ?? []).some((candidate) =>
            sameExceptionInput(candidate, mutation.expected)
          ),
        onConfirmed,
      };
    }
    case "delete-exception": {
      return {
        matches: (snapshot) =>
          !(snapshot.exceptions[mutation.ruleId] ?? []).some(
            ({ exception_id }) => exception_id === mutation.exceptionId
          ),
        onConfirmed,
      };
    }
    default: {
      throw new Error("Unsupported schedule mutation recovery");
    }
  }
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
  scheduleCurrentValue?: string;
  notificationCurrentValue?: string;
  onArchive?: () => void | Promise<void>;
  archiveBusy?: boolean;
  archiveDisabled?: boolean;
}

const SettingsHubRow = ({
  icon,
  title,
  description,
  currentValue,
  onClick,
  href,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  currentValue?: string;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
}) => {
  const content = (
    <>
      {icon}
      <ScreenRowMain>
        <ScreenRowTitle>{title}</ScreenRowTitle>
        <ScreenRowMeta>
          <span>{description}</span>
          {currentValue && (
            <span className="font-semibold text-[var(--screen-ink)]">
              {` · ${currentValue}`}
            </span>
          )}
        </ScreenRowMeta>
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
  scheduleCurrentValue,
  notificationCurrentValue,
  onArchive,
  archiveBusy = false,
  archiveDisabled = false,
}: SettingsHubProps) => {
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
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
              currentValue={`${program.name}${program.category ? ` · ${program.category}` : ""}`}
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
              currentValue={`${LIFECYCLE_LABEL[program.lifecycle]} · ${
                program.discoverability === "Listed"
                  ? COPY.programs.discoverabilityListed
                  : COPY.programs.discoverabilityUnlisted
              }`}
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
                currentValue={
                  program.enrollment_mode === "MemberRequest"
                    ? COPY.programs.enrollmentModeMemberRequest
                    : COPY.programs.enrollmentModeManagerOnly
                }
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
                currentValue={scheduleCurrentValue}
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
                currentValue={`開始前 ${program.check_in_opens_at_minutes_before_start ?? 15} 分鐘 · 結束後 ${program.check_in_closes_at_minutes_after_end ?? 0} 分鐘`}
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
              currentValue={notificationCurrentValue}
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
              onClick={() => setArchiveConfirmationOpen(true)}
            />
          </ScreenRowList>
        </ScreenSection>
      )}
      <AlertDialog
        open={archiveConfirmationOpen}
        onOpenChange={setArchiveConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.settingsHubArchiveConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.settingsHubArchiveConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {COPY.programs.settingsKeepCurrent}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                archiveBusy || archiveDisabled || onArchive === undefined
              }
              onClick={() => {
                setArchiveConfirmationOpen(false);
                void onArchive?.();
              }}
            >
              {archiveBusy
                ? COPY.programs.settingsArchiveSaving
                : COPY.programs.settingsHubArchiveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

type ScheduleEditorTarget =
  | { kind: "new-rule" }
  | { kind: "edit-rule"; ruleId: string }
  | { kind: "new-exception"; ruleId: string }
  | null;

function scheduleTargetFromRoute(
  editor: ProgramsScheduleEditor | undefined,
  ruleId: string | undefined
): ScheduleEditorTarget {
  if (editor === "new-rule") {
    return { kind: "new-rule" };
  }
  if (ruleId === undefined) {
    return null;
  }
  if (editor === "edit-rule") {
    return { kind: "edit-rule", ruleId };
  }
  if (editor === "new-exception") {
    return { kind: "new-exception", ruleId };
  }
  return null;
}

const ScheduleRuleEditor = ({
  idPrefix,
  values,
  onChange,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  idPrefix: string;
  values: RuleValues;
  onChange: (values: RuleValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel?: React.ReactNode;
}) => (
  <ScreenEditor onSubmit={onSubmit}>
    <ScreenField
      htmlFor={`${idPrefix}-recurrence`}
      label={COPY.programs.behaviorType}
    >
      <Select
        value={values.recurrence}
        onValueChange={(value) =>
          onChange({
            ...values,
            recurrence: value as RuleValues["recurrence"],
          })
        }
        disabled={busy}
      >
        <SelectTrigger
          id={`${idPrefix}-recurrence`}
          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
          aria-label={COPY.programs.behaviorType}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="WEEKLY">{COPY.programs.ruleWeekly}</SelectItem>
          <SelectItem value="MONTHLY">{COPY.programs.ruleMonthly}</SelectItem>
        </SelectContent>
      </Select>
    </ScreenField>
    {values.recurrence === "WEEKLY" && (
      <ScreenField
        htmlFor={`${idPrefix}-day-of-week`}
        label={COPY.programs.dayOfWeekLabel}
      >
        <Select
          value={values.dayOfWeek}
          onValueChange={(value) => onChange({ ...values, dayOfWeek: value })}
          disabled={busy}
        >
          <SelectTrigger
            id={`${idPrefix}-day-of-week`}
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
    )}
    {values.recurrence === "MONTHLY" && (
      <ScreenField
        htmlFor={`${idPrefix}-month-day`}
        label={COPY.programs.monthDayLabel}
      >
        <Input
          id={`${idPrefix}-month-day`}
          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
          type="number"
          min={1}
          max={31}
          value={values.monthDay}
          onChange={(event) =>
            onChange({ ...values, monthDay: event.target.value })
          }
          disabled={busy}
        />
      </ScreenField>
    )}
    <ScreenField
      htmlFor={`${idPrefix}-start-time`}
      label={COPY.programs.startTime}
    >
      <Input
        id={`${idPrefix}-start-time`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="time"
        required
        value={values.startTime}
        onChange={(event) =>
          onChange({ ...values, startTime: event.target.value })
        }
        disabled={busy}
      />
    </ScreenField>
    <ScreenField htmlFor={`${idPrefix}-end-time`} label={COPY.programs.endTime}>
      <Input
        id={`${idPrefix}-end-time`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="time"
        required
        value={values.endTime}
        onChange={(event) =>
          onChange({ ...values, endTime: event.target.value })
        }
        disabled={busy}
      />
    </ScreenField>
    <ScreenField
      htmlFor={`${idPrefix}-effective-start-date`}
      label={COPY.programs.settingsRuleStartDate}
    >
      <Input
        id={`${idPrefix}-effective-start-date`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="date"
        required
        value={values.effectiveStartDate}
        onChange={(event) =>
          onChange({ ...values, effectiveStartDate: event.target.value })
        }
        disabled={busy}
      />
    </ScreenField>
    <ScreenField
      htmlFor={`${idPrefix}-effective-end-date`}
      label={COPY.programs.settingsRuleEndDate}
      help={COPY.programs.settingsRuleOngoing}
    >
      <Input
        id={`${idPrefix}-effective-end-date`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="date"
        min={values.effectiveStartDate}
        value={values.effectiveEndDate}
        onChange={(event) =>
          onChange({ ...values, effectiveEndDate: event.target.value })
        }
        disabled={busy}
      />
    </ScreenField>
    <ScreenField
      htmlFor={`${idPrefix}-location`}
      label={COPY.programs.ruleLocation}
    >
      <Input
        id={`${idPrefix}-location`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="text"
        value={values.location}
        placeholder={COPY.programs.ruleLocationPlaceholder}
        onChange={(event) =>
          onChange({ ...values, location: event.target.value })
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
        {submitLabel ?? COPY.programs.settingsRuleSave}
      </Button>
      <Button
        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={busy}
      >
        {COPY.programs.settingsRuleCancel}
      </Button>
    </div>
  </ScreenEditor>
);
ScheduleRuleEditor.displayName = "ScheduleRuleEditor";

const ScheduleExceptionEditor = ({
  rule,
  ruleId,
  values,
  onChange,
  onSubmit,
  onCancel,
  busy,
}: {
  rule: ScheduleRule;
  ruleId: string;
  values: ExceptionValues;
  onChange: (values: ExceptionValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy: boolean;
}) => (
  <ScreenEditor onSubmit={onSubmit}>
    <ScreenField
      htmlFor={`program-settings-exception-${ruleId}-date`}
      label={COPY.programs.settingsExceptionDate}
    >
      <Input
        id={`program-settings-exception-${ruleId}-date`}
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="date"
        required
        value={values.overrideDate}
        onChange={(event) =>
          onChange({ ...values, overrideDate: event.target.value })
        }
        onInput={(event) =>
          onChange({ ...values, overrideDate: event.currentTarget.value })
        }
        disabled={busy}
      />
    </ScreenField>
    <ScreenField
      htmlFor={`program-settings-exception-${ruleId}-action`}
      label={COPY.programs.settingsExceptionAction}
    >
      <Select
        value={values.action}
        onValueChange={(value) =>
          onChange({
            ...values,
            action: value as ExceptionValues["action"],
          })
        }
        disabled={busy}
      >
        <SelectTrigger
          id={`program-settings-exception-${ruleId}-action`}
          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
          aria-label={COPY.programs.settingsExceptionAction}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CANCEL">
            {COPY.programs.settingsExceptionCancel}
          </SelectItem>
          <SelectItem value="RESCHEDULE">
            {COPY.programs.settingsExceptionReschedule}
          </SelectItem>
        </SelectContent>
      </Select>
    </ScreenField>
    {values.action === "RESCHEDULE" && (
      <>
        <ScreenField
          htmlFor={`program-settings-exception-${ruleId}-new-date`}
          label={COPY.programs.settingsExceptionNewDate}
          help={
            rule.effective_end_date
              ? `${COPY.programs.settingsExceptionBeyondRuleEnd} (${rule.effective_end_date})`
              : undefined
          }
        >
          <Input
            id={`program-settings-exception-${ruleId}-new-date`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="date"
            min={values.overrideDate || undefined}
            value={values.newDate}
            onChange={(event) =>
              onChange({ ...values, newDate: event.target.value })
            }
            disabled={busy}
          />
        </ScreenField>
        {rule.effective_end_date &&
          values.newDate > rule.effective_end_date && (
            <Alert tone="warning" announcement="polite">
              {COPY.programs.settingsExceptionBeyondRuleEnd}
            </Alert>
          )}
        <ScreenField
          htmlFor={`program-settings-exception-${ruleId}-new-start`}
          label={COPY.programs.settingsExceptionNewStart}
        >
          <Input
            id={`program-settings-exception-${ruleId}-new-start`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="time"
            required
            value={values.newStartTime}
            onChange={(event) =>
              onChange({ ...values, newStartTime: event.target.value })
            }
            disabled={busy}
          />
        </ScreenField>
        <ScreenField
          htmlFor={`program-settings-exception-${ruleId}-new-end`}
          label={COPY.programs.settingsExceptionNewEnd}
        >
          <Input
            id={`program-settings-exception-${ruleId}-new-end`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="time"
            required
            value={values.newEndTime}
            onChange={(event) =>
              onChange({ ...values, newEndTime: event.target.value })
            }
            disabled={busy}
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
        {COPY.programs.settingsExceptionSave}
      </Button>
      <Button
        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={busy}
      >
        {COPY.programs.settingsRuleCancel}
      </Button>
    </div>
  </ScreenEditor>
);
ScheduleExceptionEditor.displayName = "ScheduleExceptionEditor";

// oxlint-disable-next-line eslint/complexity
export const ProgramSettings = ({
  program,
  eventsEnabled = true,
  attendanceEnabled = true,
  onTaskChange,
  onDirtyChange,
  onFocusChange,
  navigationBlocked = false,
  onReload,
  onMutationBlockChange,
  section = "all",
  showHeading = true,
  scheduleAddonDirty = false,
  scheduleAddon,
  scheduleBackHref,
  scheduleEditor: routeScheduleEditor,
  scheduleRuleId: routeScheduleRuleId,
  onScheduleEditorChange,
}: ProgramSettingsProps) => {
  const [currentProgram, setCurrentProgram] = useState(program);
  const restoredProgramRecovery =
    useRef<ProgramSettingsMutationRecovery | null>(
      (() => {
        const recovery = readWorkspaceMutationRecovery();
        return recovery?.surface === "program" &&
          recovery.programId === program.program_id
          ? recovery
          : null;
      })()
    ).current;
  const restoredScheduleRecovery = useRef<ScheduleMutationRecovery | null>(
    (() => {
      const recovery = readWorkspaceMutationRecovery();
      return recovery?.surface === "schedule" &&
        recovery.programId === program.program_id
        ? recovery
        : null;
    })()
  ).current;
  const [basics, setBasics] = useState(
    () =>
      readSettingsDraft(
        program.program_id,
        SETTINGS_DRAFT_ACTION.basics,
        isBasicsValues
      ) ?? basicsFrom(program)
  );
  const [publishing, setPublishing] = useState(
    () =>
      readSettingsDraft(
        program.program_id,
        SETTINGS_DRAFT_ACTION.publishing,
        isPublishingValues
      ) ?? publishingFrom(program)
  );
  const [enrollment, setEnrollment] = useState(
    () =>
      readSettingsDraft(
        program.program_id,
        SETTINGS_DRAFT_ACTION.enrollment,
        isEnrollmentValues
      ) ?? enrollmentFrom(program)
  );
  const [attendance, setAttendance] = useState(
    () =>
      readSettingsDraft(
        program.program_id,
        SETTINGS_DRAFT_ACTION.attendance,
        isAttendanceValues
      ) ?? attendanceFrom(program)
  );
  const [attendanceErrors, setAttendanceErrors] = useState<AttendanceErrors>(
    {}
  );
  const [rules, setRules] = useState<ScheduleRule[] | null>(
    program.behavior_type === "Recurring" &&
      program.capabilities.manage &&
      eventsEnabled
      ? null
      : []
  );
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleEditorTarget>(
    () => scheduleTargetFromRoute(routeScheduleEditor, routeScheduleRuleId)
  );
  const [scheduleNavigationBlocked, setScheduleNavigationBlocked] =
    useState(false);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleValues>>({});
  const [newRule, setNewRule] = useState<RuleValues>(
    () =>
      readSettingsDraft(
        program.program_id,
        SETTINGS_DRAFT_ACTION.newRule,
        isRuleValues
      ) ?? defaultRuleValues()
  );
  const [exceptionDrafts, setExceptionDrafts] = useState<
    Record<string, ExceptionValues>
  >({});
  const [exceptions, setExceptions] = useState<
    Record<string, ScheduleException[]>
  >({});
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [draftRecoveryOpen, setDraftRecoveryOpen] = useState(
    () =>
      hasSettingsDraft(program.program_id) &&
      restoredProgramRecovery === null &&
      restoredScheduleRecovery === null
  );
  const [confirmingRetireRuleId, setConfirmingRetireRuleId] = useState<
    string | null
  >(null);
  const [confirmingPublishing, setConfirmingPublishing] = useState(false);
  const [confirmingEnrollment, setConfirmingEnrollment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attendanceArtifact, setAttendanceArtifact] =
    useState<ProgramAttendanceArtifact | null>(null);
  const [attendanceArtifactLoading, setAttendanceArtifactLoading] =
    useState(false);
  const [attendanceArtifactError, setAttendanceArtifactError] = useState<
    string | null
  >(null);
  const [attendanceArtifactBusy, setAttendanceArtifactBusy] = useState(false);
  const [attendanceArtifactReload, setAttendanceArtifactReload] = useState(0);
  const attendanceRotationKey = useRef<string | null>(null);
  const scheduleRuleCreateKey = useRef<string | null>(null);
  const forcedProgramReloadAction = useRef<SettingsMutationAction | null>(null);
  const programMutationKey = useRef<string | null>(
    restoredProgramRecovery?.idempotencyKey ?? null
  );
  const scheduleMutationKey = useRef<string | null>(
    restoredScheduleRecovery?.idempotencyKey ?? null
  );
  const pendingProgramRecovery = useRef<ProgramSettingsMutationRecovery | null>(
    restoredProgramRecovery
  );
  const pendingScheduleRecovery = useRef<ScheduleMutationRecovery | null>(
    restoredScheduleRecovery
  );
  const clearScheduleRecoveryDraft = (recovery: ScheduleMutationRecovery) => {
    const { mutation } = recovery;
    if (mutation.kind === "create-rule") {
      clearManagementDraft(program.program_id, SETTINGS_DRAFT_ACTION.newRule);
      setNewRule(defaultRuleValues());
    } else if (mutation.kind === "update-rule") {
      clearManagementDraft(
        program.program_id,
        `${SETTINGS_DRAFT_ACTION.rule}:${mutation.ruleId}`
      );
      setRuleDrafts((previous) => {
        const next = { ...previous };
        delete next[mutation.ruleId];
        return next;
      });
    } else if (mutation.kind === "create-exception") {
      clearManagementDraft(
        program.program_id,
        `${SETTINGS_DRAFT_ACTION.exception}:${mutation.ruleId}`
      );
      setExceptionDrafts((previous) => {
        const next = { ...previous };
        delete next[mutation.ruleId];
        return next;
      });
    }
    scheduleRuleCreateKey.current = null;
    setScheduleEditor(null);
    onScheduleEditorChange?.(null);
  };
  const pendingScheduleResolution = useRef<ScheduleMutationResolution | null>(
    restoredScheduleRecovery
      ? scheduleResolutionForRecovery(restoredScheduleRecovery, () => {
          clearScheduleRecoveryDraft(restoredScheduleRecovery);
        })
      : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(() =>
    restoredProgramRecovery !== null || restoredScheduleRecovery !== null
      ? COPY.programs.programTransportAmbiguous
      : null
  );
  const [reloadRequired, setReloadRequired] = useState(
    restoredProgramRecovery !== null || restoredScheduleRecovery !== null
  );
  const [scheduleMutationVersion, setScheduleMutationVersion] = useState(0);
  const mounted = useRef(true);
  const canManage = currentProgram.capabilities.manage;
  const mutationBlocked = busy || reloadRequired;
  const focusedSection = section !== "all";
  const focusedSchedule = section === "schedule";
  const showSchedule = !focusedSection || focusedSchedule;
  const scheduleMutationBlocked =
    showSchedule &&
    currentProgram.behavior_type === "Recurring" &&
    eventsEnabled &&
    rules === null;
  const scheduleEditorActive = focusedSchedule && scheduleEditor !== null;
  const showScheduleOverview = showSchedule && !scheduleEditorActive;
  const focusedEditor = focusedSection && !focusedSchedule;
  const showBasics = !focusedSection || section === "basics";
  const showPublishing = section === "publishing";
  const showEnrollment = !focusedSection || section === "enrollment";
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
  const scheduleEditorDirty =
    scheduleEditor?.kind === "new-rule"
      ? JSON.stringify(newRule) !== JSON.stringify(defaultRuleValues())
      : scheduleEditor?.kind === "edit-rule"
        ? (() => {
            const rule = (rules ?? []).find(
              (candidate) => candidate.rule_id === scheduleEditor.ruleId
            );
            const draft = ruleDrafts[scheduleEditor.ruleId];
            return (
              rule !== undefined &&
              draft !== undefined &&
              JSON.stringify(draft) !== JSON.stringify(ruleValuesFrom(rule))
            );
          })()
        : scheduleEditor?.kind === "new-exception"
          ? JSON.stringify(
              exceptionDrafts[scheduleEditor.ruleId] ?? defaultExceptionValues()
            ) !== JSON.stringify(defaultExceptionValues())
          : false;
  const settingsDirty = focusedSchedule
    ? scheduleEditorActive && scheduleEditorDirty
    : focusedDirty;
  const showDirtyActions = focusedEditor && focusedDirty && canManage;
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

  useEffect(() => {
    setScheduleEditor(
      scheduleTargetFromRoute(routeScheduleEditor, routeScheduleRuleId)
    );
  }, [routeScheduleEditor, routeScheduleRuleId]);

  useEffect(() => {
    const target = scheduleTargetFromRoute(
      routeScheduleEditor,
      routeScheduleRuleId
    );
    if (!target || target.kind === "new-rule") {
      return;
    }
    if (target.kind === "edit-rule") {
      const rule = (rules ?? []).find(
        (candidate) => candidate.rule_id === target.ruleId
      );
      if (rule) {
        setRuleDrafts((previous) => ({
          [target.ruleId]:
            previous[target.ruleId] ??
            readSettingsDraft(
              currentProgram.program_id,
              `${SETTINGS_DRAFT_ACTION.rule}:${target.ruleId}`,
              isRuleValues
            ) ??
            ruleValuesFrom(rule),
          ...previous,
        }));
      }
    } else {
      const draft = readSettingsDraft(
        currentProgram.program_id,
        `${SETTINGS_DRAFT_ACTION.exception}:${target.ruleId}`,
        isExceptionValues
      );
      if (draft) {
        setExceptionDrafts((previous) => ({
          [target.ruleId]: previous[target.ruleId] ?? draft,
          ...previous,
        }));
      }
    }
    if (
      readManagementDraft(
        currentProgram.program_id,
        `${
          target.kind === "edit-rule"
            ? SETTINGS_DRAFT_ACTION.rule
            : SETTINGS_DRAFT_ACTION.exception
        }:${target.ruleId}`
      ) !== null
    ) {
      setDraftRecoveryOpen(true);
    }
  }, [
    currentProgram.program_id,
    routeScheduleEditor,
    routeScheduleRuleId,
    rules,
  ]);

  useEffect(() => {
    onFocusChange?.(
      focusedSection && (focusedSchedule ? scheduleEditor !== null : true)
    );
  }, [focusedSchedule, focusedSection, onFocusChange, scheduleEditor]);
  useEffect(() => {
    if (restoredProgramRecovery !== null || restoredScheduleRecovery !== null) {
      onMutationBlockChange?.(true);
    }
  }, [
    onMutationBlockChange,
    restoredProgramRecovery,
    restoredScheduleRecovery,
  ]);
  useEffect(() => {
    onDirtyChange?.(focusedSection && settingsDirty);
  }, [focusedSection, onDirtyChange, settingsDirty]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    const programId = currentProgram.program_id;
    if (basicsDirty) {
      writeManagementDraft(programId, SETTINGS_DRAFT_ACTION.basics, basics);
    } else {
      clearManagementDraft(programId, SETTINGS_DRAFT_ACTION.basics);
    }
    if (publishingDirty) {
      writeManagementDraft(
        programId,
        SETTINGS_DRAFT_ACTION.publishing,
        publishing
      );
    } else {
      clearManagementDraft(programId, SETTINGS_DRAFT_ACTION.publishing);
    }
    if (enrollmentDirty) {
      writeManagementDraft(
        programId,
        SETTINGS_DRAFT_ACTION.enrollment,
        enrollment
      );
    } else {
      clearManagementDraft(programId, SETTINGS_DRAFT_ACTION.enrollment);
    }
    if (attendanceDirty) {
      writeManagementDraft(
        programId,
        SETTINGS_DRAFT_ACTION.attendance,
        attendance
      );
    } else {
      clearManagementDraft(programId, SETTINGS_DRAFT_ACTION.attendance);
    }
    if (scheduleEditor?.kind === "new-rule" && scheduleEditorDirty) {
      writeManagementDraft(programId, SETTINGS_DRAFT_ACTION.newRule, newRule);
    } else if (scheduleEditor?.kind === "new-rule") {
      clearManagementDraft(programId, SETTINGS_DRAFT_ACTION.newRule);
    }
  }, [
    attendance,
    attendanceDirty,
    basics,
    basicsDirty,
    currentProgram.program_id,
    enrollment,
    enrollmentDirty,
    newRule,
    publishing,
    publishingDirty,
    scheduleEditor?.kind,
    scheduleEditorDirty,
  ]);

  useEffect(() => {
    const programId = currentProgram.program_id;
    for (const [ruleId, draft] of Object.entries(ruleDrafts)) {
      const rule = (rules ?? []).find(
        (candidate) => candidate.rule_id === ruleId
      );
      const action = `${SETTINGS_DRAFT_ACTION.rule}:${ruleId}`;
      if (
        rule &&
        JSON.stringify(draft) !== JSON.stringify(ruleValuesFrom(rule))
      ) {
        writeManagementDraft(programId, action, draft);
      } else {
        clearManagementDraft(programId, action);
      }
    }
    for (const [ruleId, draft] of Object.entries(exceptionDrafts)) {
      const action = `${SETTINGS_DRAFT_ACTION.exception}:${ruleId}`;
      if (JSON.stringify(draft) !== JSON.stringify(defaultExceptionValues())) {
        writeManagementDraft(programId, action, draft);
      } else {
        clearManagementDraft(programId, action);
      }
    }
  }, [currentProgram.program_id, exceptionDrafts, ruleDrafts, rules]);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const loadRules = useCallback(async (): Promise<ScheduleSnapshot | null> => {
    if (
      currentProgram.behavior_type !== "Recurring" ||
      !canManage ||
      !eventsEnabled
    ) {
      return EMPTY_SCHEDULE_SNAPSHOT;
    }
    setRules(null);
    setRuleError(null);
    setExceptionError(null);
    setExceptions({});
    try {
      const result = await listScheduleRules(currentProgram.program_id);
      if (!mounted.current) {
        return null;
      }
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
          return null;
        }
        const snapshot = {
          rules: result.rules,
          exceptions: Object.fromEntries(exceptionEntries),
        } satisfies ScheduleSnapshot;
        setExceptions(snapshot.exceptions);
        setRules(result.rules);
        return snapshot;
      } catch (error) {
        if (!mounted.current) {
          return null;
        }
        setExceptionError(settingsErrorMessage(error));
        setRules(null);
        return null;
      }
    } catch (error) {
      if (!mounted.current) {
        return null;
      }
      setRuleError(settingsErrorMessage(error));
      // Keep the editor in an unresolved state after a failed read. An empty
      // list is reserved for an authoritative successful response with no
      // configured rules, so recovery never lies with a "no rules" state.
      setRules(null);
      return null;
    }
  }, [
    canManage,
    currentProgram.behavior_type,
    currentProgram.program_id,
    eventsEnabled,
  ]);

  const reconcileScheduleResolution = useCallback(
    async (resolution: ScheduleMutationResolution): Promise<boolean> => {
      try {
        const snapshot = await readScheduleSnapshot(currentProgram.program_id);
        if (!mounted.current) {
          return false;
        }
        setRules(snapshot.rules);
        setExceptions(snapshot.exceptions);
        if (!resolution.matches(snapshot)) {
          setReloadRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          return false;
        }
        resolution.onConfirmed();
        pendingScheduleResolution.current = null;
        pendingScheduleRecovery.current = null;
        scheduleMutationKey.current = null;
        clearWorkspaceMutationRecovery("schedule", {
          programId: currentProgram.program_id,
        });
        setReloadRequired(false);
        onMutationBlockChange?.(false);
        setNotice(COPY.programs.workspaceReconciled);
        setActionError(null);
        announce(COPY.programs.workspaceReconciled);
        return true;
      } catch {
        if (mounted.current) {
          setReloadRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
        }
        return false;
      }
    },
    [currentProgram.program_id, onMutationBlockChange]
  );

  useEffect(() => {
    if (focusedSection && !focusedSchedule) {
      return;
    }
    void loadRules();
  }, [focusedSchedule, focusedSection, loadRules]);

  useEffect(() => {
    if (section !== "attendance" || !canManage || !attendanceEnabled) {
      setAttendanceArtifact(null);
      setAttendanceArtifactError(null);
      return;
    }
    let active = true;
    setAttendanceArtifactLoading(true);
    setAttendanceArtifactError(null);
    void (async () => {
      try {
        const { artifact } = await getProgramAttendanceArtifact(
          currentProgram.program_id
        );
        if (active) {
          setAttendanceArtifact(artifact);
        }
      } catch (error) {
        if (active) {
          setAttendanceArtifactError(errorMessage(error));
        }
      } finally {
        if (active) {
          setAttendanceArtifactLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    attendanceArtifactReload,
    attendanceEnabled,
    canManage,
    currentProgram.program_id,
    section,
  ]);

  const applyProgram = useCallback(
    (next: Program, updatedAction?: SettingsMutationAction) => {
      setCurrentProgram(next);
      if (updatedAction === "basics" || !basicsDirty) {
        setBasics(basicsFrom(next));
      }
      if (updatedAction === "publishing" || !publishingDirty) {
        setPublishing(publishingFrom(next));
      }
      if (updatedAction === "enrollment" || !enrollmentDirty) {
        setEnrollment(enrollmentFrom(next));
      }
      if (updatedAction === "attendance" || !attendanceDirty) {
        setAttendance(attendanceFrom(next));
        setAttendanceErrors({});
      }
    },
    [attendanceDirty, basicsDirty, enrollmentDirty, publishingDirty]
  );

  const reconcileWorkspace = useCallback(
    async (forceScheduleRead = false) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      const pendingProgram = pendingProgramRecovery.current;
      try {
        const scheduleReadRequired =
          forceScheduleRead || scheduleMutationBlocked;
        const scheduleSnapshot = scheduleReadRequired
          ? await loadRules()
          : null;
        let workspaceRead = onReload === undefined && scheduleMutationBlocked;
        let refreshed: Program | null | void = null;
        if (onReload) {
          try {
            refreshed = await onReload();
            workspaceRead = refreshed !== undefined;
          } catch {
            workspaceRead = false;
          }
        }
        if (!mounted.current) {
          return;
        }
        if (
          (scheduleReadRequired && scheduleSnapshot === null) ||
          !workspaceRead
        ) {
          setReloadRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          return;
        }
        if (
          pendingProgram !== null &&
          (refreshed === null ||
            refreshed === undefined ||
            !programMatchesPatch(refreshed, pendingProgram.mutation.expected))
        ) {
          setReloadRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          onMutationBlockChange?.(true);
          announce(COPY.programs.programTransportAmbiguous);
          return;
        }
        const programAction =
          pendingProgram === null
            ? forcedProgramReloadAction.current
            : settingsActionForPatch(pendingProgram.mutation.patch);
        if (refreshed) {
          applyProgram(refreshed, programAction ?? undefined);
        }
        if (pendingProgram !== null) {
          pendingProgramRecovery.current = null;
          programMutationKey.current = null;
          clearWorkspaceMutationRecovery("program", {
            programId: currentProgram.program_id,
          });
        }
        forcedProgramReloadAction.current = null;
        setReloadRequired(false);
        onMutationBlockChange?.(false);
        setNotice(COPY.programs.workspaceReconciled);
        announce(COPY.programs.workspaceReconciled);
      } catch {
        if (!mounted.current) {
          return;
        }
        setReloadRequired(true);
        setActionError(COPY.programs.programTransportAmbiguous);
        announce(COPY.programs.programTransportAmbiguous);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [
      applyProgram,
      loadRules,
      onMutationBlockChange,
      onReload,
      scheduleMutationBlocked,
    ]
  );

  const runProgramMutation = useCallback(
    async (patch: Parameters<typeof updateProgram>[1]) => {
      if (reloadRequired) {
        return;
      }
      setBusy(true);
      setActionError(null);
      setNotice(null);
      const action = settingsActionForPatch(patch);
      forcedProgramReloadAction.current = null;
      const idempotencyKey = programMutationKey.current ?? crypto.randomUUID();
      programMutationKey.current = idempotencyKey;
      const recovery: ProgramSettingsMutationRecovery = {
        surface: "program",
        programId: currentProgram.program_id,
        idempotencyKey,
        mutation: {
          kind: "update",
          patch,
          expected: patch,
        },
      };
      pendingProgramRecovery.current = recovery;
      writeWorkspaceMutationRecovery(recovery);
      try {
        const result = await updateProgram(
          currentProgram.program_id,
          patch,
          idempotencyKey
        );
        if (!mounted.current) {
          return;
        }
        if (action === "basics") {
          clearManagementDraft(
            currentProgram.program_id,
            SETTINGS_DRAFT_ACTION.basics
          );
        }
        if (action === "publishing") {
          clearManagementDraft(
            currentProgram.program_id,
            SETTINGS_DRAFT_ACTION.publishing
          );
        }
        if (action === "enrollment") {
          clearManagementDraft(
            currentProgram.program_id,
            SETTINGS_DRAFT_ACTION.enrollment
          );
        }
        if (action === "attendance") {
          clearManagementDraft(
            currentProgram.program_id,
            SETTINGS_DRAFT_ACTION.attendance
          );
        }
        applyProgram({ ...currentProgram, ...result.program }, action);
        setNotice(COPY.programs.settingsSaved);
        announce(COPY.programs.settingsSaved);
        try {
          const refreshed = await onReload?.();
          if (onReload !== undefined && refreshed === undefined) {
            setReloadRequired(true);
            setActionError(COPY.programs.workspaceSavedStale);
            onMutationBlockChange?.(true);
            announce(COPY.programs.workspaceSavedStale);
          } else if (refreshed) {
            if (!programMatchesPatch(refreshed, patch)) {
              setReloadRequired(true);
              setActionError(COPY.programs.programTransportAmbiguous);
              onMutationBlockChange?.(true);
              announce(COPY.programs.programTransportAmbiguous);
              return;
            }
            applyProgram(refreshed, action);
            pendingProgramRecovery.current = null;
            programMutationKey.current = null;
            clearWorkspaceMutationRecovery("program", {
              programId: currentProgram.program_id,
            });
          }
          if (onReload === undefined) {
            pendingProgramRecovery.current = null;
            programMutationKey.current = null;
            clearWorkspaceMutationRecovery("program", {
              programId: currentProgram.program_id,
            });
          }
        } catch {
          // The PATCH is already authoritative. A failed follow-up GET must
          // remain a refresh problem, never a false failed-save state.
          setReloadRequired(onReload !== undefined);
          onMutationBlockChange?.(onReload !== undefined);
          setActionError(COPY.programs.workspaceSavedStale);
          announce(COPY.programs.workspaceSavedStale);
        }
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        const message = settingsErrorMessage(error);
        const retryable = isRetryableSettingsMutation(error);
        const conflict =
          error instanceof RpcError && error.problem.code === "CONFLICT";
        if (retryable) {
          onMutationBlockChange?.(true);
        } else {
          if (conflict) {
            forcedProgramReloadAction.current = action;
          }
          pendingProgramRecovery.current = null;
          programMutationKey.current = null;
          clearWorkspaceMutationRecovery("program", {
            programId: currentProgram.program_id,
          });
        }
        setReloadRequired((retryable || conflict) && onReload !== undefined);
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
    [
      applyProgram,
      currentProgram,
      onMutationBlockChange,
      onReload,
      reloadRequired,
    ]
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

  const savePublishing = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setActionError(null);
    setNotice(null);
    const opensBeforeError = attendanceFieldError(attendance.opensBefore);
    const closesAfterError = attendanceFieldError(attendance.closesAfter);
    setAttendanceErrors({
      ...(opensBeforeError ? { opensBefore: opensBeforeError } : {}),
      ...(closesAfterError ? { closesAfter: closesAfterError } : {}),
    });
    if (opensBeforeError || closesAfterError) {
      announce(COPY.programs.settingsAttendanceValidation);
      return;
    }
    const opensBefore = Number(attendance.opensBefore);
    const closesAfter = Number(attendance.closesAfter);
    void runProgramMutation({
      check_in_opens_at_minutes_before_start: opensBefore,
      check_in_closes_at_minutes_after_end: closesAfter,
    });
  };

  const rotateAttendanceArtifact = async () => {
    if (!attendanceArtifact || attendanceArtifactBusy || reloadRequired) {
      return;
    }
    const key = attendanceRotationKey.current ?? crypto.randomUUID();
    attendanceRotationKey.current = key;
    setAttendanceArtifactBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const { rotation } = await rotateProgramAttendanceArtifact(
        currentProgram.program_id,
        key
      );
      setAttendanceArtifact((current) =>
        current
          ? { ...current, check_in_token: rotation.check_in_token }
          : current
      );
      attendanceRotationKey.current = null;
      setNotice(COPY.programs.settingsAttendanceQrRotated);
      announce(COPY.programs.settingsAttendanceQrRotated);
    } catch (error) {
      setActionError(settingsErrorMessage(error));
      announce(settingsErrorMessage(error));
    } finally {
      setAttendanceArtifactBusy(false);
    }
  };

  const runScheduleMutation = useCallback(
    async (
      operation: () => Promise<unknown>,
      success: string,
      afterSuccess: () => void,
      resolution: ScheduleMutationResolution,
      recovery: ScheduleMutationRecovery
    ) => {
      if (reloadRequired || scheduleMutationBlocked) {
        return;
      }
      setScheduleMutationVersion((version) => version + 1);
      setBusy(true);
      setActionError(null);
      setRuleError(null);
      setNotice(null);
      pendingScheduleRecovery.current = recovery;
      writeWorkspaceMutationRecovery(recovery);
      try {
        await operation();
        const scheduleSnapshot = await loadRules();
        let refreshFailed = scheduleSnapshot === null;
        try {
          const refreshed = await onReload?.();
          refreshFailed ||= onReload !== undefined && refreshed === undefined;
        } catch {
          refreshFailed = true;
        }
        if (!mounted.current) {
          return;
        }
        if (scheduleSnapshot === null) {
          pendingScheduleResolution.current = resolution;
          setReloadRequired(true);
          onMutationBlockChange?.(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          return;
        }
        pendingScheduleResolution.current = null;
        pendingScheduleRecovery.current = null;
        scheduleMutationKey.current = null;
        clearWorkspaceMutationRecovery("schedule", {
          programId: currentProgram.program_id,
        });
        afterSuccess();
        setNotice(success);
        if (refreshFailed) {
          setReloadRequired(onReload !== undefined);
          setActionError(COPY.programs.workspaceSavedStale);
        }
        announce(success);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        if (isUnknownMutationWriteOutcome(error)) {
          onMutationBlockChange?.(true);
          setReloadRequired(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          pendingScheduleResolution.current = resolution;
          await reconcileScheduleResolution(resolution);
          return;
        }
        const message = settingsErrorMessage(error);
        pendingScheduleResolution.current = null;
        pendingScheduleRecovery.current = null;
        scheduleMutationKey.current = null;
        clearWorkspaceMutationRecovery("schedule", {
          programId: currentProgram.program_id,
        });
        setActionError(message);
        announce(message);
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [
      loadRules,
      onMutationBlockChange,
      onReload,
      reconcileScheduleResolution,
      reloadRequired,
      scheduleMutationBlocked,
    ]
  );

  const retryScheduleResolution = useCallback(async () => {
    if (busy || pendingScheduleResolution.current === null) {
      return;
    }
    setBusy(true);
    await reconcileScheduleResolution(pendingScheduleResolution.current);
    if (mounted.current) {
      setBusy(false);
    }
  }, [busy, reconcileScheduleResolution]);

  const discardMutationRecovery = () => {
    const programRecovery = pendingProgramRecovery.current;
    if (programRecovery !== null) {
      const action = settingsActionForPatch(programRecovery.mutation.patch);
      clearWorkspaceMutationRecovery("program", {
        programId: currentProgram.program_id,
      });
      clearManagementDraft(
        currentProgram.program_id,
        action === "basics"
          ? SETTINGS_DRAFT_ACTION.basics
          : action === "publishing"
            ? SETTINGS_DRAFT_ACTION.publishing
            : action === "enrollment"
              ? SETTINGS_DRAFT_ACTION.enrollment
              : SETTINGS_DRAFT_ACTION.attendance
      );
      applyProgram(currentProgram, action);
      pendingProgramRecovery.current = null;
      programMutationKey.current = null;
    }
    const scheduleRecovery = pendingScheduleRecovery.current;
    if (scheduleRecovery !== null) {
      clearScheduleRecoveryDraft(scheduleRecovery);
      clearWorkspaceMutationRecovery("schedule", {
        programId: currentProgram.program_id,
      });
      pendingScheduleRecovery.current = null;
      pendingScheduleResolution.current = null;
      scheduleMutationKey.current = null;
    }
    forcedProgramReloadAction.current = null;
    setReloadRequired(false);
    onMutationBlockChange?.(false);
    setActionError(null);
    setNotice(COPY.programs.mutationRecoveryDiscarded);
    announce(COPY.programs.mutationRecoveryDiscarded);
  };

  const submitNewRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const idempotencyKey = scheduleRuleCreateKey.current ?? crypto.randomUUID();
    scheduleRuleCreateKey.current = idempotencyKey;
    const input = ruleInputFrom(newRule);
    const finish = () => {
      clearManagementDraft(
        currentProgram.program_id,
        SETTINGS_DRAFT_ACTION.newRule
      );
      scheduleRuleCreateKey.current = null;
      setNewRule((previous) => ({
        ...previous,
        startTime: "",
        endTime: "",
      }));
      setScheduleEditor(null);
      onScheduleEditorChange?.(null);
    };
    void runScheduleMutation(
      () =>
        createScheduleRule(currentProgram.program_id, input, {
          idempotencyKey,
        }),
      COPY.programs.settingsSaved,
      finish,
      {
        matches: (snapshot) =>
          snapshot.rules.some(
            (candidate) =>
              (candidate.retired_at === null ||
                candidate.retired_at === undefined) &&
              sameRuleInput(candidate, input)
          ),
        onConfirmed: finish,
      },
      {
        surface: "schedule",
        programId: currentProgram.program_id,
        idempotencyKey,
        mutation: {
          kind: "create-rule",
          input,
          expected: input,
        },
      }
    );
  };

  const beginRuleEdit = (rule: ScheduleRule) => {
    setScheduleEditor({ kind: "edit-rule", ruleId: rule.rule_id });
    onScheduleEditorChange?.("edit-rule", rule.rule_id);
    setRuleDrafts((previous) => ({
      ...previous,
      [rule.rule_id]:
        readSettingsDraft(
          currentProgram.program_id,
          `${SETTINGS_DRAFT_ACTION.rule}:${rule.rule_id}`,
          isRuleValues
        ) ?? ruleValuesFrom(rule),
    }));
  };

  const submitRuleEdit =
    (rule: ScheduleRule) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = ruleDrafts[rule.rule_id] ?? ruleValuesFrom(rule);
      const input = ruleInputFrom(draft);
      const idempotencyKey = scheduleMutationKey.current ?? crypto.randomUUID();
      scheduleMutationKey.current = idempotencyKey;
      const finish = () => {
        clearManagementDraft(
          currentProgram.program_id,
          `${SETTINGS_DRAFT_ACTION.rule}:${rule.rule_id}`
        );
        setRuleDrafts((previous) => {
          const next = { ...previous };
          delete next[rule.rule_id];
          return next;
        });
        setScheduleEditor(null);
        onScheduleEditorChange?.(null);
      };
      void runScheduleMutation(
        () =>
          updateScheduleRule(
            currentProgram.program_id,
            rule.rule_id,
            input,
            idempotencyKey
          ),
        COPY.programs.settingsSaved,
        finish,
        {
          matches: (snapshot) => {
            const candidate = snapshot.rules.find(
              ({ rule_id }) => rule_id === rule.rule_id
            );
            return candidate !== undefined && sameRuleInput(candidate, input);
          },
          onConfirmed: finish,
        },
        {
          surface: "schedule",
          programId: currentProgram.program_id,
          idempotencyKey,
          mutation: {
            kind: "update-rule",
            ruleId: rule.rule_id,
            input,
            expected: input,
          },
        }
      );
    };

  const exceptionDraftFor = (ruleId: string): ExceptionValues =>
    exceptionDrafts[ruleId] ??
    readSettingsDraft(
      currentProgram.program_id,
      `${SETTINGS_DRAFT_ACTION.exception}:${ruleId}`,
      isExceptionValues
    ) ??
    defaultExceptionValues();

  const submitException =
    (rule: ScheduleRule) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = exceptionDraftFor(rule.rule_id);
      if (!isValidWallDate(draft.overrideDate)) {
        setActionError(COPY.programs.settingsExceptionDateValidation);
        announce(COPY.programs.settingsExceptionDateValidation);
        return;
      }
      const input = exceptionInputFrom(draft);
      const idempotencyKey = scheduleMutationKey.current ?? crypto.randomUUID();
      scheduleMutationKey.current = idempotencyKey;
      const finish = () => {
        clearManagementDraft(
          currentProgram.program_id,
          `${SETTINGS_DRAFT_ACTION.exception}:${rule.rule_id}`
        );
        setExceptionDrafts((previous) => {
          const next = { ...previous };
          delete next[rule.rule_id];
          return next;
        });
        setScheduleEditor(null);
        onScheduleEditorChange?.(null);
      };
      void runScheduleMutation(
        async () => {
          const result = await createScheduleException(
            currentProgram.program_id,
            rule.rule_id,
            input,
            { idempotencyKey }
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
        finish,
        {
          matches: (snapshot) =>
            (snapshot.exceptions[rule.rule_id] ?? []).some(
              (candidate) =>
                sameExceptionInput(candidate, input) &&
                candidate.rule_id === rule.rule_id
            ),
          onConfirmed: finish,
        },
        {
          surface: "schedule",
          programId: currentProgram.program_id,
          idempotencyKey,
          mutation: {
            kind: "create-exception",
            ruleId: rule.rule_id,
            input,
            expected: input,
          },
        }
      );
    };

  const removeException = (exception: ScheduleException) => {
    const idempotencyKey = scheduleMutationKey.current ?? crypto.randomUUID();
    scheduleMutationKey.current = idempotencyKey;
    const finish = () => {
      setExceptions((previous) => {
        const next = { ...previous };
        next[exception.rule_id] = (next[exception.rule_id] ?? []).filter(
          ({ exception_id }) => exception_id !== exception.exception_id
        );
        return next;
      });
    };
    void runScheduleMutation(
      async () => {
        await deleteScheduleException(
          currentProgram.program_id,
          exception.rule_id,
          exception.exception_id,
          idempotencyKey
        );
      },
      COPY.programs.settingsSaved,
      finish,
      {
        matches: (snapshot) =>
          !(snapshot.exceptions[exception.rule_id] ?? []).some(
            ({ exception_id }) => exception_id === exception.exception_id
          ),
        onConfirmed: finish,
      },
      {
        surface: "schedule",
        programId: currentProgram.program_id,
        idempotencyKey,
        mutation: {
          kind: "delete-exception",
          ruleId: exception.rule_id,
          exceptionId: exception.exception_id,
          expected: { deleted: true },
        },
      }
    );
  };

  const beginRetireRule = (rule: ScheduleRule) => {
    setConfirmingRetireRuleId(rule.rule_id);
    setActionError(null);
    setNotice(null);
  };

  const cancelRetireRule = () => {
    setConfirmingRetireRuleId(null);
  };

  const confirmRetireRule = (rule: ScheduleRule) => {
    const idempotencyKey = scheduleMutationKey.current ?? crypto.randomUUID();
    scheduleMutationKey.current = idempotencyKey;
    const finish = () => setConfirmingRetireRuleId(null);
    void runScheduleMutation(
      () =>
        retireScheduleRule(
          currentProgram.program_id,
          rule.rule_id,
          idempotencyKey
        ),
      COPY.programs.settingsRuleRetired,
      finish,
      {
        matches: (snapshot) => {
          const candidate = snapshot.rules.find(
            ({ rule_id }) => rule_id === rule.rule_id
          );
          return (
            candidate?.retired_at !== null &&
            candidate?.retired_at !== undefined
          );
        },
        onConfirmed: finish,
      },
      {
        surface: "schedule",
        programId: currentProgram.program_id,
        idempotencyKey,
        mutation: {
          kind: "retire-rule",
          ruleId: rule.rule_id,
          expected: { retired: true },
        },
      }
    );
  };

  const beginNewRule = () => {
    scheduleRuleCreateKey.current = null;
    setScheduleEditor({ kind: "new-rule" });
    onScheduleEditorChange?.("new-rule");
    setActionError(null);
    setNotice(null);
  };

  const beginException = (rule: ScheduleRule) => {
    setScheduleEditor({ kind: "new-exception", ruleId: rule.rule_id });
    onScheduleEditorChange?.("new-exception", rule.rule_id);
    setExceptionDrafts((previous) => ({
      ...previous,
      [rule.rule_id]: exceptionDraftFor(rule.rule_id),
    }));
    setActionError(null);
    setNotice(null);
  };

  const exitScheduleEditor = () => {
    if (scheduleEditor?.kind === "new-rule") {
      clearManagementDraft(
        currentProgram.program_id,
        SETTINGS_DRAFT_ACTION.newRule
      );
      setNewRule(defaultRuleValues());
    } else if (scheduleEditor?.kind === "edit-rule") {
      clearManagementDraft(
        currentProgram.program_id,
        `${SETTINGS_DRAFT_ACTION.rule}:${scheduleEditor.ruleId}`
      );
      setRuleDrafts((previous) => {
        const next = { ...previous };
        delete next[scheduleEditor.ruleId];
        return next;
      });
    } else if (scheduleEditor?.kind === "new-exception") {
      clearManagementDraft(
        currentProgram.program_id,
        `${SETTINGS_DRAFT_ACTION.exception}:${scheduleEditor.ruleId}`
      );
      setExceptionDrafts((previous) => {
        const next = { ...previous };
        delete next[scheduleEditor.ruleId];
        return next;
      });
    }
    scheduleRuleCreateKey.current = null;
    setScheduleEditor(null);
    onScheduleEditorChange?.(null);
    setScheduleNavigationBlocked(false);
    setActionError(null);
    setNotice(null);
  };

  const handleScheduleEditorBack: MouseEventHandler<HTMLAnchorElement> = (
    event
  ) => {
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
    // RP2.1: Back blocks on the union of Settings editor dirty and inline
    // companion dirty; a clean Settings editor must not drop inline work.
    if (scheduleEditorDirty || scheduleAddonDirty) {
      setScheduleNavigationBlocked(true);
      announce(COPY.programs.settingsUnsaved);
      return;
    }
    exitScheduleEditor();
  };

  const scheduleEditorRule =
    scheduleEditor && scheduleEditor.kind !== "new-rule"
      ? (rules ?? []).find(
          (candidate) => candidate.rule_id === scheduleEditor.ruleId
        )
      : undefined;

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
      setAttendanceErrors({});
    }
    setActionError(null);
    setNotice(null);
  };

  const discardRecoveredDrafts = () => {
    clearManagementDraftsForEntity(currentProgram.program_id);
    setBasics(basicsFrom(currentProgram));
    setPublishing(publishingFrom(currentProgram));
    setEnrollment(enrollmentFrom(currentProgram));
    setAttendance(attendanceFrom(currentProgram));
    setNewRule(defaultRuleValues());
    setRuleDrafts({});
    setExceptionDrafts({});
    setScheduleEditor(null);
    onScheduleEditorChange?.(null);
    setDraftRecoveryOpen(false);
    setActionError(null);
    setNotice(null);
  };

  return (
    <section
      className="grid min-w-0 gap-4"
      aria-labelledby={
        showHeading
          ? focusedSection
            ? "program-settings-focused-title"
            : "program-settings-title"
          : undefined
      }
    >
      <AlertDialog open={draftRecoveryOpen} onOpenChange={setDraftRecoveryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.programs.settingsDraftRecoveryTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.programs.settingsDraftRecoveryDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.programs.draftRecover}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={discardRecoveredDrafts}
            >
              {COPY.programs.draftDiscard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {focusedEditor && navigationBlocked && focusedDirty && (
        <Alert tone="warning" announcement="none">
          {COPY.programs.settingsUnsaved} {focusedSaveLabel} /{" "}
          {COPY.programs.settingsDiscard}
        </Alert>
      )}
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
            reloadRequired ? (
              <div className="flex min-w-0 flex-wrap gap-2">
                {(onReload !== undefined || focusedSchedule) && (
                  <Button
                    className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      void (pendingScheduleResolution.current
                        ? retryScheduleResolution()
                        : reconcileWorkspace(focusedSchedule))
                    }
                    disabled={busy}
                  >
                    {COPY.programs.workspaceRetryRefresh}
                  </Button>
                )}
                {(pendingProgramRecovery.current !== null ||
                  pendingScheduleRecovery.current !== null) && (
                  <Button
                    className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                    variant="outline"
                    type="button"
                    onClick={discardMutationRecovery}
                    disabled={busy}
                  >
                    {COPY.programs.draftDiscard}
                  </Button>
                )}
              </div>
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
                    disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
                  />
                </ScreenField>
                {!focusedEditor && (
                  <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                    <Button
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                      type="submit"
                      disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                      disabled={mutationBlocked}
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
                        disabled={mutationBlocked}
                        onClick={confirmPublishing}
                      >
                        {COPY.programs.settingsConfirmPublishingChange}
                      </Button>
                      <Button
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        type="button"
                        disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                    disabled={mutationBlocked}
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
                      disabled={mutationBlocked}
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
                        disabled={mutationBlocked}
                        onClick={confirmEnrollment}
                      >
                        {COPY.programs.settingsConfirmChange}
                      </Button>
                      <Button
                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                        type="button"
                        disabled={mutationBlocked}
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

          {showScheduleOverview && (
            <ScreenSection
              className="mt-0"
              headingId="program-settings-schedule"
              title={
                focusedSchedule
                  ? COPY.programs.scheduleRulesTitle
                  : COPY.programs.settingsSchedule
              }
              action={
                focusedSchedule ? (
                  <Button
                    className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                    type="button"
                    onClick={beginNewRule}
                    disabled={mutationBlocked || scheduleMutationBlocked}
                  >
                    {COPY.programs.addRule}
                  </Button>
                ) : undefined
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
                    ruleError === null ? (
                      <ScreenLoadingRows
                        density="settings"
                        label={COPY.programs.settingsScheduleLoading}
                      />
                    ) : null
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
                                      {" · "}
                                      {rule.effective_start_date ?? "—"}–
                                      {rule.effective_end_date ?? "∞"}
                                    </ScreenRowMeta>
                                    {rule.retired_at && (
                                      <ScreenStatus tone="neutral">
                                        {COPY.programs.settingsRuleRetired}
                                      </ScreenStatus>
                                    )}
                                  </ScreenRowMain>
                                  {focusedSchedule && (
                                    <ScreenRowTrailing>
                                      <Button
                                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                        type="button"
                                        variant="outline"
                                        onClick={() => beginRuleEdit(rule)}
                                        disabled={
                                          mutationBlocked ||
                                          (rule.retired_at !== null &&
                                            rule.retired_at !== undefined)
                                        }
                                      >
                                        {COPY.programs.settingsRuleEdit}
                                      </Button>
                                      <Button
                                        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                        type="button"
                                        variant="outline"
                                        onClick={() => beginException(rule)}
                                        disabled={
                                          mutationBlocked ||
                                          (rule.retired_at !== null &&
                                            rule.retired_at !== undefined)
                                        }
                                      >
                                        {COPY.programs.settingsRuleAddException}
                                      </Button>
                                      {Boolean(rule.has_generated_events) &&
                                        !rule.retired_at &&
                                        confirmingRetireRuleId !==
                                          rule.rule_id && (
                                          <Button
                                            className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                              beginRetireRule(rule)
                                            }
                                            disabled={mutationBlocked}
                                          >
                                            {COPY.programs.settingsRuleRetire}
                                          </Button>
                                        )}
                                    </ScreenRowTrailing>
                                  )}
                                </ScreenRow>
                                {focusedSchedule &&
                                  confirmingRetireRuleId === rule.rule_id && (
                                    <Alert
                                      className="mx-4 mb-3 grid min-w-0 gap-[var(--screen-utility-gap)]"
                                      tone="warning"
                                      announcement="none"
                                    >
                                      <span>
                                        {COPY.programs.settingsRuleRetireHint}
                                      </span>
                                      <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                                        <Button
                                          type="button"
                                          className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                                          onClick={() =>
                                            confirmRetireRule(rule)
                                          }
                                          disabled={mutationBlocked}
                                        >
                                          {
                                            COPY.programs
                                              .settingsRuleRetireConfirm
                                          }
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                                          onClick={cancelRetireRule}
                                          disabled={mutationBlocked}
                                        >
                                          {COPY.programs.settingsRuleCancel}
                                        </Button>
                                      </div>
                                    </Alert>
                                  )}
                                {ruleExceptions.length > 0 && (
                                  <ScreenRowList className="border-t-0 pl-4">
                                    <ul
                                      className="m-0 grid min-w-0 list-none gap-0 p-0"
                                      aria-label={
                                        COPY.programs.settingsExistingExceptions
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
                                            {exception.new_date
                                              ? ` → ${exception.new_date}`
                                              : ""}
                                          </ScreenRowMeta>
                                          <Button
                                            className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                              removeException(exception)
                                            }
                                            disabled={mutationBlocked}
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
          {scheduleEditorActive && scheduleEditor && (
            <section
              className="grid min-w-0 gap-[var(--screen-section-gap)]"
              aria-labelledby="program-settings-schedule-editor-title"
            >
              <ScreenHeader
                level="child"
                title={
                  scheduleEditor.kind === "new-rule"
                    ? COPY.programs.addRule
                    : scheduleEditor.kind === "edit-rule"
                      ? COPY.programs.settingsRuleEdit
                      : COPY.programs.settingsRuleAddException
                }
                lead={COPY.programs.settingsScheduleLead}
                headingId="program-settings-schedule-editor-title"
                backHref={scheduleBackHref ?? "#schedule-overview"}
                backLabel={COPY.programs.backToOverview}
                onBack={handleScheduleEditorBack}
              />
              {scheduleEditor.kind === "new-rule" ? (
                <ScheduleRuleEditor
                  idPrefix="program-settings-new-rule"
                  values={newRule}
                  onChange={(values) => {
                    scheduleRuleCreateKey.current = null;
                    setNewRule(values);
                  }}
                  onSubmit={submitNewRule}
                  onCancel={exitScheduleEditor}
                  busy={busy}
                  submitLabel={COPY.programs.addRule}
                />
              ) : scheduleEditorRule === undefined ? (
                <ScreenState
                  kind="error"
                  title={COPY.programs.settingsScheduleLoadError}
                />
              ) : scheduleEditor.kind === "edit-rule" ? (
                <ScheduleRuleEditor
                  idPrefix={`program-settings-rule-${scheduleEditor.ruleId}`}
                  values={
                    ruleDrafts[scheduleEditor.ruleId] ??
                    ruleValuesFrom(scheduleEditorRule)
                  }
                  onChange={(values) =>
                    setRuleDrafts((previous) => ({
                      ...previous,
                      [scheduleEditor.ruleId]: values,
                    }))
                  }
                  onSubmit={submitRuleEdit(scheduleEditorRule)}
                  onCancel={exitScheduleEditor}
                  busy={busy}
                />
              ) : (
                <ScheduleExceptionEditor
                  rule={scheduleEditorRule}
                  ruleId={scheduleEditor.ruleId}
                  values={exceptionDraftFor(scheduleEditor.ruleId)}
                  onChange={(values) =>
                    setExceptionDrafts((previous) => ({
                      ...previous,
                      [scheduleEditor.ruleId]: values,
                    }))
                  }
                  onSubmit={submitException(scheduleEditorRule)}
                  onCancel={exitScheduleEditor}
                  busy={busy}
                />
              )}
            </section>
          )}
          <AlertDialog
            open={scheduleNavigationBlocked}
            onOpenChange={(open) => {
              if (!open) {
                setScheduleNavigationBlocked(false);
              }
            }}
          >
            <AlertDialogContent className="min-w-0 max-w-[32rem]">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {COPY.programs.settingsLeaveTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {COPY.programs.settingsLeaveDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setScheduleNavigationBlocked(false)}
                >
                  {COPY.programs.settingsContinueEditing}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={exitScheduleEditor}
                >
                  {COPY.programs.settingsDiscardAndLeave}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                  noValidate
                  onSubmit={saveAttendance}
                >
                  <ScreenField
                    error={
                      attendanceErrors.opensBefore ? (
                        <span id="program-settings-attendance-opens-error">
                          {attendanceErrors.opensBefore}
                        </span>
                      ) : undefined
                    }
                    htmlFor="program-settings-attendance-opens"
                    label={COPY.programs.settingsAttendanceOpens}
                    help={COPY.programs.settingsAttendanceUnits}
                  >
                    <Input
                      id="program-settings-attendance-opens"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="number"
                      aria-label={COPY.programs.settingsAttendanceOpens}
                      aria-describedby={
                        attendanceErrors.opensBefore
                          ? "program-settings-attendance-opens-error"
                          : undefined
                      }
                      aria-invalid={attendanceErrors.opensBefore !== undefined}
                      min={0}
                      step={1}
                      required
                      value={attendance.opensBefore}
                      onChange={(event) => {
                        setAttendance((previous) => ({
                          ...previous,
                          opensBefore: event.target.value,
                        }));
                        setAttendanceErrors((previous) => ({
                          ...previous,
                          opensBefore: undefined,
                        }));
                      }}
                      disabled={mutationBlocked}
                    />
                  </ScreenField>
                  <ScreenField
                    error={
                      attendanceErrors.closesAfter ? (
                        <span id="program-settings-attendance-closes-error">
                          {attendanceErrors.closesAfter}
                        </span>
                      ) : undefined
                    }
                    htmlFor="program-settings-attendance-closes"
                    label={COPY.programs.settingsAttendanceCloses}
                    help={COPY.programs.settingsAttendanceUnits}
                  >
                    <Input
                      id="program-settings-attendance-closes"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="number"
                      aria-label={COPY.programs.settingsAttendanceCloses}
                      aria-describedby={
                        attendanceErrors.closesAfter
                          ? "program-settings-attendance-closes-error"
                          : undefined
                      }
                      aria-invalid={attendanceErrors.closesAfter !== undefined}
                      min={0}
                      step={1}
                      required
                      value={attendance.closesAfter}
                      onChange={(event) => {
                        setAttendance((previous) => ({
                          ...previous,
                          closesAfter: event.target.value,
                        }));
                        setAttendanceErrors((previous) => ({
                          ...previous,
                          closesAfter: undefined,
                        }));
                      }}
                      disabled={mutationBlocked}
                    />
                  </ScreenField>
                  {section === "attendance" && (
                    <div className="grid min-w-0 gap-3">
                      {attendanceArtifactLoading && (
                        <output
                          className="text-sm text-[var(--screen-muted)]"
                          aria-live="polite"
                        >
                          {COPY.programs.settingsAttendanceQrLoading}
                        </output>
                      )}
                      {attendanceArtifactError !== null && (
                        <ScreenState
                          kind="error"
                          title={
                            attendanceArtifactError ||
                            COPY.programs.settingsAttendanceQrUnavailable
                          }
                          action={
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                setAttendanceArtifactReload(
                                  (current) => current + 1
                                )
                              }
                              disabled={attendanceArtifactLoading}
                            >
                              {COPY.programs.settingsAttendanceQrRetry}
                            </Button>
                          }
                        />
                      )}
                      {attendanceArtifact !== null && (
                        <ProgramAttendanceQrCard
                          artifact={attendanceArtifact}
                          busy={mutationBlocked || attendanceArtifactBusy}
                          onRotate={() => void rotateAttendanceArtifact()}
                        />
                      )}
                    </div>
                  )}
                  {!focusedEditor && (
                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      <Button
                        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                        type="submit"
                        disabled={mutationBlocked}
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
        scheduleAddon && (
          <div hidden={scheduleEditorActive}>
            {scheduleAddon({
              rules,
              rulesError: ruleError,
              exceptions,
              scheduleMutationVersion,
              onScheduleRefresh: async () => (await loadRules()) !== null,
            })}
          </div>
        )}
      {showDirtyActions && (
        <>
          <output
            className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]"
            data-screen-settings-dirty="true"
            aria-live="polite"
          >
            {COPY.programs.settingsUnsaved}
          </output>
          <div
            className="grid min-w-0 grid-cols-[1fr_1.35fr] gap-[var(--screen-utility-gap)] border-t border-[var(--screen-line)] pt-2.5"
            data-screen-foundation="program-settings-dirty-actions"
            data-testid="program-settings-dirty-actions"
          >
            <Button
              className="w-full border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              type="button"
              variant="outline"
              onClick={discardFocusedChanges}
              disabled={busy}
            >
              {COPY.programs.settingsDiscard}
            </Button>
            <Button
              className="w-full bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
              type="submit"
              form={focusedFormId}
              disabled={mutationBlocked}
            >
              {focusedSaveLabel}
            </Button>
          </div>
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
