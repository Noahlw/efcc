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
  const requestVersion = useRef(0);
  const cameFromListRef = useRef(false);
  const selected =
    !showListOverride && state.kind === "ready" && intent.contentId
      ? state.announcements.find((row) => row.contentId === intent.contentId)
      : undefined;

  useEffect(() => {
    if (!selected) {
      cameFromListRef.current = true;
    }
  }, [selected]);

  const navigateToList = useCallback(() => {
    // Row selection pushes a real history entry via <Link>; go back to
    // it directly instead of replacing the current entry, so the native
    // browser back button does not land on a duplicate /messages entry.
    if (
      typeof window !== "undefined" &&
      cameFromListRef.current &&
      window.history.length > 1
    ) {
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
    requestVersion.current += 1;
    const version = requestVersion.current;
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
        <Skeleton className={styles.state} aria-hidden="true" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{COPY.home.churchNews}</h1>
          <p className={styles.pageLead}>{COPY.home.messagesLead}</p>
        </header>
        <Alert className={styles.error} variant="destructive">
          <p>{COPY.home.messagesLoadError}</p>
        </Alert>
        <Button
          className={styles.retry}
          type="button"
          onClick={() => void load()}
        >
          {COPY.home.messagesRetry}
        </Button>
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
        <Alert className={styles.error} variant="destructive">
          <p>{COPY.home.messagesNotFound}</p>
        </Alert>
        <Button className={styles.retry} type="button" onClick={navigateToList}>
          {COPY.home.messagesBack}
        </Button>
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
        <Card className={styles.empty}>
          <h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>
          <p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>
        </Card>
      ) : (
        <ul
          className={styles.messageFeed}
          aria-label={COPY.home.messagesListLabel}
        >
          {state.announcements.map((row) => (
            <li key={row.contentId} className={styles.messageCardItem}>
              <Link href={buildMessagesHref(row.contentId, "messages")}>
                <Card className={styles.messageCard}>
                  {/* ponytail: category pill returns when home_content ships a
                      category column -- the STRICT schema has none today. */}
                  <div className={styles.messageCardTop}>
                    {row.publishedAt && (
                      <Badge className={styles.messageDate} variant="outline">
                        {hkMonthDayLabel(row.publishedAt)}
                      </Badge>
                    )}
                  </div>
                  <h2 className={styles.messageCardTitle}>{row.title}</h2>
                  <p className={styles.messageCardDesc}>{row.summary}</p>
                  <div className={styles.messageCardFoot}>
                    <span>{COPY.home.churchName}</span>
                    <strong className={styles.messageActionLink}>
                      {COPY.home.messageReadMore}
                    </strong>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
