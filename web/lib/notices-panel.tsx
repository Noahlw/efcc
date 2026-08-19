"use client";
/* oxlint-disable eslint/no-plusplus react/function-component-definition */

import { useCallback, useEffect, useRef, useState } from "react";

import { COPY } from "@/lib/copy";
import { hkNoticeListLabel } from "@/lib/hk-time";
import { announce } from "@/lib/live-region";
import { listNotices, markAllNoticesRead } from "@/lib/notices-api";
import type { Notice, NoticesResult } from "@/lib/notices-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";

import styles from "./notices-panel.module.css";

type NoticesState =
  | { kind: "loading" }
  | { kind: "ready"; result: NoticesResult }
  | { kind: "error" };

function noticeHref(notice: Notice): string {
  if (notice.kind === "event" && notice.program_id && notice.event_id) {
    return buildProgramsHref({
      mode: "participant",
      programId: notice.program_id,
      eventId: notice.event_id,
    });
  }
  if (notice.kind === "program" && notice.program_id) {
    return buildProgramsHref({
      mode: "participant",
      programId: notice.program_id,
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
  const dateTime = new Date(createdAt).toISOString();
  return { dateTime, label: hkNoticeListLabel(dateTime) };
}

function NoticeRow({ notice }: { notice: Notice }) {
  const unread = notice.read_at === null;
  const time = noticeTime(notice.created_at);

  return (
    <li className={styles.item}>
      <a className={styles.itemLink} href={noticeHref(notice)}>
        <span
          className={unread ? styles.unreadDot : styles.readDot}
          aria-hidden="true"
        />
        {unread && (
          <span className="sr-only">{COPY.notices.noticesUnread}</span>
        )}
        <span className={styles.itemCopy}>
          <strong className={styles.itemTitle}>{notice.title}</strong>
          <span className={styles.itemBody}>{notice.body}</span>
        </span>
        <time className={styles.itemTime} dateTime={time.dateTime}>
          {time.label}
        </time>
      </a>
    </li>
  );
}

export function NoticesPanel() {
  const [state, setState] = useState<NoticesState>({ kind: "loading" });
  const [marking, setMarking] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setState({ kind: "loading" });
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

  const markAllRead = async () => {
    if (state.kind !== "ready" || state.result.unread_count === 0 || marking) {
      return;
    }
    setMarking(true);
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
      announce(COPY.notices.noticesMarkedAllRead);
    } catch {
      announce(COPY.notices.noticesMarkAllReadError);
    } finally {
      setMarking(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <section
        className={styles.panel}
        aria-label={COPY.notices.noticesListLabel}
      >
        <output className={styles.state} aria-busy="true">
          {COPY.notices.noticesLoading}
        </output>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        className={styles.panel}
        aria-label={COPY.notices.noticesListLabel}
      >
        <p className={styles.error} role="alert">
          {COPY.notices.noticesLoadError}
        </p>
        <button
          className={styles.retry}
          type="button"
          onClick={() => void load()}
        >
          {COPY.notices.noticesRetry}
        </button>
      </section>
    );
  }

  const { notices, unread_count: unreadCount } = state.result;
  return (
    <section
      className={styles.panel}
      aria-label={COPY.notices.noticesListLabel}
    >
      <div className={styles.toolbar}>
        {unreadCount > 0 && (
          <span className={styles.unreadCount}>
            {unreadCount} {COPY.notices.noticesUnread}
          </span>
        )}
        <button
          className={styles.markAll}
          type="button"
          onClick={() => void markAllRead()}
          disabled={marking || unreadCount === 0}
          aria-busy={marking}
        >
          {COPY.notices.noticesMarkAllRead}
        </button>
      </div>
      {notices.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{COPY.notices.noticesEmpty}</h2>
          <p className={styles.emptyHint}>{COPY.notices.noticesEmptyHint}</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label={COPY.notices.noticesListLabel}>
          {notices.map((notice) => (
            <NoticeRow key={notice.notice_id} notice={notice} />
          ))}
        </ul>
      )}
    </section>
  );
}
