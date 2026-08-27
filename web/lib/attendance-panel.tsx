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

import styles from "./attendance-panel.module.css";

const primaryControl = `${styles.button} min-h-11 h-auto w-full rounded-[var(--radius-sm)] px-4 py-3 text-base font-extrabold`;
const inputControl = `${styles.input} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`;
const backControl = `${styles.back} min-h-11 h-auto px-2 py-3 text-base font-bold text-[var(--accent-deep)] hover:bg-transparent hover:text-[var(--accent)]`;
const memberLinkControl = `${styles.guestMemberLink} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`;

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
    className={`${styles.card} ${styles.checkinResult}`}
    role="region"
    aria-labelledby="guest-result-title"
  >
    <header className={styles.resultHeader}>
      <span>{COPY.attendance.guestTitle}</span>
    </header>
    <CheckinConfirmationIcon
      kind={result.kind}
      className={styles.guestResultIcon}
      testId="guest-result-icon"
    />
    <h1
      id="guest-result-title"
      ref={headingRef}
      className={styles.title}
      tabIndex={-1}
    >
      {result.kind === "success"
        ? COPY.attendance.guestResultTitle
        : COPY.attendance.duplicateTitle}
    </h1>
    <p className={styles.resultCopy}>
      {result.kind === "success"
        ? COPY.attendance.guestResultLead(
            hkDayPeriodFromIso(result.event.starts_at)
          )
        : COPY.attendance.guestDuplicate}
    </p>
    <div className={styles.resultActions}>
      <Button asChild className={primaryControl}>
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
    cameraEnabled: false,
    invalidEntryMessage: COPY.attendance.invalidEntryCode,
    offlineResolveMessage: COPY.attendance.offlineResolve,
  });

  useEffect(() => {
    if (result) {
      resultHeadingRef.current?.focus();
    } else if (flow.events.length > 1) {
      chooserHeadingRef.current?.focus();
    }
  }, [flow.events.length, result]);
  useEffect(() => {
    if (result || flow.view !== "outcome" || !flow.outcome) {
      return;
    }
    const message = COPY.attendance.noEvents;
    flow.showStatus(message, "error");
    announce(message);
    inputRef.current?.focus();
    // The flow object is intentionally not a dependency; its showStatus
    // callback is recreated with the hook state and would retrigger this
    // terminal-state announcement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.outcome, flow.view, result]);

  const clearFormStatus = () => {
    setValidationError("");
    flow.showStatus("");
  };

  const validate = (): boolean => {
    let firstMissing: HTMLInputElement | null = null;
    if (flow.input.trim().length === 0) {
      firstMissing = inputRef.current;
    } else if (name.trim().length === 0) {
      firstMissing = nameRef.current;
    } else if (phone.trim().length === 0) {
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
    // ponytail: the error <output> now renders directly above the fields it
    // names, so validation feedback is visible at 320×568 with zero
    // scrolling — the old scrollIntoView rAF jumped the window 76px.
    return false;
  };

  async function submitGuest(event: AttendanceEvent) {
    const parsedEntry = entryFromValue(flow.input);
    const credentialValue = parsedEntry.value || flow.input.trim();
    const fromQr = flow.fromQr || parsedEntry.fromQr;
    try {
      const guestResult = await guestCheckIn({
        event_id: event.event_id,
        method: fromQr ? "guest_qr_scan" : "guest_manual_code",
        name,
        phone,
        ...(fromQr
          ? { program_token: credentialValue }
          : { entry: credentialValue }),
      });
      const kind =
        guestResult.outcome === "duplicate" ? "duplicate" : "success";
      setResult({ kind, event });
      setAwaitingSelection(false);
      flow.showStatus("");
      announce(
        kind === "duplicate"
          ? COPY.attendance.guestDuplicate
          : COPY.attendance.guestResultTitle
      );
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
    if (flow.selected) {
      await submitGuest(flow.selected);
      return;
    }
    try {
      const resolvedEvents = await flow.resolve(flow.input);
      if (resolvedEvents.length === 1) {
        await submitGuest(resolvedEvents[0]);
      } else {
        setAwaitingSelection(resolvedEvents.length > 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectEvent = (event: AttendanceEvent) => {
    if (submitting) {
      return;
    }
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
      <div className={styles.page} data-surface="guest-check-in">
        <GuestCheckinResult result={result} headingRef={resultHeadingRef} />
      </div>
    );
  }

  const submitBusy = flow.busy || submitting;

  return (
    <div className={styles.page} data-surface="guest-check-in">
      <Card
        className={styles.card}
        role="region"
        aria-labelledby="attendance-title"
      >
        <Button asChild variant="link" className={backControl}>
          <a href="/">{COPY.attendance.guestBack}</a>
        </Button>
        <h1 id="attendance-title" className={styles.title}>
          {COPY.attendance.guestTitle}
        </h1>
        <p className={styles.lead}>{COPY.attendance.guestLead}</p>
        {/* Status renders only while a message exists (quiet spacer removed):
            resolve/validation errors land between the lead and the fields
            they name — inside the initial viewport on short phones (F-05). */}
        {flow.status && (
          <ScannerStatusOutput message={flow.status} tone={flow.tone} />
        )}
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.field} htmlFor="attendance-code">
            <span className={styles.fieldLabel}>
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
          <label className={styles.field} htmlFor="guest-name">
            <span className={styles.fieldLabel}>
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
          <label className={styles.field} htmlFor="guest-phone">
            <span className={styles.fieldLabel}>
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
            <span id="guest-phone-hint" className={styles.fieldHint}>
              {COPY.attendance.guestPhoneHint}
            </span>
          </label>
          <Button
            className={primaryControl}
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
        <div className={styles.group}>
          <Button asChild variant="outline" className={memberLinkControl}>
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
