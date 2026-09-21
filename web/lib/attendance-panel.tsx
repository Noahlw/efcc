"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, RefObject } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import type { AttendanceEvent, AttendanceEventSummary } from "@/lib/attendance";
import { attendanceEventLabel } from "@/lib/attendance-display";
import { entryFromValue } from "@/lib/attendance-entry";
import {
  attendanceButtonVariants,
  CheckinConfirmationIcon,
  ScannerEventPicker,
  ScannerOutcome,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { writeGuestCredential } from "@/lib/guest-context";
import { hkDayPeriodFromIso, hkWallLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import {
  guestCheckIn,
  isUnknownMutationWriteOutcome,
  reconcileGuestCheckIn,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import {
  clearGuestMutationRecovery,
  readGuestMutationRecovery,
  writeGuestMutationRecovery,
} from "./programs/mutation-recovery";
import type {
  GuestMutationAttempt,
  GuestMutationRecovery,
} from "./programs/mutation-recovery";

const inputControl =
  "min-h-11 h-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface GuestResult {
  kind: "success" | "duplicate";
  event: AttendanceEventSummary;
  checkedInAt?: string;
}

type GuestAttempt = GuestMutationAttempt;

function guestSubmitErrorCopy(error: unknown): string {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const networkFailure =
    isOffline ||
    !(error instanceof RpcError) ||
    error.problem.code === "NETWORK_ERROR" ||
    error.problem.code === "UNAVAILABLE";
  if (networkFailure) {
    return COPY.attendance.offlineResolve;
  }
  if (
    error instanceof RpcError &&
    error.problem.code === "INVALID_CHECK_IN_ENTRY"
  ) {
    return COPY.attendance.invalidEntryCode;
  }
  return error instanceof RpcError
    ? errorCopyFor(error.problem.code, error.problem.detail)
    : COPY.error.networkError;
}

const GuestCheckinResult = ({
  result,
  headingRef,
}: {
  result: GuestResult;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) => (
  <Card
    className="grid text-center"
    role="region"
    aria-labelledby="guest-result-title"
  >
    <header className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
      <span>{COPY.attendance.guestTitle}</span>
    </header>
    <CheckinConfirmationIcon
      kind={result.kind}
      className="mx-auto h-16 w-16 text-[var(--accent)]"
      testId="guest-result-icon"
    />
    <h1
      id="guest-result-title"
      ref={headingRef}
      className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
      tabIndex={-1}
    >
      {result.kind === "success"
        ? COPY.attendance.guestResultTitle
        : COPY.attendance.duplicateTitle}
    </h1>
    <p className="text-base text-[var(--ink-muted)] leading-relaxed min-w-0 whitespace-normal [overflow-wrap:anywhere]">
      {result.kind === "success"
        ? COPY.attendance.guestResultLead(
            hkDayPeriodFromIso(result.event.starts_at)
          )
        : COPY.attendance.guestDuplicate}
    </p>
    <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
      {result.event.program_name} · {attendanceEventLabel(result.event)} ·{" "}
      {hkWallLabel(result.event.starts_at)}
    </p>
    {result.kind === "success" && result.checkedInAt && (
      <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
        {COPY.attendance.checkedInAt}：{hkWallLabel(result.checkedInAt)}
      </p>
    )}
    <div className="mt-2 grid gap-3">
      <Button
        asChild
        className={attendanceButtonVariants({ variant: "primary" })}
      >
        <a href="/">{COPY.attendance.guestDone}</a>
      </Button>
    </div>
  </Card>
);

/** Public guest check-in surface. Authenticated Self uses SelfCheckInPanel. */
export const AttendancePanel = () => {
  const [restoredGuestRecovery] = useState<GuestMutationRecovery | null>(() =>
    readGuestMutationRecovery()
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingSelection, setAwaitingSelection] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [result, setResult] = useState<GuestResult | null>(null);
  const [guestOutcomeUnknown, setGuestOutcomeUnknown] = useState(
    restoredGuestRecovery !== null
  );
  const [guestReconcileBusy, setGuestReconcileBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const guestSubmitKeyRef = useRef<string | null>(
    restoredGuestRecovery?.key ?? null
  );
  const guestAttemptRef = useRef<GuestAttempt | null>(
    restoredGuestRecovery?.attempt ?? null
  );
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const flow = useAttendanceFlow(inputRef, {
    cameraFirst: false,
    cameraEnabled: false,
    guestFlow: true,
    invalidEntryMessage: COPY.attendance.invalidEntryCode,
    offlineResolveMessage: COPY.attendance.offlineResolve,
  });

  useEffect(() => {
    if (result) {
      resultHeadingRef.current?.focus();
    }
  }, [result]);

  useEffect(() => {
    if (awaitingSelection) {
      chooserHeadingRef.current?.focus();
    }
  }, [awaitingSelection]);

  useEffect(() => {
    if (flow.view === "outcome") {
      outcomeHeadingRef.current?.focus();
    }
  }, [flow.outcome, flow.view]);

  useEffect(() => {
    if (!guestOutcomeUnknown || typeof window === "undefined") {
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
      const message = COPY.attendance.transportAmbiguous;
      flow.showStatus(message, "error");
      announce(message);
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
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (
        (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") ||
        nextUrl.origin !== currentUrl.origin
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
    // The flow object is intentionally read through its stable status method;
    // the guard must not restart while the recovery message changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestOutcomeUnknown]);

  const clearFormStatus = () => {
    setValidationError("");
  };

  const blockUnknownGuestNavigation = (
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    if (!guestOutcomeUnknown) {
      return false;
    }
    event.preventDefault();
    const message = COPY.attendance.transportAmbiguous;
    flow.showStatus(message, "error");
    announce(message);
    return true;
  };

  const backToScan = () => {
    if (guestOutcomeUnknown) {
      const message = COPY.attendance.transportAmbiguous;
      flow.showStatus(message, "error");
      announce(message);
      return;
    }
    setAwaitingSelection(false);
    setValidationError("");
    setGuestOutcomeUnknown(false);
    setGuestReconcileBusy(false);
    guestSubmitKeyRef.current = null;
    guestAttemptRef.current = null;
    clearGuestMutationRecovery();
    flow.resetToScan();
  };

  const validate = (): boolean => {
    const rawInput = flow.input.trim();
    const rawName = name.trim();
    const rawPhone = phone.trim();
    let firstMissing: HTMLInputElement | null = null;
    if (rawInput.length === 0) {
      firstMissing = inputRef.current;
    } else if (rawName.length === 0) {
      firstMissing = nameRef.current;
    } else if (rawPhone.length === 0) {
      firstMissing = phoneRef.current;
    }
    if (firstMissing === null) {
      return true;
    }
    const message = COPY.attendance.guestValidation;
    setValidationError(message);
    flow.showStatus(message, "error");
    announce(message);
    firstMissing.focus();
    return false;
  };

  async function submitGuest(event: AttendanceEvent, fromQr = flow.fromQr) {
    clearFormStatus();
    setSubmitting(true);
    try {
      const credentialValue = flow.input.trim();
      guestSubmitKeyRef.current ??= crypto.randomUUID();
      const attempt: GuestAttempt = {
        event,
        credentialValue,
        fromQr,
        name,
        phone,
      };
      guestAttemptRef.current = attempt;
      if (guestSubmitKeyRef.current) {
        writeGuestMutationRecovery(guestSubmitKeyRef.current, attempt);
      }
      const guestResult = await guestCheckIn(
        {
          event_id: event.event_id,
          method: fromQr ? "guest_qr_scan" : "guest_manual_code",
          name,
          phone,
          ...(fromQr
            ? { program_token: credentialValue }
            : { entry: credentialValue }),
        },
        guestSubmitKeyRef.current
      );
      setResult({
        kind: guestResult.outcome === "duplicate" ? "duplicate" : "success",
        event,
        checkedInAt: guestResult.checked_in_at,
      });
      setGuestOutcomeUnknown(false);
      guestSubmitKeyRef.current = null;
      guestAttemptRef.current = null;
      clearGuestMutationRecovery();
      flow.showStatus("");
    } catch (error) {
      const unknown = isUnknownMutationWriteOutcome(error);
      const message = guestSubmitErrorCopy(error);
      setGuestOutcomeUnknown(unknown);
      if (!unknown) {
        guestSubmitKeyRef.current = null;
        guestAttemptRef.current = null;
        clearGuestMutationRecovery();
      }
      flow.showStatus(message, "error");
      announce(
        unknown ? `${message} ${COPY.attendance.transportAmbiguous}` : message
      );
      if (error instanceof RpcError && error.problem.code === "VALIDATION") {
        if (error.problem.detail?.includes(COPY.attendance.guestPhoneLabel)) {
          phoneRef.current?.focus();
        } else {
          nameRef.current?.focus();
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function reconcileGuestOutcome() {
    const attempt = guestAttemptRef.current;
    if (!attempt || guestReconcileBusy) {
      return;
    }
    setGuestReconcileBusy(true);
    try {
      const outcome = await reconcileGuestCheckIn(
        {
          event_id: attempt.event.event_id,
          method: attempt.fromQr ? "guest_qr_scan" : "guest_manual_code",
          name: attempt.name,
          phone: attempt.phone,
          ...(attempt.fromQr
            ? { program_token: attempt.credentialValue }
            : { entry: attempt.credentialValue }),
        },
        guestSubmitKeyRef.current
      );
      if (outcome.outcome === "found") {
        setResult({
          kind: "success",
          event: attempt.event,
        });
        setGuestOutcomeUnknown(false);
        guestSubmitKeyRef.current = null;
        guestAttemptRef.current = null;
        clearGuestMutationRecovery();
        flow.showStatus("");
        return;
      }
      setGuestOutcomeUnknown(false);
      guestSubmitKeyRef.current = null;
      guestAttemptRef.current = null;
      clearGuestMutationRecovery();
      flow.showStatus(COPY.attendance.guestReconcileNotFound, "info");
      announce(COPY.attendance.guestReconcileNotFound);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? guestSubmitErrorCopy(error)
          : COPY.attendance.transportAmbiguous;
      setGuestOutcomeUnknown(true);
      flow.showStatus(message, "error");
      announce(`${message} ${COPY.attendance.transportAmbiguous}`);
    } finally {
      setGuestReconcileBusy(false);
    }
  }

  async function submit() {
    if (guestOutcomeUnknown || !validate()) {
      return;
    }
    setSubmitting(true);
    try {
      const events = await flow.resolve(flow.input);
      if (events.length === 1) {
        await submitGuest(events[0]);
      } else if (events.length > 1) {
        setAwaitingSelection(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectEvent = (event: AttendanceEvent) => {
    if (guestOutcomeUnknown) {
      const message = COPY.attendance.transportAmbiguous;
      flow.showStatus(message, "error");
      announce(message);
      return;
    }
    setGuestOutcomeUnknown(false);
    guestSubmitKeyRef.current = null;
    flow.setSelected(event);
    const shouldSubmit =
      awaitingSelection ||
      (flow.input.trim().length > 0 &&
        name.trim().length > 0 &&
        phone.trim().length > 0);
    if (shouldSubmit) {
      setAwaitingSelection(false);
      setSubmitting(true);
      void submitGuest(event);
    }
  };

  if (result) {
    return (
      <div
        className="mx-auto w-[min(100%,760px)] px-4 py-8 [@media(max-height:640px)]:py-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [@media(max-height:640px)]:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
        data-surface="guest-check-in"
      >
        <GuestCheckinResult result={result} headingRef={resultHeadingRef} />
      </div>
    );
  }

  if (flow.view === "outcome" && flow.outcome) {
    return (
      <div
        className="mx-auto w-[min(100%,760px)] px-4 py-8 [@media(max-height:640px)]:py-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [@media(max-height:640px)]:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
        data-surface="guest-check-in"
      >
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

  const submitBusy = flow.busy || submitting;
  const guestStatus = flow.status;

  return (
    <div
      className="mx-auto w-[min(100%,760px)] px-4 py-8 [@media(max-height:640px)]:py-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [@media(max-height:640px)]:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      data-surface="guest-check-in"
    >
      <Card
        className="grid [@media(max-height:640px)]:gap-2"
        role="region"
        aria-labelledby="attendance-title"
      >
        <Button
          asChild
          variant="link"
          className={attendanceButtonVariants({ variant: "back" })}
        >
          <a
            href="/"
            aria-disabled={guestOutcomeUnknown}
            onClick={blockUnknownGuestNavigation}
          >
            {COPY.attendance.guestBack}
          </a>
        </Button>
        <h1
          id="attendance-title"
          className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
        >
          {COPY.attendance.guestTitle}
        </h1>
        <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          {COPY.attendance.guestLead}
        </p>
        {flow.intendedEvent && (
          <Card className="grid gap-1">
            <strong className="text-sm text-[var(--accent-deep)]">
              {COPY.attendance.eventContextTitle}
            </strong>
            <span className="text-base font-bold text-[var(--ink)]">
              {flow.intendedEvent.program_name} ·{" "}
              {attendanceEventLabel(flow.intendedEvent)}
            </span>
            <span className="text-sm text-[var(--ink-muted)]">
              {hkWallLabel(flow.intendedEvent.starts_at)} –{" "}
              {hkWallLabel(flow.intendedEvent.ends_at)}
            </span>
          </Card>
        )}
        {flow.mismatchEvent && (
          <Alert variant="destructive">
            {COPY.attendance.eventCredentialMismatch.replace(
              "{event}",
              attendanceEventLabel(flow.mismatchEvent)
            )}
          </Alert>
        )}
        {guestStatus && (
          <ScannerStatusOutput
            message={guestStatus}
            tone={flow.status ? flow.tone : "info"}
          />
        )}
        {guestOutcomeUnknown && (
          <Alert variant="destructive">
            {COPY.attendance.transportAmbiguous}
          </Alert>
        )}
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1.5" htmlFor="attendance-code">
            <span className="text-sm font-bold leading-normal text-[var(--ink)]">
              {COPY.attendance.guestCode}
            </span>
            <Input
              ref={inputRef}
              id="attendance-code"
              className={inputControl}
              value={flow.input}
              onChange={(event) => {
                setAwaitingSelection(false);
                clearFormStatus();
                if (!guestOutcomeUnknown) {
                  guestSubmitKeyRef.current = null;
                  guestAttemptRef.current = null;
                }
                flow.setInput(event.target.value);
              }}
              placeholder={COPY.attendance.guestCodePlaceholder}
              autoComplete="off"
              inputMode="numeric"
              spellCheck={false}
              required
              disabled={guestOutcomeUnknown}
              aria-invalid={Boolean(validationError) && !flow.input.trim()}
            />
          </label>
          <label className="grid gap-1.5" htmlFor="guest-name">
            <span className="text-sm font-bold leading-normal text-[var(--ink)]">
              {COPY.attendance.guestName}
            </span>
            <Input
              ref={nameRef}
              id="guest-name"
              className={inputControl}
              value={name}
              onChange={(event) => {
                clearFormStatus();
                if (!guestOutcomeUnknown) {
                  guestSubmitKeyRef.current = null;
                  guestAttemptRef.current = null;
                }
                setName(event.target.value);
              }}
              autoComplete="name"
              maxLength={80}
              spellCheck={false}
              required
              disabled={guestOutcomeUnknown}
              aria-invalid={Boolean(validationError) && !name.trim()}
            />
          </label>
          <label className="grid gap-1.5" htmlFor="guest-phone">
            <span className="text-sm font-bold leading-normal text-[var(--ink)]">
              {COPY.attendance.guestPhoneLabel}
            </span>
            <Input
              ref={phoneRef}
              id="guest-phone"
              className={inputControl}
              value={phone}
              onChange={(event) => {
                clearFormStatus();
                if (!guestOutcomeUnknown) {
                  guestSubmitKeyRef.current = null;
                  guestAttemptRef.current = null;
                }
                setPhone(event.target.value);
              }}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              disabled={guestOutcomeUnknown}
              aria-describedby="guest-phone-hint"
              aria-invalid={Boolean(validationError) && !phone.trim()}
            />
            <span
              id="guest-phone-hint"
              className="text-xs leading-normal text-[var(--ink-muted)]"
            >
              {COPY.attendance.guestPhoneHint}
            </span>
          </label>
          <Button
            className={attendanceButtonVariants({ variant: "primary" })}
            type="submit"
            disabled={submitBusy || awaitingSelection || guestOutcomeUnknown}
            aria-busy={submitBusy}
          >
            {submitBusy
              ? COPY.attendance.guestSubmitting
              : COPY.attendance.guestSubmit}
          </Button>
        </form>
        {flow.events.length > 1 && (
          <ScannerEventPicker
            events={flow.events}
            headingRef={chooserHeadingRef}
            disabled={submitting || guestOutcomeUnknown}
            onSelect={selectEvent}
          />
        )}
        {guestOutcomeUnknown && (
          <Button
            type="button"
            variant="outline"
            className="border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            onClick={() => void reconcileGuestOutcome()}
            disabled={guestReconcileBusy}
            aria-busy={guestReconcileBusy}
          >
            {guestReconcileBusy
              ? COPY.attendance.guestReconciling
              : COPY.attendance.guestReconcile}
          </Button>
        )}
        <div className="mt-4 grid gap-3">
          <Button
            asChild
            variant="outline"
            className={attendanceButtonVariants({ variant: "secondary" })}
          >
            <a
              href="/"
              aria-disabled={guestOutcomeUnknown}
              onClick={(event) => {
                if (blockUnknownGuestNavigation(event)) {
                  return;
                }
                const entry = entryFromValue(flow.input);
                if (entry.value) {
                  writeGuestCredential({
                    kind:
                      flow.fromQr || entry.fromQr
                        ? "program_token"
                        : "manual_code",
                    value: entry.value,
                    ...(flow.selected?.event_id || flow.intendedEvent?.event_id
                      ? {
                          eventId:
                            flow.selected?.event_id ??
                            flow.intendedEvent?.event_id,
                        }
                      : {}),
                  });
                }
              }}
            >
              {COPY.attendance.loginForMember}
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
};
