"use client";

import { useEffect, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { writeGuestCredential } from "@/lib/guest-context";
import { announce } from "@/lib/live-region";
import {
  guestCheckIn,
  resolveAttendance,
  selfCheckIn,
} from "@/lib/programs/program-api";
import type { AttendanceEvent } from "@/lib/programs/program-api";
import { hkWallLabel } from "@/lib/hk-time";
import { useQrCamera } from "@/lib/use-qr-camera";

import styles from "./attendance-panel.module.css";

type StatusTone = "info" | "success" | "error";

function eventLabel(event: AttendanceEvent): string {
  return `${event.program_name} · ${hkWallLabel(event.starts_at)}`;
}

function entryFromValue(value: string): { value: string; fromQr: boolean } {
  try {
    const url = new URL(value);
    const programToken = url.searchParams.get("program_token");
    const manualCode = url.searchParams.get("manual_code");
    if (programToken) {
      return { value: programToken, fromQr: true };
    }
    if (manualCode) {
      return { value: manualCode, fromQr: false };
    }
  } catch {
    // Manual input is not required to be a URL.
  }
  // A bare value carries no identity: the server disambiguates manual code
  // vs Program token (never guess by length).
  return { value: value.trim(), fromQr: false };
}

export const AttendancePanel = ({
  guest = false,
  title,
}: {
  guest?: boolean;
  title?: string;
}) => {
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selected, setSelected] = useState<AttendanceEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<StatusTone>("info");

  /** Status + tone are updated together on every feedback path. */
  const showStatus = (message: string, nextTone: StatusTone = "info") => {
    setStatus(message);
    setTone(nextTone);
  };

  async function resolve(value: string, fromQr = false) {
    const entry = entryFromValue(value);
    if (!entry.value) {
      showStatus(COPY.attendance.inputLabel);
      return;
    }
    setBusy(true);
    showStatus(COPY.attendance.resolving);
    try {
      // Bare typed values are ambiguous (manual code vs Program token): send
      // them as `entry` and let the server disambiguate. URL-sourced values
      // carry their kind explicitly.
      const result =
        fromQr || entry.fromQr
          ? await resolveAttendance({ program_token: entry.value })
          : await resolveAttendance({ entry: entry.value });
      setEvents(result.events);
      setSelected(result.events.length === 1 ? result.events[0] : null);
      const message =
        result.events.length === 0
          ? COPY.attendance.noEvents
          : result.events.length === 1
            ? eventLabel(result.events[0])
            : COPY.attendance.chooseEvent;
      showStatus(message);
      announce(message);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      showStatus(message, "error");
      announce(message);
    } finally {
      setBusy(false);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (value) => {
      const entry = entryFromValue(value);
      setInput(entry.value);
      stopCamera();
      void resolve(entry.value, entry.fromQr);
    },
    onUnavailable: () => showStatus(COPY.attendance.cameraUnavailable, "error"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const programToken = params.get("program_token");
    const manualCode = params.get("manual_code");
    if (!programToken && !manualCode) {
      return;
    }
    setInput(programToken ?? manualCode ?? "");
    void resolve(programToken ?? manualCode ?? "", Boolean(programToken));
    // The URL is the QR entry seam; only run it when the deep-link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!selected) {
      showStatus(COPY.attendance.chooseEvent);
      return;
    }
    setBusy(true);
    try {
      const entry = entryFromValue(input);
      const credential = entry.fromQr
        ? { program_token: entry.value }
        : { entry: entry.value };
      const result = guest
        ? await guestCheckIn({
            event_id: selected.event_id,
            method: entry.fromQr ? "guest_qr_scan" : "guest_manual_code",
            name,
            phone,
            ...credential,
          })
        : await selfCheckIn({
            event_id: selected.event_id,
            method: entry.fromQr ? "self_qr_scan" : "self_manual_code",
            ...credential,
          });
      const message =
        result.outcome === "duplicate"
          ? guest
            ? COPY.attendance.guestDuplicate
            : COPY.attendance.duplicate
          : COPY.attendance.success;
      // Already-done outcomes are notices, not failures: neutral tone.
      showStatus(message, result.outcome === "duplicate" ? "info" : "success");
      announce(message);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      showStatus(message, "error");
      announce(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {title ??
            (guest ? COPY.attendance.guestTitle : COPY.sections.scanner)}
        </h1>
        {guest && (
          <p className={styles.lead}>{COPY.attendance.signedOutNote}</p>
        )}
        <button
          className={styles.button}
          type="button"
          onClick={() => void startCamera()}
        >
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
              onClick={stopCamera}
            >
              {COPY.attendance.cameraClose}
            </button>
          </div>
        )}
        <form
          className={styles.inputRow}
          onSubmit={(event) => {
            event.preventDefault();
            void resolve(input);
          }}
        >
          <label className={styles.field} htmlFor="attendance-code">
            <span className={styles.fieldLabel}>
              {COPY.attendance.inputLabel}
            </span>
            <input
              id="attendance-code"
              className={styles.input}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={COPY.attendance.inputPlaceholder}
              autoComplete="off"
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? COPY.attendance.resolving : COPY.attendance.resolve}
          </button>
        </form>
        {events.length > 1 && (
          <div className={styles.group} aria-labelledby="choose-event-title">
            <h2 id="choose-event-title" className={styles.sectionTitle}>
              {COPY.attendance.chooseEvent}
            </h2>
            <ul className={styles.events}>
              {events.map((event) => (
                <li key={event.event_id}>
                  <button
                    className={styles.eventButton}
                    type="button"
                    aria-pressed={selected?.event_id === event.event_id}
                    onClick={() => setSelected(event)}
                  >
                    <strong>{event.program_name}</strong>
                    <span className={styles.eventMeta}>
                      {hkWallLabel(event.starts_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {guest && selected && (
          <form
            className={styles.group}
            aria-labelledby="guest-fields-title"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <h2 id="guest-fields-title" className={styles.sectionTitle}>
              {COPY.attendance.guestFields}
            </h2>
            <div className={styles.fields}>
              <label className={styles.field} htmlFor="guest-name">
                <span className={styles.fieldLabel}>
                  {COPY.attendance.guestName}
                </span>
                <input
                  id="guest-name"
                  className={styles.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </label>
              <label className={styles.field} htmlFor="guest-phone">
                <span className={styles.fieldLabel}>
                  {COPY.attendance.guestPhone}
                </span>
                <input
                  id="guest-phone"
                  className={styles.input}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  aria-describedby="guest-phone-hint"
                />
                <span id="guest-phone-hint" className={styles.fieldHint}>
                  {COPY.attendance.guestPhoneHint}
                </span>
              </label>
            </div>
            <button
              className={styles.button}
              type="submit"
              disabled={busy}
              aria-busy={busy}
            >
              {COPY.attendance.guestSubmit}
            </button>
          </form>
        )}
        {selected && (
          <p className={styles.hint}>
            {COPY.attendance.eventTime}: {eventLabel(selected)}
          </p>
        )}
        {selected && !guest && (
          <button
            className={styles.button}
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void submit()}
          >
            {COPY.attendance.memberSubmit}
          </button>
        )}
        <output
          className={styles.status}
          data-tone={status ? tone : undefined}
          aria-live="polite"
          aria-atomic="true"
        >
          {status}
        </output>
        {guest && (
          <div className={styles.group}>
            <a
              className={styles.back}
              href="/"
              onClick={() => {
                const entry = entryFromValue(input);
                if (entry.value) {
                  writeGuestCredential({
                    kind: entry.fromQr ? "program_token" : "manual_code",
                    value: entry.value,
                  });
                }
              }}
            >
              {COPY.attendance.loginForMember}
            </a>
            <a className={styles.back} href="/">
              {COPY.nav.backToHome}
            </a>
          </div>
        )}
      </section>
    </div>
  );
};
