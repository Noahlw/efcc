"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { RpcError } from "@/lib/api";
import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceResolveLatest,
} from "@/lib/attendance";
import { attendanceEventLabel } from "@/lib/attendance-display";
import { entryFromValue } from "@/lib/attendance-entry";
import { errorCopyFor, COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { resolveAttendance } from "@/lib/programs/program-api";
import { parseScannerIntent } from "@/lib/scanner-intent";
import { useQrCamera } from "@/lib/use-qr-camera";

type StatusTone = "info" | "success" | "error";
type AttendanceView = "scan" | "chooser" | "outcome";
interface AttendanceOutcome {
  kind: "window-not-open" | "cancelled" | "not-enrolled";
  latest: AttendanceResolveLatest;
}

export interface AttendanceFlow {
  input: string;
  fromQr: boolean;
  setInput: (value: string) => void;
  events: AttendanceEvent[];
  selected: AttendanceEvent | null;
  setSelected: (event: AttendanceEvent | null) => void;
  intendedEvent: AttendanceEvent | null;
  mismatchEvent: AttendanceEventSummary | null;
  busy: boolean;
  status: string;
  tone: StatusTone;
  view: AttendanceView;
  outcome: AttendanceOutcome | null;
  cameraUnavailable: boolean;
  cameraPermissionDenied: boolean;
  cameraUnsupported: boolean;
  cameraAvailable: boolean | null;
  showStatus: (message: string, tone?: StatusTone) => void;
  resolve: (value: string, fromQr?: boolean) => Promise<AttendanceEvent[]>;
  resetToScan: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOpen: boolean;
  cameraReady: boolean;
  startCamera: () => void;
  stopCamera: () => void;
  retryCamera: () => void;
}

/**
 * Self and guest surfaces share only this entry-resolution state machine. The
 * wrappers own their submit contracts and fields, so Self never gains guest
 * or assisted controls by accident.
 */
export function useAttendanceFlow(
  inputRef: RefObject<HTMLInputElement | null>,
  options: {
    cameraFirst?: boolean;
    guestFlow?: boolean;
    phoneOnly?: boolean;
    reportCameraUnavailable?: boolean;
    cameraEnabled?: boolean;
    invalidEntryMessage?: string;
    offlineResolveMessage?: string;
  } = {}
): AttendanceFlow {
  const [inputValue, setInputValue] = useState("");
  const [fromQr, setFromQr] = useState(false);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selected, setSelectedState] = useState<AttendanceEvent | null>(null);
  const [intendedEvent, setIntendedEvent] = useState<AttendanceEvent | null>(
    null
  );
  const [mismatchEvent, setMismatchEvent] =
    useState<AttendanceEventSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");
  const [view, setView] = useState<AttendanceView>("scan");
  const [outcome, setOutcome] = useState<AttendanceOutcome | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraUnsupported, setCameraUnsupported] = useState(false);
  const showStatus = (message: string, nextTone: StatusTone = "info") => {
    setStatus(message);
    setTone(nextTone);
  };
  const showCameraDecodeFailure = () => {
    setCameraUnavailable(true);
    setCameraPermissionDenied(false);
    setCameraUnsupported(true);
    const message = COPY.attendance.cameraUnsupportedBody;
    showStatus(message, "error");
    announce(message);
    inputRef.current?.focus();
  };

  const setInput = (value: string) => {
    setInputValue(value);
    setFromQr(false);
    setEvents([]);
    setSelectedState(null);
    setOutcome(null);
    setMismatchEvent(null);
    setView("scan");
    setStatus("");
  };

  const setSelected = (event: AttendanceEvent | null) => {
    setSelectedState(event);
    setMismatchEvent(null);
    setOutcome(null);
    setView("scan");
  };

  const latestAsEventSummary = (
    latest: AttendanceResolveLatest
  ): AttendanceEventSummary | null => {
    if (!latest.event_id || !latest.starts_at || !latest.ends_at) {
      return null;
    }
    return {
      event_id: latest.event_id,
      program_id: latest.program_id,
      program_name: latest.program_name,
      name: latest.event_name ?? null,
      location: latest.location ?? null,
      starts_at: latest.starts_at,
      ends_at: latest.ends_at,
      check_in_window_opens_at: latest.check_in_window_opens_at ?? "",
      check_in_window_closes_at: latest.check_in_window_closes_at ?? "",
      status: latest.status,
      availability: latest.availability,
    };
  };

  const resetToScan = () => {
    stopCamera();
    setInputValue("");
    setFromQr(false);
    setEvents([]);
    setSelectedState(null);
    setIntendedEvent(null);
    setMismatchEvent(null);
    setOutcome(null);
    setView("scan");
    setCameraUnavailable(false);
    setCameraPermissionDenied(false);
    setCameraUnsupported(false);
    setStatus("");
    setTone("info");
  };
  async function resolve(
    value: string,
    isFromQr = false,
    requestedEventId: string | null = null,
    fromCamera = false
  ) {
    const entry = entryFromValue(value);
    const contextEventId = requestedEventId ?? intendedEvent?.event_id ?? null;
    const contextOnly = Boolean(contextEventId && !entry.value);
    if (!entry.value && !contextEventId) {
      if (fromCamera && options.cameraFirst === true) {
        showCameraDecodeFailure();
        return [];
      }
      const message = COPY.attendance.inputLabel;
      setFromQr(false);
      setEvents([]);
      setSelectedState(null);
      setOutcome(null);
      setView("scan");
      showStatus(message);
      announce(message);
      inputRef.current?.focus();
      return [];
    }
    const resolvedFromQr = isFromQr || entry.fromQr;
    setInputValue(entry.value);
    setFromQr(resolvedFromQr);
    if (requestedEventId) {
      setIntendedEvent((current) =>
        current?.event_id === requestedEventId ? current : null
      );
    }
    setBusy(true);
    setCameraUnavailable(false);
    setCameraPermissionDenied(false);
    setCameraUnsupported(false);
    setOutcome(null);
    setView("scan");
    showStatus(COPY.attendance.resolving);
    announce(COPY.attendance.resolving);
    setEvents([]);
    setSelectedState(null);
    setMismatchEvent(null);
    try {
      const result = contextOnly
        ? await resolveAttendance({ event: contextEventId as string })
        : resolvedFromQr
          ? await resolveAttendance({ program_token: entry.value })
          : await resolveAttendance({ entry: entry.value });
      const resolvedEvents = result.events ?? [];
      const latest = result.latest;
      if (contextOnly) {
        setEvents([]);
        if (resolvedEvents.length === 1) {
          setIntendedEvent(resolvedEvents[0]);
          setSelectedState(null);
          const message = COPY.attendance.eventContextReady.replace(
            "{event}",
            attendanceEventLabel(resolvedEvents[0])
          );
          showStatus(message);
          announce(message);
        } else {
          setIntendedEvent(null);
        }
      } else if (contextEventId) {
        const matchingEvent = resolvedEvents.find(
          (event) => event.event_id === contextEventId
        );
        if (matchingEvent) {
          setEvents([matchingEvent]);
          setIntendedEvent(matchingEvent);
          setSelected(matchingEvent);
          const message = attendanceEventLabel(matchingEvent);
          showStatus(message);
          announce(message);
        } else if (resolvedEvents.length > 0) {
          const otherEvent = resolvedEvents[0];
          setEvents([]);
          setSelectedState(null);
          setMismatchEvent(otherEvent);
          const message = COPY.attendance.eventCredentialMismatch.replace(
            "{event}",
            attendanceEventLabel(otherEvent)
          );
          showStatus(message, "error");
          announce(message);
        } else {
          setEvents([]);
          const otherEvent = latest ? latestAsEventSummary(latest) : null;
          if (otherEvent && otherEvent.event_id !== contextEventId) {
            setMismatchEvent(otherEvent);
            const message = COPY.attendance.eventCredentialMismatch.replace(
              "{event}",
              attendanceEventLabel(otherEvent)
            );
            showStatus(message, "error");
            announce(message);
          }
        }
      } else {
        setEvents(resolvedEvents);
      }
      const latestIsMismatch = Boolean(
        contextEventId &&
        resolvedEvents.length === 0 &&
        latest?.event_id &&
        latest.event_id !== contextEventId
      );
      if (
        !latestIsMismatch &&
        (contextOnly || (contextEventId && resolvedEvents.length === 0)) &&
        latest
      ) {
        setSelectedState(null);
        setView("outcome");
        const nextOutcome: AttendanceOutcome = {
          kind:
            latest.status === "Cancelled"
              ? "cancelled"
              : options.guestFlow
                ? "window-not-open"
                : !result.enrolled
                  ? "not-enrolled"
                  : "window-not-open",
          latest,
        };
        setOutcome(nextOutcome);
        showStatus("");
        announce(
          nextOutcome.kind === "not-enrolled"
            ? COPY.attendance.outcomeNotEnrolledTitle
            : nextOutcome.kind === "cancelled"
              ? COPY.attendance.outcomeCancelledTitle
              : COPY.attendance.outcomeWindowTitle
        );
      } else if (
        !contextOnly &&
        !contextEventId &&
        resolvedEvents.length === 1
      ) {
        setSelected(resolvedEvents[0]);
        const message = attendanceEventLabel(resolvedEvents[0]);
        showStatus(message);
        announce(message);
      } else if (!contextOnly && !contextEventId && resolvedEvents.length > 1) {
        setSelectedState(null);
        setView("chooser");
        const message = COPY.attendance.chooseMeeting;
        showStatus(message);
        announce(message);
      } else if (!contextOnly && !contextEventId && !result.latest) {
        setSelectedState(null);
        if (fromCamera && options.cameraFirst === true) {
          showCameraDecodeFailure();
          return [];
        }
        setView("scan");
        const message =
          options.invalidEntryMessage ??
          (options.cameraFirst
            ? COPY.attendance.invalidEntryCode
            : COPY.attendance.invalidEntry);
        showStatus(message, "error");
        announce(message);
      } else if (
        !contextOnly &&
        !contextEventId &&
        !result.enrolled &&
        latest
      ) {
        setSelectedState(null);
        setView("outcome");
        const nextOutcome: AttendanceOutcome = {
          kind:
            latest.status === "Cancelled"
              ? "cancelled"
              : options.guestFlow
                ? "window-not-open"
                : "not-enrolled",
          latest,
        };
        setOutcome(nextOutcome);
        showStatus("");
        announce(
          nextOutcome.kind === "not-enrolled"
            ? COPY.attendance.outcomeNotEnrolledTitle
            : nextOutcome.kind === "cancelled"
              ? COPY.attendance.outcomeCancelledTitle
              : COPY.attendance.outcomeWindowTitle
        );
      } else if (
        !contextOnly &&
        !contextEventId &&
        latest?.status === "Cancelled"
      ) {
        setSelectedState(null);
        setView("outcome");
        const nextOutcome: AttendanceOutcome = {
          kind: "cancelled",
          latest,
        };
        setOutcome(nextOutcome);
        showStatus("");
        announce(COPY.attendance.outcomeCancelledTitle);
      } else if (contextOnly || contextEventId) {
        const message =
          options.invalidEntryMessage ?? COPY.attendance.invalidEntry;
        showStatus(message, "error");
        announce(message);
      } else if (!contextOnly && !contextEventId) {
        setSelectedState(null);
        setView("outcome");
        const nextOutcome: AttendanceOutcome = {
          kind: "window-not-open",
          latest: latest as AttendanceResolveLatest,
        };
        setOutcome(nextOutcome);
        showStatus("");
        announce(COPY.attendance.outcomeWindowTitle);
      }
      return resolvedEvents;
    } catch (error) {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const networkFailure =
        isOffline ||
        !(error instanceof RpcError) ||
        error.problem.code === "NETWORK_ERROR" ||
        error.problem.code === "UNAVAILABLE";
      if (fromCamera && options.cameraFirst === true && !networkFailure) {
        showCameraDecodeFailure();
        return [];
      }
      const noEligibleEvents =
        error instanceof RpcError &&
        error.problem.code === "CHECK_IN_NOT_FOUND" &&
        resolvedFromQr;
      let message: string;
      if (networkFailure && options.offlineResolveMessage) {
        message = options.offlineResolveMessage;
      } else if (networkFailure && options.cameraFirst && fromCamera) {
        message = COPY.attendance.offlineResolve;
      } else if (isOffline && options.cameraFirst) {
        message = COPY.attendance.offlineResolve;
      } else if (noEligibleEvents) {
        message = COPY.attendance.noEvents;
      } else if (error instanceof RpcError) {
        message = errorCopyFor(error.problem.code, error.problem.detail);
      } else {
        message = COPY.error.networkError;
      }
      if (fromCamera && options.cameraFirst && networkFailure) {
        setCameraUnavailable(true);
        setCameraPermissionDenied(false);
        setCameraUnsupported(false);
      }
      setEvents([]);
      setSelectedState(null);
      setMismatchEvent(null);
      setOutcome(null);
      setView("scan");
      showStatus(message, noEligibleEvents ? "info" : "error");
      announce(message);
      return [];
    } finally {
      setBusy(false);
    }
  }

  const {
    videoRef,
    cameraOpen,
    cameraReady,
    cameraAvailable,
    startCamera,
    stopCamera,
  } = useQrCamera({
    onDetect: (value) => {
      const entry = entryFromValue(value);
      setInputValue(entry.value);
      setFromQr(entry.fromQr);
      stopCamera();
      void resolve(
        entry.value,
        entry.fromQr,
        intendedEvent?.event_id ?? null,
        true
      );
    },
    onDenied: () => {
      setCameraUnavailable(true);
      setCameraPermissionDenied(options.cameraFirst === true);
      setCameraUnsupported(options.cameraFirst !== true);
      const message = options.cameraFirst
        ? COPY.attendance.cameraDeniedBody
        : COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
    },
    onUnsupported: () => {
      setCameraUnavailable(true);
      setCameraPermissionDenied(false);
      setCameraUnsupported(options.cameraFirst === true);
      const message = options.cameraFirst
        ? COPY.attendance.cameraUnsupportedBody
        : COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
    },
    onUnavailable: () => {
      setCameraUnavailable(true);
      setCameraPermissionDenied(false);
      setCameraUnsupported(options.cameraFirst === true);
      const message = options.cameraFirst
        ? COPY.attendance.cameraUnsupportedBody
        : COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
    },
    enabled: options.cameraEnabled !== false,
    phoneOnly: options.phoneOnly,
    reportUnavailableOnMount: options.reportCameraUnavailable,
  });
  const retryCamera = () => {
    setCameraUnavailable(false);
    setCameraPermissionDenied(false);
    setCameraUnsupported(false);
    setStatus("");
    startCamera();
  };

  useEffect(() => {
    const intent = parseScannerIntent(window.location.search);
    const params = new URLSearchParams(window.location.search);
    const programToken = params.get("program_token");
    const manualCode = params.get("manual_code");
    if (intent.eventId && (programToken || manualCode)) {
      const value = programToken ?? manualCode ?? "";
      void resolve(value, Boolean(programToken), intent.eventId);
      return;
    }
    if (intent.eventId) {
      void resolve("", false, intent.eventId);
      return;
    }
    if (!programToken && !manualCode) {
      return;
    }
    const value = programToken ?? manualCode ?? "";
    setInput(value);
    void resolve(value, Boolean(programToken));
    // The URL is the QR entry seam; only run it when the deep-link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    input: inputValue,
    fromQr,
    setInput,
    events,
    selected,
    setSelected,
    intendedEvent,
    mismatchEvent,
    busy,
    status,
    tone,
    view,
    outcome,
    cameraUnavailable,
    cameraPermissionDenied,
    cameraUnsupported,
    cameraAvailable,
    showStatus,
    resolve,
    resetToScan,
    videoRef,
    cameraOpen,
    cameraReady,
    startCamera,
    stopCamera,
    retryCamera,
  };
}
