"use client";

import type { ReactNode, RefObject } from "react";

import type { AttendanceEvent } from "@/lib/attendance";
import {
  attendanceEventMeta,
  attendanceEventName,
} from "@/lib/attendance-display";
import { COPY } from "@/lib/copy";
import { Icon } from "@/lib/icons";

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

/**
 * Camera start/video/close trio shared by the Self and Guest check-in panels.
 * The Assisted panel keeps its own arrangement (close button sits beside the
 * start button, not below the video), so it does not reuse this component.
 */
export const ScannerCamera = ({
  cameraOpen,
  videoRef,
  onStart,
  onClose,
  startLabel,
}: {
  cameraOpen: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStart: () => void;
  onClose: () => void;
  startLabel?: string;
}) => (
  <div className={styles.cameraCard}>
    <div className={styles.viewfinder}>
      {cameraOpen ? (
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
      ) : (
        <div className={styles.viewfinderPlaceholder} aria-hidden="true">
          <svg
            className={styles.cameraIcon}
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 16h7l3-4h12l3 4h7a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Z" />
            <circle cx="24" cy="27" r="7" />
          </svg>
        </div>
      )}
      <div className={styles.viewfinderFrame} aria-hidden="true" />
    </div>
    <div className={styles.cameraActions}>
      <button className={styles.button} type="button" onClick={onStart}>
        {cameraOpen
          ? COPY.attendance.cameraRetry
          : (startLabel ?? COPY.attendance.camera)}
      </button>
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
  </div>
);

export const ScannerCameraUnavailable = () => (
  <div
    className={`${styles.status} ${styles.cameraUnavailable}`}
    data-tone="error"
    role="alert"
    aria-live="assertive"
  >
    <strong>{COPY.attendance.cameraUnavailableTitle}</strong>
    <p>{COPY.attendance.cameraUnavailableGuidance}</p>
  </div>
);

export const ScannerResultCard = ({
  headingId,
  tone,
  heading,
  message,
  children,
}: {
  headingId: string;
  tone: "info" | "success";
  heading: string;
  message: string;
  children: ReactNode;
}) => (
  <article className={styles.resultCard} aria-labelledby={headingId}>
    <div
      className={`${styles.resultIcon} ${
        tone === "success" ? styles.resultIconSuccess : styles.resultIconInfo
      }`}
      aria-hidden="true"
    >
      <Icon name={tone === "success" ? "check" : "info"} size={34} />
    </div>
    <h1 id={headingId} className={styles.resultTitle}>
      {heading}
    </h1>
    <p className={styles.resultCopy}>{message}</p>
    <div className={styles.resultActions}>{children}</div>
  </article>
);

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
