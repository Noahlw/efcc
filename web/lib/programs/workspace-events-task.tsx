"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Sheet,
 SheetClose,
 SheetContent,
 SheetDescription,
 SheetFooter,
 SheetHeader,
 SheetTitle,
} from "@/components/ui/sheet";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
 cancelEvent,
 createEvent,
 createScheduleException,
 deleteScheduleException,
 generateEvents,
 isUnknownMutationOutcome,
  isUnknownMutationWriteOutcome,
 listEvents,
 previewEvents,
} from "@/lib/programs/program-api";
import type {
 EventType,
 GenerateResult,
 PreviewResult,
 ProgramEvent,
 ScheduleException,
 ScheduleRule,
} from "@/lib/programs/program-api";
import {
 addWallDays,
 addWallMonths,
 formatScheduleRuleLabel,
 hkTodayWallDate,
 hkWallDateTimeLabel,
 isValidWallDate,
 wallDaySpan,
} from "@/lib/programs/recurrence";
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
 ScreenStatus,
 ScreenTab,
 ScreenTabs,
} from "@/lib/screen-foundations";

import {
 clearEventCreateDraft,
 readEventCreateDraft,
 writeEventCreateDraft,
} from "./event-create-draft";
import { hkWallInputToIso, hkWallInputValue } from "./event-detail";
import {
 clearGenerationRecovery,
 readGenerationRecovery,
 writeGenerationRecovery,
} from "./generation-recovery";
import {
 clearManagementDraft,
 listManagementDrafts,
 writeManagementDraft,
} from "./management-draft";
import {
 clearWorkspaceMutationRecovery,
 readWorkspaceMutationRecovery,
 writeWorkspaceMutationRecovery,
} from "./mutation-recovery";
import type { EventListMutationRecovery } from "./mutation-recovery";
import { ProgramDatePicker } from "./program-date-picker";
import { SETTINGS_DRAFT_ACTION } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import type {
 ManagementEventAction,
 ProgramsEventFilter,
} from "./programs-intent";
import {
 clearWorkspaceScroll,
 consumeWorkspaceScroll,
 rememberWorkspaceScroll,
 restoreProgramsScrollY,
} from "./programs-scroll";
import { useAsyncResource } from "./use-async-resource";
import {
 eventWallParts,
 redirectToLoginIfRequired,
 useWorkspaceTaskContext,
} from "./workspace-context";

const EMPTY_SCHEDULE_EXCEPTIONS: Record<string, ScheduleException[]> = {};

type EventsState =
 | { kind: "loading" }
 | { kind: "ready"; events: ProgramEvent[] }
 | { kind: "error"; message: string };

// EVT-02 (#252): server-owned preview plan lifecycle in the events task.
type PreviewState =
 | { kind: "idle" }
 | { kind: "loading" }
 | {
  kind: "ready";
  plan: PreviewResult;
  inputFingerprint: string;
  scheduleMutationVersion: number;
 }
 | { kind: "empty" }
 | { kind: "error"; message: string; stale: boolean };

interface ExceptionDraft {
 action: "CANCEL" | "RESCHEDULE";
 newDate: string;
 newStartTime: string;
 newEndTime: string;
}

/** Program Settings owns `settings-exception:${ruleId}`; an inline Preview
 * 調整 draft adds the Church Time date so same-rule occurrences stay
 * distinct session keys (ADR-0052, W2). */
function previewDraftKey(ruleId: string, occursOn: string): string {
 return `${ruleId}:${occursOn}`;
}

function previewDraftAction(draftKey: string): string {
 return `${SETTINGS_DRAFT_ACTION.exception}:${draftKey}`;
}

function previewDraftKeyFromAction(action: string): string | null {
 const prefix = `${SETTINGS_DRAFT_ACTION.exception}:`;
 if (!action.startsWith(prefix)) {
  return null;
 }
 const key = action.slice(prefix.length);
 const separator = key.indexOf(":");
 return separator > 0 && separator < key.length - 1 ? key : null;
}

function splitPreviewDraftKey(key: string): {
 ruleId: string;
 occursOn: string;
} {
 const separator = key.indexOf(":");
 return {
  ruleId: key.slice(0, separator),
  occursOn: key.slice(separator + 1),
 };
}

function isExceptionDraft(value: unknown): value is ExceptionDraft {
 if (typeof value !== "object" || value === null) {
  return false;
 }
 const draft = value as Partial<ExceptionDraft>;
 return (
  (draft.action === "CANCEL" || draft.action === "RESCHEDULE") &&
  typeof draft.newDate === "string" &&
  typeof draft.newStartTime === "string" &&
  typeof draft.newEndTime === "string"
 );
}

interface PreviewAdjustTarget {
 key: string;
 ruleId: string;
 occursOn: string;
 startsAt: string;
 location: string | null;
 exceptionId: string | null;
}

type EventListFilter = ProgramsEventFilter;

function isEventListFilter(value: string): value is EventListFilter {
 return value === "current" || value === "past" || value === "cancelled";
}

type PendingEventMutation = EventListMutationRecovery;

function sameNullableValue(
 left: string | null | undefined,
 right: string | null
): boolean {
 return (left ?? null) === right;
}

function eventSettlesMutation(
 events: readonly ProgramEvent[],
 mutation: PendingEventMutation,
 expectedEventId?: string
): boolean {
 if (mutation.kind === "cancel") {
  return events.some(
   (event) =>
    event.event_id === mutation.eventId && event.status === "Cancelled"
  );
 }
 return events.some((event) => {
  if (expectedEventId !== undefined && event.event_id !== expectedEventId) {
   return false;
  }
  return (
   event.program_id === mutation.programId &&
   !mutation.beforeEventIds.includes(event.event_id) &&
   event.starts_at === mutation.startsAt &&
   event.ends_at === mutation.endsAt &&
   sameNullableValue(event.name, mutation.name) &&
   sameNullableValue(event.event_type, mutation.eventType) &&
   sameNullableValue(event.location, mutation.location) &&
   (mutation.opensAt === null ||
    sameNullableValue(event.check_in_window_opens_at, mutation.opensAt)) &&
   (mutation.closesAt === null ||
    sameNullableValue(event.check_in_window_closes_at, mutation.closesAt))
  );
 });
}

function consumeEventCreateIntent(): void {
 if (
  typeof window === "undefined" ||
  window.location.hash !== "#create-event"
 ) {
  return;
 }
 const nextUrl = new URL(window.location.href);
 nextUrl.hash = "";
 window.history.replaceState(
  window.history.state,
  "",
  `${nextUrl.pathname}${nextUrl.search}`
 );
 window.dispatchEvent(new Event("hashchange"));
}

function eventIsOpen(event: ProgramEvent, now = Date.now()): boolean {
 if (event.status !== "Active" || event.availability === "Inactive") {
  return false;
 }
 const opensAt = Date.parse(event.check_in_window_opens_at ?? "");
 const closesAt = Date.parse(event.check_in_window_closes_at ?? "");
 return (
  Number.isFinite(opensAt) &&
  Number.isFinite(closesAt) &&
  opensAt <= now &&
  now <= closesAt
 );
}

function eventIsPast(event: ProgramEvent, now = Date.now()): boolean {
 const startsAt = Date.parse(event.starts_at);
 return (
  event.status === "Active" &&
  !eventIsOpen(event, now) &&
  ((Number.isFinite(startsAt) && startsAt <= now) ||
   eventWallParts(event.starts_at).date < hkTodayWallDate(new Date(now)))
 );
}

type EventActionPhase = "future" | "open" | "past" | "cancelled";

function eventActionPhase(
 event: ProgramEvent,
 now = Date.now()
): EventActionPhase {
 if (event.status === "Cancelled") {
  return "cancelled";
 }
 if (eventIsOpen(event, now)) {
  return "open";
 }
 const opensAt = Date.parse(event.check_in_window_opens_at ?? "");
 const startsAt = Date.parse(event.starts_at);
 return [opensAt, startsAt].some(
  (timestamp) => Number.isFinite(timestamp) && timestamp > now
 )
  ? "future"
  : "past";
}

function rankForEvent(event: ProgramEvent, now: number): number {
 if (eventIsOpen(event, now)) {
  return 0;
 }
 if (eventWallParts(event.starts_at).date === hkTodayWallDate(new Date(now))) {
  return 1;
 }
 const startsAt = Date.parse(event.starts_at);
 return Number.isFinite(startsAt) && startsAt >= now ? 2 : 3;
}

function eventsForFilter(
 events: ProgramEvent[],
 filter: EventListFilter,
 now = Date.now()
): ProgramEvent[] {
 const filtered = events.filter((event) =>
  filter === "cancelled"
   ? event.status === "Cancelled"
   : filter === "past"
    ? eventIsPast(event, now)
    : event.status === "Active" && !eventIsPast(event, now)
 );
 return filtered.sort((left, right) => {
  if (filter === "current") {
   const rankDifference = rankForEvent(left, now) - rankForEvent(right, now);
   if (rankDifference !== 0) {
    return rankDifference;
   }
  }
  const leftStartsAt = Date.parse(left.starts_at);
  const rightStartsAt = Date.parse(right.starts_at);
  if (filter === "current" && rankForEvent(left, now) === 3) {
   return rightStartsAt - leftStartsAt;
  }
  return leftStartsAt - rightStartsAt;
 });
}

function hkWallTimeOf(iso: string): string {
 return new Date(new Date(iso).getTime() + 8 * 60 * 60_000)
  .toISOString()
  .slice(11, 16);
}

function generationResultCopy(generated: GenerateResult): string {
 if (generated.failed > 0) {
  return COPY.programs.generatedPartial
   .replace("{created}", String(generated.created))
   .replace("{skipped}", String(generated.skipped))
   .replace("{failed}", String(generated.failed));
 }
 return generated.resumed
  ? COPY.programs.generatedResumed
   .replace("{created}", String(generated.created))
   .replace("{skipped}", String(generated.skipped))
  : COPY.programs.generated
   .replace("{created}", String(generated.created))
   .replace("{skipped}", String(generated.skipped));
}

function scheduleInputFingerprint(
 rules: ScheduleRule[] | null,
 exceptions: Record<string, ScheduleException[]>
): string {
 if (rules === null) {
  return "unresolved";
 }
 return JSON.stringify({
  rules: [...rules]
   .sort((left, right) => left.rule_id.localeCompare(right.rule_id))
   .map((rule) => ({
    rule_id: rule.rule_id,
    recurrence: rule.recurrence,
    day_of_week: rule.day_of_week,
    month_day: rule.month_day,
    start_time: rule.start_time,
    end_time: rule.end_time,
    location: rule.location ?? null,
    effective_start_date: rule.effective_start_date ?? null,
    effective_end_date: rule.effective_end_date ?? null,
    retired_at: rule.retired_at ?? null,
    version: rule.updated_at,
   })),
  exceptions: Object.entries(exceptions)
   .flatMap(([ruleId, rows]) =>
    rows.map((exception) => ({
     exception_id: exception.exception_id,
     rule_id: ruleId,
     override_date: exception.override_date,
     action: exception.action,
     new_start_time: exception.new_start_time,
     new_end_time: exception.new_end_time,
     new_date: exception.new_date ?? null,
     version: exception.created_at,
    }))
   )
   .sort((left, right) =>
    `${left.rule_id}:${left.exception_id}`.localeCompare(
     `${right.rule_id}:${right.exception_id}`
    )
   ),
 });
}

// oxlint-disable-next-line eslint/complexity -- this panel owns preview, exception, generation, and recovery state transitions.
export const RecurringSchedulePanel = ({
 programId,
 rules,
 exceptions = EMPTY_SCHEDULE_EXCEPTIONS,
 scheduleMutationVersion = 0,
 rulesError,
 onGenerated,
 onOpenEvent,
 onMutationBlockChange,
 onWorkspaceRefresh,
 onScheduleRefresh,
 onFocusedTaskDirtyChange,
 onFocusedTaskFocusChange,
 scheduleDraftDiscardSignal = 0,
}: {
 programId: string;
 rules: ScheduleRule[] | null;
 exceptions?: Record<string, ScheduleException[]>;
 scheduleMutationVersion?: number;
 rulesError: string | null;
 /** Invoked after a successful generation so the event list refreshes. */
 onGenerated: () => boolean | Promise<boolean>;
 /** Opens an exact generated Event when the parent owns Event navigation. */
 onOpenEvent?: (eventId: string) => void;
 onMutationBlockChange?: (blocked: boolean) => void;
 onWorkspaceRefresh?: () => void | Promise<unknown>;
 /** Re-read Rules and saved exceptions after an unknown exception write. */
 onScheduleRefresh?: () => Promise<boolean>;
 /** Report inline dirty to the parent Back handshake (union with Settings). */
 onFocusedTaskDirtyChange?: (dirty: boolean) => void;
 /** Report Sheet focus so the parent Back handshake targets this panel. */
 onFocusedTaskFocusChange?: (focused: boolean) => void;
 /** Parent Back Discard signal: drop in-memory + session inline drafts. */
 scheduleDraftDiscardSignal?: number;
}) => {
 const [previewFromDate, setPreviewFromDate] = useState(() =>
  hkTodayWallDate()
 );
 const [previewUntilDate, setPreviewUntilDate] = useState(() =>
  addWallDays(addWallMonths(hkTodayWallDate(), 3), -1)
 );
 const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
 const [previewInvalidated, setPreviewInvalidated] = useState(false);
 const [previewBusy, setPreviewBusy] = useState(false);
 const [generateBusy, setGenerateBusy] = useState(false);
 const [generateResult, setGenerateResult] = useState<string | null>(null);
 const [generationIdentity, setGenerationIdentity] = useState<{
  runId: string | null;
  planId: string;
 } | null>(null);
 const [generatePartial, setGeneratePartial] = useState(false);
 const [generationData, setGenerationData] = useState<GenerateResult | null>(
  null
 );
 const [generationNeedsReconciliation, setGenerationNeedsReconciliation] =
  useState(false);
 const [generationRequiresReview, setGenerationRequiresReview] =
  useState(false);
 const [generateError, setGenerateError] = useState<string | null>(null);
 const [exceptionDrafts, setExceptionDrafts] = useState<
  Record<string, ExceptionDraft>
 >({});
 const [localExceptions, setLocalExceptions] = useState(exceptions);
 const [exceptionBusy, setExceptionBusy] = useState(false);
 const [scheduleNeedsReconciliation, setScheduleNeedsReconciliation] =
  useState(false);
 const [adjustingTargetKey, setAdjustingTargetKey] = useState<string | null>(
  null
 );
 const mounted = useRef(true);

 useEffect(() => {
  mounted.current = true;
  return () => {
   mounted.current = false;
  };
 }, []);

 const generationRecoveryReady = useRef(false);
 useEffect(() => {
  generationRecoveryReady.current = true;
  const recovery = readGenerationRecovery(programId);
  if (!recovery) {
   return;
  }
  setGenerationIdentity({
   runId: recovery.runId,
   planId: recovery.planId,
  });
  setGenerationData(recovery.data);
  setGenerationNeedsReconciliation(recovery.needsReconciliation);
  setGenerationRequiresReview(recovery.requiresReview);
  if (recovery.data === null) {
   setGenerateError(COPY.programs.scheduleTransportAmbiguous);
  } else {
   setGenerateResult(generationResultCopy(recovery.data));
  }
  onMutationBlockChange?.(true);
 }, [onMutationBlockChange, programId]);

 // R43: a Preview reload must not erase which Plan Generate was committed
 // against. The unresolved reference survives until reconciliation settles.
 useEffect(() => {
  if (!generationRecoveryReady.current) {
   return;
  }
  if (!generationNeedsReconciliation && !generationRequiresReview) {
   clearGenerationRecovery(programId);
   return;
  }
  const planId =
   generationIdentity?.planId ??
   (preview.kind === "ready" ? preview.plan.plan.plan_id : null);
  if (planId === null) {
   return;
  }
  writeGenerationRecovery({
   version: 1,
   programId,
   planId,
   runId: generationIdentity?.runId ?? null,
   needsReconciliation: generationNeedsReconciliation,
   requiresReview: generationRequiresReview,
   data: generationData,
  });
 }, [
  generationData,
  generationIdentity,
  generationNeedsReconciliation,
  generationRequiresReview,
  preview,
  programId,
 ]);

 useEffect(() => {
  setLocalExceptions(exceptions);
 }, [exceptions]);

 const draftRecoveryReady = useRef(false);
 useEffect(() => {
  draftRecoveryReady.current = true;
  const restored: Record<string, ExceptionDraft> = {};
  for (const { action, data } of listManagementDrafts<unknown>(programId)) {
   const key = previewDraftKeyFromAction(action);
   if (key !== null && isExceptionDraft(data)) {
    restored[key] = data;
   }
  }
  if (Object.keys(restored).length > 0) {
   setExceptionDrafts((previous) => ({ ...restored, ...previous }));
  }
 }, [programId]);

 // ADR-0052: a dirty 調整 draft survives reload; an unchanged draft never
 // reaches session storage, so open/close stays a no-op.
 useEffect(() => {
  if (!draftRecoveryReady.current) {
   return;
  }
  for (const [key, draft] of Object.entries(exceptionDrafts)) {
   const action = previewDraftAction(key);
   if (draftIsDirty(key, draft)) {
    writeManagementDraft(programId, action, draft);
   } else {
    clearManagementDraft(programId, action);
   }
  }
 }, [exceptionDrafts, localExceptions, programId, rules]);

 // RP2.1: parent Back Discard clears the correct occurrence drafts from both
 // in-memory state and session storage (session alone would be rewritten).
 const discardSignalRef = useRef(0);
 useEffect(() => {
  if (scheduleDraftDiscardSignal <= discardSignalRef.current) {
   return;
  }
  discardSignalRef.current = scheduleDraftDiscardSignal;
  for (const { action } of listManagementDrafts<unknown>(programId)) {
   if (previewDraftKeyFromAction(action) !== null) {
    clearManagementDraft(programId, action);
   }
  }
  setExceptionDrafts({});
  setAdjustingTargetKey(null);
 }, [programId, scheduleDraftDiscardSignal]);

 const currentInputFingerprint = scheduleInputFingerprint(
  rules,
  localExceptions
 );
 const savedExceptionFor = (ruleId: string, occursOn: string) =>
  (localExceptions[ruleId] ?? []).find(
   (exception) => exception.override_date === occursOn
  ) ?? null;
 const draftBaseline = (target: {
  ruleId: string;
  occursOn: string;
 }): ExceptionDraft | null => {
  const rule = (rules ?? []).find(
   (candidate) => candidate.rule_id === target.ruleId
  );
  if (!rule) {
   return null;
  }
  const saved = savedExceptionFor(target.ruleId, target.occursOn);
  if (saved) {
   return {
    action: saved.action,
    newDate: saved.new_date ?? saved.override_date,
    newStartTime: saved.new_start_time ?? rule.start_time,
    newEndTime: saved.new_end_time ?? rule.end_time,
   };
  }
  return {
   action: "RESCHEDULE",
   newDate: target.occursOn,
   newStartTime: rule.start_time,
   newEndTime: rule.end_time,
  };
 };
 const draftIsDirty = (key: string, draft: ExceptionDraft): boolean => {
  const baseline = draftBaseline(splitPreviewDraftKey(key));
  return (
   baseline === null || JSON.stringify(baseline) !== JSON.stringify(draft)
  );
 };
 const adjustTargetForKey = (key: string): PreviewAdjustTarget | null => {
  const target = splitPreviewDraftKey(key);
  const rule =
      (rules ?? []).find((candidate) => candidate.rule_id === target.ruleId) ??
      null;
  const occurrence =
   preview.kind === "ready"
    ? (preview.plan.occurrences.find(
     (candidate) =>
      candidate.rule_id === target.ruleId &&
      candidate.occurs_on === target.occursOn
    ) ?? null)
    : null;
  const startsAt =
   occurrence?.starts_at ??
   (rule ? hkWallInputToIso(`${target.occursOn}T${rule.start_time}`) : null);
  if (startsAt === null) {
   return null;
  }
  return {
   key,
   ruleId: target.ruleId,
   occursOn: target.occursOn,
   startsAt,
   location: occurrence?.location ?? rule?.location ?? null,
   exceptionId:
    occurrence?.exception_id ??
    savedExceptionFor(target.ruleId, target.occursOn)?.exception_id ??
    null,
  };
 };
 const adjustTargetForOccurrence = (
  occurrence: PreviewResult["occurrences"][number]
 ): PreviewAdjustTarget => ({
  key: previewDraftKey(occurrence.rule_id, occurrence.occurs_on),
  ruleId: occurrence.rule_id,
  occursOn: occurrence.occurs_on,
  startsAt: occurrence.starts_at,
  location: occurrence.location,
  exceptionId:
   occurrence.exception_id ??
   savedExceptionFor(occurrence.rule_id, occurrence.occurs_on)
    ?.exception_id ??
   null,
 });
 const visibleDraftKeys = new Set(
  preview.kind === "ready"
   ? preview.plan.occurrences.map((occurrence) =>
    previewDraftKey(occurrence.rule_id, occurrence.occurs_on)
   )
   : []
 );
 const hasExceptionDrafts = Object.entries(exceptionDrafts).some(
  ([key, draft]) => visibleDraftKeys.has(key) && draftIsDirty(key, draft)
 );
 // A draft whose Preview Occurrence left the visible range stays recoverable
 // without permanently disabling Generate.
 const orphanDraftKeys = Object.keys(exceptionDrafts).filter(
  (key) => !visibleDraftKeys.has(key)
 );
 const previewIsStale =
  preview.kind === "ready" &&
  (previewInvalidated ||
   rules === null ||
   hasExceptionDrafts ||
   exceptionBusy ||
   preview.inputFingerprint !== currentInputFingerprint ||
   preview.scheduleMutationVersion !== scheduleMutationVersion ||
   preview.plan.plan.from_date !== previewFromDate ||
   (preview.plan.plan.to_date ??
    addWallDays(
     preview.plan.plan.from_date,
     preview.plan.plan.horizon_days - 1
    )) !== previewUntilDate);
 const previewNeedsReview =
  previewIsStale || (preview.kind === "error" && preview.stale);

 // RP2.1: wire inline dirty/focus into the parent Back Continue/Discard
 // handshake. Workspace dirty is the union of Settings dirty and this
 // panel's inline dirty; a clean Settings editor cannot drop it.
 const inlineDirty =
  hasExceptionDrafts || adjustingTargetKey !== null || exceptionBusy;
 useEffect(() => {
  onFocusedTaskDirtyChange?.(inlineDirty);
 }, [inlineDirty, onFocusedTaskDirtyChange]);
 useEffect(() => {
  onFocusedTaskFocusChange?.(adjustingTargetKey !== null);
 }, [adjustingTargetKey, onFocusedTaskFocusChange]);
 useEffect(
  () => () => {
   onFocusedTaskDirtyChange?.(false);
   onFocusedTaskFocusChange?.(false);
  },
  [onFocusedTaskDirtyChange, onFocusedTaskFocusChange]
 );

 const loadPreview = async (fromDate: string, untilDate: string) => {
  const previousPreview = preview;
  const horizonDays =
   isValidWallDate(fromDate) && isValidWallDate(untilDate)
    ? wallDaySpan(fromDate, untilDate)
    : 0;
  if (
   !isValidWallDate(fromDate) ||
   !isValidWallDate(untilDate) ||
   horizonDays < 1 ||
   horizonDays > 365
  ) {
   setPreviewInvalidated(true);
   if (previousPreview.kind !== "ready") {
    setPreview({ kind: "idle" });
   }
   setGenerateError(COPY.programs.previewError);
   announce(COPY.programs.previewError);
   return;
  }
  setPreviewBusy(true);
  setPreviewInvalidated(true);
  if (previousPreview.kind !== "ready") {
   setPreview({ kind: "loading" });
  }
    // ADR-0047: an unresolved Generate keeps its Plan identity and recoverable
  // reference across Preview/Review Again; only a settled mutation clears.
    // A reconciled requires_review latch stays until a successful Preview of
    // the current schedule fingerprint yields a new Plan id.
  if (!generationNeedsReconciliation && !generationRequiresReview) {
   setGenerateResult(null);
   setGenerationIdentity(null);
   setGenerationData(null);
   setGenerateError(null);
  }
  try {
   const plan = await previewEvents(programId, {
    from_date: fromDate,
    until_date: untilDate,
   });
   if (!mounted.current) {
    return;
   }
   if (plan.occurrences.length === 0) {
    setPreviewInvalidated(false);
    setPreview({ kind: "empty" });
    announce(COPY.programs.previewEmpty);
    return;
   }
   setPreviewInvalidated(false);
   setPreview({
    kind: "ready",
    plan,
    inputFingerprint: scheduleInputFingerprint(rules, localExceptions),
    scheduleMutationVersion,
   });
      // RP1.4: after a settled requires_review was reconciled, a successful
      // Preview of the current schedule fingerprint is a new Plan. Unlatch
      // Generate onto that new Plan id and keep the old result visible;
      // failed/STALE/unknown or a mismatched fingerprint keep the latch.
      if (
        generationRequiresReview &&
        !generationNeedsReconciliation &&
        previousPreview.kind === "ready" &&
        previousPreview.inputFingerprint ===
          scheduleInputFingerprint(rules, localExceptions)
      ) {
        setGenerationRequiresReview(false);
        setGenerationIdentity((current) => ({
          runId: current?.runId ?? null,
          planId: plan.plan.plan_id,
        }));
        setGenerateError(null);
        onMutationBlockChange?.(false);
      }
   announce(
    COPY.programs.previewed.replace(
     "{count}",
     String(plan.occurrences.length)
    )
   );
  } catch (error) {
   if (!mounted.current) {
    return;
   }
   if (redirectToLoginIfRequired(error)) {
    return;
   }
   const transportAmbiguous =
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    isUnknownMutationOutcome(error);
   const message = transportAmbiguous
    ? COPY.programs.scheduleTransportAmbiguous
    : error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   setGenerateError(message);
   if (previousPreview.kind === "ready") {
    setPreview(previousPreview);
   } else {
    setPreview({ kind: "error", message, stale: false });
   }
   announce(message);
  } finally {
   if (mounted.current) {
    setPreviewBusy(false);
   }
  }
 };

 const reconcileScheduleMutation = async () => {
  if (!onScheduleRefresh) {
   return;
  }
  setExceptionBusy(true);
  try {
   const refreshed = await onScheduleRefresh();
   if (!mounted.current) {
    return;
   }
   if (!refreshed) {
    throw new Error("schedule refresh did not settle");
   }
   setScheduleNeedsReconciliation(false);
   setGenerateError(null);
   setAdjustingTargetKey(null);
   onMutationBlockChange?.(false);
   announce(COPY.programs.workspaceReconciled);
  } catch {
   if (!mounted.current) {
    return;
   }
   setScheduleNeedsReconciliation(true);
   setGenerateError(COPY.programs.scheduleTransportAmbiguous);
   announce(COPY.programs.scheduleTransportAmbiguous);
  } finally {
   if (mounted.current) {
    setExceptionBusy(false);
   }
  }
 };

 const submitPreview = async (formEvent: FormEvent<HTMLFormElement>) => {
  formEvent.preventDefault();
  const form = new FormData(formEvent.currentTarget);
  const fromDate = String(form.get("from_date") ?? "").trim();
  const untilDate = String(form.get("until_date") ?? "").trim();
  await loadPreview(fromDate, untilDate);
 };

 const startExceptionDraft = (target: PreviewAdjustTarget) => {
  const baseline = draftBaseline(target);
  if (baseline === null) {
   return;
  }
  setExceptionDrafts((previous) =>
   previous[target.key] ? previous : { ...previous, [target.key]: baseline }
  );
  setGenerateError(null);
 };

 const openExceptionEditor = (target: PreviewAdjustTarget) => {
  startExceptionDraft(target);
  setAdjustingTargetKey(target.key);
 };

 const clearExceptionDraft = (key: string) => {
  setExceptionDrafts((previous) =>
   Object.fromEntries(Object.entries(previous).filter(([id]) => id !== key))
  );
  clearManagementDraft(programId, previewDraftAction(key));
 };

 const saveExceptionDraft = async (target: PreviewAdjustTarget) => {
  const draft = exceptionDrafts[target.key];
  if (!draft) {
   return;
  }
  setPreviewInvalidated(true);
  setExceptionBusy(true);
  setGenerateError(null);
  try {
   const result = await createScheduleException(programId, target.ruleId, {
    override_date: target.occursOn,
    action: draft.action,
    ...(draft.action === "RESCHEDULE"
     ? {
      ...(draft.newDate && draft.newDate !== target.occursOn
       ? { new_date: draft.newDate }
       : {}),
      new_start_time: draft.newStartTime,
      new_end_time: draft.newEndTime,
     }
     : {}),
   });
   if (result?.exception) {
    setLocalExceptions((previous) => ({
     ...previous,
     [target.ruleId]: [
      ...(previous[target.ruleId] ?? []).filter(
       (exception) =>
        exception.exception_id !== result.exception.exception_id &&
        exception.override_date !== target.occursOn
      ),
      result.exception,
     ],
    }));
   }
   clearExceptionDraft(target.key);
   setAdjustingTargetKey(null);
  } catch (error) {
   if (!mounted.current) {
    return;
   }
   if (redirectToLoginIfRequired(error)) {
    return;
   }
   if (isUnknownMutationWriteOutcome(error)) {
    setScheduleNeedsReconciliation(true);
    setAdjustingTargetKey(null);
    onMutationBlockChange?.(true);
    setGenerateError(COPY.programs.scheduleTransportAmbiguous);
    announce(COPY.programs.scheduleTransportAmbiguous);
    return;
   }
   const message =
    error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   setGenerateError(message);
   announce(message);
  } finally {
   if (mounted.current) {
    setExceptionBusy(false);
   }
  }
 };

 const removeSavedException = async (target: PreviewAdjustTarget) => {
  if (target.exceptionId === null) {
   return;
  }
  setPreviewInvalidated(true);
  setExceptionBusy(true);
  setGenerateError(null);
  try {
   await deleteScheduleException(
    programId,
    target.ruleId,
    target.exceptionId
   );
   setLocalExceptions((previous) => ({
    ...previous,
    [target.ruleId]: (previous[target.ruleId] ?? []).filter(
     (exception) => exception.exception_id !== target.exceptionId
    ),
   }));
   setAdjustingTargetKey(null);
  } catch (error) {
   if (!mounted.current) {
    return;
   }
   if (redirectToLoginIfRequired(error)) {
    return;
   }
   if (isUnknownMutationWriteOutcome(error)) {
    setScheduleNeedsReconciliation(true);
    setAdjustingTargetKey(null);
    onMutationBlockChange?.(true);
    setGenerateError(COPY.programs.scheduleTransportAmbiguous);
    announce(COPY.programs.scheduleTransportAmbiguous);
    return;
   }
   const transportAmbiguous =
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    isUnknownMutationWriteOutcome(error);
   const message = transportAmbiguous
    ? COPY.programs.scheduleTransportAmbiguous
    : error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   setGenerateError(message);
   announce(message);
  } finally {
   if (mounted.current) {
    setExceptionBusy(false);
   }
  }
 };

 const applyGenerationResult = async (
  generated: GenerateResult
 ): Promise<void> => {
  const requiresReview = generated.requires_review === true;
  const result = generationResultCopy(generated);
  setGeneratePartial(generated.failed > 0);
  setGenerationData(generated);
  setGenerationNeedsReconciliation(generated.failed > 0);
  setGenerationRequiresReview(requiresReview);
  if (requiresReview) {
   setPreviewInvalidated(true);
  }
  setGenerateResult(result);
  setGenerationIdentity({
   runId: generated.run_id,
   planId: generated.plan_id,
  });
  announce(result);
  const workspaceReconciled = await onGenerated();
  if (workspaceReconciled) {
   onMutationBlockChange?.(false);
  } else {
   setGenerationNeedsReconciliation(true);
   setGenerateError(COPY.programs.workspaceSavedStale);
  }
 };

 const submitGenerate = async () => {
  if (
   preview.kind !== "ready" ||
   previewIsStale ||
   generationNeedsReconciliation ||
   generationRequiresReview
  ) {
   return;
  }
  const planId = preview.plan.plan.plan_id;
  setGenerateBusy(true);
  setGenerateError(null);
  setGenerateResult(null);
  setGeneratePartial(false);
    // ADR-0047: the attempt is unresolved from dispatch, not from failure.
    // Persist the Plan reference synchronously before the request leaves so an
    // in-flight unmount or reload restores unknown-outcome recovery.
    setGenerationIdentity({ runId: null, planId });
  setGenerationData(null);
    setGenerationNeedsReconciliation(true);
    setGenerationRequiresReview(false);
    onMutationBlockChange?.(true);
    writeGenerationRecovery({
      version: 1,
      programId,
      planId,
      runId: null,
      needsReconciliation: true,
      requiresReview: false,
      data: null,
    });
  try {
   const { generated } = await generateEvents(programId, planId);
   if (!mounted.current) {
    return;
   }
   await applyGenerationResult(generated);
  } catch (error) {
   if (!mounted.current) {
    return;
   }
   if (redirectToLoginIfRequired(error)) {
    return;
   }
   const transportAmbiguous =
    (typeof navigator !== "undefined" && !navigator.onLine) ||
        isUnknownMutationWriteOutcome(error);
   const message = transportAmbiguous
    ? COPY.programs.scheduleTransportAmbiguous
    : error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   if (error instanceof RpcError && error.problem.code === "STALE_PLAN") {
    // The schedule changed under the plan; require a fresh preview
    // before generation can run again while retaining the old rows for
        // comparison. STALE_PLAN is a settled rejection, not an unknown write:
        // drop the dispatch record so Generate can go again after Review Again.
    setPreviewInvalidated(true);
    setPreview((current) =>
     current.kind === "ready"
      ? current
      : { kind: "error", message, stale: true }
    );
    setGenerationNeedsReconciliation(false);
    setGenerationRequiresReview(false);
        setGenerationIdentity(null);
        setGenerationData(null);
        clearGenerationRecovery(programId);
        onMutationBlockChange?.(false);
   } else {
    setGenerationNeedsReconciliation(transportAmbiguous);
    if (transportAmbiguous) {
     // The write outcome is unknown; keep the Plan it was attempted
     // against so Preview cannot swap in an unrelated reference.
     setGenerationIdentity({ runId: null, planId });
     onMutationBlockChange?.(true);
    } else {
     // Settled failure: the write did not commit, so release the parent
     // navigation block the dispatch write took.
     onMutationBlockChange?.(false);
    }
    setGenerateError(message);
   }
   announce(message);
  } finally {
   if (mounted.current) {
    setGenerateBusy(false);
   }
  }
 };

 // oxlint-disable-next-line eslint/complexity -- recovery keeps readback, plan, and unknown-outcome states explicit.
 const reconcileGeneration = async () => {
  const planId =
   generationIdentity?.planId ??
   (preview.kind === "ready" ? preview.plan.plan.plan_id : null);
  const canRefreshAfterReview =
   generationRequiresReview &&
   generationData !== null &&
   onWorkspaceRefresh !== undefined;
  if (!planId || (previewIsStale && !canRefreshAfterReview)) {
   return;
  }
  setGenerationIdentity((current) =>
   current?.planId === planId
    ? current
    : { runId: current?.runId ?? null, planId }
  );
  setGenerateBusy(true);
  setGenerateError(null);
  let workspaceReconciled = true;
  if (onWorkspaceRefresh) {
   try {
    workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
   } catch {
    workspaceReconciled = false;
   }
  }
  try {
   if (!workspaceReconciled) {
    setGenerationNeedsReconciliation(true);
    setGenerateError(COPY.programs.scheduleTransportAmbiguous);
    return;
   }
   if (generationRequiresReview) {
    setGenerationNeedsReconciliation(false);
    setGenerateError(null);
    onMutationBlockChange?.(false);
    announce(COPY.programs.workspaceReconciled);
    return;
   }
   if (generationData !== null && generationData.failed === 0) {
    setGenerationNeedsReconciliation(false);
    setGenerateError(null);
    onMutationBlockChange?.(false);
    announce(COPY.programs.workspaceReconciled);
    return;
   }
   const { generated } = await generateEvents(programId, planId);
   if (!mounted.current) {
    return;
   }
   await applyGenerationResult(generated);
  } catch (error) {
   if (!mounted.current) {
    return;
   }
   if (redirectToLoginIfRequired(error)) {
    return;
   }
      const message = isUnknownMutationWriteOutcome(error)
    ? COPY.programs.scheduleTransportAmbiguous
    : error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   if (error instanceof RpcError && error.problem.code === "STALE_PLAN") {
    setPreviewInvalidated(true);
    setPreview((current) =>
     current.kind === "ready"
      ? current
      : { kind: "error", message, stale: true }
    );
    setGenerationNeedsReconciliation(false);
    if (workspaceReconciled) {
     onMutationBlockChange?.(false);
    }
   } else {
    setGenerationNeedsReconciliation(true);
        if (isUnknownMutationWriteOutcome(error)) {
     onMutationBlockChange?.(true);
    }
    setGenerateError(message);
   }
   announce(message);
  } finally {
   if (mounted.current) {
    setGenerateBusy(false);
   }
  }
 };

 const rulesReady = rules !== null;
 const noRules = rulesReady && rules.length === 0;
 const adjustingTarget =
  adjustingTargetKey === null ? null : adjustTargetForKey(adjustingTargetKey);
 const adjustingDraft =
  adjustingTargetKey === null
   ? null
   : (exceptionDrafts[adjustingTargetKey] ?? null);
 const adjustingRule =
  adjustingTarget === null
   ? null
   : ((rules ?? []).find(
    (candidate) => candidate.rule_id === adjustingTarget.ruleId
   ) ?? null);
 const createdEventIds = generationData?.created_event_ids ?? [];
 const skippedOccurrences = generationData?.skipped_occurrences ?? [];
 const unresolvedOccurrences = generationData?.unresolved_occurrences ?? [];
 const unresolvedCount =
  generationData?.failed ?? unresolvedOccurrences.length;
 return (
  <Sheet
   open={adjustingTarget !== null && adjustingDraft !== null}
   onOpenChange={(open) => {
    if (open || adjustingTargetKey === null) {
     return;
    }
    const draft = exceptionDrafts[adjustingTargetKey];
    if (draft !== undefined && !draftIsDirty(adjustingTargetKey, draft)) {
     // An unchanged open/close is a no-op: no draft, no server write.
     clearExceptionDraft(adjustingTargetKey);
    }
    setAdjustingTargetKey(null);
   }}
  >
   <>
    <ScreenSection
     title={COPY.programs.secondaryGeneratorLabel}
     headingId="programs-workspace-recurring-title"
    >
     <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
      {COPY.programs.previewLead}
     </p>
     {rulesError !== null && (
      <Alert variant="destructive">{rulesError}</Alert>
     )}
     {noRules ? (
      <ScreenState
       kind="empty"
       title={`${COPY.programs.schedulePreviewTitle}：${COPY.programs.settingsScheduleNone}`}
      />
     ) : (
      <ScreenCard asChild>
       <ScreenEditor onSubmit={submitPreview}>
        <fieldset className="grid min-w-0 gap-2">
         <legend className="text-sm font-semibold text-[var(--screen-ink)]">
          {COPY.programs.previewHorizon}
         </legend>
         <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <ScreenField
           htmlFor="programs-preview-from-date"
           label={COPY.programs.previewFromDate}
          >
           <Input
            id="programs-preview-from-date"
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="date"
            name="from_date"
            value={previewFromDate}
            onChange={(event) =>
             setPreviewFromDate(event.target.value)
            }
            required
           />
          </ScreenField>
          <ScreenField
           htmlFor="programs-preview-until-date"
           label={COPY.programs.previewUntilDate}
          >
           <Input
            id="programs-preview-until-date"
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="date"
            name="until_date"
            min={previewFromDate}
            value={previewUntilDate}
            onChange={(event) =>
             setPreviewUntilDate(event.target.value)
            }
            required
           />
          </ScreenField>
         </div>
         <p className="m-0 text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
          {COPY.programs.hkTimeMarker}
         </p>
        </fieldset>
        <Button
         type="submit"
         className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
         // Previewing before the authoritative rules settle would bind a
         // plan to a fingerprint the client cannot confirm, which leaves
         // the fresh plan permanently stale on arrival.
         disabled={
          previewBusy ||
          generateBusy ||
          exceptionBusy ||
          rules === null
         }
        >
         {previewBusy
          ? COPY.programs.previewing
          : previewNeedsReview
           ? COPY.programs.previewReviewAgain
           : COPY.programs.previewEvents}
        </Button>
       </ScreenEditor>
      </ScreenCard>
     )}
     {preview.kind !== "ready" &&
      (generationNeedsReconciliation || generationRequiresReview) && (
       <ScreenSection title={COPY.programs.generatedUnresolvedTitle}>
        {generateError !== null && (
         <Alert variant="destructive">{generateError}</Alert>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
         <Button
          type="button"
          className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
          onClick={() => void reconcileGeneration()}
          disabled={generateBusy}
          data-generation-plan-id={generationIdentity?.planId}
          data-generation-run-id={
           generationIdentity?.runId ?? undefined
          }
         >
          {generationData === null
           ? COPY.programs.generatedReconcileUnknown
           : COPY.programs.generatedReconcile}
         </Button>
        </div>
       </ScreenSection>
      )}
     {preview.kind === "loading" && (
      <ScreenLoadingRows count={1} label={COPY.programs.previewing} />
     )}
     {preview.kind === "error" &&
      (preview.stale ? (
       <Alert
        data-preview-stale="true"
        tone="warning"
        announcement="assertive"
       >
        {preview.message}
       </Alert>
      ) : (
       <ScreenState kind="error" title={preview.message} />
      ))}
     {preview.kind === "empty" && (
      <ScreenState kind="empty" title={COPY.programs.previewEmpty} />
     )}
     {preview.kind === "ready" && (
      <ScreenSection title={COPY.programs.schedulePreviewTitle}>
       {previewIsStale && (
        <Alert
         data-preview-stale="true"
         tone="warning"
         announcement="assertive"
        >
         {COPY.programs.previewChanged}
        </Alert>
       )}
       <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.previewPlanLabel}
        {" · "}
        {COPY.programs.previewPlanMeta
         .replace("{rules}", String(preview.plan.plan.rule_count))
         .replace("{from}", preview.plan.plan.from_date)
         .replace(
          "{to}",
          preview.plan.plan.to_date ??
          addWallDays(
           preview.plan.plan.from_date,
           preview.plan.plan.horizon_days - 1
          )
         )
         .replace("{days}", String(preview.plan.plan.horizon_days))}
       </p>
       {rules?.some(
        (rule) =>
         rule.recurrence === "MONTHLY" && (rule.month_day ?? 0) >= 29
       ) && (
         <p className="m-0 text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
          {COPY.programs.previewMonthlyOmission.replace(
           "{day}",
           String(
            rules.find(
             (rule) =>
              rule.recurrence === "MONTHLY" &&
              (rule.month_day ?? 0) >= 29
            )?.month_day ?? ""
           )
          )}
         </p>
        )}
       <ScreenRowList>
        <ul
         className="m-0 grid min-w-0 list-none gap-0 p-0"
         aria-label={COPY.programs.previewEvents}
        >
         {preview.plan.occurrences.map((occurrence) => {
          const rule = (rules ?? []).find(
           (candidate) => candidate.rule_id === occurrence.rule_id
          );
          const skipped = occurrence.skip_reason !== null;
          const targetKey = previewDraftKey(
           occurrence.rule_id,
           occurrence.occurs_on
          );
          const draft = exceptionDrafts[targetKey];
          const draftDirty =
           draft !== undefined && draftIsDirty(targetKey, draft);
          return (
           <li key={occurrence.occurrence_id} className="min-w-0">
            <ScreenRow className="items-start">
             <ScreenRowMain>
              <ScreenRowTitle>
               {hkWallDateTimeLabel(occurrence.starts_at)}
              </ScreenRowTitle>
              <ScreenRowMeta>
               {occurrence.location?.trim()
                ? occurrence.location
                : COPY.programs.eventLocationPlaceholder}
              </ScreenRowMeta>
              <ScreenRowMeta>
               {rule
                ? formatScheduleRuleLabel(rule)
                : occurrence.rule_id}
              </ScreenRowMeta>
              {occurrence.replacement_date !== null &&
               occurrence.replacement_date !== undefined && (
                <ScreenRowMeta>
                 {COPY.programs.previewOccurrenceOriginal.replace(
                  "{date}",
                  occurrence.occurs_on
                 )}{" "}
                 ·{" "}
                 {COPY.programs.previewOccurrenceReplacement.replace(
                  "{date}",
                  occurrence.replacement_date
                 )}
                </ScreenRowMeta>
               )}
             </ScreenRowMain>
             <ScreenRowTrailing>
              {occurrence.skip_reason === "CANCEL" && (
               <ScreenStatus tone="danger">
                {COPY.programs.previewOccurrenceSkipped}
               </ScreenStatus>
              )}
              {occurrence.skip_reason === "DUPLICATE" && (
               <ScreenStatus tone="danger">
                {COPY.programs.previewOccurrenceDuplicate}
               </ScreenStatus>
              )}
              {!skipped && occurrence.exception_id !== null && (
               <ScreenStatus tone="pending">
                {COPY.programs.previewOccurrenceRescheduled}
               </ScreenStatus>
              )}
             </ScreenRowTrailing>
            </ScreenRow>
            {occurrence.skip_reason !== "DUPLICATE" && (
             <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)] border-t border-[var(--screen-line)] p-3">
              {draftDirty && (
               <ScreenStatus tone="pending">
                {COPY.programs.previewExceptionDraft}
               </ScreenStatus>
              )}
              <Button
               type="button"
               variant="outline"
               className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                              onClick={() =>
                                openExceptionEditor(
                                  adjustTargetForOccurrence(occurrence)
                                )
                              }
               disabled={
                exceptionBusy || scheduleNeedsReconciliation
               }
              >
               {COPY.programs.previewAdjustOccurrence}
              </Button>
             </div>
            )}
           </li>
          );
         })}
        </ul>
       </ScreenRowList>
       <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
        <Button
         type="button"
         className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
         onClick={() => void submitGenerate()}
         disabled={
          generateBusy ||
          previewBusy ||
          previewIsStale ||
          hasExceptionDrafts ||
          exceptionBusy ||
          scheduleNeedsReconciliation ||
          generationNeedsReconciliation ||
          generationRequiresReview
         }
        >
         {generateBusy
          ? COPY.programs.generating
          : COPY.programs.generateEvents}
        </Button>
        {generateResult !== null &&
         (generatePartial ? (
          <Alert
           data-generation-plan-id={generationIdentity?.planId}
           data-generation-result="true"
           data-generation-run-id={generationIdentity?.runId}
           variant="destructive"
          >
           {generateResult}
          </Alert>
         ) : (
          <Alert
           data-generation-plan-id={generationIdentity?.planId}
           data-generation-result="true"
           data-generation-run-id={generationIdentity?.runId}
           announcement="polite"
           tone="success"
          >
           {generateResult}
          </Alert>
         ))}
       </div>
       {generationData !== null && (
        <ScreenCard
         className="grid min-w-0 gap-3"
         data-generation-summary="true"
        >
         <dl className="grid min-w-0 grid-cols-3 gap-2 text-center">
          <div className="grid min-w-0 gap-1 rounded-[var(--screen-radius-control)] border border-[var(--screen-line)] p-2">
           <dt className="wrap-anywhere text-xs text-[var(--screen-muted)]">
            {COPY.programs.generatedCreatedLabel}
           </dt>
           <dd className="m-0 text-lg font-bold text-[var(--screen-ink)]">
            {generationData.created}
           </dd>
          </div>
          <div className="grid min-w-0 gap-1 rounded-[var(--screen-radius-control)] border border-[var(--screen-line)] p-2">
           <dt className="wrap-anywhere text-xs text-[var(--screen-muted)]">
            {COPY.programs.generatedSkippedLabel}
           </dt>
           <dd className="m-0 text-lg font-bold text-[var(--screen-ink)]">
            {generationData.skipped}
           </dd>
          </div>
          <div className="grid min-w-0 gap-1 rounded-[var(--screen-radius-control)] border border-[var(--screen-line)] p-2">
           <dt className="wrap-anywhere text-xs text-[var(--screen-muted)]">
            {COPY.programs.generatedUnresolvedLabel}
           </dt>
           <dd className="m-0 text-lg font-bold text-[var(--screen-ink)]">
            {unresolvedCount}
           </dd>
          </div>
         </dl>
         {onWorkspaceRefresh &&
          generationRequiresReview &&
          generationNeedsReconciliation &&
          generationData !== null && (
           <Button
            type="button"
            variant="outline"
            className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
            onClick={() => void reconcileGeneration()}
            disabled={generateBusy}
           >
            {COPY.programs.workspaceRetryRefresh}
           </Button>
          )}
         {generationNeedsReconciliation &&
          !generationRequiresReview &&
          unresolvedCount === 0 && (
           <Button
            type="button"
            variant="outline"
            className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
            onClick={() => void reconcileGeneration()}
            disabled={generateBusy}
           >
            {COPY.programs.workspaceRetryRefresh}
           </Button>
          )}
         {unresolvedCount > 0 ? (
          <details open>
           <summary className="cursor-pointer font-bold text-[var(--screen-danger)]">
            {COPY.programs.generatedUnresolvedTitle}
           </summary>
           {unresolvedOccurrences.length > 0 ? (
            <ul className="m-0 mt-2 grid min-w-0 list-none gap-2 p-0">
             {unresolvedOccurrences.map((occurrence) => (
              <li
               key={occurrence.occurrence_id}
               className="wrap-anywhere text-sm text-[var(--screen-danger)]"
              >
               {hkWallDateTimeLabel(occurrence.starts_at)}
               {occurrence.detail
                ? ` · ${COPY.programs.generatedUnresolvedItem}`
                : ""}
              </li>
             ))}
            </ul>
           ) : (
            <p className="m-0 mt-2 text-sm text-[var(--screen-danger)]">
             {COPY.programs.generatedUnresolvedFallback}
            </p>
           )}
           {!generationRequiresReview && (
            <Button
             type="button"
             className="mt-3 w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
             onClick={() => void reconcileGeneration()}
             disabled={generateBusy}
            >
             {COPY.programs.generatedReconcile}
            </Button>
           )}
          </details>
         ) : (
          <details>
           <summary className="cursor-pointer font-bold text-[var(--screen-ink)]">
            {COPY.programs.generatedCompletedDetails}
           </summary>
           {skippedOccurrences.length > 0 && (
            <ul className="m-0 mt-2 grid min-w-0 list-none gap-2 p-0">
             {skippedOccurrences.map((occurrence) => (
              <li
               key={occurrence.occurrence_id}
               className="wrap-anywhere text-sm text-[var(--screen-muted)]"
              >
               {hkWallDateTimeLabel(occurrence.starts_at)} ·{" "}
               {occurrence.reason === "DUPLICATE"
                ? COPY.programs.previewOccurrenceDuplicate
                : COPY.programs.previewOccurrenceSkipped}
              </li>
             ))}
            </ul>
           )}
          </details>
         )}
         {createdEventIds.length > 0 && onOpenEvent && (
          <Button
           type="button"
           className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
           onClick={() => onOpenEvent(createdEventIds[0])}
          >
           {COPY.programs.generatedCreatedEvent}
          </Button>
         )}
        </ScreenCard>
       )}
       {generateError !== null && (
        <div className="grid min-w-0 gap-3">
         <Alert variant="destructive">{generateError}</Alert>
         {generationNeedsReconciliation && generationData === null && (
          <Button
           type="button"
           className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
           onClick={() => void reconcileGeneration()}
           disabled={generateBusy}
           data-generation-plan-id={generationIdentity?.planId}
           data-generation-run-id={
            generationIdentity?.runId ?? undefined
           }
          >
           {COPY.programs.generatedReconcileUnknown}
          </Button>
         )}
         {scheduleNeedsReconciliation && (
          <Button
           type="button"
           variant="outline"
           className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
           onClick={() => void reconcileScheduleMutation()}
           disabled={exceptionBusy}
          >
           {COPY.programs.workspaceRetryRefresh}
          </Button>
         )}
        </div>
       )}
      </ScreenSection>
     )}
     {orphanDraftKeys.length > 0 && (
      <ScreenSection title={COPY.programs.previewOrphanDraftsTitle}>
       <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.previewOrphanDraftsLead}
       </p>
       <ScreenRowList>
        <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
         {orphanDraftKeys.map((key) => {
          const target = adjustTargetForKey(key);
          const parsed = splitPreviewDraftKey(key);
          const rule =
           (rules ?? []).find(
            (candidate) => candidate.rule_id === parsed.ruleId
           ) ?? null;
          return (
           <li key={key} className="min-w-0">
            <ScreenRow className="items-start">
             <ScreenRowMain>
              <ScreenRowTitle>
               {target
                ? hkWallDateTimeLabel(target.startsAt)
                : parsed.occursOn}
              </ScreenRowTitle>
              <ScreenRowMeta>
                              {rule
                                ? formatScheduleRuleLabel(rule)
                                : parsed.ruleId}
              </ScreenRowMeta>
             </ScreenRowMain>
             <ScreenRowTrailing>
              <Button
               type="button"
               variant="outline"
               className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
               onClick={() => {
                if (target) {
                 openExceptionEditor(target);
                }
               }}
               disabled={
                                target === null ||
                                exceptionBusy ||
                                scheduleNeedsReconciliation
               }
              >
               {COPY.programs.draftRecover}
              </Button>
              <Button
               type="button"
               variant="outline"
               className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
               onClick={() => clearExceptionDraft(key)}
               disabled={exceptionBusy}
              >
               {COPY.programs.draftDiscard}
              </Button>
             </ScreenRowTrailing>
            </ScreenRow>
           </li>
          );
         })}
        </ul>
       </ScreenRowList>
      </ScreenSection>
     )}
    </ScreenSection>
    <SheetContent side="bottom">
     {adjustingTarget && adjustingDraft && (
      <>
       <SheetHeader className="border-b border-[var(--screen-line)]">
        <SheetTitle className="text-xl font-bold text-[var(--screen-ink)]">
         {COPY.programs.previewAdjustSheetTitle}
        </SheetTitle>
        <SheetDescription>
         {hkWallDateTimeLabel(adjustingTarget.startsAt)} ·{" "}
         {adjustingTarget.location ??
          COPY.programs.eventLocationPlaceholder}
         <br />
         {COPY.programs.previewAdjustSheetLead}
        </SheetDescription>
       </SheetHeader>
       <div className="grid min-w-0 gap-4 px-4">
        <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
         <Button
          type="button"
          variant={
           adjustingDraft.action === "CANCEL" ? "default" : "outline"
          }
          onClick={() =>
           setExceptionDrafts((previous) => ({
            ...previous,
            [adjustingTarget.key]: {
             ...adjustingDraft,
             action: "CANCEL",
            },
           }))
          }
          disabled={exceptionBusy || scheduleNeedsReconciliation}
         >
          {COPY.programs.previewSkipOccurrence}
         </Button>
         <Button
          type="button"
          variant={
           adjustingDraft.action === "RESCHEDULE"
            ? "default"
            : "outline"
          }
          onClick={() =>
           setExceptionDrafts((previous) => ({
            ...previous,
            [adjustingTarget.key]: {
             ...adjustingDraft,
             action: "RESCHEDULE",
            },
           }))
          }
          disabled={exceptionBusy || scheduleNeedsReconciliation}
         >
          {COPY.programs.previewRescheduleOccurrence}
         </Button>
        </div>
        {adjustingDraft.action === "RESCHEDULE" && (
         <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          <ScreenField
           htmlFor={`preview-adjust-${adjustingTarget.key}-date`}
           label={COPY.programs.settingsExceptionNewDate}
          >
           <Input
            id={`preview-adjust-${adjustingTarget.key}-date`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="date"
            value={adjustingDraft.newDate}
            onChange={(event) =>
             setExceptionDrafts((previous) => ({
              ...previous,
              [adjustingTarget.key]: {
               ...adjustingDraft,
               newDate: event.target.value,
              },
             }))
            }
            disabled={exceptionBusy}
           />
          </ScreenField>
          <ScreenField
           htmlFor={`preview-adjust-${adjustingTarget.key}-start`}
           label={COPY.programs.settingsExceptionNewStart}
          >
           <Input
            id={`preview-adjust-${adjustingTarget.key}-start`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="time"
            value={adjustingDraft.newStartTime}
            onChange={(event) =>
             setExceptionDrafts((previous) => ({
              ...previous,
              [adjustingTarget.key]: {
               ...adjustingDraft,
               newStartTime: event.target.value,
              },
             }))
            }
            disabled={exceptionBusy}
           />
          </ScreenField>
          <ScreenField
           htmlFor={`preview-adjust-${adjustingTarget.key}-end`}
           label={COPY.programs.settingsExceptionNewEnd}
          >
           <Input
            id={`preview-adjust-${adjustingTarget.key}-end`}
            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
            type="time"
            value={adjustingDraft.newEndTime}
            onChange={(event) =>
             setExceptionDrafts((previous) => ({
              ...previous,
              [adjustingTarget.key]: {
               ...adjustingDraft,
               newEndTime: event.target.value,
              },
             }))
            }
            disabled={exceptionBusy}
           />
          </ScreenField>
         </div>
        )}
        {adjustingRule?.effective_end_date &&
         adjustingDraft.action === "RESCHEDULE" &&
         adjustingDraft.newDate > adjustingRule.effective_end_date && (
          <Alert tone="warning" announcement="polite">
           {COPY.programs.settingsExceptionBeyondRuleEnd}
          </Alert>
         )}
        {adjustingTarget.exceptionId !== null && (
         <Button
          type="button"
          variant="outline"
          className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                    onClick={() => void removeSavedException(adjustingTarget)}
          disabled={exceptionBusy || scheduleNeedsReconciliation}
         >
          {COPY.programs.previewRemoveException}
         </Button>
        )}
       </div>
       <SheetFooter>
        <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
         <Button
          type="button"
          className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
          onClick={() => void saveExceptionDraft(adjustingTarget)}
          disabled={exceptionBusy || scheduleNeedsReconciliation}
         >
          {exceptionBusy
           ? COPY.programs.submitting
           : COPY.programs.previewSaveException}
         </Button>
         <SheetClose asChild>
          <Button
           type="button"
           variant="outline"
           className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      onClick={() => clearExceptionDraft(adjustingTarget.key)}
          >
           {COPY.programs.previewCancelDraft}
          </Button>
         </SheetClose>
        </div>
       </SheetFooter>
      </>
     )}
    </SheetContent>
   </>
  </Sheet>
 );
};

// oxlint-disable-next-line eslint/complexity -- this task keeps create, list, action, stale, and recovery states together
export const EventsTask = () => {
 const {
  program,
  attention,
  departmentId,
  hash,
  directoryQuery,
  onAttentionRefresh,
  onWorkspaceRefresh,
  onMutationBlockChange,
  onTaskChange,
  onOpenEvent,
  onOpenAttendance,
  onWorkspaceDirtyChange,
  eventFilter: routeEventFilter,
  onEventFilterChange,
 } = useWorkspaceTaskContext();
 const programId = program.program_id;
 const canManage = program.capabilities.manage;
 const recurring = program.behavior_type === "Recurring";
 const initialDraft = readEventCreateDraft(programId);
 const mounted = useRef(true);
 const previousEvents = useRef<ProgramEvent[] | null>(null);
 interface EventLoadOutcome {
  status: "pending" | "success" | "error" | "stale";
 }
 const eventLoadOutcomes = useRef(new WeakMap<object, EventLoadOutcome>());
 const latestEventLoadOutcome = useRef<EventLoadOutcome | null>(null);
 const { state, run, retry } = useAsyncResource<ProgramEvent[], EventsState>(
  async (request) => {
   const outcome: EventLoadOutcome = { status: "pending" };
   const previousOutcome = latestEventLoadOutcome.current;
   if (previousOutcome) {
    previousOutcome.status = "stale";
   }
   latestEventLoadOutcome.current = outcome;
   eventLoadOutcomes.current.set(request ?? outcome, outcome);
   try {
    const { events } = await listEvents(programId);
    outcome.status =
     latestEventLoadOutcome.current === outcome ? "success" : "stale";
    return events;
   } catch (error) {
    outcome.status =
     latestEventLoadOutcome.current === outcome ? "error" : "stale";
    throw error;
   }
  },
  {
   toLoading: () => ({ kind: "loading" }),
   toReady: (events) => {
    previousEvents.current = events;
    return { kind: "ready", events };
   },
   onError: (error) => {
    if (redirectToLoginIfRequired(error)) {
     return null;
    }
    const code = error instanceof RpcError ? error.problem.code : undefined;
    return {
     kind: "error",
     message:
      error instanceof RpcError
       ? errorCopyFor(code, error.problem.detail)
       : COPY.error.networkError,
    };
   },
  },
  [programId]
 );
 const [createOpen, setCreateOpen] = useState(() => initialDraft !== null);
 const [createRecoveryOpen, setCreateRecoveryOpen] = useState(
  () => initialDraft !== null
 );
 const [createBusy, setCreateBusy] = useState(false);
 const [createError, setCreateError] = useState<string | null>(null);
 const [createDate, setCreateDate] = useState(initialDraft?.date ?? "");
 const [createStartTime, setCreateStartTime] = useState(
  initialDraft?.startTime ?? ""
 );
 const [createEndTime, setCreateEndTime] = useState(
  initialDraft?.endTime ?? ""
 );
 const [createEndAuto, setCreateEndAuto] = useState(
  initialDraft?.endAuto ?? true
 );
 const [createName, setCreateName] = useState(initialDraft?.name ?? "");
 const [createLocation, setCreateLocation] = useState(
  initialDraft?.location ?? ""
 );
 const [createEventType, setCreateEventType] = useState<EventType>(
  initialDraft?.eventType ?? COPY.programs.eventTypeOptions[0]
 );
 const [createWindowOverride, setCreateWindowOverride] = useState(
  initialDraft?.windowOverride ?? false
 );
 const [createWindowOpens, setCreateWindowOpens] = useState(
  initialDraft?.windowOpens ?? ""
 );
 const [createWindowCloses, setCreateWindowCloses] = useState(
  initialDraft?.windowCloses ?? ""
 );
 const [actionBusy, setActionBusy] = useState(false);
 const [actionError, setActionError] = useState<string | null>(null);
 const [notice, setNotice] = useState<string | null>(null);
 const restoredPendingMutation = useMemo<PendingEventMutation | null>(() => {
  const recovery = readWorkspaceMutationRecovery();
  return recovery?.surface === "events" && recovery.programId === programId
   ? recovery.mutation
   : null;
 }, [programId]);
 const [eventsStale, setEventsStale] = useState(
  restoredPendingMutation !== null
 );
 const [eventsOutcomeUnknown, setEventsOutcomeUnknown] = useState(
  restoredPendingMutation !== null
 );
 const [localEventFilter, setLocalEventFilter] =
  useState<EventListFilter>("current");
 const eventFilter = routeEventFilter ?? localEventFilter;
 const setEventFilter = (value: EventListFilter) => {
  if (onEventFilterChange) {
   onEventFilterChange(value);
  } else {
   setLocalEventFilter(value);
  }
 };
 const [confirmingEventId, setConfirmingEventId] = useState<string | null>(
  null
 );
 const confirmEventRef = useRef<HTMLDivElement>(null);
 const pendingEventMutationRef = useRef<PendingEventMutation | null>(
  restoredPendingMutation
 );

 useEffect(() => {
  mounted.current = true;
  return () => {
   mounted.current = false;
  };
 }, []);

 useEffect(() => {
  void run();
 }, [run]);

 useEffect(() => {
  if (state.kind === "ready") {
   setEventsStale(eventsOutcomeUnknown);
   if (!eventsOutcomeUnknown && pendingEventMutationRef.current === null) {
    onMutationBlockChange?.(false);
   }
  } else if (state.kind === "error" && previousEvents.current !== null) {
   setEventsStale(true);
   if (eventsOutcomeUnknown) {
    onMutationBlockChange?.(true);
   }
  }
 }, [eventsOutcomeUnknown, onMutationBlockChange, state.kind]);

 const reconcileEvents = async () => {
  if (actionBusy) {
   return;
  }
  const pendingMutation = pendingEventMutationRef.current;
  setActionBusy(true);
  let workspaceReconciled = true;
  try {
   if (onWorkspaceRefresh) {
    try {
     workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
    } catch {
     workspaceReconciled = false;
    }
   }
   const request = { cancelled: false };
   const reconciledEvents = await run(request);
   const outcome = eventLoadOutcomes.current.get(request);
   if (!mounted.current) {
    return;
   }
   const settled =
    pendingMutation === null ||
    (reconciledEvents !== undefined &&
     eventSettlesMutation(reconciledEvents, pendingMutation));
   if (workspaceReconciled && outcome?.status === "success" && settled) {
    if (pendingMutation?.kind === "create") {
     clearEventCreateDraft(programId);
     setCreateOpen(false);
     const createdEvent = reconciledEvents?.find((event) =>
      eventSettlesMutation([event], pendingMutation)
     );
     if (createdEvent && onOpenEvent) {
      onOpenEvent(createdEvent.event_id);
     }
    }
    pendingEventMutationRef.current = null;
    clearWorkspaceMutationRecovery("events", { programId });
    setEventsOutcomeUnknown(false);
    setEventsStale(false);
    onMutationBlockChange?.(false);
    setActionError(COPY.programs.workspaceReconciled);
    announce(COPY.programs.workspaceReconciled);
   } else {
    setEventsOutcomeUnknown(pendingMutation !== null);
    setEventsStale(true);
    const message =
     pendingMutation === null
      ? COPY.programs.workspaceEventsSavedStale
      : COPY.programs.programTransportAmbiguous;
    setActionError(message);
    announce(message);
   }
  } finally {
   if (mounted.current) {
    setActionBusy(false);
   }
  }
 };

 useEffect(() => {
  if (confirmingEventId !== null) {
   confirmEventRef.current?.querySelector("button")?.focus();
  }
 }, [confirmingEventId]);

 useEffect(() => {
  if (!createOpen) {
   clearEventCreateDraft(programId);
   onWorkspaceDirtyChange?.(false);
   return;
  }
  writeEventCreateDraft(programId, {
   version: 1,
   date: createDate,
   startTime: createStartTime,
   endTime: createEndTime,
   endAuto: createEndAuto,
   name: createName,
   location: createLocation,
   eventType: createEventType,
   windowOverride: createWindowOverride,
   windowOpens: createWindowOpens,
   windowCloses: createWindowCloses,
  });
  onWorkspaceDirtyChange?.(true);
 }, [
  createDate,
  createEndAuto,
  createEndTime,
  createEventType,
  createLocation,
  createName,
  createOpen,
  createStartTime,
  createWindowCloses,
  createWindowOpens,
  createWindowOverride,
  onWorkspaceDirtyChange,
  programId,
 ]);

 useEffect(
  () => () => onWorkspaceDirtyChange?.(false),
  [onWorkspaceDirtyChange]
 );

 const eventAttention = attention?.programs.find(
  ({ program_id }) => program_id === programId
 );
 const resetCreateForm = () => {
  setCreateDate(hkTodayWallDate());
  setCreateStartTime("");
  setCreateEndTime("");
  setCreateEndAuto(true);
  setCreateName("");
  setCreateLocation("");
  setCreateEventType(COPY.programs.eventTypeOptions[0]);
  setCreateWindowOverride(false);
  setCreateWindowOpens("");
  setCreateWindowCloses("");
 };
 const toggleCreateForm = (open: boolean) => {
  consumeEventCreateIntent();
  if (open) {
   if (!readEventCreateDraft(programId)) {
    resetCreateForm();
   }
  } else {
   clearEventCreateDraft(programId);
  }
  setCreateOpen(open);
  setCreateError(null);
 };
 const discardRecoveredCreateDraft = () => {
  consumeEventCreateIntent();
  clearEventCreateDraft(programId);
  resetCreateForm();
  setCreateOpen(false);
  setCreateRecoveryOpen(false);
 };
 useEffect(() => {
  if (
   hash !== "#create-event" ||
   window.location.hash !== "#create-event" ||
   !canManage ||
   createOpen
  ) {
   return;
  }
  consumeEventCreateIntent();
  if (!readEventCreateDraft(programId)) {
   resetCreateForm();
  }
  setCreateOpen(true);
 }, [canManage, createOpen, hash, programId]);
 const changeCreateStartTime = (value: string) => {
  setCreateStartTime(value);
  if (!createEndAuto) {
   return;
  }
  const startsAt = hkWallInputToIso(`${createDate}T${value}`);
  if (!startsAt) {
   setCreateEndTime("");
   return;
  }
  setCreateEndTime(
   hkWallTimeOf(
    new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString()
   )
  );
 };
 const changeCreateDate = (value: string) => {
  setCreateDate(value);
  if (!createEndAuto || !createStartTime) {
   return;
  }
  const startsAt = hkWallInputToIso(`${value}T${createStartTime}`);
  if (!startsAt) {
   return;
  }
  setCreateEndTime(
   hkWallTimeOf(
    new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString()
   )
  );
 };
 const eventsForActions =
  state.kind === "ready" ? state.events : (previousEvents.current ?? []);
 const dataReady = state.kind === "ready";
 const scrollScope = `${programId}:events`;
 const pendingScrollRef = useRef<number | null>(null);
 const scrollRestoredRef = useRef(false);
 useEffect(() => {
  pendingScrollRef.current = consumeWorkspaceScroll(scrollScope);
 }, [scrollScope]);
 useEffect(() => {
  // R45.1: wait for the rows to exist before restoring, otherwise the shell
  // scroller clamps the position to the still-empty list.
  if (
   scrollRestoredRef.current ||
   pendingScrollRef.current === null ||
   state.kind !== "ready"
  ) {
   return;
  }
  scrollRestoredRef.current = true;
  restoreProgramsScrollY(pendingScrollRef.current);
  clearWorkspaceScroll(scrollScope);
 }, [scrollScope, state]);
 const openEvent = (eventId: string, eventAction?: ManagementEventAction) => {
  if (eventsOutcomeUnknown || eventsStale) {
   return;
  }
  rememberWorkspaceScroll(scrollScope);
  onOpenEvent?.(eventId, eventAction);
 };
 const defaultWindow = (() => {
  const startsAt = hkWallInputToIso(`${createDate}T${createStartTime}`);
  const endsAt = hkWallInputToIso(`${createDate}T${createEndTime}`);
  if (!startsAt || !endsAt) {
   return null;
  }
  const opens = new Date(
   new Date(startsAt).getTime() -
   (program.check_in_opens_at_minutes_before_start ?? 15) * 60_000
  );
  const closes = new Date(
   new Date(endsAt).getTime() +
   (program.check_in_closes_at_minutes_after_end ?? 0) * 60_000
  );
  return {
   opensAt: opens.toISOString(),
   closesAt: closes.toISOString(),
  };
 })();
 const runEventAction = async (
  action: () => Promise<unknown>,
  successMessage: string,
  pendingMutation: PendingEventMutation
 ): Promise<boolean> => {
  if (eventsOutcomeUnknown || eventsStale) {
   return false;
  }
  setActionBusy(true);
  setActionError(null);
  setNotice(null);
  pendingEventMutationRef.current = pendingMutation;
  writeWorkspaceMutationRecovery({
   surface: "events",
   programId,
   mutation: pendingMutation,
  });
  const request = { cancelled: false };
  try {
   await action();
   pendingEventMutationRef.current = null;
   clearWorkspaceMutationRecovery("events", {
    programId,
   });
   if (!mounted.current) {
    return false;
   }
   onAttentionRefresh();
   let workspaceReconciled = true;
   if (onWorkspaceRefresh) {
    try {
     workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
    } catch {
     workspaceReconciled = false;
    }
   }
   await run(request);
   const outcome = eventLoadOutcomes.current.get(request);
   if (!mounted.current) {
    return false;
   }
   if (!workspaceReconciled || outcome?.status !== "success") {
    setEventsStale(true);
    setActionError(COPY.programs.workspaceEventsSavedStale);
   }
   setEventsOutcomeUnknown(false);
   setNotice(successMessage);
   announce(successMessage);
   return true;
  } catch (error: unknown) {
   if (!mounted.current) {
    return false;
   }
   if (redirectToLoginIfRequired(error)) {
    return false;
   }
   if (isUnknownMutationOutcome(error)) {
    pendingEventMutationRef.current = pendingMutation;
    setEventsOutcomeUnknown(true);
    onMutationBlockChange?.(true);
    setEventsStale(true);
    setActionError(COPY.programs.programTransportAmbiguous);
    announce(COPY.programs.programTransportAmbiguous);
    return false;
   }
   pendingEventMutationRef.current = null;
   clearWorkspaceMutationRecovery("events", {
    programId,
   });
   const message =
    error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   setActionError(message);
   announce(message);
   return false;
  } finally {
   if (mounted.current) {
    setActionBusy(false);
   }
  }
 };

 const submitCancelEvent =
  (eventId: string) => (formEvent: FormEvent<HTMLFormElement>) => {
   formEvent.preventDefault();
   const currentEvent = eventsForActions.find(
    (candidate) => candidate.event_id === eventId
   );
   if (currentEvent?.has_attendance) {
    const message = COPY.programs.cancelBlockedWithAttendance;
    setConfirmingEventId(null);
    setActionError(message);
    announce(message);
    return;
   }
   if (confirmingEventId !== eventId) {
    setConfirmingEventId(eventId);
    return;
   }
   const form = new FormData(formEvent.currentTarget);
   const reason = String(form.get("cancel_reason") ?? "").trim() || null;
   void (async () => {
    const succeeded = await runEventAction(
     () => cancelEvent(programId, eventId, reason),
     COPY.programs.eventCancelledNotice,
     { kind: "cancel", eventId }
    );
    if (succeeded && mounted.current) {
     setConfirmingEventId(null);
    }
   })();
  };

 // oxlint-disable-next-line eslint/complexity -- create validation and optional check-in-window overrides are one form boundary
 const submitCreate = async (formEvent: FormEvent<HTMLFormElement>) => {
  formEvent.preventDefault();
  if (eventsOutcomeUnknown || eventsStale) {
   return;
  }
  const form = new FormData(formEvent.currentTarget);
  const name = String(form.get("name") ?? "").trim();
  if (!createDate || !createStartTime || !createEndTime || !name) {
   const message = COPY.programs.createMeetingValidation;
   setCreateError(message);
   announce(message);
   return;
  }
  const startsAt = hkWallInputToIso(`${createDate}T${createStartTime}`);
  const endsAt = hkWallInputToIso(`${createDate}T${createEndTime}`);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
   const message = COPY.programs.eventInvalidInterval;
   setCreateError(message);
   announce(message);
   return;
  }
  const overrideOpens = createWindowOverride
   ? hkWallInputToIso(createWindowOpens)
   : null;
  const overrideCloses = createWindowOverride
   ? hkWallInputToIso(createWindowCloses)
   : null;
  if (
   createWindowOverride &&
   (!overrideOpens || !overrideCloses || overrideCloses <= overrideOpens)
  ) {
   const message = COPY.programs.createMeetingValidation;
   setCreateError(message);
   announce(message);
   return;
  }
  const pendingMutation: PendingEventMutation = {
   kind: "create",
   programId,
   beforeEventIds: eventsForActions.map((event) => event.event_id),
   name,
   eventType: createEventType,
   startsAt,
   endsAt,
   location: createLocation.trim() || null,
   opensAt: overrideOpens,
   closesAt: overrideCloses,
  };
  pendingEventMutationRef.current = pendingMutation;
  writeWorkspaceMutationRecovery({
   surface: "events",
   programId,
   mutation: pendingMutation,
  });
  setCreateBusy(true);
  setCreateError(null);
  try {
   const { event } = await createEvent(programId, {
    name,
    event_type: createEventType,
    starts_at: startsAt,
    ends_at: endsAt,
    location: createLocation.trim() || null,
    check_in_window_opens_at: overrideOpens,
    check_in_window_closes_at: overrideCloses,
   });
   pendingEventMutationRef.current = null;
   clearWorkspaceMutationRecovery("events", { programId });
   announce(COPY.programs.eventCreatedNotice);
   clearEventCreateDraft(programId);
   toggleCreateForm(false);
   if (!mounted.current) {
    return;
   }
   onAttentionRefresh();
   if (onWorkspaceRefresh) {
    try {
     await onWorkspaceRefresh();
    } catch {
     // Independent Event readback below remains authoritative for navigation.
    }
   }
   const refreshedEvents = await run();
   if (
    refreshedEvents === undefined ||
    !eventSettlesMutation(refreshedEvents, pendingMutation, event.event_id)
   ) {
    setEventsStale(true);
    setActionError(COPY.programs.workspaceEventsSavedStale);
    setNotice(COPY.programs.eventCreatedNotice);
    return;
   }
   setNotice(COPY.programs.eventCreatedNotice);
   if (onOpenEvent) {
    onOpenEvent(event.event_id);
   } else {
    await run();
   }
  } catch (error: unknown) {
   if (redirectToLoginIfRequired(error)) {
    return;
   }
   if (isUnknownMutationOutcome(error)) {
    pendingEventMutationRef.current = pendingMutation;
    setEventsOutcomeUnknown(true);
    onMutationBlockChange?.(true);
    setEventsStale(true);
    setActionError(COPY.programs.programTransportAmbiguous);
    announce(COPY.programs.programTransportAmbiguous);
    return;
   }
   pendingEventMutationRef.current = null;
   clearWorkspaceMutationRecovery("events", { programId });
   const message =
    error instanceof RpcError
     ? errorCopyFor(error.problem.code, error.problem.detail)
     : COPY.error.networkError;
   setCreateError(message);
   announce(message);
  } finally {
   setCreateBusy(false);
  }
 };
 const eventsForDisplay =
  state.kind === "ready" ? state.events : previousEvents.current;
 const visibleEvents =
  eventsForDisplay === null
   ? null
   : eventsForFilter(eventsForDisplay, eventFilter);
 const createControlsDisabled =
  createBusy || eventsOutcomeUnknown || eventsStale;

 return (
  <ScreenSection
   title={COPY.programs.workspaceTaskEvents}
   headingId="programs-workspace-events-title"
   aria-busy={createBusy || actionBusy}
   action={
    canManage && !createOpen ? (
     <Button
      type="button"
      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
      onClick={() => toggleCreateForm(true)}
      disabled={eventsOutcomeUnknown || eventsStale}
     >
      {COPY.programs.createMeeting}
     </Button>
    ) : undefined
   }
  >
   <AlertDialog
    open={createRecoveryOpen}
    onOpenChange={setCreateRecoveryOpen}
   >
    <AlertDialogContent>
     <AlertDialogHeader>
      <AlertDialogTitle>
       {COPY.programs.eventCreateRecoveryTitle}
      </AlertDialogTitle>
      <AlertDialogDescription>
       {COPY.programs.eventCreateRecoveryDescription}
      </AlertDialogDescription>
     </AlertDialogHeader>
     <AlertDialogFooter>
      <AlertDialogCancel>{COPY.programs.draftRecover}</AlertDialogCancel>
      <AlertDialogAction
       variant="destructive"
       onClick={discardRecoveredCreateDraft}
      >
       {COPY.programs.draftDiscard}
      </AlertDialogAction>
     </AlertDialogFooter>
    </AlertDialogContent>
   </AlertDialog>
   <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
    {COPY.programs.repeatInformational}
   </p>
   {eventsForDisplay !== null && (
    <ScreenTabs
     aria-label={COPY.programs.eventsFilterLabel}
     data-testid="programs-events-filters"
     role="tablist"
     value={eventFilter}
     onValueChange={(value) => {
      if (isEventListFilter(value)) {
       setEventFilter(value);
      }
     }}
    >
     <ScreenTab
      id="programs-events-current-tab"
      role="tab"
      aria-controls="programs-events-filter-panel"
      value="current"
      selected={eventFilter === "current"}
     >
      {COPY.programs.eventsFilterCurrent}
     </ScreenTab>
     <ScreenTab
      id="programs-events-past-tab"
      role="tab"
      aria-controls="programs-events-filter-panel"
      value="past"
      selected={eventFilter === "past"}
     >
      {COPY.programs.eventsFilterPast}
     </ScreenTab>
     <ScreenTab
      id="programs-events-cancelled-tab"
      role="tab"
      aria-controls="programs-events-filter-panel"
      value="cancelled"
      selected={eventFilter === "cancelled"}
     >
      {COPY.programs.eventsFilterCancelled}
     </ScreenTab>
    </ScreenTabs>
   )}
   {notice !== null && (
    <Alert tone="success" announcement="polite">
     {notice}
    </Alert>
   )}
   {actionError !== null && !eventsStale && (
    <Alert variant="destructive">{actionError}</Alert>
   )}
   {(eventAttention?.inactive_event_count ?? 0) > 0 ||
    (eventAttention?.cancelled_event_count ?? 0) > 0 ? (
    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
     {(eventAttention?.inactive_event_count ?? 0) > 0 && (
      <ScreenStatus
       tone="accent"
       aria-label={COPY.programs.attentionEventCount.replace(
        "{count}",
        String(eventAttention?.inactive_event_count)
       )}
      >
       {eventAttention?.inactive_event_count}
      </ScreenStatus>
     )}
     {(eventAttention?.cancelled_event_count ?? 0) > 0 && (
      <ScreenStatus
       tone="danger"
       aria-label={COPY.programs.attentionCancelledCount.replace(
        "{count}",
        String(eventAttention?.cancelled_event_count)
       )}
      >
       {eventAttention?.cancelled_event_count}
      </ScreenStatus>
     )}
    </div>
   ) : null}
   {canManage && createOpen && (
    <ScreenCard asChild>
     <ScreenEditor
      aria-labelledby="programs-workspace-event-create-title"
      aria-busy={createBusy}
      noValidate
      onSubmit={submitCreate}
     >
      <h3
       id="programs-workspace-event-create-title"
       className="m-0 wrap-anywhere text-base font-bold leading-[var(--screen-section-title-leading)]"
      >
       {COPY.programs.createMeeting}
      </h3>
      {createError !== null && (
       <Alert variant="destructive">{createError}</Alert>
      )}
      <ScreenField
       htmlFor="programs-event-date"
       label={COPY.programs.eventDate}
      >
       <ProgramDatePicker
        id="programs-event-date"
        name="event_date"
        label={COPY.programs.eventDate}
        placeholder={COPY.programs.eventDate}
        value={createDate}
        onChange={changeCreateDate}
        disabled={createControlsDisabled}
       />
      </ScreenField>
      <ScreenField
       htmlFor="programs-event-time"
       label={COPY.programs.eventTime}
      >
       <Input
        id="programs-event-time"
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="time"
        name="event_time"
        value={createStartTime}
        onChange={(event) => changeCreateStartTime(event.target.value)}
        aria-required="true"
        disabled={createControlsDisabled}
       />
      </ScreenField>
      <ScreenField
       htmlFor="programs-event-end-time"
       label={COPY.programs.eventEnd}
      >
       <Input
        id="programs-event-end-time"
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="time"
        name="event_end_time"
        value={createEndTime}
        onChange={(event) => {
         setCreateEndTime(event.target.value);
         setCreateEndAuto(false);
        }}
        aria-required="true"
        disabled={createControlsDisabled}
       />
      </ScreenField>
      <ScreenField
       htmlFor="programs-event-name"
       label={COPY.programs.eventName}
      >
       <Input
        id="programs-event-name"
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="text"
        name="name"
        placeholder={COPY.programs.eventNamePlaceholder}
        aria-required="true"
        required
        value={createName}
        onChange={(event) => setCreateName(event.target.value)}
        disabled={createControlsDisabled}
       />
      </ScreenField>
      <ScreenField
       htmlFor="programs-event-type"
       label={COPY.programs.eventType}
      >
       <Select
        name="event_type"
        value={createEventType}
        onValueChange={(value) =>
         setCreateEventType(value as EventType)
        }
        disabled={createControlsDisabled}
       >
        <SelectTrigger
         id="programs-event-type"
         className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
         aria-label={COPY.programs.eventType}
        >
         <SelectValue />
        </SelectTrigger>
        <SelectContent>
         {COPY.programs.eventTypeOptions.map((type) => (
          <SelectItem key={type} value={type}>
           {type}
          </SelectItem>
         ))}
        </SelectContent>
       </Select>
      </ScreenField>
      <ScreenField
       htmlFor="programs-event-location"
       label={COPY.programs.eventLocation}
      >
       <Input
        id="programs-event-location"
        className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
        type="text"
        name="location"
        value={createLocation}
        onChange={(event) => setCreateLocation(event.target.value)}
        placeholder={COPY.programs.eventLocationPlaceholder}
        disabled={createControlsDisabled}
       />
      </ScreenField>
      <div className="grid min-w-0 gap-2 rounded-[var(--screen-radius-card)] border border-[var(--screen-line)] bg-[var(--screen-surface-soft)] p-3">
       <div className="flex min-w-0 items-start gap-3">
        <Checkbox
         id="programs-event-window-override"
         checked={createWindowOverride}
         onCheckedChange={(checked) => {
          const next = checked === true;
          setCreateWindowOverride(next);
          if (next && defaultWindow) {
           setCreateWindowOpens(
            hkWallInputValue(defaultWindow.opensAt)
           );
           setCreateWindowCloses(
            hkWallInputValue(defaultWindow.closesAt)
           );
          }
         }}
         disabled={createControlsDisabled}
        />
        <label
         className="min-w-0 cursor-pointer text-sm leading-6 text-[var(--screen-ink)]"
         htmlFor="programs-event-window-override"
        >
         {COPY.programs.eventCheckInWindowOverride}
        </label>
       </div>
       {createWindowOverride ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
         <ScreenField
          htmlFor="programs-event-window-opens"
          label={COPY.programs.eventCheckInWindowOpensAt}
         >
          <Input
           id="programs-event-window-opens"
           className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
           type="datetime-local"
           value={createWindowOpens}
           onChange={(event) =>
            setCreateWindowOpens(event.target.value)
           }
           disabled={createControlsDisabled}
          />
         </ScreenField>
         <ScreenField
          htmlFor="programs-event-window-closes"
          label={COPY.programs.eventCheckInWindowClosesAt}
         >
          <Input
           id="programs-event-window-closes"
           className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
           type="datetime-local"
           value={createWindowCloses}
           onChange={(event) =>
            setCreateWindowCloses(event.target.value)
           }
           disabled={createControlsDisabled}
          />
         </ScreenField>
        </div>
       ) : (
        <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
         {defaultWindow
          ? `${COPY.programs.eventCheckInWindowOpensAt} ${hkWallDateTimeLabel(defaultWindow.opensAt)}；${COPY.programs.eventCheckInWindowClosesAt} ${hkWallDateTimeLabel(defaultWindow.closesAt)}`
          : COPY.programs.eventCheckInWindowCalculated}
        </p>
       )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
       <Button
        type="submit"
        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
        disabled={createControlsDisabled}
       >
        {createBusy
         ? COPY.programs.submitting
         : COPY.programs.createMeeting}
       </Button>
       <Button
        type="button"
        className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
        variant="outline"
        disabled={createControlsDisabled}
        onClick={() => {
         toggleCreateForm(false);
        }}
       >
        {COPY.programs.eventCreateCancel}
       </Button>
      </div>
     </ScreenEditor>
    </ScreenCard>
   )}
   {state.kind === "loading" && (
    <ScreenLoadingRows
     count={2}
     label={COPY.programs.workspaceTaskEventsLoading}
    />
   )}
   {state.kind === "error" && (
    <ScreenState
     kind="error"
     title={state.message}
     action={
      <Button
       className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
       variant="outline"
       type="button"
       onClick={retry}
      >
       {COPY.programs.workspaceTaskEventsRetry}
      </Button>
     }
    />
   )}
   {eventsStale && (
    <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
     <Alert
      tone={eventsOutcomeUnknown ? "error" : "warning"}
      announcement={eventsOutcomeUnknown ? "assertive" : "polite"}
     >
      {eventsOutcomeUnknown
       ? COPY.programs.programTransportAmbiguous
       : COPY.programs.workspaceEventsSavedStale}
     </Alert>
     <Button
      type="button"
      variant="outline"
      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
      onClick={() => void reconcileEvents()}
      disabled={actionBusy}
     >
      {COPY.programs.workspaceRetryRefresh}
     </Button>
    </div>
   )}
   {eventsForDisplay !== null && (
    <section
     id="programs-events-filter-panel"
     role="tabpanel"
     aria-labelledby={`programs-events-${eventFilter}-tab`}
     tabIndex={0}
    >
     {state.kind === "ready" && state.events.length === 0 && (
      <ScreenState
       kind="empty"
       title={COPY.programs.workspaceTaskEventsEmpty}
      />
     )}
     {state.kind === "ready" &&
      state.events.length > 0 &&
      visibleEvents !== null &&
      visibleEvents.length === 0 && (
       <ScreenState
        kind="empty"
        title={COPY.programs.eventsFilterEmpty}
       />
      )}
     {visibleEvents !== null && visibleEvents.length > 0 && (
      <ScreenRowList>
       <ul
        className="m-0 grid min-w-0 list-none gap-0 p-0"
        aria-label={COPY.programs.workspaceTaskEvents}
       >
        {visibleEvents.map(
         // oxlint-disable-next-line eslint/complexity -- one row owns its operational menu and settled recovery guards.
         (event) => {
          const wall = eventWallParts(event.starts_at);
          const exception = event.exception ?? null;
          const actionPhase = eventActionPhase(event);
          const eventTitle =
           event.name ?? hkWallDateTimeLabel(event.starts_at);
          const eventHref = buildProgramsHref({
           mode: "management",
           departmentId,
           programId,
           task: "events",
           eventId: event.event_id,
           eventFilter,
           directoryQuery,
           hash,
          });
          return (
           <li
            key={event.event_id}
            className="min-w-0"
            data-event-id={event.event_id}
           >
            <ScreenRow
             className="items-start flex-wrap"
             aria-busy={actionBusy}
            >
             <ScreenRowMain className="basis-full">
              <Link
               href={eventHref}
               aria-label={`${eventTitle} · ${wall.date} · ${COPY.programs.eventDetailOpen}`}
               className="inline-flex min-w-0 min-h-11 items-center wrap-anywhere text-[length:var(--screen-body-size)] leading-[21px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
               onClick={(clickEvent) => {
                if (eventsOutcomeUnknown || eventsStale) {
                 clickEvent.preventDefault();
                 return;
                }
                if (
                 !onOpenEvent ||
                 clickEvent.defaultPrevented ||
                 clickEvent.button !== 0 ||
                 clickEvent.metaKey ||
                 clickEvent.ctrlKey ||
                 clickEvent.shiftKey ||
                 clickEvent.altKey
                ) {
                 return;
                }
                clickEvent.preventDefault();
                openEvent(event.event_id);
               }}
               aria-disabled={
                eventsOutcomeUnknown || eventsStale
               }
              >
               {event.name ??
                hkWallDateTimeLabel(event.starts_at)}
              </Link>
              <ScreenRowMeta>
               {wall.date} · {wall.time} ·{" "}
               {event.event_type ??
                COPY.programs.eventTypeOptions[5]}{" "}
               ·{" "}
               {COPY.programs.repeatLabel.replace(
                "{tag}",
                event.recurrence_tag ??
                COPY.programs.recurrenceNone
               )}{" "}
               ·{" "}
               {event.status === "Active"
                ? COPY.programs.eventActive
                : COPY.programs.eventCancelled}
              </ScreenRowMeta>
              <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
               <ScreenStatus
                tone={
                 event.source === "SCHEDULE"
                  ? "accent"
                  : "neutral"
                }
               >
                {event.source === "SCHEDULE"
                 ? COPY.programs.eventScheduleSource
                 : COPY.programs.eventManualSource}
               </ScreenStatus>
               {exception !== null && (
                <ScreenStatus tone="pending">
                 {exception.action === "RESCHEDULE"
                  ? COPY.programs.eventRescheduledBadge.replace(
                   "{time}",
                   exception.new_start_time ?? ""
                  )
                  : COPY.programs.eventCancelledBadge}
                </ScreenStatus>
               )}
               {event.availability !== undefined &&
                event.availability !== "Active" && (
                 <ScreenStatus tone="danger">
                  {COPY.programs.eventUnavailable}
                 </ScreenStatus>
                )}
              </div>
              {event.status === "Cancelled" &&
               event.cancel_reason !== null && (
                <details className="min-w-0">
                 <summary className="cursor-pointer text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-danger)]">
                  {COPY.programs.cancelReason}
                 </summary>
                 <p className="m-0 mt-1 wrap-anywhere text-[var(--screen-danger)]">
                  {event.cancel_reason}
                 </p>
                </details>
               )}
             </ScreenRowMain>
             <div className="flex min-w-0 basis-full flex-wrap items-center gap-[var(--screen-utility-gap)]">
              {(actionPhase === "open" ||
               actionPhase === "past") && (
                <Button
                 asChild
                 className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                 variant="outline"
                >
                 <Link
                  href={`/events?eventId=${encodeURIComponent(event.event_id)}`}
                  aria-disabled={
                   eventsOutcomeUnknown || eventsStale
                  }
                  onClick={(clickEvent) => {
                   if (eventsOutcomeUnknown || eventsStale) {
                    clickEvent.preventDefault();
                    return;
                   }
                   if (
                    !onOpenAttendance ||
                    clickEvent.defaultPrevented ||
                    clickEvent.button !== 0 ||
                    clickEvent.metaKey ||
                    clickEvent.ctrlKey ||
                    clickEvent.shiftKey ||
                    clickEvent.altKey
                   ) {
                    return;
                   }
                   clickEvent.preventDefault();
                   onOpenAttendance(event.event_id);
                  }}
                 >
                  {actionPhase === "open"
                   ? COPY.attendance.eventAttendanceOpen
                   : COPY.programs.eventAttendanceViewRecord}
                 </Link>
                </Button>
               )}
              {canManage && actionPhase !== "cancelled" && (
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                 <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={COPY.programs.eventMoreActions}
                  disabled={
                   actionBusy ||
                   eventsOutcomeUnknown ||
                   eventsStale
                  }
                  className="border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                 >
                  <MoreHorizontal aria-hidden="true" />
                 </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                 <DropdownMenuItem
                  disabled={
                   !onOpenEvent ||
                   eventsOutcomeUnknown ||
                   eventsStale
                  }
                  onSelect={() =>
                   openEvent(event.event_id, "edit")
                  }
                 >
                  {COPY.programs.eventEdit}
                 </DropdownMenuItem>
                 <DropdownMenuItem
                  disabled={
                   !onOpenEvent ||
                   eventsOutcomeUnknown ||
                   eventsStale
                  }
                  onSelect={() =>
                   openEvent(event.event_id, "reschedule")
                  }
                 >
                  {COPY.programs.eventReschedule}
                 </DropdownMenuItem>
                 {dataReady && event.status === "Active" && (
                  <>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem
                    variant="destructive"
                    disabled={
                     eventsOutcomeUnknown || eventsStale
                    }
                    onSelect={() => {
                     if (event.has_attendance) {
                      const message =
                       COPY.programs
                        .cancelBlockedWithAttendance;
                      setActionError(message);
                      announce(message);
                      return;
                     }
                     setConfirmingEventId(event.event_id);
                    }}
                   >
                    {COPY.programs.cancelEvent}
                   </DropdownMenuItem>
                  </>
                 )}
                </DropdownMenuContent>
               </DropdownMenu>
              )}
              {canManage &&
               dataReady &&
               event.status === "Active" &&
               confirmingEventId === event.event_id && (
                <form
                 className="grid min-w-0 basis-full gap-2"
                 noValidate
                 onSubmit={submitCancelEvent(event.event_id)}
                >
                 <Input
                  className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                  type="text"
                  name="cancel_reason"
                  placeholder={
                   COPY.programs.cancelReasonPlaceholder
                  }
                  aria-label={COPY.programs.cancelReason}
                  disabled={actionBusy}
                 />
                 <ScreenCard
                  className="min-w-0"
                  role="alert"
                  ref={confirmEventRef}
                 >
                  <strong>
                   {COPY.programs.cancelMeetingConfirmTitle}
                  </strong>
                  <span>
                   {COPY.programs.cancelMeetingConfirmBody}
                  </span>
                  <Button
                   type="submit"
                   disabled={actionBusy}
                   className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                  >
                   {COPY.programs.confirmCancel}
                  </Button>
                  <Button
                   type="button"
                   disabled={actionBusy}
                   className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                   variant="outline"
                   onClick={() => setConfirmingEventId(null)}
                  >
                   {COPY.programs.keepMeeting}
                  </Button>
                 </ScreenCard>
                </form>
               )}
             </div>
            </ScreenRow>
           </li>
          );
         }
        )}
       </ul>
      </ScreenRowList>
     )}
    </section>
   )}
   {canManage && recurring && (
    <ScreenSection
     title={COPY.programs.settingsSchedule}
     headingId="programs-workspace-schedule-link-title"
    >
     <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
      {COPY.programs.settingsScheduleLead}
     </p>
     <ScreenRowList>
      <ScreenRow asChild density="settings">
       <Link
        href={buildProgramsHref({
         mode: "management",
         programId,
         departmentId,
         task: "schedule",
         scheduleOrigin: "events",
         directoryQuery,
         hash,
        })}
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
         onTaskChange("schedule", undefined, "events");
        }}
       >
        <ScreenRowMain>
         <ScreenRowTitle>
          {COPY.programs.settingsScheduleEventsLink}
         </ScreenRowTitle>
         <ScreenRowMeta>
          {COPY.programs.settingsScheduleLead}
         </ScreenRowMeta>
        </ScreenRowMain>
        <ScreenRowTrailing>
         <ChevronRight
          aria-hidden="true"
          className="size-[var(--screen-icon-size)] text-[var(--screen-muted)]"
          strokeWidth={1.8}
         />
        </ScreenRowTrailing>
       </Link>
      </ScreenRow>
     </ScreenRowList>
    </ScreenSection>
   )}
  </ScreenSection>
 );
};
