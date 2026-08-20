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
  const queryString = searchParams.toString();
  const intent = parseMessagesIntent(`?${queryString}`);
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [showListOverride, setShowListOverride] = useState(false);
  const selected =
    !showListOverride && state.kind === "ready" && intent.contentId
      ? state.announcements.find((row) => row.contentId === intent.contentId)
      : undefined;

  const navigateToList = useCallback(() => {
    const href = buildMessagesHref();
    if (typeof window !== "undefined") {
      window.history.replaceState({ efccSection: "messages" }, "", href);
      setShowListOverride(true);
      return;
    }
    router.replace(href);
  }, [router]);

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

  useEffect(() => {
    setShowListOverride(false);
  }, [queryString]);

  if (state.kind === "ready" && selected) {
    return (
      <AnnouncementDetail
        announcement={toDetail(selected)}
        backLabel={COPY.home.churchNews}
        onBack={navigateToList}
      />
    );
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

  if (
    !showListOverride &&
    (intent.malformed ||
      (state.kind === "ready" && intent.contentId !== null && !selected))
  ) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{COPY.home.churchNews}</h1>
          <p className={styles.pageLead}>{COPY.home.messagesLead}</p>
        </header>
        <p className={styles.error} role="alert">
          {COPY.home.messagesNotFound}
        </p>
        <button className={styles.retry} type="button" onClick={navigateToList}>
          {COPY.home.messagesBack}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{COPY.home.churchNews}</h1>
        <p className={styles.pageLead}>{COPY.home.messagesLead}</p>
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
                href={buildMessagesHref(row.contentId, "messages")}
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
