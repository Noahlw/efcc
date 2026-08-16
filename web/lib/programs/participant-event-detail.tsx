import { COPY } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";
import { buildScannerHref } from "@/lib/scanner-intent";

import type { ParticipantEventSummary } from "./program-api";

import styles from "@/app/programs/programs.module.css";

export interface ParticipantEventDetailProps {
  event: ParticipantEventSummary;
  programName: string;
  onBack: () => void;
}

export const ParticipantEventDetail = ({
  event,
  programName,
  onBack,
}: ParticipantEventDetailProps) => {
  const opensAt = event.check_in_window_opens_at;
  const closesAt = event.check_in_window_closes_at;
  const opens = opensAt ? Date.parse(opensAt) : Number.NaN;
  const closes = closesAt ? Date.parse(closesAt) : Number.NaN;
  const now = Date.now();
  const windowState =
    !Number.isFinite(opens) || !Number.isFinite(closes)
      ? "unavailable"
      : now < opens
        ? "upcoming"
        : now <= closes
          ? "open"
          : "closed";
  const statusLabel = {
    open: COPY.programs.eventDetailStatusOpen,
    upcoming: COPY.programs.eventDetailStatusUpcoming,
    closed: COPY.programs.eventDetailStatusClosed,
    unavailable: COPY.programs.eventDetailStatusUnavailable,
  }[windowState];
  const statusClass = {
    open: styles.participantEventStatusOpen,
    upcoming: styles.participantEventStatusUpcoming,
    closed: styles.participantEventStatusClosed,
    unavailable: styles.participantEventStatusUnavailable,
  }[windowState];
  const title = event.name?.trim() || programName;
  const location =
    event.location?.trim() || COPY.programs.eventDetailLocationUnavailable;

  return (
    <article
      className={styles.participantEventDetail}
      aria-labelledby="participant-event-detail-title"
    >
      <button
        className={styles.programDetailBack}
        type="button"
        aria-label={COPY.programs.participantEventDetailBack}
        onClick={onBack}
      >
        ← {COPY.programs.participantEventDetailBack}
      </button>
      <header className={styles.programDetailHeader}>
        <p className={styles.programDetailEyebrow}>
          {COPY.programs.participantEventDetailTitle}
        </p>
        <span className={`${styles.participantEventStatus} ${statusClass}`}>
          {statusLabel}
        </span>
        <h2
          id="participant-event-detail-title"
          className={styles.boundaryTitle}
        >
          {title}
        </h2>
        <p className={styles.programDetailEyebrow}>{programName}</p>
      </header>

      <section
        className={styles.participantEventCard}
        aria-label={COPY.programs.participantEventDetailTitle}
      >
        <dl className={styles.participantEventFacts}>
          <div>
            <dt>{COPY.programs.eventDetailWhen}</dt>
            <dd>
              {hkWallLabel(event.starts_at)}–{hkWallLabel(event.ends_at)}
            </dd>
          </div>
          <div>
            <dt>{COPY.programs.eventDetailLocation}</dt>
            <dd>{location}</dd>
          </div>
        </dl>
      </section>

      <section
        className={styles.participantEventInstructions}
        aria-labelledby="participant-event-instructions"
      >
        <h3
          id="participant-event-instructions"
          className={styles.programDetailHeading}
        >
          {COPY.programs.eventDetailInstructions}
        </h3>
        <p>{COPY.programs.eventDetailInstructionsText}</p>
      </section>

      <div className={styles.participantEventSticky}>
        <a
          className={styles.button}
          href={buildScannerHref("self", event.event_id)}
        >
          {COPY.programs.eventDetailScan}
        </a>
      </div>
    </article>
  );
};
