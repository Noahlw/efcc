"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import type { AttendanceEvent } from "@/lib/attendance";
import { entryFromValue } from "@/lib/attendance-entry";
import {
  attendanceButtonVariants,
  CheckinConfirmationIcon,
  ScannerEventPicker,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { writeGuestCredential } from "@/lib/guest-context";
import { hkDayPeriodFromIso } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import { guestCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

const inputControl =
  "min-h-11 h-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface GuestResult {
  kind: "success" | "duplicate";
  event: AttendanceEvent;
}

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
    className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)] text-center"
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingSelection, setAwaitingSelection] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [result, setResult] = useState<GuestResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const flow = useAttendanceFlow(inputRef, {
    cameraFirst: false,
    cameraEnabled: false,
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

  const clearFormStatus = () => {
    setValidationError("");
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
      const guestResult = await guestCheckIn({
        event_id: event.event_id,
        method: fromQr ? "guest_qr_scan" : "guest_manual_code",
        name,
        phone,
        ...(fromQr
          ? { program_token: credentialValue }
          : { entry: credentialValue }),
      });
      setResult({
        kind: guestResult.outcome === "duplicate" ? "duplicate" : "success",
        event,
      });
      flow.showStatus("");
    } catch (error) {
      const message = guestSubmitErrorCopy(error);
      flow.showStatus(message, "error");
      announce(message);
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

  async function submit() {
    if (!validate()) {
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

  const submitBusy = flow.busy || submitting;
  const guestStatus =
    flow.status || (flow.outcome ? COPY.attendance.noEvents : "");

  return (
    <div
      className="mx-auto w-[min(100%,760px)] px-4 py-8 [@media(max-height:640px)]:py-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [@media(max-height:640px)]:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      data-surface="guest-check-in"
    >
      <Card
        className="grid gap-[1.125rem] p-5 [@media(max-height:640px)]:p-3 [@media(max-height:640px)]:gap-3 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)]"
        role="region"
        aria-labelledby="attendance-title"
      >
        <Button
          asChild
          variant="link"
          className={attendanceButtonVariants({ variant: "back" })}
        >
          <a href="/">{COPY.attendance.guestBack}</a>
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
        {guestStatus && (
          <ScannerStatusOutput
            message={guestStatus}
            tone={flow.status ? flow.tone : "info"}
          />
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
                flow.setInput(event.target.value);
              }}
              placeholder={COPY.attendance.guestCodePlaceholder}
              autoComplete="off"
              inputMode="numeric"
              spellCheck={false}
              required
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
                setName(event.target.value);
              }}
              autoComplete="name"
              maxLength={80}
              spellCheck={false}
              required
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
                setPhone(event.target.value);
              }}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
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
            disabled={submitBusy || awaitingSelection}
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
            disabled={submitting}
            onSelect={selectEvent}
          />
        )}
        <div className="mt-4 grid gap-3">
          <Button
            asChild
            variant="outline"
            className={attendanceButtonVariants({ variant: "secondary" })}
          >
            <a
              href="/"
              onClick={() => {
                const entry = entryFromValue(flow.input);
                if (entry.value) {
                  writeGuestCredential({
                    kind:
                      flow.fromQr || entry.fromQr
                        ? "program_token"
                        : "manual_code",
                    value: entry.value,
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
