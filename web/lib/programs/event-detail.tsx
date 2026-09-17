"use client";

import { CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import {
  hkShortDateLabel,
  hkShortTimeLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  cancelEvent,
  getEvent,
  getOwnAttendance,
  isUnknownMutationOutcome,
  setEventAvailability,
  updateEvent,
} from "@/lib/programs/program-api";
import type {
  EventDetail as EventDetailData,
  EventType,
  AttendanceParticipantView,
  Program,
  ProgramEvent,
  ProgramIdentityAssignment,
} from "@/lib/programs/program-api";
import {
  HK_UTC_OFFSET_MINUTES,
  hkWallDateTimeLabel,
} from "@/lib/programs/recurrence";
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
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";

import { EventCheckInSheet } from "./event-check-in-sheet";
import {
  clearManagementDraft,
  readManagementDraft,
  writeManagementDraft,
} from "./management-draft";
import {
  clearWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
  writeWorkspaceMutationRecovery,
} from "./mutation-recovery";
import type { EventMutationRecovery } from "./mutation-recovery";
import { buildProgramsHref } from "./programs-intent";
import type { ManagementEventAction, ProgramsOrigin } from "./programs-intent";

export const EventFactIcon = ({
  name,
}: {
  name: "calendar" | "pin" | "back";
}) => {
  const Icon =
    name === "calendar" ? CalendarDays : name === "pin" ? MapPin : ChevronLeft;
  return (
    <Icon
      aria-hidden="true"
      className="size-[var(--screen-icon-size)] shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
      focusable="false"
      strokeWidth={1.8}
    />
  );
};

const STATUS_LABEL: Record<ProgramEvent["status"], string> = {
  Active: COPY.programs.eventActive,
  Cancelled: COPY.programs.eventCancelled,
};

const AVAILABILITY_LABEL: Record<
  NonNullable<ProgramEvent["availability"]>,
  string
> = {
  Active: COPY.programs.eventAvailable,
  Inactive: COPY.programs.eventUnavailable,
};
function checkInWindowIsOpen(event: ProgramEvent, now = Date.now()): boolean {
  if (
    event.status !== "Active" ||
    event.availability !== "Active" ||
    !event.check_in_window_opens_at ||
    !event.check_in_window_closes_at
  ) {
    return false;
  }
  const opensAt = Date.parse(event.check_in_window_opens_at);
  const closesAt = Date.parse(event.check_in_window_closes_at);
  return (
    Number.isFinite(opensAt) &&
    Number.isFinite(closesAt) &&
    opensAt <= now &&
    now <= closesAt
  );
}

type EventPhase = "future" | "open" | "past" | "cancelled";
type EventEditIntent = "edit" | "reschedule";
type OwnAttendanceUnavailableReason = "forbidden" | "not-found" | null;

interface EventDetailDraft {
  version: 1;
  intent: EventEditIntent;
  name: string;
  location: string;
  eventType: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  closesAt: string;
}

function isEventDetailDraft(value: unknown): value is EventDetailDraft {
  if (!value || typeof value !== "object") {
    return false;
  }
  const draft = value as Partial<EventDetailDraft>;
  return (
    draft.version === 1 &&
    (draft.intent === "edit" || draft.intent === "reschedule") &&
    typeof draft.name === "string" &&
    typeof draft.location === "string" &&
    typeof draft.eventType === "string" &&
    typeof draft.reason === "string" &&
    typeof draft.startsAt === "string" &&
    typeof draft.endsAt === "string" &&
    typeof draft.opensAt === "string" &&
    typeof draft.closesAt === "string"
  );
}

const EVENT_DETAIL_DRAFT_ACTION = "event-edit";

function eventPhase(event: ProgramEvent, now = Date.now()): EventPhase {
  if (event.status === "Cancelled") {
    return "cancelled";
  }
  if (checkInWindowIsOpen(event, now)) {
    return "open";
  }
  const opensAt = event.check_in_window_opens_at
    ? Date.parse(event.check_in_window_opens_at)
    : Number.NaN;
  const startsAt = Date.parse(event.starts_at);
  return [opensAt, startsAt].some(
    (timestamp) => Number.isFinite(timestamp) && timestamp > now
  )
    ? "future"
    : "past";
}

function eventMutationSettles(
  detail: EventDetailData,
  mutation: EventMutationRecovery
): boolean {
  const { event } = detail;
  if (
    event.program_id !== mutation.programId ||
    event.event_id !== mutation.eventId
  ) {
    return false;
  }
  const actual = {
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    name: event.name ?? null,
    eventType: event.event_type ?? null,
    location: event.location ?? null,
    opensAt: event.check_in_window_opens_at ?? null,
    closesAt: event.check_in_window_closes_at ?? null,
    availability: event.availability,
    status: event.status,
  };
  return Object.entries(mutation.expected).every(
    ([key, expected]) =>
      actual[key as keyof typeof actual] === (expected ?? null)
  );
}

function participantAttendanceLabel(
  state: AttendanceParticipantView["state"]
): string {
  switch (state) {
    case null: {
      return COPY.programs.participantAttendanceUnavailable;
    }
    case "Present": {
      return COPY.programs.participantAttendancePresent;
    }
    case "Excused": {
      return COPY.programs.participantAttendanceExcused;
    }
    case "Absent": {
      return COPY.programs.participantAttendanceAbsent;
    }
    case "Cancelled": {
      return COPY.programs.participantAttendanceCancelled;
    }
    default: {
      return COPY.programs.participantAttendanceNotYet;
    }
  }
}

/** HK wall "YYYY-MM-DDTHH:MM" value for a datetime-local input. */
export function hkWallInputValue(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const shifted = new Date(
    new Date(iso).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  );
  return `${shifted.toISOString().slice(0, 16)}`;
}

/** datetime-local HK wall value back to a UTC ISO instant. */
export function hkWallInputToIso(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * EVT-01 (#251): Event operational detail — identity, participant summary,
 * leaders, edit, independent availability with confirm + undo, and cancel.
 * Rendered by ProgramWorkspace when a management events task carries an
 * `event` deep link; every mutation is re-authorized server-side.
 */
/* oxlint-disable-next-line eslint/complexity -- EVT-01 branch matrix is one state machine; splitting it would scatter the transitions */
export const EventDetail = ({
  programId,
  eventId,
  eventAction,
  canManage,
  origin,
  departmentId,
  hash,
  backHref,
  backReplace,
  onBack,
  onAttentionRefresh,
  onWorkspaceRefresh,
  onMutationBlockChange,
  onDirtyChange,
  onAuthRequired,
}: {
  programId: string;
  eventId: string;
  eventAction?: ManagementEventAction;
  canManage: boolean;
  origin?: ProgramsOrigin;
  departmentId?: string | null;
  hash?: string | null;
  backHref: string;
  backReplace?: boolean;
  onBack?: React.MouseEventHandler<HTMLAnchorElement>;
  /** NTF-01 (#256): keep shell attention counts fresh after a confirmed mutation. */
  onAttentionRefresh?: () => void;
  /** Refresh the authoritative Program/cockpit resource after a write. */
  onWorkspaceRefresh?: () => void | Promise<Program | void>;
  /** Keep the parent from navigating away before an unknown write is read back. */
  onMutationBlockChange?: (blocked: boolean) => void;
  /** Keep the parent from unmounting an unfinished edit/reschedule draft. */
  onDirtyChange?: (dirty: boolean) => void;
  onAuthRequired?: () => void;
}) => {
  const [detail, setDetail] = useState<EventDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recoveryRef = useRef<HTMLHeadingElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const restoredPendingMutation = useMemo<EventMutationRecovery | null>(() => {
    const recovery = readWorkspaceMutationRecovery();
    return recovery?.surface === "event" &&
      recovery.programId === programId &&
      recovery.eventId === eventId
      ? recovery.mutation
      : null;
  }, [eventId, programId]);
  const [actionError, setActionError] = useState<string | null>(() =>
    restoredPendingMutation === null
      ? null
      : COPY.programs.programTransportAmbiguous
  );
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(
    restoredPendingMutation !== null
  );
  const [detailStale, setDetailStale] = useState(false);
  const eventActionBlocked =
    busy || detailStale || loadError !== null || mutationOutcomeUnknown;
  const [editing, setEditing] = useState(false);
  const [editingIntent, setEditingIntent] = useState<EventEditIntent>("edit");
  const [editingEventType, setEditingEventType] = useState<EventType>(
    COPY.programs.eventTypeOptions[0] as EventType
  );
  const [editReason, setEditReason] = useState("");
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editOpensAt, setEditOpensAt] = useState("");
  const [editClosesAt, setEditClosesAt] = useState("");
  // Inline confirmations replace the control that opened them; hand focus to
  // the replacement so keyboard users land on the new affordance.
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [ownAttendance, setOwnAttendance] =
    useState<AttendanceParticipantView | null>(null);
  const [ownAttendanceUnavailable, setOwnAttendanceUnavailable] =
    useState(false);
  const [ownAttendanceUnavailableReason, setOwnAttendanceUnavailableReason] =
    useState<OwnAttendanceUnavailableReason>(null);
  const [ownAttendanceLoading, setOwnAttendanceLoading] = useState(false);
  const [ownAttendanceError, setOwnAttendanceError] = useState<string | null>(
    null
  );
  const [undoAvailable, setUndoAvailable] = useState(false);
  // Affected-operation count shown in the deactivation confirm; sourced
  // from the loaded summary or, on a server refusal, the server's fresh
  // count.
  const [deactivateImpact, setDeactivateImpact] = useState(0);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelConfirmRef = useRef<HTMLDivElement>(null);
  const menuFocusTargetRef = useRef<"deactivate" | "cancel" | null>(null);
  const eventIdentityRef = useRef({ programId, eventId });
  const eventRequestSequenceRef = useRef(0);
  const ownAttendanceRequestSequenceRef = useRef(0);
  const pendingEventMutationRef = useRef<EventMutationRecovery | null>(
    restoredPendingMutation
  );
  const appliedEventActionRef = useRef<string | null>(null);
  eventIdentityRef.current = { programId, eventId };
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (confirmingDeactivate) {
      const focusReplacement = window.setTimeout(() => {
        confirmRef.current?.querySelector("button")?.focus();
      }, 0);
      return () => window.clearTimeout(focusReplacement);
    }
  }, [confirmingDeactivate]);

  useEffect(() => {
    if (confirmingCancel) {
      const focusReplacement = window.setTimeout(() => {
        cancelConfirmRef.current?.querySelector("button")?.focus();
      }, 0);
      return () => window.clearTimeout(focusReplacement);
    }
  }, [confirmingCancel]);
  useEffect(() => {
    if (!editing) {
      return;
    }
    const firstInput = document.querySelector<HTMLInputElement>(
      'form input[name="name"]'
    );
    firstInput?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [editing]);

  const isCurrentEvent = useCallback(
    (requestProgramId: string, requestEventId: string) =>
      mounted.current &&
      eventIdentityRef.current.programId === requestProgramId &&
      eventIdentityRef.current.eventId === requestEventId,
    []
  );

  const load = useCallback(async (): Promise<EventDetailData | null> => {
    eventRequestSequenceRef.current += 1;
    const requestSequence = eventRequestSequenceRef.current;
    const requestProgramId = programId;
    const requestEventId = eventId;
    setLoadError(null);
    try {
      const next = await getEvent(programId, eventId);
      if (
        !isCurrentEvent(requestProgramId, requestEventId) ||
        requestSequence !== eventRequestSequenceRef.current ||
        next.event.event_id !== requestEventId
      ) {
        return null;
      }
      setDetail(next);
      return next;
    } catch (error) {
      if (
        !isCurrentEvent(requestProgramId, requestEventId) ||
        requestSequence !== eventRequestSequenceRef.current
      ) {
        return null;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        onAuthRequired?.();
        return null;
      }
      setLoadError(errorMessage(error));
      // A failed post-write read must not erase the last confirmed Event.
      return null;
    }
  }, [eventId, isCurrentEvent, onAuthRequired, programId]);

  useEffect(() => {
    setDetail(null);
    setLoadError(null);
    setNotice(null);
    const pendingMutation = pendingEventMutationRef.current;
    setActionError(
      pendingMutation === null ? null : COPY.programs.programTransportAmbiguous
    );
    setMutationOutcomeUnknown(pendingMutation !== null);
    setDetailStale(false);
    setBusy(false);
    setEditing(false);
    setEditingIntent("edit");
    setEditingEventType(COPY.programs.eventTypeOptions[0] as EventType);
    setEditReason("");
    setEditName("");
    setEditLocation("");
    setEditStartsAt("");
    setEditEndsAt("");
    setEditOpensAt("");
    setEditClosesAt("");
    setConfirmingDeactivate(false);
    setConfirmingCancel(false);
    setShowCheckInSheet(false);
    setOwnAttendance(null);
    setOwnAttendanceUnavailable(false);
    setOwnAttendanceUnavailableReason(null);
    setOwnAttendanceLoading(false);
    setOwnAttendanceError(null);
    setUndoAvailable(false);
    setDeactivateImpact(0);
    menuFocusTargetRef.current = null;
    void load();
  }, [load]);

  const startEditing = useCallback(
    (intent: EventEditIntent, event: ProgramEvent) => {
      const stored = readManagementDraft<unknown>(
        event.event_id,
        EVENT_DETAIL_DRAFT_ACTION
      );
      const draft =
        isEventDetailDraft(stored) && stored.intent === intent
          ? stored
          : ({
              version: 1 as const,
              intent,
              name: event.name ?? "",
              location: event.location ?? "",
              eventType: event.event_type ?? COPY.programs.eventTypeOptions[0],
              reason: "",
              startsAt: hkWallInputValue(event.starts_at),
              endsAt: hkWallInputValue(event.ends_at),
              opensAt: hkWallInputValue(event.check_in_window_opens_at),
              closesAt: hkWallInputValue(event.check_in_window_closes_at),
            } satisfies EventDetailDraft);
      setEditingIntent(intent);
      setEditingEventType(draft.eventType as EventType);
      setEditReason(draft.reason);
      setEditName(draft.name);
      setEditLocation(draft.location);
      setEditStartsAt(draft.startsAt);
      setEditEndsAt(draft.endsAt);
      setEditOpensAt(draft.opensAt);
      setEditClosesAt(draft.closesAt);
      setEditing(true);
    },
    []
  );

  const detailEvent = detail?.event;
  useEffect(() => {
    if (!canManage || !eventAction || detailEvent?.event_id !== eventId) {
      return;
    }
    const actionIdentity = `${programId}:${eventId}:${eventAction}`;
    if (appliedEventActionRef.current === actionIdentity) {
      return;
    }
    appliedEventActionRef.current = actionIdentity;
    startEditing(eventAction, detailEvent);
  }, [canManage, detailEvent, eventAction, eventId, programId, startEditing]);

  const eventEditDirty = (() => {
    if (!editing || detail?.event.event_id !== eventId) {
      return false;
    }
    const { event } = detail;
    return editingIntent === "edit"
      ? editName !== (event.name ?? "") ||
          editLocation !== (event.location ?? "") ||
          editingEventType !==
            (event.event_type ?? COPY.programs.eventTypeOptions[0]) ||
          editReason !== ""
      : editStartsAt !== hkWallInputValue(event.starts_at) ||
          editEndsAt !== hkWallInputValue(event.ends_at) ||
          editOpensAt !== hkWallInputValue(event.check_in_window_opens_at) ||
          editClosesAt !== hkWallInputValue(event.check_in_window_closes_at);
  })();

  useEffect(() => {
    onDirtyChange?.(eventEditDirty);
    if (editing && detail?.event.event_id === eventId && eventEditDirty) {
      writeManagementDraft(eventId, EVENT_DETAIL_DRAFT_ACTION, {
        version: 1,
        intent: editingIntent,
        name: editName,
        location: editLocation,
        eventType: editingEventType,
        reason: editReason,
        startsAt: editStartsAt,
        endsAt: editEndsAt,
        opensAt: editOpensAt,
        closesAt: editClosesAt,
      } satisfies EventDetailDraft);
    } else if (editing && detail?.event.event_id === eventId) {
      clearManagementDraft(eventId, EVENT_DETAIL_DRAFT_ACTION);
    }
  }, [
    detail?.event.event_id,
    editClosesAt,
    editEndsAt,
    editLocation,
    editName,
    editOpensAt,
    editReason,
    editStartsAt,
    editing,
    editingEventType,
    editingIntent,
    eventEditDirty,
    eventId,
    onDirtyChange,
  ]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const loadOwnAttendance = useCallback(
    async (isActive: () => boolean = () => true) => {
      ownAttendanceRequestSequenceRef.current += 1;
      const requestSequence = ownAttendanceRequestSequenceRef.current;
      const requestProgramId = programId;
      const requestEventId = eventId;
      const isCurrentRequest = () =>
        isActive() &&
        isCurrentEvent(requestProgramId, requestEventId) &&
        requestSequence === ownAttendanceRequestSequenceRef.current;
      if (!isCurrentRequest()) {
        return;
      }
      setOwnAttendance(null);
      setOwnAttendanceUnavailable(false);
      setOwnAttendanceUnavailableReason(null);
      setOwnAttendanceError(null);
      setOwnAttendanceLoading(true);
      try {
        const next = await getOwnAttendance(eventId);
        if (isCurrentRequest()) {
          setOwnAttendance(next);
          setOwnAttendanceUnavailable(next === null || next.state === null);
        }
      } catch (error: unknown) {
        if (!isCurrentRequest()) {
          return;
        }
        if (
          error instanceof RpcError &&
          (error.problem.code === "FORBIDDEN" ||
            error.problem.code === "NOT_FOUND")
        ) {
          setOwnAttendanceUnavailableReason(
            error.problem.code === "FORBIDDEN" ? "forbidden" : "not-found"
          );
          setOwnAttendanceUnavailable(true);
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          onAuthRequired?.();
        }
        setOwnAttendanceError(COPY.programs.participantAttendanceError);
      } finally {
        if (isCurrentRequest()) {
          setOwnAttendanceLoading(false);
        }
      }
    },
    [eventId, isCurrentEvent, onAuthRequired, programId]
  );

  useEffect(() => {
    if (canManage || detail === null || detail.event.event_id !== eventId) {
      return;
    }
    let cancelled = false;
    void loadOwnAttendance(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [canManage, detail, eventId, loadOwnAttendance]);
  useEffect(() => {
    if (!canManage && detail !== null) {
      /* oxlint-disable-next-line unicorn/prefer-query-selector -- exact id lookup on participant-event-title */
      document.getElementById("participant-event-title")?.focus();
    }
  }, [canManage, detail]);
  useEffect(() => {
    if (loadError !== null && detail === null) {
      recoveryRef.current?.focus();
    }
  }, [loadError, detail]);

  const reconcileMutationOutcome = useCallback(async () => {
    const requestProgramId = programId;
    const requestEventId = eventId;
    if (!isCurrentEvent(requestProgramId, requestEventId)) {
      return;
    }
    setBusy(true);
    let workspaceReconciled = true;
    if (onWorkspaceRefresh) {
      try {
        workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
      } catch {
        workspaceReconciled = false;
      }
    }
    if (!isCurrentEvent(requestProgramId, requestEventId)) {
      return;
    }
    const pendingMutation = pendingEventMutationRef.current;
    const refreshed = await load();
    if (isCurrentEvent(requestProgramId, requestEventId)) {
      if (
        workspaceReconciled &&
        refreshed &&
        pendingMutation !== null &&
        eventMutationSettles(refreshed, pendingMutation)
      ) {
        pendingEventMutationRef.current = null;
        clearWorkspaceMutationRecovery("event", {
          programId: requestProgramId,
          eventId: requestEventId,
        });
        setMutationOutcomeUnknown(false);
        setDetailStale(false);
        onMutationBlockChange?.(false);
        setActionError(COPY.programs.workspaceReconciled);
        announce(COPY.programs.workspaceReconciled);
      } else {
        setMutationOutcomeUnknown(true);
        setActionError(COPY.programs.programTransportAmbiguous);
        announce(COPY.programs.programTransportAmbiguous);
      }
      setBusy(false);
    }
  }, [
    eventId,
    isCurrentEvent,
    load,
    onMutationBlockChange,
    onWorkspaceRefresh,
    programId,
  ]);

  const retryConfirmedRead = useCallback(async () => {
    const requestProgramId = programId;
    const requestEventId = eventId;
    if (!isCurrentEvent(requestProgramId, requestEventId)) {
      return;
    }
    let workspaceReconciled = true;
    if (onWorkspaceRefresh) {
      try {
        workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
      } catch {
        workspaceReconciled = false;
      }
    }
    if (!isCurrentEvent(requestProgramId, requestEventId)) {
      return;
    }
    const refreshed = await load();
    if (
      workspaceReconciled &&
      refreshed &&
      isCurrentEvent(requestProgramId, requestEventId)
    ) {
      setDetailStale(false);
      onMutationBlockChange?.(false);
      setActionError(null);
      setNotice(COPY.programs.workspaceReconciled);
      announce(COPY.programs.workspaceReconciled);
    } else if (isCurrentEvent(requestProgramId, requestEventId)) {
      setDetailStale(true);
      setActionError(COPY.programs.workspaceEventsSavedStale);
    }
  }, [
    eventId,
    isCurrentEvent,
    load,
    onMutationBlockChange,
    onWorkspaceRefresh,
    programId,
  ]);

  const runAction = useCallback(
    // oxlint-disable-next-line eslint/complexity -- the mutation boundary keeps identity, refresh, and unknown-outcome guards together.
    async (
      fn: () => Promise<unknown>,
      successCopy: string | (() => string),
      pendingMutation: EventMutationRecovery,
      onRefused?: (error: unknown) => boolean
    ) => {
      const requestProgramId = programId;
      const requestEventId = eventId;
      if (mutationOutcomeUnknown || detailStale || loadError !== null) {
        return;
      }
      if (!isCurrentEvent(requestProgramId, requestEventId)) {
        return;
      }
      setBusy(true);
      setActionError(null);
      pendingEventMutationRef.current = pendingMutation;
      writeWorkspaceMutationRecovery({
        surface: "event",
        programId: requestProgramId,
        eventId: requestEventId,
        mutation: pendingMutation,
      });
      try {
        await fn();
        pendingEventMutationRef.current = null;
        clearWorkspaceMutationRecovery("event", {
          programId: requestProgramId,
          eventId: requestEventId,
        });
        if (!isCurrentEvent(requestProgramId, requestEventId)) {
          return;
        }
        onAttentionRefresh?.();
        setMutationOutcomeUnknown(false);
        let workspaceReconciled = true;
        if (onWorkspaceRefresh) {
          try {
            workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
          } catch {
            workspaceReconciled = false;
          }
        }
        if (!isCurrentEvent(requestProgramId, requestEventId)) {
          return;
        }
        const refreshed = await load();
        if (!isCurrentEvent(requestProgramId, requestEventId)) {
          return;
        }
        if (!workspaceReconciled || !refreshed) {
          setDetailStale(true);
          setActionError(COPY.programs.workspaceEventsSavedStale);
        } else {
          setDetailStale(false);
          onMutationBlockChange?.(false);
        }
        const message =
          typeof successCopy === "function" ? successCopy() : successCopy;
        setNotice(message);
        announce(message);
      } catch (error) {
        if (!isCurrentEvent(requestProgramId, requestEventId)) {
          return;
        }
        if (onRefused?.(error)) {
          pendingEventMutationRef.current = null;
          clearWorkspaceMutationRecovery("event", {
            programId: requestProgramId,
            eventId: requestEventId,
          });
          return;
        }
        if (isUnknownMutationOutcome(error)) {
          setMutationOutcomeUnknown(true);
          onMutationBlockChange?.(true);
          setActionError(COPY.programs.programTransportAmbiguous);
          announce(COPY.programs.programTransportAmbiguous);
          return;
        }
        pendingEventMutationRef.current = null;
        clearWorkspaceMutationRecovery("event", {
          programId: requestProgramId,
          eventId: requestEventId,
        });
        const message = errorMessage(error);
        setActionError(message);
        announce(message);
      } finally {
        if (isCurrentEvent(requestProgramId, requestEventId)) {
          setBusy(false);
        }
      }
    },
    [
      load,
      mutationOutcomeUnknown,
      onAttentionRefresh,
      detailStale,
      loadError,
      onMutationBlockChange,
      onWorkspaceRefresh,
      isCurrentEvent,
      eventId,
      programId,
    ]
  );

  // oxlint-disable-next-line eslint/complexity -- edit validation and attendance-aware confirmation are one transition boundary
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hasAttendance =
      detail?.event.has_attendance === true ||
      (detail?.participant_summary.checked_in ?? 0) > 0;
    const name = String(form.get("name") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const eventType = editingEventType;
    const identityChanged =
      name !== (detail?.event.name ?? "") ||
      location !== (detail?.event.location ?? "") ||
      eventType !==
        (detail?.event.event_type ?? COPY.programs.eventTypeOptions[0]);
    if (!name) {
      const message = COPY.programs.eventNameRequired;
      setActionError(message);
      announce(message);
      return;
    }
    if (hasAttendance && identityChanged && !editReason.trim()) {
      const message = COPY.programs.eventIdentityChangeReasonRequired;
      setActionError(message);
      announce(message);
      return;
    }
    void runAction(
      () =>
        updateEvent(programId, eventId, {
          name,
          location: location || null,
          event_type: eventType,
          ...(hasAttendance && identityChanged
            ? { reason: editReason.trim() }
            : {}),
        }),
      () => {
        clearManagementDraft(eventId, EVENT_DETAIL_DRAFT_ACTION);
        setEditing(false);
        // Any successful edit invalidates the prior deactivation's Undo
        // context; a stale Undo would silently re-open availability.
        setUndoAvailable(false);
        return hasAttendance
          ? COPY.programs.editWithAttendanceNotice
          : COPY.programs.eventSavedNotice;
      },
      {
        kind: "update",
        programId,
        eventId,
        expected: {
          name,
          location: location || null,
          eventType,
        },
      }
    );
  };

  const submitReschedule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAtIso = hkWallInputToIso(String(form.get("starts_at") ?? ""));
    const endsAtIso = hkWallInputToIso(String(form.get("ends_at") ?? ""));
    if (!startsAtIso || !endsAtIso || endsAtIso <= startsAtIso) {
      const message = COPY.programs.eventInvalidInterval;
      setActionError(message);
      announce(message);
      return;
    }
    void runAction(
      () =>
        updateEvent(programId, eventId, {
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          check_in_window_opens_at: hkWallInputToIso(
            String(form.get("opens_at") ?? "")
          ),
          check_in_window_closes_at: hkWallInputToIso(
            String(form.get("closes_at") ?? "")
          ),
        }),
      () => {
        clearManagementDraft(eventId, EVENT_DETAIL_DRAFT_ACTION);
        setEditing(false);
        setUndoAvailable(false);
        return COPY.programs.eventRescheduledNotice;
      },
      {
        kind: "update",
        programId,
        eventId,
        expected: {
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          opensAt: hkWallInputToIso(String(form.get("opens_at") ?? "")),
          closesAt: hkWallInputToIso(String(form.get("closes_at") ?? "")),
        },
      }
    );
  };

  const submitDeactivate = (confirmRequired: boolean) => {
    void runAction(
      () =>
        setEventAvailability(programId, eventId, "Inactive", confirmRequired),
      () => {
        setConfirmingDeactivate(false);
        setUndoAvailable(true);
        return COPY.programs.eventAvailabilityNotice;
      },
      {
        kind: "availability",
        programId,
        eventId,
        expected: { availability: "Inactive" },
      },
      /* oxlint-disable-next-line promise/prefer-await-to-callbacks -- runAction takes success/error callbacks by design; awaiting means reworking every call site */
      (error) => {
        // A concurrent enrollment/check-in can make the server require
        // confirmation even when the loaded summary looked safe; surface
        // the inline confirm with the server's fresh operation count
        // instead of a dead-end error.
        if (
          !confirmRequired &&
          error instanceof RpcError &&
          error.problem.code === "CONFIRMATION_REQUIRED"
        ) {
          const problem = error.problem as typeof error.problem & {
            open_operations?: unknown;
          };
          setDeactivateImpact(
            typeof problem.open_operations === "number"
              ? problem.open_operations
              : (detail?.participant_summary.checked_in ?? 0)
          );
          setConfirmingDeactivate(true);
          return true;
        }
        return false;
      }
    );
  };

  const submitActivate = () => {
    void runAction(
      () => setEventAvailability(programId, eventId, "Active"),
      () => {
        setUndoAvailable(false);
        return COPY.programs.eventAvailabilityRestoredNotice;
      },
      {
        kind: "availability",
        programId,
        eventId,
        expected: { availability: "Active" },
      }
    );
  };

  const submitCancel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasAttendance =
      detail?.event.has_attendance === true ||
      (detail?.participant_summary.checked_in ?? 0) > 0;
    if (hasAttendance) {
      const message = COPY.programs.cancelBlockedWithAttendance;
      setConfirmingCancel(false);
      setActionError(message);
      announce(message);
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("cancel_reason") ?? "").trim() || null;
    void runAction(
      () => cancelEvent(programId, eventId, reason),
      () => {
        setConfirmingCancel(false);
        setUndoAvailable(false);
        return COPY.programs.eventCancelledNotice;
      },
      {
        kind: "cancel",
        programId,
        eventId,
        expected: { status: "Cancelled" },
      },
      /* oxlint-disable-next-line promise/prefer-await-to-callbacks -- runAction takes success/error callbacks by design; awaiting means reworking every call site */
      (error) => {
        if (
          error instanceof RpcError &&
          (error.problem.code === "EVENT_CANCEL_BLOCKED" ||
            error.problem.code === "EVENT_CANCELLATION_BLOCKED")
        ) {
          const message = COPY.programs.cancelBlockedWithAttendance;
          setActionError(message);
          announce(message);
          return true;
        }
        return false;
      }
    );
  };

  const currentDetail = detail?.event.event_id === eventId ? detail : null;
  const switchingEvent = detail !== null && currentDetail === null;
  if (currentDetail === null) {
    const RecoveryHeading = canManage ? "h2" : "h1";
    if (!switchingEvent && loadError !== null) {
      const programHref = buildProgramsHref({
        mode: canManage ? "management" : "participant",
        programId,
        ...(canManage ? { departmentId, task: "events" as const } : {}),
        ...(canManage || origin === undefined ? {} : { origin }),
        hash,
      });
      return (
        <ScreenState
          kind="error"
          title={
            <RecoveryHeading
              ref={recoveryRef}
              className="m-0 text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
              tabIndex={-1}
            >
              {COPY.programs.eventDetailRecoveryTitle}
            </RecoveryHeading>
          }
          description={loadError}
          action={
            <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
              <Button
                type="button"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                onClick={() => void load()}
              >
                {COPY.error.retry}
              </Button>
              {programHref !== "/programs" && (
                <Button
                  asChild
                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                  variant="outline"
                >
                  <Link href={programHref}>
                    {COPY.programs.eventDetailViewProgram}
                  </Link>
                </Button>
              )}
              {!canManage && (
                <Button
                  asChild
                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                  variant="outline"
                >
                  <Link href={backHref} replace={backReplace} onClick={onBack}>
                    {COPY.programs.backToOrigin}
                  </Link>
                </Button>
              )}
              <Button
                asChild
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
              >
                <Link href="/programs">
                  {COPY.programs.eventDetailBackToCatalog}
                </Link>
              </Button>
            </div>
          }
          aria-label={COPY.programs.eventDetailTitle}
        />
      );
    }
    return (
      <ScreenState
        kind="loading"
        title={
          <RecoveryHeading
            ref={recoveryRef}
            className="m-0 text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]"
            tabIndex={-1}
          >
            {COPY.programs.eventDetailLoading}
          </RecoveryHeading>
        }
        aria-label={COPY.programs.eventDetailTitle}
      >
        <ScreenLoadingRows count={2} label={COPY.programs.eventDetailLoading} />
      </ScreenState>
    );
  }
  const { event, leaders, participant_summary } = currentDetail;
  const cancelled = event.status === "Cancelled";
  const phase = eventPhase(event);
  const hasAttendance =
    event.has_attendance === true || participant_summary.checked_in > 0;
  const attendanceHref = `/events?eventId=${encodeURIComponent(event.event_id)}`;
  if (!canManage) {
    const programName = event.program_name ?? event.program_id;
    const checkInOpen = phase === "open";
    const scanHref = `/scanner?event=${encodeURIComponent(event.event_id)}`;
    const eventTitle =
      event.name ??
      (event.program_name
        ? COPY.programs.eventFallbackTitle.replace("{name}", event.program_name)
        : hkWallDateTimeLabel(event.starts_at));
    const participantProgramHref = buildProgramsHref({
      mode: "participant",
      programId,
      hash,
    });
    const whenLabel = `${hkShortDateLabel(event.starts_at)}${hkShortTimeRange(event.starts_at, event.ends_at)}`;
    const instructionsHeadingId = "participant-event-instructions";
    const participantAttendanceTone =
      ownAttendance?.state === "Present"
        ? "success"
        : ownAttendance?.state === "Cancelled"
          ? "danger"
          : "pending";
    const participantCanScan =
      checkInOpen && ownAttendance?.state === "Not Yet";
    const participantCancelReason = event.cancel_reason?.trim() || null;
    const participantInstruction = cancelled
      ? COPY.attendance.eventCancelled
      : ownAttendanceError ||
          ownAttendanceUnavailable ||
          !ownAttendance ||
          ownAttendance.state === null
        ? COPY.programs.participantAttendanceUnavailable
        : ownAttendance.state === "Not Yet"
          ? checkInOpen
            ? COPY.programs.eventInstructions
            : phase === "future"
              ? event.check_in_window_opens_at
                ? `${COPY.programs.eventInstructionsClosed} ${COPY.programs.eventCheckInWindowOpensAt} ${hkShortDateLabel(event.check_in_window_opens_at)} ${hkShortTimeLabel(event.check_in_window_opens_at)}`
                : COPY.programs.eventInstructionsClosed
              : COPY.programs.eventInstructionsEnded
          : COPY.programs.participantAttendanceRecorded;

    return (
      <section
        className="grid min-w-0 gap-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--screen-ink)]"
        aria-labelledby="participant-event-title"
        aria-busy={busy}
      >
        <ScreenHeader
          level="child"
          backLabel={COPY.programs.backToOrigin}
          backHref={backHref}
          backReplace={backReplace}
          onBack={onBack}
          title={eventTitle}
          lead={programName}
          headingId="participant-event-title"
          status={
            cancelled ? (
              <ScreenStatus
                role="status"
                tone="danger"
                aria-label={COPY.attendance.eventCancelled}
              >
                {COPY.attendance.eventCancelled}
              </ScreenStatus>
            ) : phase === "open" ? (
              <ScreenStatus
                role="status"
                tone="success"
                aria-label={COPY.programs.checkInAvailable}
              >
                {COPY.programs.checkInAvailable}
              </ScreenStatus>
            ) : (
              <ScreenStatus
                role="status"
                tone="pending"
                aria-label={
                  phase === "future"
                    ? COPY.programs.eventNotStarted
                    : COPY.programs.eventEnded
                }
              >
                {phase === "future"
                  ? COPY.programs.eventNotStarted
                  : COPY.programs.eventEnded}
              </ScreenStatus>
            )
          }
        />

        <ScreenCard asChild>
          <article>
            <p className="m-0 flex min-w-0 items-start gap-3 wrap-anywhere font-semibold leading-[1.6]">
              <EventFactIcon name="calendar" />
              <time dateTime={event.starts_at}>{whenLabel}</time>
            </p>
            {event.location && (
              <p className="m-0 flex min-w-0 items-start gap-3 wrap-anywhere leading-[1.6]">
                <EventFactIcon name="pin" />
                <span>{event.location}</span>
              </p>
            )}
          </article>
        </ScreenCard>

        <ScreenSection title={COPY.programs.participantAttendance}>
          {ownAttendanceLoading ? (
            <output className="text-[var(--screen-muted)]" aria-live="polite">
              {COPY.programs.participantAttendanceLoading}
            </output>
          ) : ownAttendanceError ? (
            <Alert variant="destructive" className="grid gap-2">
              <span>{ownAttendanceError}</span>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => void loadOwnAttendance()}
                disabled={ownAttendanceLoading}
              >
                {COPY.error.retry}
              </Button>
            </Alert>
          ) : ownAttendance && ownAttendance.state !== null ? (
            <div className="grid min-w-0 gap-2">
              <ScreenStatus tone={participantAttendanceTone}>
                {participantAttendanceLabel(ownAttendance.state)}
              </ScreenStatus>
              {ownAttendance.attendance?.checked_in_at && (
                <ScreenRowMeta>
                  {COPY.programs.participantAttendanceTime}：
                  {hkWallDateTimeLabel(ownAttendance.attendance.checked_in_at)}
                </ScreenRowMeta>
              )}
              {ownAttendance.disposition?.reason && (
                <ScreenRowMeta>
                  {COPY.programs.participantAttendanceReason}：
                  {ownAttendance.disposition.reason}
                </ScreenRowMeta>
              )}
            </div>
          ) : (
            <ScreenState
              kind="empty"
              title={
                ownAttendanceUnavailableReason === "forbidden"
                  ? COPY.programs.participantAttendanceForbidden
                  : ownAttendanceUnavailableReason === "not-found"
                    ? COPY.programs.participantAttendanceNotFound
                    : COPY.programs.participantAttendanceUnavailable
              }
              action={
                ownAttendanceUnavailable ? (
                  <Button asChild variant="outline">
                    <Link href={participantProgramHref}>
                      {COPY.programs.eventDetailViewProgram}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </ScreenSection>

        <ScreenSection
          headingId={instructionsHeadingId}
          title={COPY.programs.checkInInstructionsHeading}
        >
          <div className="grid min-w-0 gap-1">
            <p className="m-0 min-w-0 max-w-[65ch] wrap-anywhere leading-[1.6] text-[var(--screen-muted)]">
              {participantInstruction}
            </p>
            {cancelled && participantCancelReason && (
              <ScreenRowMeta className="text-[var(--screen-danger)]">
                {COPY.programs.cancelledReason.replace(
                  "{reason}",
                  participantCancelReason
                )}
              </ScreenRowMeta>
            )}
          </div>
        </ScreenSection>

        {participantCanScan && (
          <ScreenCard className="mt-0" data-action-bar>
            <Button
              asChild
              className="h-auto w-full justify-center whitespace-normal bg-[var(--screen-accent)] text-center text-white hover:bg-[var(--screen-accent-deep)]"
              data-action-state="available"
            >
              <Link href={scanHref}>{COPY.programs.goToScan}</Link>
            </Button>
          </ScreenCard>
        )}
      </section>
    );
  }

  const beginEdit = () => {
    startEditing("edit", event);
  };
  const beginReschedule = () => {
    startEditing("reschedule", event);
  };
  const cancelEditing = () => {
    clearManagementDraft(eventId, EVENT_DETAIL_DRAFT_ACTION);
    setEditing(false);
    setEditReason("");
  };
  const requestDeactivate = () => {
    if (event.availability === "Active" && participant_summary.checked_in > 0) {
      menuFocusTargetRef.current = "deactivate";
      setDeactivateImpact(participant_summary.checked_in);
      setConfirmingDeactivate(true);
      return;
    }
    if (event.availability === "Active") {
      submitDeactivate(false);
      return;
    }
    submitActivate();
  };
  const requestCancel = () => {
    if (hasAttendance) {
      const message = COPY.programs.cancelBlockedWithAttendance;
      setActionError(message);
      announce(message);
      return;
    }
    menuFocusTargetRef.current = "cancel";
    setConfirmingCancel(true);
  };
  const primaryAction =
    phase === "future" ? (
      <Button
        type="button"
        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
        disabled={eventActionBlocked}
        onClick={() => setShowCheckInSheet(true)}
      >
        {COPY.attendance.eventCheckInSheetOpen}
      </Button>
    ) : phase === "open" ? (
      <Button
        asChild
        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
        data-action-state="available"
      >
        <Link
          href={attendanceHref}
          aria-disabled={eventActionBlocked}
          onClick={(clickEvent) => {
            if (eventActionBlocked) {
              clickEvent.preventDefault();
            }
          }}
        >
          {COPY.attendance.eventAttendanceOpen}
        </Link>
      </Button>
    ) : phase === "past" ? (
      <Button
        asChild
        className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
        data-action-state="available"
      >
        <Link
          href={attendanceHref}
          aria-disabled={eventActionBlocked}
          onClick={(clickEvent) => {
            if (eventActionBlocked) {
              clickEvent.preventDefault();
            }
          }}
        >
          {COPY.programs.eventAttendanceViewRecord}
        </Link>
      </Button>
    ) : null;

  return (
    <section
      className="grid min-w-0 gap-[var(--screen-section-gap)] text-[var(--screen-ink)]"
      aria-label={COPY.programs.eventDetailTitle}
      aria-busy={busy}
    >
      <ScreenHeader
        level="child"
        title={event.name ?? hkWallDateTimeLabel(event.starts_at)}
        lead={event.program_name}
        headingId="management-event-detail-title"
        backHref={backHref}
        backLabel={COPY.programs.eventDetailBack}
        backReplace={backReplace}
        onBack={onBack}
        status={
          <ScreenStatus
            tone={
              cancelled ? "danger" : phase === "open" ? "success" : "pending"
            }
          >
            {cancelled
              ? STATUS_LABEL[event.status]
              : phase === "open"
                ? COPY.programs.checkInAvailable
                : phase === "future"
                  ? COPY.programs.eventNotStarted
                  : COPY.programs.eventEnded}
          </ScreenStatus>
        }
      />
      {!cancelled && (
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          {primaryAction}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={eventActionBlocked}
              >
                {COPY.programs.eventMoreActions}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(focusEvent) => {
                const target = menuFocusTargetRef.current;
                if (!target) {
                  return;
                }
                focusEvent.preventDefault();
                menuFocusTargetRef.current = null;
                window.setTimeout(() => {
                  (target === "deactivate"
                    ? confirmRef.current
                    : cancelConfirmRef.current
                  )
                    ?.querySelector("button")
                    ?.focus();
                }, 0);
              }}
            >
              {phase !== "future" && event.manual_check_in_code && (
                <DropdownMenuItem onSelect={() => setShowCheckInSheet(true)}>
                  {COPY.attendance.eventCheckInSheetOpen}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={beginEdit}>
                {COPY.programs.eventEdit}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={beginReschedule}>
                {COPY.programs.eventReschedule}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={requestDeactivate}>
                {event.availability === "Active"
                  ? COPY.programs.eventAvailabilityDeactivate
                  : COPY.programs.eventAvailabilityActivate}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={requestCancel}>
                {COPY.programs.cancelEvent}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
            <span>{notice}</span>
            {undoAvailable && !cancelled && (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                disabled={eventActionBlocked}
                onClick={submitActivate}
              >
                {COPY.programs.eventAvailabilityUndo}
              </Button>
            )}
          </div>
        </Alert>
      )}
      {actionError !== null && (
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          <Alert variant="destructive">{actionError}</Alert>
          {(mutationOutcomeUnknown || detailStale || loadError !== null) && (
            <Button
              type="button"
              variant="outline"
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              onClick={() =>
                void (mutationOutcomeUnknown
                  ? reconcileMutationOutcome()
                  : retryConfirmedRead())
              }
              disabled={busy}
            >
              {COPY.programs.workspaceRetryRefresh}
            </Button>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-[var(--screen-utility-gap)]">
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          <ScreenRowMeta>
            {hkWallDateTimeLabel(event.starts_at)} —{" "}
            {hkWallDateTimeLabel(event.ends_at)}
          </ScreenRowMeta>
          <ScreenStatus
            tone={event.source === "SCHEDULE" ? "accent" : "neutral"}
          >
            {event.source === "SCHEDULE"
              ? COPY.programs.eventScheduleSource
              : COPY.programs.eventManualSource}
          </ScreenStatus>
          <ScreenStatus tone="neutral">
            {event.event_type ?? COPY.programs.eventTypeOptions[5]}
          </ScreenStatus>
          <ScreenStatus tone="neutral">
            {COPY.programs.repeatLabel.replace(
              "{tag}",
              event.recurrence_tag ?? COPY.programs.recurrenceNone
            )}
          </ScreenStatus>
          {event.source === "SCHEDULE" && event.occurrence_date && (
            <ScreenStatus tone="neutral">
              {COPY.programs.eventOriginalOccurrence}: {event.occurrence_date}
            </ScreenStatus>
          )}
          {event.availability !== undefined && (
            <ScreenStatus
              tone={event.availability === "Active" ? "success" : "danger"}
            >
              {AVAILABILITY_LABEL[event.availability]}
            </ScreenStatus>
          )}
          {event.exception !== null && event.exception !== undefined && (
            <ScreenStatus tone="pending">
              {event.exception.action === "RESCHEDULE"
                ? COPY.programs.eventRescheduledBadge.replace(
                    "{time}",
                    event.exception.new_start_time ?? ""
                  )
                : COPY.programs.eventCancelledBadge}
            </ScreenStatus>
          )}
        </div>
        {cancelled && event.cancel_reason !== null && (
          <ScreenRowMeta className="text-[var(--screen-danger)]">
            {COPY.programs.cancelledReason.replace(
              "{reason}",
              event.cancel_reason
            )}
          </ScreenRowMeta>
        )}
      </div>

      <ScreenCard>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
          {event.location !== null && event.location !== undefined && (
            <div>
              <dt className="text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
                {COPY.programs.eventLocation}
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-semibold">
                {event.location}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
              {COPY.programs.eventCheckInWindow}
            </dt>
            <dd className="m-0 mt-1 wrap-anywhere">
              {event.check_in_window_opens_at !== null &&
              event.check_in_window_opens_at !== undefined
                ? `${COPY.programs.eventCheckInWindowOpensAt} ${hkWallDateTimeLabel(event.check_in_window_opens_at)}；${
                    event.check_in_window_closes_at !== null &&
                    event.check_in_window_closes_at !== undefined
                      ? `${COPY.programs.eventCheckInWindowClosesAt} ${hkWallDateTimeLabel(event.check_in_window_closes_at)}`
                      : COPY.programs.eventCheckInWindowClosesAt
                  }`
                : COPY.programs.hkTimeMarker}
            </dd>
          </div>
        </dl>
      </ScreenCard>

      <ScreenSection title={COPY.programs.eventDetailParticipantSummary}>
        <div className="grid grid-cols-2 border-y border-[var(--screen-line)]">
          <div className="grid gap-0.5 py-3">
            <ScreenRowMeta>
              {COPY.programs.eventActiveEnrollments.replace(
                "{count}",
                String(participant_summary.active_enrollments)
              )}
            </ScreenRowMeta>
          </div>
          <div className="grid gap-0.5 border-l border-[var(--screen-line)] py-3 pl-4">
            <ScreenRowMeta>
              {COPY.programs.eventCheckedIn.replace(
                "{count}",
                String(participant_summary.checked_in)
              )}
            </ScreenRowMeta>
          </div>
        </div>
      </ScreenSection>

      <ScreenSection title={COPY.attendance.rosterTitle}>
        <p className="m-0 min-w-0 max-w-[65ch] wrap-anywhere leading-[1.6] text-[var(--screen-muted)]">
          {COPY.attendance.eventAttendanceLead}
        </p>
        {!cancelled && (
          <ScreenRowMeta>
            {phase === "open"
              ? COPY.attendance.eventAttendanceOpen
              : phase === "future"
                ? COPY.attendance.eventCheckInSheetOpen
                : COPY.programs.eventAttendanceViewRecord}
          </ScreenRowMeta>
        )}
      </ScreenSection>
      {showCheckInSheet && !cancelled && (
        <EventCheckInSheet
          event={event}
          onClose={() => setShowCheckInSheet(false)}
          onAuthRequired={onAuthRequired}
        />
      )}

      <ScreenSection title={COPY.programs.identityAssignments}>
        {leaders.length === 0 ? (
          <ScreenState
            kind="empty"
            title={COPY.programs.noIdentityAssignments}
          />
        ) : (
          <ScreenRowList>
            <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
              {leaders.map((leader: ProgramIdentityAssignment) => (
                <li
                  key={`${leader.user_id}:${leader.role_definition_id}`}
                  className="min-w-0"
                  aria-label={`${leader.user_name ?? leader.username ?? leader.user_id}，身份組：${leader.label}`}
                >
                  <ScreenRow>
                    <ScreenRowMain>
                      <ScreenRowTitle>
                        {leader.user_name ?? leader.username ?? leader.user_id}
                      </ScreenRowTitle>
                      <ScreenRowMeta>{leader.label}</ScreenRowMeta>
                    </ScreenRowMain>
                  </ScreenRow>
                </li>
              ))}
            </ul>
          </ScreenRowList>
        )}
      </ScreenSection>

      {canManage && !cancelled && (
        <>
          <ScreenSection title={COPY.programs.eventAvailability}>
            {confirmingDeactivate ? (
              <ScreenCard role="alert" ref={confirmRef} tone="default">
                <p className="m-0 wrap-anywhere">
                  {COPY.programs.eventAvailabilityConfirmBody.replace(
                    "{count}",
                    String(deactivateImpact)
                  )}
                </p>
                <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                  <Button
                    type="button"
                    className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                    disabled={eventActionBlocked}
                    onClick={() => submitDeactivate(true)}
                  >
                    {COPY.programs.eventAvailabilityConfirmProceed}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                    disabled={eventActionBlocked}
                    onClick={() => setConfirmingDeactivate(false)}
                  >
                    {COPY.programs.keepEvent}
                  </Button>
                </div>
              </ScreenCard>
            ) : (
              <ScreenRowMeta>
                {event.availability === "Active"
                  ? COPY.programs.eventAvailable
                  : COPY.programs.eventUnavailable}
              </ScreenRowMeta>
            )}
          </ScreenSection>

          <ScreenSection
            title={
              editingIntent === "reschedule"
                ? COPY.programs.eventReschedule
                : COPY.programs.eventEditTitle
            }
          >
            {editing ? (
              <ScreenCard asChild>
                <ScreenEditor
                  data-edit-intent={editingIntent}
                  data-testid="event-edit-form"
                  onSubmit={
                    editingIntent === "reschedule"
                      ? submitReschedule
                      : submitEdit
                  }
                >
                  {editingIntent === "edit" && (
                    <>
                      <ScreenField
                        htmlFor="management-event-name"
                        label={COPY.programs.eventName}
                      >
                        <Input
                          id="management-event-name"
                          autoFocus
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="text"
                          name="name"
                          value={editName}
                          onChange={(changeEvent) =>
                            setEditName(changeEvent.target.value)
                          }
                          placeholder={COPY.programs.eventNamePlaceholder}
                        />
                      </ScreenField>
                      {hasAttendance && (
                        <ScreenField
                          htmlFor="management-event-edit-reason"
                          label={COPY.programs.eventIdentityChangeReason}
                        >
                          <Input
                            id="management-event-edit-reason"
                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                            type="text"
                            name="edit_reason"
                            value={editReason}
                            onChange={(changeEvent) =>
                              setEditReason(changeEvent.target.value)
                            }
                            placeholder={
                              COPY.programs.eventIdentityChangeReasonPlaceholder
                            }
                            required={false}
                          />
                        </ScreenField>
                      )}
                      <ScreenField
                        htmlFor="management-event-type"
                        label={COPY.programs.eventType}
                      >
                        <Select
                          value={editingEventType}
                          onValueChange={(value) =>
                            setEditingEventType(value as EventType)
                          }
                        >
                          <SelectTrigger
                            id="management-event-type"
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
                        htmlFor="management-event-location"
                        label={COPY.programs.eventLocation}
                      >
                        <Input
                          id="management-event-location"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="text"
                          name="location"
                          value={editLocation}
                          onChange={(changeEvent) =>
                            setEditLocation(changeEvent.target.value)
                          }
                          placeholder={COPY.programs.eventLocationPlaceholder}
                        />
                      </ScreenField>
                    </>
                  )}
                  {editingIntent === "reschedule" && (
                    <>
                      <ScreenField
                        htmlFor="management-event-start"
                        label={COPY.programs.eventStart}
                      >
                        <Input
                          id="management-event-start"
                          autoFocus
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="datetime-local"
                          name="starts_at"
                          required
                          value={editStartsAt}
                          onChange={(changeEvent) =>
                            setEditStartsAt(changeEvent.target.value)
                          }
                        />
                      </ScreenField>
                      <ScreenField
                        htmlFor="management-event-end"
                        label={COPY.programs.eventEnd}
                      >
                        <Input
                          id="management-event-end"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="datetime-local"
                          name="ends_at"
                          required
                          value={editEndsAt}
                          onChange={(changeEvent) =>
                            setEditEndsAt(changeEvent.target.value)
                          }
                        />
                      </ScreenField>
                      <ScreenField
                        htmlFor="management-event-opens"
                        label={COPY.programs.eventCheckInWindowOpensAt}
                      >
                        <Input
                          id="management-event-opens"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="datetime-local"
                          name="opens_at"
                          required={
                            event.check_in_window_opens_at !== null &&
                            event.check_in_window_opens_at !== undefined
                          }
                          value={editOpensAt}
                          onChange={(changeEvent) =>
                            setEditOpensAt(changeEvent.target.value)
                          }
                        />
                      </ScreenField>
                      <ScreenField
                        htmlFor="management-event-closes"
                        label={COPY.programs.eventCheckInWindowClosesAt}
                      >
                        <Input
                          id="management-event-closes"
                          className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                          type="datetime-local"
                          name="closes_at"
                          required={
                            event.check_in_window_closes_at !== null &&
                            event.check_in_window_closes_at !== undefined
                          }
                          value={editClosesAt}
                          onChange={(changeEvent) =>
                            setEditClosesAt(changeEvent.target.value)
                          }
                        />
                      </ScreenField>
                    </>
                  )}
                  <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                    <Button
                      type="submit"
                      disabled={eventActionBlocked}
                      className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                    >
                      {editingIntent === "reschedule"
                        ? COPY.programs.eventRescheduleSave
                        : COPY.programs.eventEditSave}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      disabled={eventActionBlocked}
                      onClick={cancelEditing}
                    >
                      {editingIntent === "reschedule"
                        ? COPY.programs.eventRescheduleCancel
                        : COPY.programs.eventEditCancel}
                    </Button>
                  </div>
                </ScreenEditor>
              </ScreenCard>
            ) : (
              <ScreenRowMeta>{COPY.programs.eventEdit}</ScreenRowMeta>
            )}
          </ScreenSection>

          <ScreenSection title={COPY.programs.cancelEvent}>
            {confirmingCancel ? (
              <ScreenEditor noValidate onSubmit={submitCancel}>
                <ScreenCard role="alert" ref={cancelConfirmRef}>
                  <strong>{COPY.programs.cancelMeetingConfirmTitle}</strong>
                  <span>{COPY.programs.cancelMeetingConfirmBody}</span>
                  <ScreenField
                    htmlFor="management-cancel-reason"
                    label={COPY.programs.cancelReason}
                  >
                    <Input
                      id="management-cancel-reason"
                      className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                      type="text"
                      name="cancel_reason"
                      placeholder={COPY.programs.cancelReasonPlaceholder}
                    />
                  </ScreenField>
                  <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
                    <Button
                      type="submit"
                      disabled={eventActionBlocked}
                      className="w-fit bg-[var(--screen-danger)] text-white hover:bg-[var(--screen-danger)]"
                    >
                      {COPY.programs.confirmCancel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                      disabled={eventActionBlocked}
                      onClick={() => setConfirmingCancel(false)}
                    >
                      {COPY.programs.keepMeeting}
                    </Button>
                  </div>
                </ScreenCard>
              </ScreenEditor>
            ) : (
              <ScreenRowMeta>{COPY.programs.eventMoreActions}</ScreenRowMeta>
            )}
          </ScreenSection>
        </>
      )}
    </section>
  );
};
