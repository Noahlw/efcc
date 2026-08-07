"use client";

import { useEffect, useRef, useState } from "react";

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

import styles from "./attendance-panel.module.css";

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

function eventLabel(event: AttendanceEvent): string {
  return `${event.program_name} · ${new Date(event.starts_at).toLocaleString("zh-HK")}`;
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function resolve(value: string, fromQr = false) {
    const entry = entryFromValue(value);
    if (!entry.value) {
      setStatus(COPY.attendance.inputLabel);
      return;
    }
    setBusy(true);
    setStatus(COPY.attendance.resolving);
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
        result.events.length === 1
          ? eventLabel(result.events[0])
          : COPY.attendance.chooseEvent;
      setStatus(message);
      announce(message);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setStatus(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  }

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

  useEffect(
    () => () => {
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    },
    []
  );

  function stopCamera() {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    setCameraOpen(false);
  }

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) {
      return;
    }
    const detector = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!detector) {
      setStatus(COPY.attendance.cameraUnavailable);
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    let cancelled = false;
    const scanner = new detector({ formats: ["qr_code"] });
    const scan = async () => {
      if (cancelled) {
        return;
      }
      const codes = await scanner.detect(video);
      const value = codes[0]?.rawValue;
      if (value) {
        const entry = entryFromValue(value);
        setInput(entry.value);
        stopCamera();
        await resolve(entry.value, entry.fromQr);
        return;
      }
      requestAnimationFrame(() => void scan());
    };
    video.srcObject = stream;
    const startScan = async () => {
      await video.play();
      await scan();
    };
    void startScan();
    return () => {
      cancelled = true;
    };
  }, [cameraOpen]);

  async function startCamera() {
    const detector = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!detector || !navigator.mediaDevices?.getUserMedia) {
      setStatus(COPY.attendance.cameraUnavailable);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      stopCamera();
      setStatus(COPY.attendance.cameraUnavailable);
    }
  }

  async function submit() {
    if (!selected) {
      setStatus(COPY.attendance.chooseEvent);
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
      setStatus(message);
      announce(message);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setStatus(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {title ??
            (guest ? COPY.attendance.guestTitle : COPY.sections.scanner)}
        </h1>
        <p className={styles.lead}>
          {guest ? COPY.attendance.signedOutNote : COPY.sections.scanner}
        </p>
        <button
          className={styles.button}
          type="button"
          onClick={() => void startCamera()}
        >
          {cameraOpen ? COPY.attendance.cameraRetry : COPY.attendance.camera}
        </button>
        {cameraOpen && (
          <>
            <video
              ref={videoRef}
              className={styles.video}
              muted
              playsInline
              aria-label={COPY.attendance.camera}
            />
            <button
              className={styles.button}
              type="button"
              onClick={stopCamera}
            >
              {COPY.attendance.cameraClose}
            </button>
          </>
        )}
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void resolve(input);
          }}
        >
          <label className={styles.field} htmlFor="attendance-code">
            {COPY.attendance.inputLabel}
            <input
              id="attendance-code"
              className={styles.input}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={COPY.attendance.inputPlaceholder}
              autoComplete="off"
            />
          </label>
          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? COPY.attendance.resolving : COPY.attendance.resolve}
          </button>
        </form>
        {events.length > 1 && (
          <div>
            <h2>{COPY.attendance.chooseEvent}</h2>
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
                      {new Date(event.starts_at).toLocaleString("zh-HK")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {guest && selected && (
          <div className={styles.fields}>
            <label className={styles.field} htmlFor="guest-name">
              {COPY.attendance.guestName}
              <input
                id="guest-name"
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>
            <label className={styles.field} htmlFor="guest-phone">
              {COPY.attendance.guestPhone}
              <input
                id="guest-phone"
                className={styles.input}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </label>
          </div>
        )}
        {selected && (
          <p className={styles.hint}>
            {COPY.attendance.eventTime}: {eventLabel(selected)}
          </p>
        )}
        {selected && (
          <button
            className={styles.button}
            type="button"
            disabled={busy}
            onClick={() => void submit()}
          >
            {guest ? COPY.attendance.guestSubmit : COPY.attendance.memberSubmit}
          </button>
        )}
        <output className={styles.status} aria-live="polite">
          {status}
        </output>
        {guest && (
          <>
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
          </>
        )}
      </section>
    </main>
  );
};
