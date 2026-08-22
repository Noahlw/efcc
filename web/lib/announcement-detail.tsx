"use client";

import { COPY } from "@/lib/copy";

import styles from "@/app/home/home.module.css";

export interface AnnouncementData {
  title: string;
  date: string;
  summary: string;
  externalUrl: string | null;
}

/* oxlint-disable-next-line react/function-component-definition -- moved verbatim from app/home/page.tsx */
export function Icon({
  name,
  className,
}: {
  name: "calendar" | "clock" | "pin" | "chevron" | "back" | "external";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      {name === "calendar" && (
        <>
          <rect {...common} x="3" y="5" width="18" height="16" rx="2" />
          <path {...common} d="M16 3v4M8 3v4M3 10h18" />
        </>
      )}
      {name === "clock" && (
        <>
          <circle {...common} cx="12" cy="12" r="9" />
          <path {...common} d="M12 7v5l3 2" />
        </>
      )}
      {name === "pin" && (
        <>
          <path
            {...common}
            d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"
          />
          <circle {...common} cx="12" cy="10" r="2.5" />
        </>
      )}
      {name === "chevron" && <path {...common} d="m9 18 6-6-6-6" />}
      {name === "back" && <path {...common} d="m15 18-6-6 6-6" />}
      {name === "external" && (
        <path
          {...common}
          d="M15 3h6v6M10 14 21 3M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7"
        />
      )}
    </svg>
  );
}

/* oxlint-disable-next-line react/function-component-definition -- moved verbatim from app/home/page.tsx */
export function AnnouncementDetail({
  announcement,
  onBack,
  backLabel = COPY.home.backHome,
}: {
  announcement: AnnouncementData;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div
      className={`${styles.page} ${styles.detailPage}`}
      data-testid="announcement-detail"
    >
      {backLabel !== COPY.home.churchNews && (
        <div className={styles.detailTopbar}>
          <span>{COPY.home.churchNews}</span>
        </div>
      )}
      <div className={styles.detailIntro}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <Icon name="back" className={styles.backIcon} />
          {backLabel}
        </button>
        <time className={styles.dateTag}>{announcement.date}</time>
        <h1>{announcement.title}</h1>
        <p>{announcement.summary}</p>
      </div>
      {/* ponytail: TODO(CMS) venueCard is identical for every announcement by design
          (impeccable audit P2-06) -- read from announcement.venue instead
          once the CMS ships a per-announcement venue field. */}
      <article className={styles.venueCard}>
        <h2>{COPY.home.venueTitle}</h2>
        <p>{COPY.home.venueInstructions}</p>
        <ul>
          <li>{COPY.home.worshipLocation}</li>
          <li>{COPY.home.familyRoom}</li>
          <li>{COPY.home.visitorReception}</li>
        </ul>
        {announcement.externalUrl && (
          <div className={styles.externalLinkRow}>
            <a
              href={announcement.externalUrl}
              target="_blank"
              rel="noopener"
              className={styles.externalLink}
            >
              <Icon name="external" className={styles.externalIcon} />
              {COPY.home.externalLink}
            </a>
          </div>
        )}
      </article>
    </div>
  );
}
