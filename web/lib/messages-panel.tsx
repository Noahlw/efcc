"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AnnouncementDetail, Icon } from "@/app/home/page";
import { COPY } from "@/lib/copy";
import { hkMonthDayLabel } from "@/lib/hk-time";
import { listAnnouncements } from "@/lib/home-api";
import type { HomeAnnouncement } from "@/lib/home-api";
import { buildMessagesHref, parseMessagesIntent } from "@/lib/messages-intent";

import styles from "@/lib/notices-panel.module.css";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; announcements: HomeAnnouncement[] }
  | { kind: "error" };

function toDetail(row: HomeAnnouncement) {
  return {
    title: row.title,
    date: row.publishedAt ? hkMonthDayLabel(row.publishedAt) : "",
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
            <li key={row.contentId} className={styles.item}>
              <Link
                className={styles.messageLink}
                href={buildMessagesHref(row.contentId)}
              >
                <span className={styles.itemCopy}>
                  <span className={styles.itemTitle}>{row.title}</span>
                  <span className={styles.itemBody}>
                    {row.summary}
                    {row.publishedAt
                      ? ` · ${hkMonthDayLabel(row.publishedAt)}`
                      : ""}
                  </span>
                </span>
                <Icon name="chevron" className={styles.messageChevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
