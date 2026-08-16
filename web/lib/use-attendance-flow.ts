"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { RpcError } from "@/lib/api";
import type { AttendanceEvent } from "@/lib/attendance";
import { attendanceEventLabel } from "@/lib/attendance-display";
import { entryFromValue } from "@/lib/attendance-entry";
import { errorCopyFor, COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { resolveAttendance } from "@/lib/programs/program-api";
import { useQrCamera } from "@/lib/use-qr-camera";

export type StatusTone = "info" | "success" | "error";

export interface AttendanceFlow {
  input: string;
  fromQr: boolean;
  setInput: (value: string) => void;
  events: AttendanceEvent[];
  selected: AttendanceEvent | null;
  setSelected: (event: AttendanceEvent | null) => void;
  busy: boolean;
  status: string;
  tone: StatusTone;
  showStatus: (message: string, tone?: StatusTone) => void;
  resolve: (value: string, fromQr?: boolean) => Promise<void>;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOpen: boolean;
  startCamera: () => void;
  stopCamera: () => void;
}

/**
 * Self and guest surfaces share only this entry-resolution state machine. The
 * wrappers own their submit contracts and fields, so Self never gains guest
 * or assisted controls by accident.
 */
export function useAttendanceFlow(
  inputRef: RefObject<HTMLInputElement | null>,
  requestedEventId: string | null = null
): AttendanceFlow {
  const [inputValue, setInputValue] = useState("");
  const [fromQr, setFromQr] = useState(false);
  const setInput = (value: string) => {
    setInputValue(value);
    setFromQr(false);
  };
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selected, setSelected] = useState<AttendanceEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");

  const showStatus = (message: string, nextTone: StatusTone = "info") => {
    setStatus(message);
    setTone(nextTone);
  };

  async function resolve(value: string, isFromQr = false) {
    const entry = entryFromValue(value);
    if (!entry.value) {
      const message = COPY.attendance.inputLabel;
      setFromQr(false);
      setEvents([]);
      setSelected(null);
      showStatus(message);
      announce(message);
      inputRef.current?.focus();
      return;
    }
    const resolvedFromQr = isFromQr || entry.fromQr;
    setInputValue(entry.value);
    setFromQr(resolvedFromQr);
    setBusy(true);
    showStatus(COPY.attendance.resolving);
    announce(COPY.attendance.resolving);
    setEvents([]);
    setSelected(null);
    try {
      const result = resolvedFromQr
        ? await resolveAttendance({ program_token: entry.value })
        : await resolveAttendance({ entry: entry.value });
      setEvents(result.events);
      const nextSelected = requestedEventId
        ? (result.events.find((event) => event.event_id === requestedEventId) ??
          null)
        : result.events.length === 1
          ? result.events[0]
          : null;
      setSelected(nextSelected);
      const message =
        result.events.length === 0
          ? COPY.attendance.noEvents
          : nextSelected
            ? attendanceEventLabel(nextSelected)
            : COPY.attendance.chooseEvent;
      showStatus(message);
      announce(message);
    } catch (error) {
      const noEligibleEvents =
        error instanceof RpcError &&
        error.problem.code === "CHECK_IN_NOT_FOUND" &&
        resolvedFromQr;
      const message = noEligibleEvents
        ? COPY.attendance.noEvents
        : error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      showStatus(message, noEligibleEvents ? "info" : "error");
      announce(message);
    } finally {
      setBusy(false);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (value) => {
      const entry = entryFromValue(value);
      setInputValue(entry.value);
      setFromQr(entry.fromQr);
      stopCamera();
      void resolve(entry.value, entry.fromQr);
    },
    onUnavailable: () => {
      const message = COPY.attendance.cameraUnavailable;
      showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const programToken = params.get("program_token");
    const manualCode = params.get("manual_code");
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
    busy,
    status,
    tone,
    showStatus,
    resolve,
    videoRef,
    cameraOpen,
    startCamera,
    stopCamera,
  };
}
