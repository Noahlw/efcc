"use client";

import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";
import { FeedPresentation } from "@/lib/feed-presentation";
import type { FeedPresentationProps } from "@/lib/feed-presentation";
import type {
  ManagementNotificationItem,
  ManagementNotifications,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { hkWallDateTimeLabel } from "@/lib/programs/recurrence";
import {
  ScreenHeader,
  ScreenIconButton,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";

const styles = {
  retry:
    "min-h-11 min-w-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]",
  notificationControl:
    "relative min-w-0 max-[799px]:flex max-[799px]:w-full max-[799px]:justify-end",
  notificationBadge:
    "absolute -top-1 -right-1 min-w-6 justify-center px-1 text-xs leading-5",
  notificationPopover:
    "absolute top-full right-0 z-[var(--layer-overlay)] grid max-h-[min(32rem,calc(100vh-8rem))] min-w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto overscroll-contain rounded-[var(--screen-radius-surface)] border border-[var(--screen-line-strong)] bg-[var(--screen-surface)] p-4 text-[var(--screen-ink)] shadow-lg",
  notificationPopoverHeader:
    "flex min-w-0 flex-wrap items-center justify-between gap-2 [overflow-wrap:anywhere]",
  notificationViewAll:
    "inline-flex min-h-11 min-w-11 w-fit items-center rounded-[var(--screen-radius-control)] border border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]",
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

type NotificationListProps = Pick<
  ProgramsNotificationsProps,
  "state" | "onMarkRead" | "hash"
> & {
  onNavigate?: () => void;
};

const NotificationRows = ({
  items,
  onMarkRead,
  onNavigate,
  hash,
}: {
  items: readonly ManagementNotificationItem[];
  onMarkRead: NotificationListProps["onMarkRead"];
  onNavigate?: () => void;
  hash?: string | null;
}) => (
  <ScreenRowList aria-label={COPY.programs.notificationsListLabel}>
    {items.map((item) => {
      const title =
        item.kind === "enrollment"
          ? COPY.programs.notificationsEnrollmentLabel
          : item.actionable
            ? COPY.programs.notificationsEventLabel
            : COPY.programs.notificationsEventInformationalLabel;
      const detail =
        item.kind === "enrollment"
          ? COPY.programs.notificationsEnrollmentCount.replace(
              "{count}",
              String(item.count)
            )
          : `${item.name ? `${item.name} · ` : ""}${hkWallDateTimeLabel(item.starts_at)}`;
      return (
        <ScreenRow key={`${item.source_key}:${item.source_revision}`} asChild>
          <Link
            href={notificationHref(item, hash)}
            onClick={() => {
              onNavigate?.();
              void onMarkRead([item]);
            }}
          >
            {item.read || (
              <span
                aria-label={COPY.programs.notificationsUnread}
                className="size-2 shrink-0 rounded-full bg-[var(--screen-accent)]"
              />
            )}
            <ScreenRowMain>
              <ScreenRowTitle>{title}</ScreenRowTitle>
              <ScreenRowMeta>
                {item.program_name} · {item.department_name} · {detail}
              </ScreenRowMeta>
            </ScreenRowMain>
            <ScreenRowTrailing>
              <ChevronRight
                aria-hidden="true"
                className="size-5 text-[var(--screen-muted)]"
              />
            </ScreenRowTrailing>
          </Link>
        </ScreenRow>
      );
    })}
  </ScreenRowList>
);

const NotificationList = ({
  state,
  onMarkRead,
  onNavigate,
  hash,
}: NotificationListProps) => {
  if (state.kind === "loading") {
    return (
      <ScreenState kind="loading" title={COPY.programs.notificationsLoading}>
        <ScreenLoadingRows
          count={2}
          label={COPY.programs.notificationsLoading}
        />
      </ScreenState>
    );
  }
  if (state.kind === "error") {
    return <ScreenState kind="error" title={state.message} />;
  }
  if (state.notifications.items.length === 0) {
    return (
      <ScreenState kind="empty" title={COPY.programs.notificationsEmpty} />
    );
  }

  const unread = state.notifications.items.filter((item) => !item.read);
  const earlier = state.notifications.items.filter((item) => item.read);
  return (
    <div
      className="grid min-w-0 gap-5"
      aria-label={COPY.programs.notificationsListLabel}
    >
      {unread.length > 0 ? (
        <ScreenSection
          title={COPY.programs.notificationsUnreadSection}
          action={
            <ScreenStatus tone="pending">
              {state.notifications.unread_count}
            </ScreenStatus>
          }
        >
          <NotificationRows
            items={unread}
            onMarkRead={onMarkRead}
            onNavigate={onNavigate}
            hash={hash}
          />
        </ScreenSection>
      ) : null}
      {earlier.length > 0 ? (
        <ScreenSection title={COPY.programs.notificationsEarlierSection}>
          <NotificationRows
            items={earlier}
            onMarkRead={onMarkRead}
            onNavigate={onNavigate}
            hash={hash}
          />
        </ScreenSection>
      ) : null}
    </div>
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
      <ScreenState
        kind="error"
        title={COPY.programs.notificationsReadError}
        action={
          <Button className={styles.retry} type="button" onClick={retryRead}>
            {COPY.programs.notificationsRetry}
          </Button>
        }
      />
    </>
  ) : (
    status
  );

  if (full) {
    return (
      <section
        className="grid min-w-0 gap-5"
        aria-labelledby="programs-notifications-title"
      >
        <ScreenHeader
          level="child"
          title={COPY.programs.notificationsScreenTitle}
          lead={COPY.programs.notificationsScreenLead}
          headingId="programs-notifications-title"
          backHref={buildProgramsHref({
            mode: "management",
            departmentId,
            hash,
          })}
        />
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
      <ScreenIconButton
        className="relative"
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
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount > 0 && (
          <ScreenStatus
            className={styles.notificationBadge}
            tone="pending"
            aria-label={COPY.programs.notificationsCount.replace(
              "{count}",
              String(unreadCount)
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </ScreenStatus>
        )}
      </ScreenIconButton>
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
            {unreadCount > 0 ? (
              <ScreenStatus tone="pending">{unreadCount}</ScreenStatus>
            ) : null}
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
