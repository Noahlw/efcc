"use client";

import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  assistedCheckIn,
  correctGuestAttendance,
  listAttendanceRoster,
  listManageableEvents,
  searchAttendanceMembers,
  voidAttendance,
} from "@/lib/programs/program-api";
import type {
  AttendanceEvent,
  AttendanceMember,
  AttendanceRow,
} from "@/lib/programs/program-api";

import styles from "./attendance-panel.module.css";

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

export const AttendanceOperatorPanel = () => {
  const [eventId, setEventId] = useState("");
  const [chooserEvents, setChooserEvents] = useState<AttendanceEvent[]>([]);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [event, setEvent] = useState<AttendanceEvent | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionName, setCorrectionName] = useState("");
  const [correctionPhone, setCorrectionPhone] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [status, setStatus] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    },
    []
  );

  function showError(error: unknown) {
    const message =
      error instanceof RpcError
        ? errorCopyFor(error.problem.code, error.problem.detail)
        : COPY.error.networkError;
    setStatus(message);
    announce(message);
  }

  async function loadRoster(eventIdInput = eventId) {
    if (!eventIdInput.trim()) {
      setStatus(COPY.attendance.eventId);
      return;
    }
    try {
      const result = await listAttendanceRoster(eventIdInput.trim());
      setEvent(result.event);
      setRows(result.attendances);
      setStatus(`${result.attendances.length} ${COPY.attendance.roster}`);
    } catch (error) {
      showError(error);
    }
  }

  async function searchMembers() {
    try {
      const result = await searchAttendanceMembers(eventId.trim(), query);
      setMembers(result.members);
    } catch (error) {
      showError(error);
    }
  }

  async function checkIn(
    member: AttendanceMember,
    method: "leader_qr_scan" | "leader_manual_search" = "leader_manual_search"
  ) {
    try {
      await assistedCheckIn(eventId.trim(), member.user_id, method);
      setStatus(COPY.attendance.success);
      await loadRoster();
    } catch (error) {
      showError(error);
    }
  }

  async function scanMember(rawValue: string) {
    // Exact QR match through the same members endpoint the manual search
    // uses; no separate endpoint needed (the search filters account_status
    // Active + enrolled). Check in only when the scan resolves to one member.
    try {
      const result = await searchAttendanceMembers(eventId.trim(), rawValue);
      if (result.members.length !== 1) {
        const message = COPY.attendance.memberSearch;
        setStatus(message);
        announce(message);
        return;
      }
      await checkIn(result.members[0], "leader_qr_scan");
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    // The events list deep-links here (e.g. /events?eventId=...); keep the
    // static-export-friendly window.location.search read, same as the scanner.
    const params = new URLSearchParams(window.location.search);
    const id = params.get("eventId");
    if (id) {
      setEventId(id);
      void loadRoster(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Operator chooser (Spec 081 US 20): list Events the actor can assist.
    void (async () => {
      try {
        const result = await listManageableEvents();
        setChooserEvents(result.events);
      } catch (error) {
        showError(error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function voidRow(row: AttendanceRow) {
    if (!voidReason.trim()) {
      setStatus(COPY.attendance.voidReason);
      return;
    }
    try {
      await voidAttendance(row.attendance_id, voidReason);
      setVoidReason("");
      await loadRoster();
    } catch (error) {
      showError(error);
    }
  }

  async function saveCorrection() {
    if (!correctionId) {
      return;
    }
    try {
      await correctGuestAttendance(correctionId, {
        name: correctionName,
        phone: correctionPhone,
        reason: correctionReason,
      });
      setCorrectionId(null);
      await loadRoster();
    } catch (error) {
      showError(error);
    }
  }

  function stopCamera() {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    setCameraOpen(false);
  }

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
        stopCamera();
        await scanMember(value);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="operator-title">
        <h1 id="operator-title" className={styles.title}>
          {COPY.sections.events}
        </h1>
        {chooserEvents.length > 0 && (
          <div className={styles.form}>
            <label className={styles.field} htmlFor="event-chooser">
              {COPY.attendance.chooseEvent}
              <select
                id="event-chooser"
                className={styles.input}
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  void loadRoster(e.target.value);
                }}
              >
                <option value="">—</option>
                {chooserEvents.map((chooserEvent) => (
                  <option
                    key={chooserEvent.event_id}
                    value={chooserEvent.event_id}
                  >
                    {chooserEvent.program_name} ·{" "}
                    {new Date(chooserEvent.starts_at).toLocaleString("zh-HK")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className={styles.form}>
          <label className={styles.field} htmlFor="event-id">
            {COPY.attendance.eventId}
            <input
              id="event-id"
              className={styles.input}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </label>
          <button
            className={styles.button}
            type="button"
            onClick={() => void loadRoster()}
          >
            {COPY.attendance.roster}
          </button>
        </div>
        {event && (
          <p className={styles.hint}>
            {event.program_name} ·{" "}
            {new Date(event.starts_at).toLocaleString("zh-HK")}
          </p>
        )}
        {event && (
          <div className={styles.form}>
            <button
              className={styles.button}
              type="button"
              onClick={() => void startCamera()}
            >
              {cameraOpen
                ? COPY.attendance.cameraRetry
                : COPY.attendance.camera}
            </button>
            {cameraOpen && (
              <button
                className={styles.button}
                type="button"
                onClick={stopCamera}
              >
                {COPY.attendance.cameraClose}
              </button>
            )}
          </div>
        )}
        {cameraOpen && (
          <video
            ref={videoRef}
            className={styles.video}
            muted
            playsInline
            aria-label={COPY.attendance.camera}
          />
        )}
        <div className={styles.form}>
          <label className={styles.field} htmlFor="member-search">
            {COPY.attendance.memberSearch}
            <input
              id="member-search"
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className={styles.button}
            type="button"
            onClick={() => void searchMembers()}
          >
            {COPY.attendance.search}
          </button>
        </div>
        {members.length > 0 && (
          <ul className={styles.events}>
            {members.map((member) => (
              <li key={member.user_id}>
                <button
                  className={styles.eventButton}
                  type="button"
                  onClick={() => void checkIn(member)}
                >
                  <strong>{member.name}</strong>
                  <span className={styles.eventMeta}>
                    {member.phone ?? member.user_id}
                  </span>
                  <span>{COPY.attendance.checkInMember}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <div className={styles.fields}>
            <h2>{COPY.attendance.roster}</h2>
            {rows.map((row) => (
              <article className={styles.card} key={row.attendance_id}>
                <strong>{row.guest_name ?? row.member_user_id}</strong>
                <span className={styles.eventMeta}>
                  {row.guest_phone ?? row.method}
                </span>
                <span>{row.status}</span>
                {row.status === "Active" && (
                  <>
                    <label
                      className={styles.field}
                      htmlFor={`void-${row.attendance_id}`}
                    >
                      {COPY.attendance.voidReason}
                      <input
                        id={`void-${row.attendance_id}`}
                        className={styles.input}
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                      />
                    </label>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={() => void voidRow(row)}
                    >
                      {COPY.attendance.void}
                    </button>
                    {row.member_user_id === null && (
                      <button
                        className={styles.button}
                        type="button"
                        onClick={() => {
                          setCorrectionId(row.attendance_id);
                          setCorrectionName(row.guest_name ?? "");
                          setCorrectionPhone(row.guest_phone ?? "");
                        }}
                      >
                        {COPY.attendance.correctGuest}
                      </button>
                    )}
                  </>
                )}
                {correctionId === row.attendance_id && (
                  <div className={styles.fields}>
                    <label className={styles.field} htmlFor="correction-name">
                      {COPY.attendance.guestName}
                      <input
                        id="correction-name"
                        className={styles.input}
                        value={correctionName}
                        onChange={(e) => setCorrectionName(e.target.value)}
                      />
                    </label>
                    <label className={styles.field} htmlFor="correction-phone">
                      {COPY.attendance.guestPhone}
                      <input
                        id="correction-phone"
                        className={styles.input}
                        value={correctionPhone}
                        onChange={(e) => setCorrectionPhone(e.target.value)}
                      />
                    </label>
                    <label className={styles.field} htmlFor="correction-reason">
                      {COPY.attendance.correctionReason}
                      <input
                        id="correction-reason"
                        className={styles.input}
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                      />
                    </label>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={() => void saveCorrection()}
                    >
                      {COPY.attendance.saveCorrection}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {event && (
          <button
            className={styles.button}
            type="button"
            onClick={() => window.print()}
          >
            {COPY.attendance.printSheet}
          </button>
        )}
        <output className={styles.status} aria-live="polite">
          {status}
        </output>
      </section>
    </main>
  );
};
