"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnnouncementDetail } from "@/lib/announcement-detail";
import { COPY } from "@/lib/copy";
import {
  FeedPresentation,
  type FeedAnnouncement,
  type FeedPresentationState,
} from "@/lib/feed-presentation";
import { hkMonthDayLabel } from "@/lib/hk-time";
import { listAnnouncements } from "@/lib/home-api";
import type { HomeAnnouncement } from "@/lib/home-api";
import { buildMessagesHref, parseMessagesIntent } from "@/lib/messages-intent";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; announcements: HomeAnnouncement[] }
  | { kind: "error" };

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

function toDetail(row: HomeAnnouncement) {
  return {
    title: row.title,
    date: row.publishedAt ? hkMonthDayLabel(row.publishedAt) : "",
    summary: row.summary,
    externalUrl: externalUrlFrom(row.ctaUrl),
  };
}

export const MessagesPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const intent = parseMessagesIntent(`?${queryString}`);
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [showListOverride, setShowListOverride] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(1);
  const requestVersion = useRef(0);
  const cameFromListRef = useRef(false);
  const selected =
    !showListOverride && state.kind === "ready" && intent.contentId
      ? state.announcements.find((row) => row.contentId === intent.contentId)
      : undefined;

  const navigateToList = useCallback(() => {
    // A row click marks a same-app list entry. Use the native history stack for
    // that path; a direct or malformed deep link safely replaces its URL.
    if (
      typeof window !== "undefined" &&
      cameFromListRef.current &&
      window.history.length > 1
    ) {
      cameFromListRef.current = false;
      window.history.back();
      return;
    }
    const href = buildMessagesHref();
    if (typeof window !== "undefined") {
      window.history.replaceState({ efccSection: "messages" }, "", href);
      setShowListOverride(true);
      return;
    }
    router.replace(href);
  }, [router]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoadAttempt(version);
    setState({ kind: "loading" });
    try {
      const result = await listAnnouncements();
      if (requestVersion.current !== version) {
        return;
      }
      setState({ kind: "ready", announcements: result.announcements });
    } catch {
      if (requestVersion.current !== version) {
        return;
      }
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setShowListOverride(false);
  }, [queryString]);

  const notFound =
    !showListOverride &&
    (intent.malformed ||
      (state.kind === "ready" && intent.contentId !== null && !selected));
  const presentationState: FeedPresentationState =
    state.kind === "loading"
      ? "loading"
      : state.kind === "error"
        ? "error"
        : selected
          ? "detail"
          : notFound
            ? "error"
            : state.announcements.length === 0
              ? "empty"
              : "ready";
  const announcement: FeedAnnouncement | undefined =
    state.kind === "loading"
      ? { key: `loading:${loadAttempt}`, message: COPY.home.messagesLoading }
      : undefined;

  const header = (
    <header className="mb-7 border-b border-[var(--line)] pb-5 max-[799px]:mb-3 max-[799px]:flex max-[799px]:items-center max-[799px]:justify-between max-[799px]:gap-4 max-[799px]:pb-2">
      <h1 className="m-0 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)] max-[799px]:absolute max-[799px]:m-[-1px] max-[799px]:h-px max-[799px]:w-px max-[799px]:overflow-hidden max-[799px]:whitespace-nowrap max-[799px]:border-0 max-[799px]:p-0 max-[799px]:[clip:rect(0,0,0,0)]">
        {COPY.home.churchNews}
      </h1>
      <p className="m-0 mt-2 text-base leading-[1.6] text-[var(--ink-muted)] max-[799px]:mt-0 max-[799px]:text-[0.78rem] max-[799px]:font-semibold max-[799px]:leading-[1.4]">
        {COPY.home.messagesLead}
      </p>
    </header>
  );

  const list =
    state.kind === "ready" ? (
      <>
        {header}
        <ul className="m-0 grid list-none gap-3.5 p-0" data-feed-list>
          {state.announcements.map((row) => (
            <li key={row.contentId} className="list-none">
              <Link
                className="block min-h-11 outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                href={buildMessagesHref(row.contentId, "messages")}
                onClick={() => {
                  cameFromListRef.current = true;
                }}
              >
                <Card className="block min-w-0 p-[1.125rem] transition-colors hover:bg-[var(--surface)]">
                  <div className="mb-2 flex items-center justify-between">
                    {row.publishedAt && (
                      <Badge
                        className="text-[0.78rem] font-semibold text-[var(--ink-muted)]"
                        variant="outline"
                      >
                        {hkMonthDayLabel(row.publishedAt)}
                      </Badge>
                    )}
                  </div>
                  <h2 className="min-w-0 wrap-anywhere text-[1.0625rem] font-semibold leading-[1.3] text-[var(--ink)]">
                    {row.title}
                  </h2>
                  <p className="mt-1.5 min-w-0 wrap-anywhere text-[0.84375rem] leading-[1.55] text-[var(--ink-muted)]">
                    {row.summary}
                  </p>
                  <div className="mt-3.5 flex items-center justify-between border-t border-[var(--line)] pt-2.5 text-[0.8125rem] font-bold text-[var(--accent)]">
                    <span>{COPY.home.churchName}</span>
                    <strong className="font-bold text-[var(--accent)]">
                      {COPY.home.messageReadMore}
                    </strong>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </>
    ) : null;

  const empty =
    state.kind === "ready" ? (
      <>
        {header}
        <Card className="border border-[var(--line)] bg-[var(--surface-raised)] p-[2.125rem_1.375rem] text-center shadow-none">
          <h2 className="text-[1.125rem] leading-[1.4]">
            {COPY.home.messagesEmpty}
          </h2>
          <p className="mt-2 text-[var(--ink-muted)] leading-[1.6]">
            {COPY.home.messagesEmptyHint}
          </p>
        </Card>
      </>
    ) : null;

  const error =
    state.kind === "error" || notFound ? (
      <>
        {header}
        <Alert className="block leading-[1.6]" variant="destructive">
          <p>
            {state.kind === "error"
              ? COPY.home.messagesLoadError
              : COPY.home.messagesNotFound}
          </p>
        </Alert>
        <Button
          className="mt-3 min-h-11"
          type="button"
          onClick={() => {
            if (state.kind === "error") {
              void load();
              return;
            }
            navigateToList();
          }}
        >
          {state.kind === "error"
            ? COPY.home.messagesRetry
            : COPY.home.messagesBack}
        </Button>
      </>
    ) : null;

  return (
    <FeedPresentation
      state={presentationState}
      list={list}
      detail={
        selected ? (
          <AnnouncementDetail
            announcement={toDetail(selected)}
            backLabel={COPY.home.churchNews}
            onBack={navigateToList}
          />
        ) : null
      }
      empty={empty}
      loading={
        <>
          <output className="block p-4 text-[var(--ink-muted)] leading-[1.6]">
            {COPY.home.messagesLoading}
          </output>
          <Skeleton
            className="block h-20 w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]"
            aria-hidden="true"
          />
        </>
      }
      error={error}
      announcement={announcement}
      aria-label={COPY.home.messagesListLabel}
    />
  );
};
