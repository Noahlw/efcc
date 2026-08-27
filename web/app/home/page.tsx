"use client";
/* oxlint-disable eslint/complexity, eslint/no-use-before-define, react/function-component-definition, promise/prefer-await-to-then, unicorn/no-negated-condition */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnnouncementDetail, Icon } from "@/lib/announcement-detail";
import type { AnnouncementData } from "@/lib/announcement-detail";
import { RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import {
  hkShortDateLabel,
  hkShortTimeLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";
import { getHome } from "@/lib/home-api";
import {
  getManagementAccess,
  getParticipantProgramDetail,
  listParticipantCatalog,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";

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

async function loadHomeProjection(): Promise<HomeProjection> {
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
  return value && Number.isFinite(Date.parse(value))
    ? hkShortDateLabel(value)
    : null;
}

function eventTimeRange(
  startsAt: string | null,
  endsAt: string | null
): string | null {
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) {
    return null;
  }
  if (!endsAt || !Number.isFinite(Date.parse(endsAt))) {
    return hkShortTimeLabel(startsAt);
  }
  return hkShortTimeRange(startsAt, endsAt);
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

function HomeLoadingSkeleton() {
  return (
    <div
      className={`${styles.page} ${styles.skeletonPage}`}
      data-testid="home-loading-skeleton"
    >
      <section
        className={styles.skeletonRegion}
        data-testid="home-loading-state"
        aria-busy="true"
        aria-live="polite"
      >
        <output className={styles.skeletonAnnouncement}>
          {COPY.home.loading}
        </output>
        <div aria-hidden="true">
          <div className={styles.skeletonIntro}>
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonDate}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonHeading}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonText}`}
            />
          </div>
          <div className={styles.skeletonEventCard}>
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonBadge}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonTitle}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonDetail}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonDetail}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonAction}`}
            />
          </div>
          <div className={styles.skeletonSection}>
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonSectionHeading}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonListCard}`}
            />
          </div>
          <div className={styles.skeletonSection}>
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonSectionHeading}`}
            />
            <Skeleton
              className={`${styles.skeletonBlock} ${styles.skeletonListCard}`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export function HomeView({
  featuredEvent: initialEvent,
  featuredProgram: initialProgram,
  announcement: initialAnnouncement,
}: HomeViewProps = {}) {
  const { bootstrap } = useApp();
  const hasInitialData =
    initialEvent !== undefined ||
    initialProgram !== undefined ||
    initialAnnouncement !== undefined;
  const [projection, setProjection] = useState<HomeProjection | null>(null);
  const [participant, setParticipant] = useState<{
    event: HomeEvent | null;
    program: HomeProgram | null;
  }>({ event: null, program: null });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    hasInitialData ? "ready" : "loading"
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const displayName = bootstrap.profile.name || bootstrap.profile.username;

  const openAnnouncement = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.pushState(
        { efccOverlay: "announcement" },
        "",
        window.location.href
      );
    }
    setAnnouncementOpen(true);
  }, []);

  const closeAnnouncement = useCallback(() => {
    setAnnouncementOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onPopState = () => {
      setAnnouncementOpen(window.history.state?.efccOverlay === "announcement");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ponytail: warm participant catalog + access for /programs (F-C01)
  // fire-and-forget so /programs first paint hits cache within 30s
  useEffect(() => {
    void listParticipantCatalog().catch(() => {});
    void getManagementAccess().catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadState("loading");
      try {
        const nextProjection = await loadHomeProjection();
        if (!mounted) {
          return;
        }
        setProjection(nextProjection);
        setParticipant({ event: null, program: null });
        setLoadState("ready");
      } catch (primaryError) {
        if (
          primaryError instanceof RpcError &&
          primaryError.problem.status === 401
        ) {
          if (mounted) {
            setLoadState("error");
          }
          return;
        }
        try {
          const nextParticipant = await loadParticipantProjection();
          if (!mounted) {
            return;
          }
          setProjection(null);
          setParticipant(nextParticipant);
          setLoadState("ready");
        } catch {
          if (mounted) {
            setLoadState("error");
          }
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

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
        onBack={closeAnnouncement}
      />
    );
  }

  if (!hasInitialData && loadState === "loading") {
    return <HomeLoadingSkeleton />;
  }

  if (!hasInitialData && loadState === "error") {
    return (
      <div className={styles.page}>
        <Alert
          className={styles.errorCard}
          data-testid="home-error-state"
          variant="destructive"
        >
          <p>{COPY.home.loadError}</p>
          <Button
            className={styles.primaryAction}
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {COPY.home.retry}
          </Button>
        </Alert>
      </div>
    );
  }

  const programTitle = event?.programTitle ?? program?.name;
  const eventHref =
    event?.eventId && event.programId
      ? buildProgramsHref({
          mode: "participant",
          programId: event.programId,
          eventId: event.eventId,
          origin: "home",
        })
      : "/programs";
  const exploreProgramHref = program?.programId
    ? buildProgramsHref({
        mode: "participant",
        programId: program.programId,
        origin: "home",
      })
    : "/programs";
  const title = event?.eventTitle ?? "";
  const date = eventDate(event?.startsAt ?? null);
  const time = eventTimeRange(event?.startsAt ?? null, event?.endsAt ?? null);

  return (
    <div className={styles.page} data-testid="home-page">
      <div className={styles.intro}>
        <time
          className={styles.dateTag}
          dateTime={new Date().toISOString().slice(0, 10)}
        >
          {greetingDate()}
        </time>
        <h1>
          {COPY.home.greeting}，{displayName}
        </h1>
        <p>{COPY.home.subtitle}</p>
      </div>

      {event ? (
        <Card className={styles.eventCard} data-testid="next-event-card">
          <Badge className={styles.enrolledBadge}>
            {COPY.home.enrolledBadge}
          </Badge>
          {programTitle && (
            <p className={styles.programTitle}>{programTitle}</p>
          )}
          {title && <h2>{title}</h2>}
          {(date || time || event.location) && (
            <div className={styles.eventDetails}>
              {date && <EventRow icon="calendar">{date}</EventRow>}
              {time && <EventRow icon="clock">{time}</EventRow>}
              {event.location && (
                <EventRow icon="pin">{event.location}</EventRow>
              )}
            </div>
          )}
          <Button asChild className={styles.primaryAction}>
            <Link href={eventHref}>{COPY.home.viewEvent}</Link>
          </Button>
        </Card>
      ) : (
        <Card
          size="empty"
          className={styles.emptyCard}
          data-testid="home-empty-state"
        >
          <h2>{COPY.home.emptyTitle}</h2>
          <p>{COPY.home.emptySubtitle}</p>
          <Button asChild className={styles.primaryAction}>
            <Link href="/programs">{COPY.home.explorePrograms}</Link>
          </Button>
        </Card>
      )}

      {announcement && (
        <section
          className={styles.section}
          aria-labelledby="church-news-heading"
        >
          <div className={styles.sectionHeading}>
            <h2 id="church-news-heading">{COPY.home.churchNews}</h2>
            <Button asChild className={styles.sectionLink} variant="link">
              <Link href="/messages">{COPY.home.viewAllMessages}</Link>
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={styles.listCard}
            data-testid="announcement-card"
            onClick={openAnnouncement}
          >
            <span>
              <span className={styles.cardTitle}>{announcement.title}</span>
              <span className={styles.cardDescription}>
                {announcement.summary} · {announcement.date}
              </span>
            </span>
            <Icon name="chevron" className={styles.chevron} />
          </Button>
        </section>
      )}

      {program && (
        <section className={styles.section} aria-labelledby="explore-heading">
          <div className={styles.sectionHeading}>
            <h2 id="explore-heading">{COPY.home.explore}</h2>
            <Button asChild className={styles.sectionLink} variant="link">
              <Link href="/programs">{COPY.home.allPrograms}</Link>
            </Button>
          </div>
          <Link href={exploreProgramHref} data-testid="explore-card">
            <Card className={styles.listCard}>
              <span>
                <span className={styles.cardTitle}>{program.name}</span>
                {program.description && (
                  <span className={styles.cardDescription}>
                    {program.description}
                  </span>
                )}
              </span>
              <Icon name="chevron" className={styles.chevron} />
            </Card>
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
