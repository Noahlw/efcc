"use client";

import type { RefObject } from "react";

import type { AttendanceEvent } from "@/lib/attendance";
import {
  attendanceEventMeta,
  attendanceEventName,
} from "@/lib/attendance-display";
import { COPY } from "@/lib/copy";

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
}: {
  cameraOpen: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStart: () => void;
  onClose: () => void;
}) => (
  <>
    <button className={styles.button} type="button" onClick={onStart}>
      {cameraOpen ? COPY.attendance.cameraRetry : COPY.attendance.camera}
    </button>
    {cameraOpen && (
      <div className={styles.group}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={COPY.attendance.camera}
        />
        <button
          className={styles.buttonSecondary}
          type="button"
          onClick={onClose}
        >
          {COPY.attendance.cameraClose}
        </button>
      </div>
    )}
  </>
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
