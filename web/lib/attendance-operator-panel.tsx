"use client";

import { useEffect, useState } from "react";

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
import { useQrCamera } from "@/lib/use-qr-camera";

import styles from "./attendance-panel.module.css";

type StatusTone = "info" | "success" | "error";

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
  const [tone, setTone] = useState<StatusTone>("info");
  const [busy, setBusy] = useState(false);

  /** Status + tone are updated together on every feedback path. */
  const showStatus = (message: string, nextTone: StatusTone = "info") => {
    setStatus(message);
    setTone(nextTone);
  };

  function showError(error: unknown) {
    const message =
      error instanceof RpcError
        ? errorCopyFor(error.problem.code, error.problem.detail)
        : COPY.error.networkError;
    showStatus(message, "error");
    announce(message);
  }

  async function loadRoster(eventIdInput = eventId) {
    if (!eventIdInput.trim()) {
      showStatus(COPY.attendance.eventId);
      return;
    }
    setBusy(true);
    try {
      const result = await listAttendanceRoster(eventIdInput.trim());
      setEvent(result.event);
      setRows(result.attendances);
      showStatus(`${result.attendances.length} ${COPY.attendance.roster}`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function searchMembers() {
    setBusy(true);
    try {
      const result = await searchAttendanceMembers(eventId.trim(), query);
      setMembers(result.members);
      if (result.members.length === 0) {
        showStatus(COPY.attendance.memberSearchEmpty);
        announce(COPY.attendance.memberSearchEmpty);
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(
    member: AttendanceMember,
    method: "leader_qr_scan" | "leader_manual_search" = "leader_manual_search"
  ) {
    setBusy(true);
    try {
      await assistedCheckIn(eventId.trim(), member.user_id, method);
      showStatus(COPY.attendance.success, "success");
      await loadRoster();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function scanMember(rawValue: string) {
    // Exact QR match through the same members endpoint the manual search
    // uses; no separate endpoint needed (the search filters account_status
    // Active + enrolled). Check in only when the scan resolves to one member.
    try {
      const result = await searchAttendanceMembers(eventId.trim(), rawValue);
      if (result.members.length !== 1) {
        showStatus(COPY.attendance.memberSearchEmpty);
        announce(COPY.attendance.memberSearchEmpty);
        return;
      }
      await checkIn(result.members[0], "leader_qr_scan");
    } catch (error) {
      showError(error);
    }
  }

  const { videoRef, cameraOpen, startCamera, stopCamera } = useQrCamera({
    onDetect: (value) => {
      void scanMember(value);
    },
    onUnavailable: () => showStatus(COPY.attendance.cameraUnavailable, "error"),
  });

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
      showStatus(COPY.attendance.voidReason);
      return;
    }
    setBusy(true);
    try {
      await voidAttendance(row.attendance_id, voidReason);
      setVoidReason("");
      await loadRoster();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection() {
    if (!correctionId) {
      return;
    }
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="operator-title">
        <h1 id="operator-title" className={styles.title}>
          {COPY.sections.events}
        </h1>
        <p className={styles.lead}>{COPY.attendance.operatorTitle}</p>
        {chooserEvents.length > 0 && (
          <div className={styles.form}>
            <label className={styles.field} htmlFor="event-chooser">
              <span className={styles.fieldLabel}>
                {COPY.attendance.chooseEvent}
              </span>
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
            <span className={styles.fieldLabel}>{COPY.attendance.eventId}</span>
            <input
              id="event-id"
              className={styles.input}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </label>
          <button
            className={styles.buttonSecondary}
            type="button"
            disabled={busy}
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
          <div className={styles.group}>
            <div className={styles.actionsRow}>
              <button
                className={styles.button}
                type="button"
                disabled={busy}
                onClick={() => void startCamera()}
              >
                {cameraOpen
                  ? COPY.attendance.cameraRetry
                  : COPY.attendance.camera}
              </button>
              {cameraOpen && (
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={stopCamera}
                >
                  {COPY.attendance.cameraClose}
                </button>
              )}
            </div>
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
        <div className={styles.group}>
          <div className={styles.inputRow}>
            <label className={styles.field} htmlFor="member-search">
              <span className={styles.fieldLabel}>
                {COPY.attendance.memberSearch}
              </span>
              <input
                id="member-search"
                className={styles.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className={styles.buttonSecondary}
              type="button"
              disabled={busy}
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
                    disabled={busy}
                    onClick={() => void checkIn(member)}
                  >
                    <strong>{member.name}</strong>
                    <span className={styles.eventMeta}>
                      {member.phone ?? member.user_id}
                    </span>
                    <span className={styles.rowAction}>
                      {COPY.attendance.checkInMember}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {rows.length > 0 && (
          <div className={styles.group}>
            <h2 className={styles.sectionTitle}>{COPY.attendance.roster}</h2>
            {rows.map((row) => (
              <article className={styles.rowCard} key={row.attendance_id}>
                <div className={styles.actionsRow}>
                  <strong className={styles.rowName}>
                    {row.guest_name ?? row.member_user_id}
                  </strong>
                  <span
                    className={
                      row.status === "Active"
                        ? `${styles.pill} ${styles.pillActive}`
                        : `${styles.pill} ${styles.pillMuted}`
                    }
                  >
                    {row.status}
                  </span>
                </div>
                <span className={styles.eventMeta}>
                  {row.guest_phone ?? row.method}
                </span>
                {row.status === "Active" && (
                  <>
                    <label
                      className={styles.field}
                      htmlFor={`void-${row.attendance_id}`}
                    >
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.voidReason}
                      </span>
                      <input
                        id={`void-${row.attendance_id}`}
                        className={styles.input}
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                      />
                    </label>
                    <div className={styles.actionsRow}>
                      <button
                        className={styles.buttonDanger}
                        type="button"
                        disabled={busy}
                        onClick={() => void voidRow(row)}
                      >
                        {COPY.attendance.void}
                      </button>
                      {row.member_user_id === null && (
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setCorrectionId(row.attendance_id);
                            setCorrectionName(row.guest_name ?? "");
                            setCorrectionPhone(row.guest_phone ?? "");
                          }}
                        >
                          {COPY.attendance.correctGuest}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {correctionId === row.attendance_id && (
                  <div className={styles.correctionPanel}>
                    <label className={styles.field} htmlFor="correction-name">
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.guestName}
                      </span>
                      <input
                        id="correction-name"
                        className={styles.input}
                        value={correctionName}
                        onChange={(e) => setCorrectionName(e.target.value)}
                      />
                    </label>
                    <label className={styles.field} htmlFor="correction-phone">
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.guestPhone}
                      </span>
                      <input
                        id="correction-phone"
                        className={styles.input}
                        value={correctionPhone}
                        onChange={(e) => setCorrectionPhone(e.target.value)}
                      />
                    </label>
                    <label className={styles.field} htmlFor="correction-reason">
                      <span className={styles.fieldLabel}>
                        {COPY.attendance.correctionReason}
                      </span>
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
                      disabled={busy}
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
            className={styles.buttonSecondary}
            type="button"
            onClick={() => window.print()}
          >
            {COPY.attendance.printSheet}
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
      </section>
    </main>
  );
};
