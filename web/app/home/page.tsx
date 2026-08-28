"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  FeedPresentation,
  type FeedAnnouncement,
  type FeedPresentationState,
} from "@/lib/feed-presentation";
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
  /** These optional values make the surface deterministic in component tests. */
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

function validatedAnnouncement(
  value: AnnouncementData | null
): AnnouncementData | null {
  if (!value) {
    return null;
  }
  return { ...value, externalUrl: externalUrlFrom(value.externalUrl) };
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
    <div className="flex min-w-0 items-start gap-2.5 leading-[1.55]">
      <Icon name={icon} className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </div>
  );
}

function HomeLoadingSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[680px] min-w-0 px-[clamp(1rem,4vw,1.5rem)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-[799px]:pb-6"
      data-testid="home-loading-skeleton"
    >
      <section
        className="grid gap-3 pt-2"
        data-testid="home-loading-state"
        aria-busy="true"
      >
        <output className="block text-[0.78rem] text-[var(--ink-muted)]">
          {COPY.home.loading}
        </output>
        <div aria-hidden="true" className="grid gap-2.5">
          <div className="grid gap-2.5 px-0 pb-5 pt-2">
            <Skeleton className="block h-3 w-28 rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block h-10 w-[min(70%,16rem)] rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block h-5 w-[min(82%,22rem)] rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
          </div>
          <div className="grid gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-[22px]">
            <Skeleton className="block h-7 w-[5.5rem] rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block h-7 w-[min(78%,20rem)] rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block h-5 w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block h-5 w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="mt-2 block h-12 w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
          </div>
          <div className="mt-4 grid gap-3">
            <Skeleton className="block h-6 w-32 rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block min-h-[72px] w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
          </div>
          <div className="mt-4 grid gap-3">
            <Skeleton className="block h-6 w-32 rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
            <Skeleton className="block min-h-[72px] w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]" />
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
  const [loadAttempt, setLoadAttempt] = useState(hasInitialData ? 0 : 1);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const announcementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const overlayEntryRef = useRef(false);
  const displayName = bootstrap.profile.name || bootstrap.profile.username;

  const focusAnnouncementTrigger = useCallback(() => {
    queueMicrotask(() => announcementTriggerRef.current?.focus());
  }, []);

  const openAnnouncement = useCallback(() => {
    if (announcementOpen || typeof window === "undefined") {
      return;
    }
    window.history.pushState(
      { ...(window.history.state ?? {}), efccOverlay: "announcement" },
      "",
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    overlayEntryRef.current = true;
    setAnnouncementOpen(true);
  }, [announcementOpen]);

  const closeAnnouncement = useCallback(() => {
    const shouldPop =
      typeof window !== "undefined" &&
      overlayEntryRef.current &&
      window.history.state?.efccOverlay === "announcement";
    overlayEntryRef.current = false;
    setAnnouncementOpen(false);
    if (shouldPop) {
      window.history.back();
    }
    focusAnnouncementTrigger();
  }, [focusAnnouncementTrigger]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const clearOverlayState = () => {
      const currentState = window.history.state;
      if (currentState?.efccOverlay !== "announcement") {
        return;
      }
      const { efccOverlay: _overlay, ...rest } = currentState;
      window.history.replaceState(
        rest,
        "",
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
    };
    const onPopState = () => {
      const isAnnouncement =
        window.history.state?.efccOverlay === "announcement";
      overlayEntryRef.current = isAnnouncement;
      setAnnouncementOpen(isAnnouncement);
      if (!isAnnouncement) {
        focusAnnouncementTrigger();
      }
    };
    if (window.history.state?.efccOverlay === "announcement") {
      overlayEntryRef.current = true;
      setAnnouncementOpen(true);
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      clearOverlayState();
    };
  }, [focusAnnouncementTrigger]);

  // ponytail: warm participant catalog + access for /programs (F-C01)
  useEffect(() => {
    void listParticipantCatalog().catch(() => {});
    void getManagementAccess().catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadAttempt(reloadKey + 1);
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
      ? validatedAnnouncement(initialAnnouncement)
      : (projection?.announcement ?? null);
  const feedState: FeedPresentationState =
    announcementOpen && announcement
      ? "detail"
      : !hasInitialData && loadState === "loading"
        ? "loading"
        : !hasInitialData && loadState === "error"
          ? "error"
          : event || program || announcement
            ? "ready"
            : "empty";
  const feedAnnouncement: FeedAnnouncement | undefined =
    !hasInitialData && loadState === "loading"
      ? { key: `loading:${loadAttempt}`, message: COPY.home.loading }
      : undefined;

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

  const homeContent = (
    <div
      className="mx-auto w-full max-w-[680px] min-w-0 px-[clamp(1rem,4vw,1.5rem)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))] text-[var(--ink)] max-[799px]:pb-6"
      data-testid="home-page"
    >
      <div className="px-0 pb-4 pt-2.5">
        <time
          className="mb-2.5 inline-flex items-center font-mono text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ink-muted)]"
          dateTime={new Date().toISOString().slice(0, 10)}
        >
          {greetingDate()}
        </time>
        <h1 className="m-0 min-w-0 wrap-anywhere text-[clamp(1.6rem,5.5vw,2rem)] font-extrabold leading-[1.25] tracking-[-0.02em]">
          {COPY.home.greeting}，{displayName}
        </h1>
        <p className="mt-1 min-w-0 wrap-anywhere text-[0.9375rem] leading-[1.55] text-[var(--ink-muted)]">
          {COPY.home.subtitle}
        </p>
      </div>

      {event ? (
        <Card
          className="min-w-0 rounded-[1.125rem] border-0 bg-[var(--surface-raised)] p-[1.125rem] shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]"
          data-testid="next-event-card"
        >
          <Badge className="inline-flex min-h-6 w-fit items-center rounded-full border-0 bg-[var(--accent)] px-3 py-1 text-xs font-bold tracking-[0.02em] text-white">
            {COPY.home.enrolledBadge}
          </Badge>
          {programTitle && (
            <p className="mt-3.5 min-w-0 wrap-anywhere text-[0.86rem] font-semibold text-[var(--ink-muted)]">
              {programTitle}
            </p>
          )}
          {title && (
            <h2 className="mt-2.5 min-w-0 wrap-anywhere text-2xl font-semibold leading-[1.3] tracking-[-0.02em]">
              {title}
            </h2>
          )}
          {(date || time || event.location) && (
            <div className="my-5 grid min-w-0 gap-2.5 text-[var(--ink-muted)]">
              {date && <EventRow icon="calendar">{date}</EventRow>}
              {time && <EventRow icon="clock">{time}</EventRow>}
              {event.location && <EventRow icon="pin">{event.location}</EventRow>}
            </div>
          )}
          <Button asChild className="min-h-12 w-full" data-feed-event-action>
            <Link href={eventHref}>{COPY.home.viewEvent}</Link>
          </Button>
        </Card>
      ) : (
        <Card
          className="min-w-0 rounded-[1.125rem] border-0 bg-[var(--surface-raised)] p-5 text-center shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]"
          data-testid="home-empty-state"
        >
          <h2 className="min-w-0 wrap-anywhere text-[1.0625rem] font-bold leading-[1.4]">
            {COPY.home.emptyTitle}
          </h2>
          <p className="mt-1.5 min-w-0 wrap-anywhere text-sm leading-[1.55] text-[var(--ink-muted)]">
            {COPY.home.emptySubtitle}
          </p>
          <Button asChild className="mt-3.5 min-h-12 w-full">
            <Link href="/programs">{COPY.home.explorePrograms}</Link>
          </Button>
        </Card>
      )}

      {announcement && (
        <section className="mt-5" aria-labelledby="church-news-heading">
          <div className="mb-2 flex items-baseline justify-between gap-4 px-1">
            <h2
              className="m-0 text-[0.8125rem] font-extrabold tracking-[0.1em] text-[var(--ink-muted)]"
              id="church-news-heading"
            >
              {COPY.home.churchNews}
            </h2>
            <Button asChild className="min-h-11" variant="link">
              <Link href="/messages">{COPY.home.viewAllMessages}</Link>
            </Button>
          </div>
          <Button
            ref={announcementTriggerRef}
            type="button"
            variant="ghost"
            className="grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 whitespace-normal rounded-[1.125rem] p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
            data-testid="announcement-card"
            onClick={openAnnouncement}
          >
            <span className="min-w-0">
              <span className="block min-w-0 wrap-anywhere font-semibold leading-[1.45]">
                {announcement.title}
              </span>
              <span className="mt-1.5 block min-w-0 wrap-anywhere text-[0.86rem] leading-[1.5] text-[var(--ink-muted)]">
                {announcement.summary} · {announcement.date}
              </span>
            </span>
            <Icon
              name="chevron"
              className="size-5 shrink-0 text-[var(--ink-muted)]"
            />
          </Button>
        </section>
      )}

      {program && (
        <section className="mt-5" aria-labelledby="explore-heading">
          <div className="mb-2 flex items-baseline justify-between gap-4 px-1">
            <h2
              className="m-0 text-[0.8125rem] font-extrabold tracking-[0.1em] text-[var(--ink-muted)]"
              id="explore-heading"
            >
              {COPY.home.explore}
            </h2>
            <Button asChild className="min-h-11" variant="link">
              <Link href="/programs">{COPY.home.allPrograms}</Link>
            </Button>
          </div>
          <Link
            href={exploreProgramHref}
            className="block min-h-16 min-w-0 rounded-[1.125rem] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
            data-testid="explore-card"
          >
            <Card className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-[1.125rem] border-0 bg-[var(--surface-raised)] p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)] transition-colors hover:bg-[var(--surface)]">
              <span className="min-w-0">
                <span className="block min-w-0 wrap-anywhere font-semibold leading-[1.45]">
                  {program.name}
                </span>
                {program.description && (
                  <span className="mt-1.5 block min-w-0 wrap-anywhere text-[0.86rem] leading-[1.5] text-[var(--ink-muted)]">
                    {program.description}
                  </span>
                )}
              </span>
              <Icon
                name="chevron"
                className="size-5 shrink-0 text-[var(--ink-muted)]"
              />
            </Card>
          </Link>
        </section>
      )}
    </div>
  );

  return (
    <FeedPresentation
      state={feedState}
      list={homeContent}
      empty={homeContent}
      detail={
        announcement ? (
          <AnnouncementDetail
            announcement={announcement}
            onBack={closeAnnouncement}
          />
        ) : null
      }
      loading={<HomeLoadingSkeleton />}
      error={
        <div className="mx-auto w-full max-w-[680px] min-w-0 px-[clamp(1rem,4vw,1.5rem)] pb-8">
          <Alert
            data-testid="home-error-state"
            className="block leading-[1.6]"
            variant="destructive"
          >
            <p>{COPY.home.loadError}</p>
            <Button
              className="mt-3 min-h-11"
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              {COPY.home.retry}
            </Button>
          </Alert>
        </div>
      }
      announcement={feedAnnouncement}
      focusTargetRef={announcementTriggerRef}
    />
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <HomeView />
    </AppShell>
  );
}
