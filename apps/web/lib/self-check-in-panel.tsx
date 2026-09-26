"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import type { AttendanceEvent, AttendanceEventSummary } from "@/lib/attendance";
import { attendanceEventLabel } from "@/lib/attendance-display";
import {
  attendanceButtonVariants,
  CameraFirstScanner,
  ScannerCheckinResult,
  ScannerChooser,
  ScannerConfirmation,
  ScannerOutcome,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  getOwnAttendance,
  isUnknownMutationWriteOutcome,
  selfCheckIn,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

const inputControl =
  "min-h-11 h-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const methodControl =
  "flex flex-col justify-center min-h-24 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-left text-base font-normal text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] motion-reduce:transition-none";
interface CheckinResult {
  kind: "success" | "duplicate";
  event: AttendanceEvent;
  checkedInAt?: string;
}

const KNOWN_SUBMIT_ERROR_CODES = [
  "AUTH_REQUIRED",
  "CHECK_IN_CLOSED",
  "CONFLICT",
  "DUPLICATE_ATTENDANCE",
  "ENROLLMENT_REQUIRED",
  "EVENT_CANCELLED",
  "EVENT_UNAVAILABLE",
  "FORBIDDEN",
  "INVALID_CHECK_IN_ENTRY",
  "NOT_FOUND",
  "RATE_LIMITED",
  "VALIDATION",
] as const;
function replaceWithPlainScanner() {
  window.history.replaceState(null, "", "/scanner");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const EventContextCard = ({ event }: { event: AttendanceEvent }) => (
  <Card className="grid gap-1" aria-label={COPY.attendance.eventContextTitle}>
    <strong className="text-sm text-[var(--accent-deep)]">
      {COPY.attendance.eventContextTitle}
    </strong>
    <span className="text-base font-bold text-[var(--ink)]">
      {event.program_name} · {attendanceEventLabel(event)}
    </span>
    <span className="text-sm text-[var(--ink-muted)]">
      {hkWallLabel(event.starts_at)} – {hkWallLabel(event.ends_at)}
    </span>
  </Card>
);

const EventMismatchAlert = ({ event }: { event: AttendanceEventSummary }) => (
  <Alert variant="destructive">
    {COPY.attendance.eventCredentialMismatch.replace(
      "{event}",
      attendanceEventLabel(event)
    )}
  </Alert>
);

export const SelfCheckInPanel = ({
  title = COPY.attendance.scanTitle,
}: {
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);
  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const cameraAnnouncementRef = useRef<"opening" | "live" | null>(null);
  const autoStartRef = useRef(false);
  const submitKeyRef = useRef<string | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const [hasDeepLink, setHasDeepLink] = useState(false);
  const [deepLinkChecked, setDeepLinkChecked] = useState(false);
  const [scanStopped, setScanStopped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(
    null
  );
  const [showChooser, setShowChooser] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [retryNeedsReconciliation, setRetryNeedsReconciliation] =
    useState(false);
  const flow = useAttendanceFlow(inputRef, {
    cameraFirst: true,
    phoneOnly: true,
    reportCameraUnavailable: true,
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setIsPhone(true);
      return;
    }
    const media = window.matchMedia("(max-width: 799.98px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // An Event-only link is context, not a credential. It still uses the
    // phone camera-first entry and collects a QR/code before confirmation.
    setHasDeepLink(
      Boolean(params.get("program_token") || params.get("manual_code"))
    );
    setDeepLinkChecked(true);
  }, []);
  useEffect(() => {
    if (
      !deepLinkChecked ||
      !isPhone ||
      hasDeepLink ||
      scanStopped ||
      flow.cameraUnavailable ||
      flow.cameraAvailable !== true ||
      flow.busy ||
      autoStartRef.current
    ) {
      return;
    }
    autoStartRef.current = true;
    cameraAnnouncementRef.current = "opening";
    announce(COPY.attendance.cameraOpening);
    flow.startCamera();
    // The flow owns the stable camera callback refs; this effect is the one
    // camera-first entry trigger and must not restart on callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    flow.cameraAvailable,
    flow.cameraUnavailable,
    flow.busy,
    deepLinkChecked,
    hasDeepLink,
    isPhone,
    scanStopped,
  ]);

  useEffect(() => {
    if (flow.cameraReady && cameraAnnouncementRef.current !== "live") {
      cameraAnnouncementRef.current = "live";
      announce(COPY.attendance.cameraLiveHint);
    }
    if (!flow.cameraReady && !scanStopped) {
      cameraAnnouncementRef.current = null;
    }
  }, [flow.cameraReady, scanStopped]);

  useEffect(() => {
    if (!isPhone) {
      autoStartRef.current = false;
      if (flow.cameraOpen) {
        flow.stopCamera();
      }
    }
  }, [flow.cameraOpen, isPhone]);

  useEffect(() => {
    if ((flow.view === "chooser" || showChooser) && flow.events.length > 1) {
      chooserHeadingRef.current?.focus();
    } else if (checkinResult) {
      resultHeadingRef.current?.focus();
    } else if (flow.view === "outcome") {
      outcomeHeadingRef.current?.focus();
    } else if (flow.selected) {
      confirmationHeadingRef.current?.focus({ preventScroll: true });
    } else if ((!isPhone || manualOpen || hasDeepLink) && !flow.busy) {
      inputRef.current?.focus();
    } else if (
      isPhone &&
      (scanStopped ||
        flow.cameraUnavailable ||
        flow.cameraAvailable === false) &&
      !flow.busy
    ) {
      fallbackHeadingRef.current?.focus();
    } else if (flow.view === "scan" && !flow.busy) {
      scanHeadingRef.current?.focus();
    }
    // Scalar flow fields are listed deliberately; the flow object is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    checkinResult,
    flow.busy,
    flow.cameraAvailable,
    flow.cameraUnavailable,
    flow.events.length,
    flow.outcome,
    flow.selected,
    flow.view,
    hasDeepLink,
    isPhone,
    manualOpen,
    scanStopped,
    showChooser,
  ]);

  useEffect(() => {
    if (retryAvailable) {
      retryRef.current?.focus();
    }
  }, [retryAvailable]);

  useEffect(() => {
    if (!retryNeedsReconciliation || typeof window === "undefined") {
      return;
    }
    const blockedHref = window.location.href;
    const guardToken = crypto.randomUUID();
    const currentState =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    const guardedState = {
      ...currentState,
      efccGuestMutationGuard: guardToken,
    };
    window.history.pushState(guardedState, "", blockedHref);
    const announceBlocked = () => {
      setConfirmationError(COPY.attendance.transportAmbiguous);
      announce(COPY.attendance.transportAmbiguous);
    };
    const handleDocumentClick = (clickEvent: globalThis.MouseEvent) => {
      if (
        clickEvent.defaultPrevented ||
        clickEvent.button !== 0 ||
        clickEvent.metaKey ||
        clickEvent.ctrlKey ||
        clickEvent.shiftKey ||
        clickEvent.altKey
      ) {
        return;
      }
      const target = clickEvent.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const rawHref = anchor.getAttribute("href");
      if (
        rawHref?.startsWith("#") ||
        anchor.hasAttribute("download") ||
        (anchor.getAttribute("target") ?? "").toLowerCase() === "_blank"
      ) {
        return;
      }
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      announceBlocked();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePopState = () => {
      window.history.pushState(guardedState, "", blockedHref);
      announceBlocked();
    };
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      if (
        window.location.href === blockedHref &&
        (window.history.state as Record<string, unknown> | null)
          ?.efccGuestMutationGuard === guardToken
      ) {
        window.history.back();
      }
    };
  }, [retryNeedsReconciliation]);

  const handleManualChange = (value: string) => {
    flow.setInput(value.replaceAll(/\D/gu, "").slice(0, 6));
  };

  const handleResolve = () => {
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setRetryNeedsReconciliation(false);
    submitKeyRef.current = null;
    setShowChooser(false);
    if (!flow.fromQr && !/^\d{6}$/u.test(flow.input)) {
      const message = COPY.attendance.invalidManualCode;
      flow.showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
      return;
    }
    void flow.resolve(flow.input);
  };

  const selectEvent = (event: Parameters<typeof flow.setSelected>[0]) => {
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setRetryNeedsReconciliation(false);
    submitKeyRef.current = null;
    setShowChooser(false);
    const shellContent = document.getElementById("shell-content");
    if (shellContent) {
      shellContent.scrollTop = 0;
    }
    flow.setSelected(event);
    setManualOpen(false);
    if (event) {
      const message = attendanceEventLabel(event);
      flow.showStatus(message);
      announce(message);
    }
  };

  async function submit(isRetry = false) {
    const { selected } = flow;
    if (!selected || submitting) {
      return;
    }
    if (!isRetry) {
      setRetryAvailable(false);
      setRetryNeedsReconciliation(false);
      submitKeyRef.current = crypto.randomUUID();
    }
    setConfirmationError("");
    // No offline pre-check here (F-03/F-11): an offline submit flows into
    // the same recoverable-failure path below, which shows the offline copy
    // AND keeps the dedicated 重試簽到 control visible and focused.
    setSubmitting(true);
    flow.stopCamera();
    try {
      if (isRetry && retryNeedsReconciliation) {
        try {
          const current = await getOwnAttendance(selected.event_id);
          if (current.attendance?.status === "Active") {
            setCheckinResult({
              kind: "success",
              event: selected,
              checkedInAt: current.attendance.checked_in_at,
            });
            setRetryAvailable(false);
            setRetryNeedsReconciliation(false);
            submitKeyRef.current = null;
            announce(
              `${COPY.attendance.successTitle} ${selected.program_name} · ${attendanceEventLabel(selected)}`
            );
            return;
          }
          setRetryNeedsReconciliation(false);
        } catch {
          const message = COPY.attendance.transportAmbiguous;
          setRetryAvailable(true);
          setConfirmationError(message);
          announce(message);
          return;
        }
      }
      const credential = flow.fromQr
        ? { program_token: flow.input }
        : { entry: flow.input };
      submitKeyRef.current ??= crypto.randomUUID();
      const result = await selfCheckIn(
        {
          event_id: selected.event_id,
          method: flow.fromQr ? "self_qr_scan" : "self_manual_code",
          ...credential,
        },
        submitKeyRef.current
      );
      const kind = result.outcome === "duplicate" ? "duplicate" : "success";
      setCheckinResult({
        kind,
        event: selected,
        checkedInAt: result.checked_in_at,
      });
      setRetryAvailable(false);
      setRetryNeedsReconciliation(false);
      submitKeyRef.current = null;
      announce(
        kind === "duplicate"
          ? `${COPY.attendance.duplicateTitle} ${COPY.attendance.duplicateBody}`
          : `${COPY.attendance.successTitle} ${selected.program_name} · ${attendanceEventLabel(selected)}`
      );
    } catch (error) {
      const code = error instanceof RpcError ? error.problem.code : undefined;
      const offline =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        code === "NETWORK_ERROR";
      const hasSpecificCopy =
        code !== undefined &&
        KNOWN_SUBMIT_ERROR_CODES.includes(
          code as (typeof KNOWN_SUBMIT_ERROR_CODES)[number]
        );
      const message = offline
        ? COPY.attendance.offlineSubmit
        : hasSpecificCopy && error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.attendance.submitFailure;
      const unknown = isUnknownMutationWriteOutcome(error);
      setRetryAvailable(true);
      setRetryNeedsReconciliation(unknown);
      const visibleMessage = unknown
        ? `${message} ${COPY.attendance.transportAmbiguous}`
        : message;
      setConfirmationError(visibleMessage);
      announce(visibleMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const backToScan = () => {
    if (retryNeedsReconciliation) {
      const message = COPY.attendance.transportAmbiguous;
      setConfirmationError(message);
      announce(message);
      return;
    }
    replaceWithPlainScanner();
    setHasDeepLink(false);
    setManualOpen(false);
    setScanStopped(false);
    cameraAnnouncementRef.current = null;
    autoStartRef.current = false;
    setShowChooser(false);
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setRetryNeedsReconciliation(false);
    submitKeyRef.current = null;
    flow.resetToScan();
  };

  const openManual = () => {
    flow.stopCamera();
    setManualOpen(true);
    setScanStopped(true);
    cameraAnnouncementRef.current = null;
    announce(COPY.attendance.manualCodeLabel);
  };

  const stopScanning = () => {
    flow.stopCamera();
    setScanStopped(true);
    setManualOpen(false);
    cameraAnnouncementRef.current = null;
    // The stop tap scrolls the shell's inner scroller (#shell-content,
    // overflow:auto) toward the stage bottom; reset it — plus the window
    // fallback for the guest surface — so the card lands at the top
    // (was scroller scrollTop=3 → card y=-3 at 320×568).
    requestAnimationFrame(() => {
      document.getElementById("shell-content")?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    announce(COPY.attendance.fallbackLead);
  };

  const retryCamera = () => {
    setScanStopped(false);
    setManualOpen(false);
    autoStartRef.current = true;
    cameraAnnouncementRef.current = "opening";
    announce(COPY.attendance.cameraOpening);
    flow.retryCamera();
  };

  const handleNotThisEvent = () => {
    if (submitting || retryNeedsReconciliation) {
      if (retryNeedsReconciliation) {
        const message = COPY.attendance.transportAmbiguous;
        setConfirmationError(message);
        announce(message);
      }
      return;
    }
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setRetryNeedsReconciliation(false);
    submitKeyRef.current = null;
    if (flow.events.length > 1) {
      flow.setSelected(null);
      setShowChooser(true);
      announce(COPY.attendance.chooseMeeting);
      return;
    }
    backToScan();
  };

  // The manual form composes with or without its own heading: standalone
  // (deep link / manual entry) owns the page header, while the desktop
  // surface already renders one — composing both produced two h1s and the
  // same hint sentence three times. With a heading, the h1 doubles as the
  // input's accessible name and the per-field label/hint duplicates are
  // omitted so screen readers hear the title once.
  const manualForm = (withHeading: boolean) => (
    <form
      noValidate
      className="grid gap-3"
      data-scanner-state="manual"
      onSubmit={(event) => {
        event.preventDefault();
        handleResolve();
      }}
    >
      {flow.intendedEvent && <EventContextCard event={flow.intendedEvent} />}
      {flow.mismatchEvent && <EventMismatchAlert event={flow.mismatchEvent} />}
      {withHeading && (
        <>
          <h1
            ref={scanHeadingRef}
            id="attendance-code-label"
            className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)]"
            tabIndex={-1}
          >
            {COPY.attendance.manualCodeLabel}
          </h1>
          <p
            id="manual-entry-hint"
            className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)]"
          >
            {COPY.attendance.manualCodeHint}
          </p>
        </>
      )}
      <label className="grid gap-1.5" htmlFor="attendance-code">
        {!withHeading && (
          <span className="text-sm font-bold leading-normal text-[var(--ink)]">
            {COPY.attendance.manualCodeLabel}
          </span>
        )}
        <Input
          ref={inputRef}
          id="attendance-code"
          className={inputControl}
          value={flow.input}
          onChange={(event) => handleManualChange(event.target.value)}
          placeholder={COPY.attendance.manualCodePlaceholder}
          autoComplete="off"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          aria-labelledby={withHeading ? "attendance-code-label" : undefined}
          aria-describedby="manual-entry-hint"
        />
        {!withHeading && (
          <span
            id="manual-entry-hint"
            className="text-xs leading-normal text-[var(--ink-muted)]"
          >
            {COPY.attendance.manualCodeHint}
          </span>
        )}
      </label>
      <Button
        className={attendanceButtonVariants({ variant: "primary" })}
        type="submit"
        disabled={flow.busy || submitting}
        aria-busy={flow.busy || submitting}
      >
        {flow.busy ? COPY.attendance.resolving : COPY.attendance.continue}
      </Button>
      <ScannerStatusOutput message={flow.status} tone={flow.tone} />
      {isPhone && (
        <Button
          variant="outline"
          className={attendanceButtonVariants({ variant: "secondary" })}
          type="button"
          onClick={backToScan}
        >
          {COPY.attendance.backToScan}
        </Button>
      )}
    </form>
  );

  if ((flow.view === "chooser" || showChooser) && flow.events.length > 1) {
    return (
      <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
        <ScannerChooser
          events={flow.events}
          headingRef={chooserHeadingRef}
          onBack={backToScan}
          onSelect={selectEvent}
        />
      </div>
    );
  }

  if (checkinResult) {
    return (
      <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
        <ScannerCheckinResult
          event={checkinResult.event}
          kind={checkinResult.kind}
          checkedInAt={checkinResult.checkedInAt}
          eventHref={buildProgramsHref({
            mode: "participant",
            programId: checkinResult.event.program_id,
            eventId: checkinResult.event.event_id,
            origin: "programs",
          })}
          headingRef={resultHeadingRef}
          onScanAgain={backToScan}
        />
      </div>
    );
  }

  if (flow.selected) {
    return (
      <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
        <ScannerConfirmation
          event={flow.selected}
          headingRef={confirmationHeadingRef}
          busy={submitting}
          error={confirmationError}
          retryAvailable={retryAvailable}
          retryRef={retryRef}
          onRescan={backToScan}
          onSubmit={() => void submit()}
          onRetry={() => void submit(true)}
          onNotThisEvent={handleNotThisEvent}
        />
      </div>
    );
  }

  if (flow.view === "outcome" && flow.outcome) {
    return (
      <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
        <ScannerOutcome
          kind={flow.outcome.kind}
          latest={flow.outcome.latest}
          programHref={buildProgramsHref({
            mode: "participant",
            programId: flow.outcome.latest.program_id,
          })}
          headingRef={outcomeHeadingRef}
          onBack={backToScan}
        />
      </div>
    );
  }

  if (!isPhone) {
    return (
      <div
        className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12"
        data-scanner-state="desktop-manual"
      >
        <Card className="grid" aria-labelledby="attendance-title">
          <h1
            id="attendance-title"
            ref={scanHeadingRef}
            className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)]"
            tabIndex={-1}
          >
            {title}
          </h1>
          {manualForm(false)}
        </Card>
      </div>
    );
  }

  if (!deepLinkChecked || hasDeepLink || manualOpen) {
    return (
      <div className="mx-auto w-[min(100%,760px)] px-4 py-8 pb-12">
        {manualForm(true)}
      </div>
    );
  }

  if (
    flow.mismatchEvent ||
    scanStopped ||
    flow.cameraUnavailable ||
    flow.cameraAvailable === false
  ) {
    return (
      <div
        className="mx-auto w-[min(100%,760px)] px-4 py-8 [@media(max-height:640px)]:py-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [@media(max-height:640px)]:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
        data-scanner-state="fallback"
      >
        <Card
          className="grid [@media(max-height:640px)]:gap-3"
          aria-labelledby="fallback-methods-title"
        >
          {flow.intendedEvent && (
            <EventContextCard event={flow.intendedEvent} />
          )}
          {flow.mismatchEvent && (
            <EventMismatchAlert event={flow.mismatchEvent} />
          )}
          <h1
            ref={fallbackHeadingRef}
            id="fallback-methods-title"
            className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)]"
            tabIndex={-1}
          >
            {COPY.attendance.fallbackTitle}
          </h1>
          <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)]">
            {COPY.attendance.fallbackLead}
          </p>
          {flow.cameraPermissionDenied && (
            <Alert
              variant="destructive"
              className="grid gap-2 border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)] p-4 rounded-[var(--radius-sm)]"
            >
              <strong>{COPY.attendance.cameraDeniedTitle}</strong>
              <p>{COPY.attendance.cameraDeniedBody}</p>
              <Button
                className={attendanceButtonVariants({ variant: "primaryFit" })}
                type="button"
                onClick={retryCamera}
              >
                {COPY.attendance.cameraRetry}
              </Button>
            </Alert>
          )}
          {flow.cameraUnsupported && !flow.cameraPermissionDenied && (
            <Alert
              variant="destructive"
              className="grid gap-2 border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)] p-4 rounded-[var(--radius-sm)]"
            >
              <strong>{COPY.attendance.cameraUnsupportedTitle}</strong>
              <p>{COPY.attendance.cameraUnsupportedHint}</p>
            </Alert>
          )}
          <section
            className="mt-4 grid gap-3"
            aria-labelledby="fallback-methods-title"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className={methodControl}
                type="button"
                onClick={openManual}
              >
                <strong>{COPY.attendance.manualMethodTitle}</strong>
                <span>{COPY.attendance.manualMethodHint}</span>
              </Button>
              <Button asChild variant="outline" className={methodControl}>
                <a href="/profile?from=scanner">
                  <strong>{COPY.attendance.memberQrTitle}</strong>
                  <span>{COPY.attendance.memberQrHint}</span>
                </a>
              </Button>
            </div>
          </section>
          {!flow.cameraPermissionDenied && !flow.cameraUnsupported && (
            <ScannerStatusOutput message={flow.status} tone={flow.tone} />
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {flow.intendedEvent && <EventContextCard event={flow.intendedEvent} />}
      <CameraFirstScanner
        cameraOpen={flow.cameraOpen}
        opening={flow.cameraAvailable !== true || !flow.cameraReady}
        videoRef={flow.videoRef}
        onStop={stopScanning}
      />
    </div>
  );
};
