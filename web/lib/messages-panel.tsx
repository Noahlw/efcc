"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AnnouncementDetail, Icon } from "@/app/home/page";
import { COPY } from "@/lib/copy";
import { listAnnouncements } from "@/lib/home-api";
import type { HomeAnnouncement } from "@/lib/home-api";
import { buildMessagesHref, parseMessagesIntent } from "@/lib/messages-intent";

import homeStyles from "@/app/home/home.module.css";
import styles from "@/lib/notices-panel.module.css";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; announcements: HomeAnnouncement[] }
  | { kind: "error" };

function announcementDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("zh-Hant-HK", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).formatToParts(date);
  const month = parts.find((entry) => entry.type === "month")?.value ?? "";
  const day = parts.find((entry) => entry.type === "day")?.value ?? "";
  return month && day ? `${month}月${day}日` : "";
}

function toDetail(row: HomeAnnouncement) {
  return {
    title: row.title,
    date: announcementDate(row.publishedAt),
    summary: row.summary,
    externalUrl: row.ctaUrl,
  };
}

export const MessagesPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = parseMessagesIntent(`?${searchParams.toString()}`);
  const [state, setState] = useState<ListState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await listAnnouncements();
      setState({ kind: "ready", announcements: result.announcements });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "ready" && intent.contentId) {
    const selected = state.announcements.find(
      (row) => row.contentId === intent.contentId
    );
    if (selected) {
      return (
        <AnnouncementDetail
          announcement={toDetail(selected)}
          backLabel={COPY.home.churchNews}
          onBack={() => router.push(buildMessagesHref())}
        />
      );
    }
  }

  if (state.kind === "loading") {
    return (
      <div className={styles.page}>
        <output className={styles.state} aria-busy="true">
          {COPY.home.messagesLoading}
        </output>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={styles.page}>
        <p className={styles.error} role="alert">
          {COPY.home.messagesLoadError}
        </p>
        <button
          className={styles.retry}
          type="button"
          onClick={() => void load()}
        >
          {COPY.home.messagesRetry}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{COPY.home.churchNews}</h1>
      </header>
      {state.announcements.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>
          <p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label={COPY.home.messagesListLabel}>
          {state.announcements.map((row) => (
            <li key={row.contentId}>
              <Link
                className={homeStyles.listCard}
                href={buildMessagesHref(row.contentId)}
              >
                <span>
                  <span className={homeStyles.cardTitle}>{row.title}</span>
                  <span className={homeStyles.cardDescription}>
                    {row.summary}
                    {row.publishedAt
                      ? ` · ${announcementDate(row.publishedAt)}`
                      : ""}
                  </span>
                </span>
                <Icon name="chevron" className={homeStyles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
