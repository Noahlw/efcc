"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { COPY } from "@/lib/copy";
import {
  FeedPresentation,
  type FeedAnnouncement,
  type FeedPresentationState,
} from "@/lib/feed-presentation";
import { hkNoticeListLabel } from "@/lib/hk-time";
import { listNotices, markAllNoticesRead } from "@/lib/notices-api";
import type { Notice, NoticesResult } from "@/lib/notices-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";

type NoticesState =
  | { kind: "loading" }
  | { kind: "ready"; result: NoticesResult }
  | { kind: "error" };

interface FeedbackState extends FeedAnnouncement {}

function noticeHref(notice: Notice): string {
  if (notice.kind === "event" && notice.program_id && notice.event_id) {
    return buildProgramsHref({
      mode: "participant",
      programId: notice.program_id,
      eventId: notice.event_id,
      origin: "notices",
    });
  }
  if (notice.kind === "program" && notice.program_id) {
    return buildProgramsHref({
      mode: "participant",
      programId: notice.program_id,
      origin: "notices",
    });
  }
  if (notice.kind === "account") {
    return "/profile";
  }
  return "/programs";
}

function noticeTime(createdAt: number): {
  dateTime: string;
  label: string;
} {
  const safeCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();
  const dateTime = new Date(safeCreatedAt).toISOString();
  return { dateTime, label: hkNoticeListLabel(dateTime) };
}

function NoticeRow({ notice }: { notice: Notice }) {
  const unread = notice.read_at === null;
  const time = noticeTime(notice.created_at);

  return (
    <li className="border-[var(--line)] not-first:border-t">
      <a
        className="grid min-h-[92px] min-w-0 grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-2.5 p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--focus)] hover:bg-[var(--surface)]"
        href={noticeHref(notice)}
        data-feed-list-item
      >
        <span
          className={`mt-1.5 size-2 rounded-full ${unread ? "bg-[var(--accent)]" : "bg-transparent"}`}
          aria-hidden="true"
        />
        {unread && (
          <span className="sr-only">{COPY.notices.noticesUnread}</span>
        )}
        <span className="min-w-0">
          <strong className="block min-w-0 wrap-anywhere text-base font-semibold leading-[1.4] text-[var(--ink)]">
            {notice.title}
          </strong>
          <span className="mt-1.5 block min-w-0 wrap-anywhere text-[0.9375rem] leading-[1.55] text-[var(--ink-muted)]">
            {notice.body}
          </span>
        </span>
        <time
          className="whitespace-nowrap text-xs leading-[1.5] text-[var(--ink-muted)]"
          dateTime={time.dateTime}
        >
          {time.label}
        </time>
      </a>
    </li>
  );
}

export function NoticesPanel() {
  const [state, setState] = useState<NoticesState>({ kind: "loading" });
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(1);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const requestVersion = useRef(0);
  const feedbackKey = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoadAttempt(version);
    setState({ kind: "loading" });
    setMarkError(null);
    setFeedback(null);
    try {
      const result = await listNotices();
      if (requestVersion.current !== version) {
        return;
      }
      setState({ kind: "ready", result });
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

  const announceFeedback = useCallback((message: string) => {
    setFeedback({ key: ++feedbackKey.current, message });
  }, []);

  const markAllRead = async () => {
    if (state.kind !== "ready" || state.result.unread_count === 0 || marking) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const message = COPY.notices.noticesMarkAllReadError;
      setMarkError(message);
      return;
    }
    setMarking(true);
    setMarkError(null);
    try {
      await markAllNoticesRead();
      const markedAt = Date.now();
      setState((current) => {
        if (current.kind !== "ready") {
          return current;
        }
        return {
          kind: "ready",
          result: {
            ...current.result,
            unread_count: 0,
            notices: current.result.notices.map((notice) =>
              notice.read_at === null
                ? { ...notice, read_at: markedAt }
                : notice
            ),
          },
        };
      });
      announceFeedback(COPY.notices.noticesMarkedAllRead);
    } catch {
      const message = COPY.notices.noticesMarkAllReadError;
      setMarkError(message);
    } finally {
      setMarking(false);
    }
  };

  const presentationState: FeedPresentationState =
    state.kind === "loading"
      ? "loading"
      : state.kind === "error"
        ? "error"
        : state.result.notices.length === 0
          ? "empty"
          : "ready";
  const announcement: FeedAnnouncement | undefined =
    feedback ??
    (state.kind === "loading"
      ? { key: `loading:${loadAttempt}`, message: COPY.notices.noticesLoading }
      : undefined);

  const toolbar =
    state.kind === "ready" ? (
      <div className="mb-2 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        {state.result.unread_count > 0 ? (
          <Badge
            className="inline-flex min-h-6 items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-2.5 py-1 text-[0.8125rem] font-bold text-[var(--accent)]"
            variant="outline"
          >
            {state.result.unread_count} {COPY.notices.noticesUnread}
          </Badge>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button
          className="min-h-11"
          type="button"
          onClick={() => void markAllRead()}
          disabled={marking || state.result.unread_count === 0}
          aria-busy={marking}
        >
          {COPY.notices.noticesMarkAllRead}
        </Button>
      </div>
    ) : null;

  const list =
    state.kind === "ready" ? (
      <>
        {toolbar}
        <ul className="m-0 list-none overflow-hidden rounded-[1.125rem] bg-[var(--surface-raised)] p-0 shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]">
          {state.result.notices.map((notice) => (
            <NoticeRow key={notice.notice_id} notice={notice} />
          ))}
        </ul>
      </>
    ) : null;

  const empty =
    state.kind === "ready" ? (
      <>
        {toolbar}
        <Card className="border border-[var(--line)] bg-[var(--surface-raised)] p-[2.125rem_1.375rem] text-center shadow-none">
          <h2 className="text-[1.125rem] leading-[1.4]">
            {COPY.notices.noticesEmpty}
          </h2>
          <p className="mt-2 text-[var(--ink-muted)] leading-[1.6]">
            {COPY.notices.noticesEmptyHint}
          </p>
        </Card>
      </>
    ) : null;

  return (
    <FeedPresentation
      state={presentationState}
      list={list}
      empty={empty}
      loading={
        <>
          <output className="block p-4 text-[var(--ink-muted)] leading-[1.6]">
            {COPY.notices.noticesLoading}
          </output>
          <Skeleton
            className="block h-20 w-full rounded-[var(--radius-sm)] bg-[var(--skeleton)]"
            aria-hidden="true"
          />
        </>
      }
      error={
        <>
          <Alert className="block leading-[1.6]" variant="destructive">
            <p>{COPY.notices.noticesLoadError}</p>
          </Alert>
          <Button
            className="mt-3 min-h-11"
            type="button"
            onClick={() => void load()}
          >
            {COPY.notices.noticesRetry}
          </Button>
        </>
      }
      status={
        markError ? (
          <Alert className="mb-3 block leading-[1.6]" variant="destructive">
            <p>{markError}</p>
          </Alert>
        ) : undefined
      }
      announcement={announcement}
      aria-label={COPY.notices.noticesListLabel}
    />
  );
}
