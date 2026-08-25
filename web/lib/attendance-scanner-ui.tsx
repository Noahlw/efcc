"use client";

import type { RefObject } from "react";

import type {
  AttendanceEvent,
  AttendanceResolveLatest,
} from "@/lib/attendance";
import {
  attendanceEventMeta,
  attendanceEventName,
} from "@/lib/attendance-display";
import { COPY } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";

import styles from "./attendance-panel.module.css";

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
    className={styles.status}
    data-tone={message ? tone : undefined}
    aria-live="polite"
    aria-atomic="true"
  >
    {message}
  </output>
);

const CameraIcon = () => (
  <svg
    className={styles.cameraIcon}
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M13 17h4l3-4h8l3 4h4a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V21a4 4 0 0 1 4-4Z" />
    <circle cx="24" cy="27" r="7" />
  </svg>
);

const ChevronIcon = () => (
  <svg
    className={styles.chevron}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="m9 5 7 7-7 7" />
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
  <div className={styles.cameraGroup}>
    <div className={styles.cameraFrame} aria-label={COPY.attendance.camera}>
      {cameraOpen && (
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
      )}
      <span className={`${styles.cameraCorner} ${styles.cameraCornerTop}`} />
      <span className={`${styles.cameraCorner} ${styles.cameraCornerRight}`} />
      <span className={`${styles.cameraCorner} ${styles.cameraCornerBottom}`} />
      <span className={`${styles.cameraCorner} ${styles.cameraCornerLeft}`} />
      {!cameraOpen && <CameraIcon />}
    </div>
    {!cameraOpen && (
      <button
        className={styles.button}
        type="button"
        data-camera-available={cameraAvailable}
        onClick={onStart}
      >
        {COPY.attendance.startScan}
      </button>
    )}
    {cameraOpen && (
      <button
        className={styles.buttonSecondary}
        type="button"
        onClick={onClose}
      >
        {COPY.attendance.cameraClose}
      </button>
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
    className={`${styles.cameraStage} ${
      opening ? styles.cameraStageOpening : ""
    }`}
    data-camera-state={opening ? "opening" : "live"}
    data-testid="scanner-camera-stage"
  >
    {opening ? (
      <output className={styles.cameraState} aria-live="polite">
        {COPY.attendance.cameraOpening}
      </output>
    ) : (
      <p className={styles.cameraHint}>{COPY.attendance.cameraLiveHint}</p>
    )}
    <figure
      className={styles.cameraFrameLive}
      aria-label={COPY.attendance.camera}
    >
      {cameraOpen && (
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
      )}
      <span
        className={`${styles.cameraCornerLive} ${styles.cameraCornerLiveTopLeft}`}
      />
      <span
        className={`${styles.cameraCornerLive} ${styles.cameraCornerLiveTopRight}`}
      />
      <span
        className={`${styles.cameraCornerLive} ${styles.cameraCornerLiveBottomLeft}`}
      />
      <span
        className={`${styles.cameraCornerLive} ${styles.cameraCornerLiveBottomRight}`}
      />
    </figure>
    <button
      className={styles.cameraStop}
      type="button"
      disabled={opening}
      aria-busy={opening}
      onClick={onStop}
    >
      {COPY.attendance.stopScan}
    </button>
  </div>
);

export const ScannerUnavailableNotice = () => (
  <div className={styles.cameraUnavailable} role="alert">
    <strong>{COPY.attendance.cameraUnavailableTitle}</strong>
    <p>{COPY.attendance.cameraUnavailableHint}</p>
  </div>
);

export const ScannerChooser = ({
  events,
  headingRef,
  onBack,
  onSelect,
}: {
  events: readonly AttendanceEvent[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSelect: (event: AttendanceEvent) => void;
}) => (
  <section className={styles.chooser} aria-labelledby="scanner-chooser-title">
    <header className={styles.chooserHeader}>
      <span className={styles.chooserTitle}>{COPY.attendance.chooseEvent}</span>
      <button className={styles.back} type="button" onClick={onBack}>
        {COPY.attendance.rescan}
      </button>
    </header>
    <span className={styles.chooserTag}>
      {COPY.attendance.recognizedMultiple}
    </span>
    <h1
      id="scanner-chooser-title"
      ref={headingRef}
      className={styles.title}
      tabIndex={-1}
    >
      {COPY.attendance.chooseMeeting}
    </h1>
    <p className={styles.lead}>{COPY.attendance.chooseMeetingHint}</p>
    <ul className={styles.events}>
      {events.map((event) => (
        <li key={event.event_id}>
          <button
            className={styles.eventButton}
            type="button"
            onClick={() => onSelect(event)}
          >
            <span className={styles.eventCopy}>
              <strong>{attendanceEventName(event)}</strong>
              <span className={styles.eventMeta}>
                {attendanceEventMeta(event)}
              </span>
            </span>
            <ChevronIcon />
          </button>
        </li>
      ))}
    </ul>
  </section>
);

const CheckinConfirmationIcon = ({
  kind,
}: {
  kind: "success" | "duplicate";
}) => (
  <svg
    className={`${styles.checkinResultIcon} ${
      kind === "success"
        ? styles.checkinResultIconSuccess
        : styles.checkinResultIconDuplicate
    }`}
    viewBox="0 0 48 48"
    data-testid={`attendance-result-icon-${kind}`}
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
    className={styles.confirmDetailIcon}
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
  <section
    className={styles.confirmation}
    aria-labelledby="attendance-confirm-title"
  >
    <header className={styles.confirmHeader}>
      <span>{COPY.attendance.confirmHeader}</span>
    </header>
    <button
      className={styles.back}
      type="button"
      disabled={busy}
      onClick={onRescan}
    >
      {COPY.attendance.rescan}
    </button>
    <span className={styles.confirmTag}>{COPY.attendance.recognizedBadge}</span>
    <h1
      id="attendance-confirm-title"
      ref={headingRef}
      className={styles.title}
      tabIndex={-1}
    >
      {COPY.attendance.confirmTitle}
    </h1>
    <p className={styles.lead}>{COPY.attendance.confirmLead}</p>
    <article
      className={styles.confirmCard}
      aria-labelledby="attendance-confirm-event-title"
    >
      <span className={styles.confirmProgram}>{event.program_name}</span>
      <h2
        id="attendance-confirm-event-title"
        className={styles.confirmEventTitle}
      >
        {attendanceEventName(event)}
      </h2>
      <div className={styles.confirmDetails}>
        <div className={styles.confirmDetail}>
          <EventDetailIcon kind="time" />
          <span>
            {hkWallLabel(event.starts_at)} – {hkWallLabel(event.ends_at)}
          </span>
        </div>
        <div className={styles.confirmDetail}>
          <EventDetailIcon kind="location" />
          <span>{event.location?.trim() || COPY.attendance.eventLocation}</span>
        </div>
      </div>
    </article>
    <div className={styles.confirmActions}>
      <button
        className={styles.button}
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={onSubmit}
      >
        {COPY.attendance.confirmSubmit}
      </button>
      {error && (
        <p className={styles.confirmError} role="alert">
          {error}
        </p>
      )}
      {retryAvailable && (
        <button
          ref={retryRef}
          className={styles.buttonSecondary}
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={onRetry}
        >
          {COPY.attendance.retry}
        </button>
      )}
      <button
        className={styles.buttonSecondary}
        type="button"
        disabled={busy}
        onClick={onNotThisEvent}
      >
        {COPY.attendance.notThisEvent}
      </button>
    </div>
  </section>
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
  <section
    className={`${styles.card} ${styles.checkinResult}`}
    aria-labelledby="attendance-result-title"
  >
    <header className={styles.resultHeader}>
      <span>{COPY.attendance.resultTitle}</span>
    </header>
    <CheckinConfirmationIcon kind={kind} />
    <h1
      id="attendance-result-title"
      ref={headingRef}
      className={styles.title}
      tabIndex={-1}
    >
      {kind === "success"
        ? COPY.attendance.successTitle
        : COPY.attendance.duplicateTitle}
    </h1>
    {kind === "success" ? (
      <p className={styles.resultCopy}>
        <span>{event.program_name}</span>
        <span aria-hidden="true"> · </span>
        <span>{attendanceEventName(event)}</span>
      </p>
    ) : (
      <p className={styles.resultCopy}>{COPY.attendance.duplicateBody}</p>
    )}
    <div className={styles.resultActions}>
      <a className={styles.button} href="/">
        {COPY.attendance.backHome}
      </a>
      <button
        className={styles.buttonSecondary}
        type="button"
        onClick={onScanAgain}
      >
        {COPY.attendance.scanAgain}
      </button>
    </div>
  </section>
);

const OutcomeIcon = ({
  kind,
}: {
  kind: "window-not-open" | "cancelled" | "not-enrolled";
}) => (
  <svg
    className={`${styles.outcomeIcon} ${
      kind === "window-not-open"
        ? styles.outcomeIconWindow
        : kind === "cancelled"
          ? styles.outcomeIconCancelled
          : styles.outcomeIconNotEnrolled
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

function formatOpeningTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

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
  const openingTime = formatOpeningTime(latest.check_in_window_opens_at);
  const hasThirtyMinuteWindow = opensThirtyMinutesBefore(
    latest.check_in_window_opens_at,
    latest.starts_at
  );
  return (
    <section
      className={`${styles.card} ${styles.outcome}`}
      aria-labelledby="scanner-outcome-title"
    >
      <p className={styles.outcomeHeader}>{COPY.attendance.outcomeHeader}</p>
      <OutcomeIcon kind={kind} />
      <h1
        id="scanner-outcome-title"
        ref={headingRef}
        className={styles.title}
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
          <p className={styles.outcomeBody}>
            {COPY.attendance.outcomeWindowBodyPrefix}{" "}
            <strong>{openingTime}</strong>{" "}
            {hasThirtyMinuteWindow
              ? COPY.attendance.outcomeWindowBodySuffix
              : COPY.attendance.outcomeWindowBodySuffixWithoutOffset}
          </p>
        ) : (
          <p className={styles.outcomeBody}>{COPY.attendance.noEvents}</p>
        )
      ) : (
        <p className={styles.outcomeBody}>
          {kind === "cancelled"
            ? COPY.attendance.outcomeCancelledBody
            : COPY.attendance.outcomeNotEnrolledBody}
        </p>
      )}
      <div className={styles.outcomeActions}>
        {kind === "not-enrolled" && (
          <a className={styles.button} href={programHref}>
            {COPY.attendance.viewProgramDetail}
          </a>
        )}
        <button
          className={styles.buttonSecondary}
          type="button"
          onClick={onBack}
        >
          {COPY.attendance.backToScan}
        </button>
      </div>
    </section>
  );
};

/**
 * Concise multi-Event picker shared by the Self and Guest check-in panels
 * (one QR resolving to several eligible Events). Rendered only by the caller
 * when `events.length > 1`.
 */
export const ScannerEventPicker = ({
  events,
  selectedId,
  onSelect,
  headingRef,
}: {
  events: readonly AttendanceEvent[];
  selectedId: string | null;
  onSelect: (event: AttendanceEvent) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) => (
  <div className={styles.group} aria-labelledby="choose-event-title">
    <h2
      id="choose-event-title"
      ref={headingRef}
      className={styles.sectionTitle}
      tabIndex={headingRef ? -1 : undefined}
    >
      {COPY.attendance.chooseEvent}
    </h2>
    <ul className={styles.events}>
      {events.map((event) => (
        <li key={event.event_id}>
          <button
            className={styles.eventButton}
            type="button"
            aria-pressed={selectedId === event.event_id}
            onClick={() => onSelect(event)}
          >
            <strong>{attendanceEventName(event)}</strong>
            <span className={styles.eventMeta}>
              {attendanceEventMeta(event)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </div>
);
