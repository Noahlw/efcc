"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useApp } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { getHome } from "@/lib/home-api";
import {
  getParticipantProgramDetail,
  listParticipantCatalog,
} from "@/lib/programs/program-api";

import styles from "./home.module.css";

export interface HomeEvent {
  eventId: string | null;
  programId: string | null;
  eventTitle: string | null;
  programTitle: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
}

export interface HomeProgram {
  programId: string;
  name: string;
  description: string | null;
}

export interface AnnouncementData {
  title: string;
  date: string;
  summary: string;
  externalUrl: string | null;
}

interface HomeProjection {
  featuredEvent: HomeEvent | null;
  featuredProgram: HomeProgram | null;
  announcement: AnnouncementData | null;
}

export interface HomeViewProps {
  /**
   * These optional values make the surface deterministic in component tests.
   * The route itself obtains them from the authenticated data boundaries.
   */
  featuredEvent?: HomeEvent | null;
  featuredProgram?: HomeProgram | null;
  announcement?: AnnouncementData | null;
}

function externalUrlFrom(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatAnnouncementDate(value: string): string {
  const parts = localDateParts(value);
  return parts ? `${parts.month}月${parts.day}日` : value;
}

async function loadHomeProjection(): Promise<HomeProjection | null> {
  try {
    const data = await getHome();
    const featuredEvent =
      data.featuredEvent?.isEnrolled === true
        ? {
            eventId: data.featuredEvent.eventId,
            programId: data.featuredEvent.programId,
            eventTitle: data.featuredEvent.title,
            programTitle: data.featuredEvent.programTitle,
            startsAt: data.featuredEvent.startAt ?? data.featuredEvent.startsAt,
            endsAt: data.featuredEvent.endAt ?? data.featuredEvent.endsAt,
            location: data.featuredEvent.location,
          }
        : null;
    const rawAnnouncement = data.announcement;
    const announcement = rawAnnouncement?.publishedAt
      ? {
          title: rawAnnouncement.title,
          date: formatAnnouncementDate(rawAnnouncement.publishedAt),
          summary: rawAnnouncement.summary,
          externalUrl: externalUrlFrom(rawAnnouncement.ctaUrl),
        }
      : null;
    const rawProgram = data.exploreProgram;
    const featuredProgram = rawProgram
      ? {
          programId: rawProgram.programId,
          name: rawProgram.title,
          description: rawProgram.summary,
        }
      : null;
    return { featuredEvent, announcement, featuredProgram };
  } catch {
    return null;
  }
}

function eventIsUpcoming(startsAt: string | null): boolean {
  return startsAt !== null && Number.isFinite(Date.parse(startsAt))
    ? Date.parse(startsAt) >= Date.now()
    : false;
}

async function loadParticipantProjection(): Promise<{
  event: HomeEvent | null;
  program: HomeProgram | null;
}> {
  try {
    const { catalog } = await listParticipantCatalog();
    const programs = catalog
      .flatMap((entry) => entry.programs)
      .filter(
        (program) =>
          program.lifecycle === "Active" && program.discoverability === "Listed"
      )
      .toSorted((a, b) => a.display_order - b.display_order);
    const featuredProgram =
      programs.find((program) => program.enrollment_mode === "MemberRequest") ??
      null;
    const details = await Promise.all(
      programs.map(async (program) => {
        try {
          return await getParticipantProgramDetail(program.program_id);
        } catch {
          return null;
        }
      })
    );
    const upcoming = details
      .flatMap((detail) => {
        if (
          !detail?.enrollment?.enrollments.some(
            (enrollment) => enrollment.status === "Active"
          )
        ) {
          return [];
        }
        return detail.events
          .filter(
            (event) =>
              event.status === "Active" && eventIsUpcoming(event.starts_at)
          )
          .map((event) => ({
            eventId: event.event_id,
            programId: event.program_id,
            eventTitle: null,
            programTitle: detail.program.name,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
            location: null,
          }));
      })
      .toSorted(
        (a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "")
      );

    return {
      event: upcoming[0] ?? null,
      program: featuredProgram
        ? {
            programId: featuredProgram.program_id,
            name: featuredProgram.name,
            description: featuredProgram.description,
          }
        : null,
    };
  } catch {
    return { event: null, program: null };
  }
}

function localDateParts(value: string | Date): {
  weekday: string;
  month: string;
  day: string;
} | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("zh-Hant-HK", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Hong_Kong",
    weekday: "long",
  }).formatToParts(date);
  const part = (type: "weekday" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return { weekday: part("weekday"), month: part("month"), day: part("day") };
}

function greetingDate(): string {
  const parts = localDateParts(new Date());
  return parts ? `${parts.weekday} · ${parts.month}月${parts.day}日` : "";
}

function eventDate(value: string | null): string | null {
  const parts = value ? localDateParts(value) : null;
  return parts ? `${parts.month}月${parts.day}日（${parts.weekday}）` : null;
}

function eventTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("zh-Hant-HK", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function Icon({
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

function EventRow({
  icon,
  children,
}: {
  icon: "calendar" | "clock" | "pin";
  children: string;
}) {
  return (
    <div className={styles.eventRow}>
      <Icon name={icon} className={styles.eventIcon} />
      <span>{children}</span>
    </div>
  );
}

export function AnnouncementDetail({
  announcement,
  onBack,
}: {
  announcement: AnnouncementData;
  onBack: () => void;
}) {
  return (
    <div
      className={`${styles.page} ${styles.detailPage}`}
      data-testid="announcement-detail"
    >
      <div className={styles.detailTopbar}>
        <span>{COPY.home.churchNews}</span>
      </div>
      <div className={styles.detailIntro}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <Icon name="back" className={styles.backIcon} />
          {COPY.home.backHome}
        </button>
        <time className={styles.dateTag}>{announcement.date}</time>
        <h1>{announcement.title}</h1>
        <p>{announcement.summary}</p>
      </div>
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

export function HomeView({
  featuredEvent: initialEvent,
  featuredProgram: initialProgram,
  announcement: initialAnnouncement,
}: HomeViewProps = {}) {
  const { bootstrap } = useApp();
  const [projection, setProjection] = useState<HomeProjection | null>(null);
  const [participant, setParticipant] = useState<{
    event: HomeEvent | null;
    program: HomeProgram | null;
  }>({ event: null, program: null });
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const displayName = bootstrap.profile.name || bootstrap.profile.username;

  useEffect(() => {
    let mounted = true;
    void loadHomeProjection().then(async (nextProjection) => {
      if (!mounted) {
        return;
      }
      setProjection(nextProjection);
      if (nextProjection === null) {
        const nextParticipant = await loadParticipantProjection();
        if (mounted) {
          setParticipant(nextParticipant);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const event =
    initialEvent !== undefined
      ? initialEvent
      : (participant.event ?? projection?.featuredEvent ?? null);
  const program =
    initialProgram !== undefined
      ? initialProgram
      : (projection?.featuredProgram ?? participant.program);
  const announcement =
    initialAnnouncement !== undefined
      ? initialAnnouncement
      : (projection?.announcement ?? null);

  if (announcementOpen && announcement) {
    return (
      <AnnouncementDetail
        announcement={announcement}
        onBack={() => setAnnouncementOpen(false)}
      />
    );
  }

  const programTitle = event?.programTitle ?? program?.name;
  const title = event?.eventTitle ?? "";
  const date = eventDate(event?.startsAt ?? null);
  const startTime = eventTime(event?.startsAt ?? null);
  const endTime = eventTime(event?.endsAt ?? null);
  const time = startTime && endTime ? `${startTime}–${endTime}` : startTime;

  return (
    <div className={styles.page} data-testid="home-page">
      <div className={styles.intro}>
        <time className={styles.dateTag}>{greetingDate()}</time>
        <h1>
          {COPY.home.greeting}，{displayName}
        </h1>
        <p>{COPY.home.subtitle}</p>
      </div>

      {event ? (
        <article className={styles.eventCard} data-testid="next-event-card">
          <span className={styles.enrolledBadge}>
            {COPY.home.enrolledBadge}
          </span>
          {programTitle && (
            <p className={styles.programTitle}>{programTitle}</p>
          )}
          {title && <h2>{title}</h2>}
          <div className={styles.eventDetails}>
            {date && <EventRow icon="calendar">{date}</EventRow>}
            {time && <EventRow icon="clock">{time}</EventRow>}
            {event.location && <EventRow icon="pin">{event.location}</EventRow>}
          </div>
          <Link href="/programs" className={styles.primaryAction}>
            {COPY.home.viewEvent}
          </Link>
        </article>
      ) : (
        <section className={styles.emptyCard} data-testid="home-empty-state">
          <h2>{COPY.home.emptyTitle}</h2>
          <p>{COPY.home.emptySubtitle}</p>
          <Link href="/programs" className={styles.primaryAction}>
            {COPY.home.explorePrograms}
          </Link>
        </section>
      )}

      {announcement && (
        <section
          className={styles.section}
          aria-labelledby="church-news-heading"
        >
          <h2 id="church-news-heading">{COPY.home.churchNews}</h2>
          <button
            type="button"
            className={styles.listCard}
            data-testid="announcement-card"
            onClick={() => setAnnouncementOpen(true)}
          >
            <span>
              <span className={styles.cardTitle}>{announcement.title}</span>
              <span className={styles.cardDescription}>
                {announcement.summary} · {announcement.date}
              </span>
            </span>
            <Icon name="chevron" className={styles.chevron} />
          </button>
        </section>
      )}

      {program && (
        <section className={styles.section} aria-labelledby="explore-heading">
          <div className={styles.sectionHeading}>
            <h2 id="explore-heading">{COPY.home.explore}</h2>
            <Link href="/programs" className={styles.sectionLink}>
              {COPY.home.allPrograms}
            </Link>
          </div>
          <Link
            href="/programs"
            className={styles.listCard}
            data-testid="explore-card"
          >
            <span>
              <span className={styles.cardTitle}>{program.name}</span>
              {program.description && (
                <span className={styles.cardDescription}>
                  {program.description}
                </span>
              )}
            </span>
            <Icon name="chevron" className={styles.chevron} />
          </Link>
        </section>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <HomeView />
    </AppShell>
  );
}
