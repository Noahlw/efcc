"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COPY } from "@/lib/copy";
import { FeedPresentation } from "@/lib/feed-presentation";
import type { FeedPresentationProps } from "@/lib/feed-presentation";
import type {
  ManagementNotificationItem,
  ManagementNotifications,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { hkWallDateTimeLabel } from "@/lib/programs/recurrence";
import { cn } from "@/lib/utils";

const styles = {
  notificationState:
    "block min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 [overflow-wrap:anywhere]",
  notificationList: "m-0 grid min-w-0 list-none gap-2 p-0",
  notificationItem:
    "min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)]",
  notificationRead: "opacity-80",
  notificationUnread: "border-[var(--success-border)]",
  notificationItemLink:
    "flex min-h-11 min-w-0 flex-col gap-1 rounded-lg p-3 text-[var(--ink)] no-underline hover:bg-[var(--surface)] [overflow-wrap:anywhere]",
  notificationItemTopline:
    "flex min-w-0 flex-wrap items-center justify-between gap-2 [overflow-wrap:anywhere]",
  notificationUnreadLabel:
    "shrink-0 whitespace-normal bg-[var(--error)] text-white",
  notificationsPage: "grid min-w-0 gap-4",
  notificationsPageHeader:
    "flex min-w-0 flex-wrap items-start justify-between gap-3",
  panelHeading:
    "m-0 min-w-0 text-lg font-extrabold leading-6 tracking-[-0.02em] [overflow-wrap:anywhere]",
  notificationsLead:
    "m-0 mt-1 max-w-prose text-sm leading-6 text-[var(--ink-muted)] [overflow-wrap:anywhere]",
  badge: "shrink-0 whitespace-normal",
  badgeActive: "border-transparent bg-[var(--accent)] text-white",
  retry:
    "min-h-11 min-w-11 w-fit rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
  notificationControl:
    "relative min-w-0 max-[799px]:flex max-[799px]:w-full max-[799px]:justify-end",
  notificationTrigger:
    "relative min-h-11 min-w-11 rounded-lg border border-[var(--line-strong)] bg-transparent p-2 text-[var(--ink)] hover:bg-[var(--surface)]",
  notificationBellIcon: "size-5 fill-none stroke-current stroke-2",
  notificationBadge:
    "absolute -right-1 -top-1 min-h-5 min-w-5 px-1 text-xs leading-5",
  notificationPopover:
    "absolute left-auto right-0 top-full z-[var(--layer-overlay)] grid max-h-[min(32rem,calc(100vh-8rem))] min-w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto overscroll-contain rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 text-[var(--ink)] shadow-lg",
  notificationPopoverHeader:
    "flex min-w-0 flex-wrap items-center justify-between gap-2 [overflow-wrap:anywhere]",
  notificationViewAll:
    "inline-flex min-h-11 min-w-11 w-fit items-center rounded-lg border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)]",
} as const;

export type ManagementNotificationState =
  | { kind: "loading" }
  | { kind: "ready"; notifications: ManagementNotifications }
  | { kind: "error"; message: string };

type ReadableNotification = Pick<
  ManagementNotificationItem,
  "source_key" | "source_revision"
>;

export interface ProgramsNotificationsProps extends Pick<
  FeedPresentationProps,
  "status" | "announcement" | "focusTargetRef"
> {
  state: ManagementNotificationState;
  onRetry: () => void;
  onOpen?: () => void;
  onMarkRead: (items: readonly ReadableNotification[]) => void | Promise<void>;
  /** Current management directory context for canonical View All recovery. */
  departmentId?: string | null;
  hash?: string | null;
  full?: boolean;
}
function notificationHref(
  item: ManagementNotificationItem,
  hash: string | null | undefined
): string {
  return buildProgramsHref(
    item.kind === "event"
      ? {
          mode: "management",
          programId: item.program_id,
          departmentId: item.department_id,
          task: "events",
          eventId: item.event_id,
          hash,
        }
      : {
          mode: "management",
          programId: item.program_id,
          departmentId: item.department_id,
          task: "participants",
          hash,
        }
  );
}

const NotificationList = ({
  state,
  onMarkRead,
  onNavigate,
  hash,
}: Pick<ProgramsNotificationsProps, "state" | "onMarkRead" | "hash"> & {
  onNavigate?: () => void;
}) => {
  if (state.kind === "loading") {
    return (
      <>
        <output className={styles.notificationState} aria-busy="true">
          {COPY.programs.notificationsLoading}
        </output>
        <Skeleton className={styles.notificationState} aria-hidden="true" />
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <Alert className={styles.notificationState} variant="destructive">
        {state.message}
      </Alert>
    );
  }
  if (state.notifications.items.length === 0) {
    return (
      <output className={styles.notificationState}>
        {COPY.programs.notificationsEmpty}
      </output>
    );
  }
  return (
    <ul
      className={styles.notificationList}
      aria-label={COPY.programs.notificationsListLabel}
    >
      {state.notifications.items.map((item) => {
        const title =
          item.kind === "enrollment"
            ? COPY.programs.notificationsEnrollmentLabel
            : item.actionable
              ? COPY.programs.notificationsEventLabel
              : COPY.programs.notificationsEventInformationalLabel;
        return (
          <li
            key={`${item.source_key}:${item.source_revision}`}
            className={cn(
              styles.notificationItem,
              item.read ? styles.notificationRead : styles.notificationUnread
            )}
          >
            <Link
              className={styles.notificationItemLink}
              href={notificationHref(item, hash)}
              onClick={() => {
                onNavigate?.();
                onMarkRead([item]);
              }}
            >
              <span className={styles.notificationItemTopline}>
                <strong>{title}</strong>
                {!item.read && (
                  <Badge
                    className={styles.notificationUnreadLabel}
                    variant="destructive"
                  >
                    {COPY.programs.notificationsUnread}
                  </Badge>
                )}
              </span>
              <span>
                {item.program_name} · {item.department_name}
              </span>
              <span>
                {item.kind === "enrollment"
                  ? COPY.programs.notificationsEnrollmentCount.replace(
                      "{count}",
                      String(item.count)
                    )
                  : `${item.name ? `${item.name} · ` : ""}${hkWallDateTimeLabel(item.starts_at)}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

function feedStateFor(
  state: ManagementNotificationState
): "loading" | "ready" | "empty" | "error" {
  if (state.kind === "loading") {
    return "loading";
  }
  if (state.kind === "error") {
    return "error";
  }
  return state.notifications.items.length === 0 ? "empty" : "ready";
}

const NotificationFeed = ({
  state,
  onMarkRead,
  onRetry,
  onNavigate,
  className,
  status,
  announcement,
  focusTargetRef,
  hash,
}: {
  state: ManagementNotificationState;
  onMarkRead: (items: readonly ReadableNotification[]) => void | Promise<void>;
  onRetry: () => void;
  onNavigate?: () => void;
  className?: string;
  status?: FeedPresentationProps["status"];
  announcement?: FeedPresentationProps["announcement"];
  focusTargetRef?: FeedPresentationProps["focusTargetRef"];
  hash?: string | null;
}) => {
  const feedState = feedStateFor(state);
  return (
    <FeedPresentation
      state={feedState}
      status={status}
      announcement={announcement}
      focusTargetRef={focusTargetRef}
      className={className}
      list={
        <NotificationList
          state={state}
          onMarkRead={onMarkRead}
          onNavigate={onNavigate}
          hash={hash}
        />
      }
      detail={
        <NotificationList
          state={state}
          onMarkRead={onMarkRead}
          onNavigate={onNavigate}
          hash={hash}
        />
      }
      loading={
        <NotificationList
          state={{ kind: "loading" }}
          onMarkRead={onMarkRead}
          onNavigate={onNavigate}
          hash={hash}
        />
      }
      error={
        <div className="grid min-w-0 gap-3">
          <NotificationList
            state={state}
            onMarkRead={onMarkRead}
            onNavigate={onNavigate}
            hash={hash}
          />
          <Button className={styles.retry} type="button" onClick={onRetry}>
            {COPY.programs.notificationsRetry}
          </Button>
        </div>
      }
      empty={
        <NotificationList
          state={state}
          onMarkRead={onMarkRead}
          onNavigate={onNavigate}
          hash={hash}
        />
      }
    />
  );
};

export const ProgramsNotifications = ({
  state,
  onRetry,
  onOpen,
  onMarkRead,
  full = false,
  status,
  announcement,
  focusTargetRef,
  departmentId = null,
  hash = null,
}: ProgramsNotificationsProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const focusReadyRef = useRef(false);
  const readKeyRef = useRef<string | null>(null);
  const [readError, setReadError] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(
    () => new Set()
  );
  const expanded = full || open;
  const closePopover = useCallback(() => setOpen(false), []);
  const effectiveState = useMemo<ManagementNotificationState>(() => {
    if (state.kind !== "ready" || readOverrides.size === 0) {
      return state;
    }
    const items = state.notifications.items.map((item) =>
      readOverrides.has(`${item.source_key}:${item.source_revision}`)
        ? { ...item, read: true }
        : item
    );
    const newlyReadCount = state.notifications.items.filter(
      (item) =>
        !item.read &&
        readOverrides.has(`${item.source_key}:${item.source_revision}`)
    ).length;
    return {
      kind: "ready",
      notifications: {
        ...state.notifications,
        items,
        unread_count: Math.max(
          0,
          state.notifications.unread_count - newlyReadCount
        ),
      },
    };
  }, [readOverrides, state]);
  const unreadCount =
    effectiveState.kind === "ready"
      ? effectiveState.notifications.unread_count
      : 0;
  const markRead = useCallback(
    async (items: readonly ReadableNotification[]) => {
      if (items.length === 0) {
        return;
      }
      try {
        await onMarkRead(items);
        setReadError(false);
      } catch {
        setReadError(true);
        return;
      }
      setReadOverrides((current) => {
        const next = new Set(current);
        for (const item of items) {
          next.add(`${item.source_key}:${item.source_revision}`);
        }
        return next;
      });
    },
    [onMarkRead]
  );
  const retryRead = useCallback(() => {
    readKeyRef.current = null;
    setReadError(false);
  }, []);

  useEffect(() => {
    if (!expanded) {
      readKeyRef.current = null;
      return;
    }
    if (readError || effectiveState.kind !== "ready") {
      return;
    }
    const visible = effectiveState.notifications.items;
    const readKey = visible
      .map(
        ({ source_key, source_revision }) => `${source_key}:${source_revision}`
      )
      .join("|");
    if (readKey === readKeyRef.current) {
      return;
    }
    readKeyRef.current = readKey;
    const unread =
      state.kind === "ready"
        ? state.notifications.items.filter((item) => !item.read)
        : [];
    if (unread.length > 0) {
      void markRead(unread);
    }
  }, [expanded, effectiveState, markRead, readError, state]);

  useEffect(() => {
    if (!focusReadyRef.current) {
      focusReadyRef.current = true;
      return;
    }
    if (expanded) {
      panelRef.current?.focus();
      return;
    }
    triggerRef.current?.focus();
  }, [expanded]);
  const notificationStatus = readError ? (
    <>
      {status}
      <Alert className={styles.notificationState} variant="destructive">
        <p>{COPY.programs.notificationsReadError}</p>
        <Button className={styles.retry} type="button" onClick={retryRead}>
          {COPY.programs.notificationsRetry}
        </Button>
      </Alert>
    </>
  ) : (
    status
  );

  if (full) {
    return (
      <section
        className={styles.notificationsPage}
        aria-labelledby="programs-notifications-title"
      >
        <header className={styles.notificationsPageHeader}>
          <div className="min-w-0">
            <h3
              id="programs-notifications-title"
              className={styles.panelHeading}
            >
              {COPY.programs.notificationsTitle}
            </h3>
            <p className={styles.notificationsLead}>
              {COPY.programs.notificationsLead}
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge
              className={`${styles.badge} ${styles.badgeActive}`}
              variant="default"
            >
              {unreadCount}
            </Badge>
          )}
        </header>
        <NotificationFeed
          state={effectiveState}
          onMarkRead={markRead}
          onRetry={onRetry}
          status={notificationStatus}
          announcement={announcement}
          focusTargetRef={focusTargetRef}
          hash={hash}
        />
      </section>
    );
  }

  return (
    <section
      className={styles.notificationControl}
      aria-label={COPY.programs.notificationBellLabel}
      data-feed-state={feedStateFor(effectiveState)}
    >
      <Button
        className={styles.notificationTrigger}
        type="button"
        aria-expanded={open}
        aria-controls="programs-notification-panel"
        aria-haspopup="dialog"
        aria-label={COPY.programs.notificationBellTitle}
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              onOpen?.();
            }
            return nextOpen;
          });
        }}
      >
        <svg
          className={styles.notificationBellIcon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <Badge
            className={`${styles.badge} ${styles.badgeActive} ${styles.notificationBadge}`}
            variant="default"
            aria-label={COPY.programs.notificationsCount.replace(
              "{count}",
              String(unreadCount)
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>
      {open && (
        <dialog
          open
          ref={panelRef}
          id="programs-notification-panel"
          className={styles.notificationPopover}
          aria-label={COPY.programs.notificationsTitle}
          tabIndex={-1}
        >
          <div className={styles.notificationPopoverHeader}>
            <h3 className="m-0 text-base font-bold">
              {COPY.programs.notificationsTitle}
            </h3>
            {unreadCount > 0 && <Badge variant="default">{unreadCount}</Badge>}
          </div>
          <NotificationFeed
            state={effectiveState}
            onMarkRead={markRead}
            onRetry={onRetry}
            onNavigate={closePopover}
            status={notificationStatus}
            announcement={announcement}
            focusTargetRef={focusTargetRef}
            hash={hash}
          />
          {effectiveState.kind === "ready" &&
            effectiveState.notifications.has_more && (
              <Link
                className={styles.notificationViewAll}
                href={buildProgramsHref({
                  mode: "management",
                  departmentId,
                  task: "notifications",
                  hash,
                })}
                onClick={closePopover}
              >
                {COPY.programs.notificationsViewAll}
              </Link>
            )}
        </dialog>
      )}
    </section>
  );
};
