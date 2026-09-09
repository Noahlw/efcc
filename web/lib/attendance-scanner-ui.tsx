"use client";

import { cva } from "class-variance-authority";
import { useState } from "react";
import type { Ref, RefObject } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  AttendanceEvent,
  AttendanceResolveLatest,
} from "@/lib/attendance";
import {
  attendanceEventMeta,
  attendanceEventName,
} from "@/lib/attendance-display";
import { COPY } from "@/lib/copy";
import { hkTime24Label, hkWallLabel } from "@/lib/hk-time";
import { cn } from "@/lib/utils";

export const attendanceButtonVariants = cva(
  "inline-flex min-h-11 h-auto min-w-11 items-center justify-center rounded-[var(--radius-sm)] px-4 py-3 text-base font-bold transition-colors outline-none motion-reduce:transition-none focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "w-full bg-[var(--accent)] text-white font-extrabold hover:bg-[var(--accent-deep)] active:bg-[var(--accent-deep)]",
        primaryFit:
          "w-auto bg-[var(--accent)] text-white font-extrabold hover:bg-[var(--accent-deep)] active:bg-[var(--accent-deep)]",
        secondary:
          "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
        danger:
          "border border-[var(--error)] bg-[var(--surface-raised)] text-[var(--error)] hover:bg-[var(--error-surface)] hover:text-[var(--error)]",
        back: "w-fit min-w-11 min-h-11 px-2 py-3 text-[var(--accent-deep)] hover:bg-transparent hover:text-[var(--accent)] font-bold",
        modeTab:
          "border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2.5 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] aria-selected:border-[var(--accent)] aria-selected:bg-[var(--surface)] aria-selected:text-[var(--accent-deep)]",
        cameraStop:
          "min-h-12 rounded-[var(--radius-sm)] border border-white/40 bg-black/50 px-4 font-semibold text-white hover:bg-black/70 hover:text-white focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

export const statusOutputVariants = cva(
  "rounded-[var(--radius-sm)] border p-3 text-base min-w-0 [overflow-wrap:anywhere]",
  {
    variants: {
      tone: {
        info: "border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        error:
          "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  }
);

export type StatusTone = "info" | "success" | "error";

/**
 * Shared live-region status output used by every attendance surface
 * (Self Check-In, Guest Check-In, Assisted Scanner). The tone is exposed as
 * data-tone only when a message is present so the output never announces an
 * empty state as a status change.
 */
export const ScannerStatusOutput = ({
  message,
  tone,
}: {
  message: string;
  tone?: StatusTone;
}) => (
  <output
    className={cn(statusOutputVariants({ tone: tone ?? "info" }))}
    data-tone={message ? tone : undefined}
    aria-live="polite"
    aria-atomic="true"
  >
    {message}
  </output>
);

const CameraIcon = () => (
  <svg
    className="h-18 w-18 fill-none stroke-[var(--accent)] stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M13 17h4l3-4h8l3 4h4a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V21a4 4 0 0 1 4-4Z" />
    <circle cx="24" cy="27" r="7" />
  </svg>
);

/**
 * Camera start/video/close trio shared by the Self and Guest check-in panels.
 * The frame remains a stable affordance even when the browser cannot provide
 * a camera. `cameraAvailable` is optional so guest/operator callers retain
 * their existing click-to-discover behavior.
 */
export const ScannerCamera = ({
  cameraOpen,
  cameraAvailable = true,
  videoRef,
  onStart,
  onClose,
}: {
  cameraOpen: boolean;
  cameraAvailable?: boolean | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStart: () => void;
  onClose: () => void;
}) => (
  <div className="grid justify-items-center gap-3.5 w-full">
    <div
      className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--surface)] flex items-center justify-center"
      aria-label={COPY.attendance.camera}
    >
      {cameraOpen && (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
      )}
      <span className="absolute top-2 left-2 h-10 w-10 border-[3px] border-[var(--accent)] border-r-0 border-b-0 rounded-tl-[var(--radius-sm)] pointer-events-none" />
      <span className="absolute top-2 right-2 h-10 w-10 border-[3px] border-[var(--accent)] border-l-0 border-b-0 rounded-tr-[var(--radius-sm)] pointer-events-none" />
      <span className="absolute bottom-2 right-2 h-10 w-10 border-[3px] border-[var(--accent)] border-l-0 border-t-0 rounded-br-[var(--radius-sm)] pointer-events-none" />
      <span className="absolute bottom-2 left-2 h-10 w-10 border-[3px] border-[var(--accent)] border-r-0 border-t-0 rounded-bl-[var(--radius-sm)] pointer-events-none" />
      {!cameraOpen && <CameraIcon />}
    </div>
    {!cameraOpen && (
      <Button
        className={attendanceButtonVariants({ variant: "primaryFit" })}
        type="button"
        data-camera-available={cameraAvailable}
        onClick={onStart}
      >
        {COPY.attendance.startScan}
      </Button>
    )}
    {cameraOpen && (
      <Button
        variant="outline"
        className={attendanceButtonVariants({ variant: "secondary" })}
        type="button"
        onClick={onClose}
      >
        {COPY.attendance.cameraClose}
      </Button>
    )}
  </div>
);

export const CameraFirstScanner = ({
  cameraOpen,
  opening,
  videoRef,
  onStop,
}: {
  cameraOpen: boolean;
  opening: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStop: () => void;
}) => (
  <div
    className={cn(
      "relative flex flex-col items-center justify-center min-h-[min(760px,calc(100dvh-84px-env(safe-area-inset-bottom,0px)))] [@media(max-height:640px)]:min-h-[560px] p-[92px_20px_142px] [@media(max-height:640px)]:p-[48px_20px_96px] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_28%,#344342_0%,#172021_56%,#050708_100%)] text-white rounded-[var(--radius-md)] motion-reduce:transition-none",
      opening && "opacity-90"
    )}
    data-camera-state={opening ? "opening" : "live"}
    data-testid="scanner-camera-stage"
  >
    {opening ? (
      <output
        className="text-sm font-semibold tracking-wide text-white/90"
        aria-live="polite"
      >
        {COPY.attendance.cameraOpening}
      </output>
    ) : (
      <p className="text-sm font-semibold tracking-wide text-white/90">
        {COPY.attendance.cameraLiveHint}
      </p>
    )}
    <figure
      className="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-[var(--radius-md)] border-2 border-white/40 bg-black/30 m-0"
      aria-label={COPY.attendance.camera}
    >
      {cameraOpen && (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
      )}
      <span className="absolute top-2 left-2 h-8 w-8 border-2 border-white border-r-0 border-b-0 pointer-events-none" />
      <span className="absolute top-2 right-2 h-8 w-8 border-2 border-white border-l-0 border-b-0 pointer-events-none" />
      <span className="absolute bottom-2 left-2 h-8 w-8 border-2 border-white border-r-0 border-t-0 pointer-events-none" />
      <span className="absolute bottom-2 right-2 h-8 w-8 border-2 border-white border-l-0 border-t-0 pointer-events-none" />
    </figure>
    <Button
      variant="ghost"
      className={cn(
        attendanceButtonVariants({ variant: "cameraStop" }),
        "absolute right-5 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-5"
      )}
      type="button"
      disabled={opening}
      aria-busy={opening}
      onClick={onStop}
    >
      {COPY.attendance.stopScan}
    </Button>
  </div>
);

export const ScannerUnavailableNotice = () => (
  <Alert
    variant="destructive"
    className="grid gap-2 border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)] p-4 rounded-[var(--radius-sm)]"
  >
    <strong>{COPY.attendance.cameraUnavailableTitle}</strong>
    <p>{COPY.attendance.cameraUnavailableHint}</p>
  </Alert>
);

const ScannerEventChoiceGroup = ({
  events,
  onSelect,
  headingRef,
  disabled = false,
  legendId,
  legendClassName,
  legend,
  lead,
  radioName,
  headingTabIndex,
}: {
  events: readonly AttendanceEvent[];
  onSelect: (event: AttendanceEvent) => void;
  headingRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
  legendId: string;
  legendClassName: string;
  legend: string;
  lead?: string;
  radioName: string;
  headingTabIndex?: -1;
}) => {
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const checked = events.find((event) => event.event_id === checkedId) ?? null;

  return (
    <fieldset className="grid gap-4 border-0 p-0 m-0 min-w-0">
      <legend
        id={legendId}
        ref={headingRef as Ref<HTMLLegendElement>}
        tabIndex={headingTabIndex}
        className={cn(
          "p-0 m-0 min-w-0 whitespace-normal [overflow-wrap:anywhere]",
          legendClassName
        )}
      >
        {legend}
      </legend>
      {lead && (
        <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          {lead}
        </p>
      )}
      <div className="grid gap-2 min-w-0">
        {events.map((event) => (
          <label
            key={event.event_id}
            className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] cursor-pointer hover:bg-[var(--surface)] min-w-0 motion-reduce:transition-none"
          >
            <input
              className="h-5 w-5 accent-[var(--accent)] shrink-0"
              type="radio"
              name={radioName}
              value={event.event_id}
              disabled={disabled}
              checked={checkedId === event.event_id}
              onChange={() => setCheckedId(event.event_id)}
            />
            <span className="grid gap-0.5 text-base text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
              <strong>{attendanceEventName(event)}</strong>
              <span className="text-sm text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                {attendanceEventMeta(event)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Button
        className={attendanceButtonVariants({ variant: "primary" })}
        type="button"
        disabled={disabled || !checked}
        onClick={() => {
          if (checked) {
            onSelect(checked);
          }
        }}
      >
        {COPY.attendance.continue}
      </Button>
    </fieldset>
  );
};

export const ScannerChooser = ({
  events,
  headingRef,
  onBack,
  onSelect,
}: {
  events: readonly AttendanceEvent[];
  headingRef?: RefObject<HTMLElement | null>;
  onBack: () => void;
  onSelect: (event: AttendanceEvent) => void;
}) => (
  <Card
    className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)]"
    role="region"
    aria-labelledby="scanner-chooser-title"
  >
    <header className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
        {COPY.attendance.chooseEvent}
      </span>
      <Button
        variant="link"
        className={attendanceButtonVariants({ variant: "back" })}
        type="button"
        onClick={onBack}
      >
        {COPY.attendance.rescan}
      </Button>
    </header>
    <Badge
      variant="outline"
      className="self-start px-2 py-0.5 text-xs font-semibold"
    >
      {COPY.attendance.recognizedMultiple}
    </Badge>
    <ScannerEventChoiceGroup
      events={events}
      onSelect={onSelect}
      headingRef={headingRef}
      legendId="scanner-chooser-title"
      legendClassName="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)]"
      legend={COPY.attendance.chooseMeeting}
      lead={COPY.attendance.chooseMeetingHint}
      radioName="scanner-event"
      headingTabIndex={-1}
    />
  </Card>
);

export const CheckinConfirmationIcon = ({
  kind,
  className,
  testId = "attendance-result-icon",
}: {
  kind: "success" | "duplicate";
  className?: string;
  testId?: string;
}) => (
  <svg
    className={`mx-auto h-16 w-16 fill-none stroke-[2] [stroke-linecap:round] [stroke-linejoin:round] ${
      kind === "success" ? "stroke-[var(--success)]" : "stroke-[var(--pending)]"
    }${className ? ` ${className}` : ""}`}
    viewBox="0 0 48 48"
    data-testid={`${testId}-${kind}`}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="24" cy="24" r="17" />
    {kind === "success" ? (
      <path d="m16 24 5 5 11-11" />
    ) : (
      <>
        <path d="M24 21v11" />
        <path d="M24 15h.01" />
      </>
    )}
  </svg>
);

const EventDetailIcon = ({ kind }: { kind: "time" | "location" }) => (
  <svg
    className="h-5 w-5 shrink-0 text-[var(--ink-muted)]"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    {kind === "time" ? (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 9h16" />
      </>
    ) : (
      <>
        <path d="M19 10c0 4.7-7 10-7 10s-7-5.3-7-10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2.25" />
      </>
    )}
  </svg>
);

export const ScannerConfirmation = ({
  event,
  headingRef,
  busy,
  error,
  retryAvailable,
  retryRef,
  onRescan,
  onSubmit,
  onRetry,
  onNotThisEvent,
}: {
  event: AttendanceEvent;
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  error: string;
  retryAvailable: boolean;
  retryRef: RefObject<HTMLButtonElement | null>;
  onRescan: () => void;
  onSubmit: () => void;
  onRetry: () => void;
  onNotThisEvent: () => void;
}) => (
  <Card
    className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)]"
    role="region"
    aria-labelledby="attendance-confirm-title"
  >
    <header className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
      <span>{COPY.attendance.confirmHeader}</span>
    </header>
    <Button
      variant="link"
      className={attendanceButtonVariants({ variant: "back" })}
      type="button"
      disabled={busy}
      onClick={onRescan}
    >
      {COPY.attendance.rescan}
    </Button>
    <Badge
      variant="outline"
      className="self-start px-2 py-0.5 text-xs font-semibold"
    >
      {COPY.attendance.recognizedBadge}
    </Badge>
    <h1
      id="attendance-confirm-title"
      ref={headingRef}
      className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
      tabIndex={-1}
    >
      {COPY.attendance.confirmTitle}
    </h1>
    <p className="-mt-1.5 text-base leading-relaxed text-[var(--ink-muted)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
      {COPY.attendance.confirmLead}
    </p>
    <article
      className="grid gap-3 p-4 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] min-w-0"
      aria-labelledby="attendance-confirm-event-title"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-deep)] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
        {event.program_name}
      </span>
      <h2
        id="attendance-confirm-event-title"
        className="text-xl font-extrabold text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
      >
        {attendanceEventName(event)}
      </h2>
      <div className="grid gap-2 border-t border-[var(--line)] pt-3">
        <div className="flex items-center gap-2 text-sm text-[var(--ink)] min-w-0">
          <EventDetailIcon kind="time" />
          <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
            <span className="font-bold text-[var(--ink-muted)] mr-1">
              {COPY.attendance.eventTime}
            </span>
            {hkWallLabel(event.starts_at)} – {hkWallLabel(event.ends_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--ink)] min-w-0">
          <EventDetailIcon kind="location" />
          <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
            <span className="font-bold text-[var(--ink-muted)] mr-1">
              {COPY.attendance.eventLocation}
            </span>
            {event.location?.trim() || COPY.attendance.eventLocation}
          </span>
        </div>
      </div>
    </article>
    <div className="mt-2 grid gap-3">
      {error && (
        <p className="text-sm text-[var(--error)] font-medium" role="alert">
          {error}
        </p>
      )}
      {retryAvailable ? (
        <Button
          ref={retryRef}
          className={attendanceButtonVariants({ variant: "primary" })}
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={onRetry}
        >
          {COPY.attendance.retry}
        </Button>
      ) : (
        <Button
          className={attendanceButtonVariants({ variant: "primary" })}
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={onSubmit}
        >
          {COPY.attendance.confirmSubmit}
        </Button>
      )}
      <Button
        variant="outline"
        className={attendanceButtonVariants({ variant: "secondary" })}
        type="button"
        disabled={busy}
        onClick={onNotThisEvent}
      >
        {COPY.attendance.notThisEvent}
      </Button>
    </div>
  </Card>
);

export const ScannerCheckinResult = ({
  event,
  kind,
  headingRef,
  onScanAgain,
}: {
  event: AttendanceEvent;
  kind: "success" | "duplicate";
  headingRef: RefObject<HTMLHeadingElement | null>;
  onScanAgain: () => void;
}) => (
  <Card
    className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)] text-center"
    role="region"
    aria-labelledby="attendance-result-title"
  >
    <header className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
      <span>{COPY.attendance.resultTitle}</span>
    </header>
    <CheckinConfirmationIcon kind={kind} />
    <h1
      id="attendance-result-title"
      ref={headingRef}
      className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
      tabIndex={-1}
    >
      {kind === "success"
        ? COPY.attendance.successTitle
        : COPY.attendance.duplicateTitle}
    </h1>
    {kind === "success" ? (
      <p className="text-base text-[var(--ink-muted)] leading-relaxed min-w-0 whitespace-normal [overflow-wrap:anywhere]">
        <span>{event.program_name}</span>
        <span aria-hidden="true"> · </span>
        <span>{attendanceEventName(event)}</span>
      </p>
    ) : (
      <p className="text-base text-[var(--ink-muted)] leading-relaxed">
        {COPY.attendance.duplicateBody}
      </p>
    )}
    <div className="mt-2 grid gap-3">
      <Button
        asChild
        className={attendanceButtonVariants({ variant: "primary" })}
      >
        <a href="/">{COPY.attendance.backHome}</a>
      </Button>
      <Button
        variant="outline"
        className={attendanceButtonVariants({ variant: "secondary" })}
        type="button"
        onClick={onScanAgain}
      >
        {COPY.attendance.scanAgain}
      </Button>
    </div>
  </Card>
);

const OutcomeIcon = ({
  kind,
}: {
  kind: "window-not-open" | "cancelled" | "not-enrolled";
}) => (
  <svg
    className={`mx-auto h-16 w-16 fill-none stroke-[2] [stroke-linecap:round] [stroke-linejoin:round] ${
      kind === "window-not-open"
        ? "stroke-[var(--pending)]"
        : kind === "cancelled"
          ? "stroke-[var(--error)]"
          : "stroke-[var(--ink-muted)]"
    }`}
    viewBox="0 0 48 48"
    data-testid={`attendance-outcome-icon-${kind}`}
    aria-hidden="true"
    focusable="false"
  >
    {kind === "window-not-open" ? (
      <>
        <circle cx="24" cy="24" r="17" />
        <path d="M24 14v11l7 4" />
      </>
    ) : (
      <>
        <circle cx="24" cy="24" r="17" />
        <path d="M24 21v11" />
        <path d="M24 15h.01" />
      </>
    )}
  </svg>
);

function opensThirtyMinutesBefore(
  opensAt: string | null,
  startsAt: string | null
): boolean {
  if (!opensAt || !startsAt) {
    return false;
  }
  const opens = Date.parse(opensAt);
  const starts = Date.parse(startsAt);
  return (
    Number.isFinite(opens) &&
    Number.isFinite(starts) &&
    starts - opens === 30 * 60 * 1000
  );
}

export const ScannerOutcome = ({
  kind,
  latest,
  programHref,
  headingRef,
  onBack,
}: {
  kind: "window-not-open" | "cancelled" | "not-enrolled";
  latest: AttendanceResolveLatest;
  programHref: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) => {
  const openingTime = hkTime24Label(latest.check_in_window_opens_at);
  const hasThirtyMinuteWindow = opensThirtyMinutesBefore(
    latest.check_in_window_opens_at,
    latest.starts_at
  );
  return (
    <Card
      className="grid gap-[1.125rem] p-5 bg-[var(--surface-raised)] border border-[var(--line-strong)] rounded-[var(--radius-md)] text-center"
      role="region"
      aria-labelledby="scanner-outcome-title"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
        {COPY.attendance.outcomeHeader}
      </p>
      <OutcomeIcon kind={kind} />
      <h1
        id="scanner-outcome-title"
        ref={headingRef}
        className="text-2xl font-extrabold leading-tight tracking-[0.01em] text-[var(--ink)] min-w-0 whitespace-normal [overflow-wrap:anywhere]"
        tabIndex={headingRef ? -1 : undefined}
      >
        {kind === "window-not-open"
          ? COPY.attendance.outcomeWindowTitle
          : kind === "cancelled"
            ? COPY.attendance.outcomeCancelledTitle
            : COPY.attendance.outcomeNotEnrolledTitle}
      </h1>
      {kind === "window-not-open" ? (
        openingTime ? (
          <p className="text-base text-[var(--ink-muted)] leading-relaxed min-w-0 whitespace-normal [overflow-wrap:anywhere]">
            {COPY.attendance.outcomeWindowBodyPrefix}{" "}
            <strong>{openingTime}</strong>{" "}
            {hasThirtyMinuteWindow
              ? COPY.attendance.outcomeWindowBodySuffix
              : COPY.attendance.outcomeWindowBodySuffixWithoutOffset}
          </p>
        ) : (
          <p className="text-base text-[var(--ink-muted)] leading-relaxed">
            {COPY.attendance.noEvents}
          </p>
        )
      ) : (
        <p className="text-base text-[var(--ink-muted)] leading-relaxed min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          {kind === "cancelled"
            ? COPY.attendance.outcomeCancelledBody
            : COPY.attendance.outcomeNotEnrolledBody}
        </p>
      )}
      <div className="mt-2 grid gap-3">
        {kind === "not-enrolled" && (
          <Button
            asChild
            className={attendanceButtonVariants({ variant: "primary" })}
          >
            <a href={programHref}>{COPY.attendance.viewProgramDetail}</a>
          </Button>
        )}
        <Button
          variant="outline"
          className={attendanceButtonVariants({ variant: "secondary" })}
          type="button"
          onClick={onBack}
        >
          {COPY.attendance.backToScan}
        </Button>
      </div>
    </Card>
  );
};

/**
 * Concise multi-Event picker shared by the Self and Guest check-in panels
 * (one QR resolving to several eligible Events). Rendered only by the caller
 * when `events.length > 1`.
 */
export const ScannerEventPicker = ({
  events,
  onSelect,
  headingRef,
  disabled = false,
}: {
  events: readonly AttendanceEvent[];
  onSelect: (event: AttendanceEvent) => void;
  headingRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
}) => (
  <div className="mt-4 grid gap-3 min-w-0" aria-labelledby="choose-event-title">
    <ScannerEventChoiceGroup
      events={events}
      onSelect={onSelect}
      headingRef={headingRef}
      disabled={disabled}
      legendId="choose-event-title"
      legendClassName="text-xl font-extrabold leading-snug text-[var(--ink)]"
      legend={COPY.attendance.chooseEvent}
      radioName="choose-event"
      headingTabIndex={headingRef ? -1 : undefined}
    />
  </div>
);
