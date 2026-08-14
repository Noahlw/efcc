"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { COPY } from "@/lib/copy";
import type {
  ManagementNotificationItem,
  ManagementNotifications,
} from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { hkWallDateTimeLabel } from "@/lib/programs/recurrence";

import styles from "@/app/programs/programs.module.css";

export type ManagementNotificationState =
  | { kind: "loading" }
  | { kind: "ready"; notifications: ManagementNotifications }
  | { kind: "error"; message: string };

type ReadableNotification = Pick<
  ManagementNotificationItem,
  "source_key" | "source_revision"
>;

export interface ProgramsNotificationsProps {
  state: ManagementNotificationState;
  onRetry: () => void;
  onOpen?: () => void;
  onMarkRead: (items: readonly ReadableNotification[]) => void;
  onViewAll: () => void;
  full?: boolean;
}

function notificationHref(item: ManagementNotificationItem): string {
  return buildProgramsHref(
    item.kind === "event"
      ? {
          mode: "management",
          programId: item.program_id,
          task: "events",
          eventId: item.event_id,
        }
      : {
          mode: "management",
          programId: item.program_id,
          task: "participants",
        }
  );
}

const NotificationList = ({
  state,
  onMarkRead,
}: Pick<ProgramsNotificationsProps, "state" | "onMarkRead">) => {
  if (state.kind === "loading") {
    return (
      <output className={styles.notificationState} aria-busy="true">
        {COPY.programs.notificationsLoading}
      </output>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={styles.notificationState} role="alert">
        {state.message}
      </div>
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
            className={`${styles.notificationItem} ${
              item.read ? styles.notificationRead : styles.notificationUnread
            }`}
          >
            <a
              className={styles.notificationItemLink}
              href={notificationHref(item)}
              onClick={() => {
                onMarkRead([item]);
              }}
            >
              <span className={styles.notificationItemTopline}>
                <strong>{title}</strong>
                {!item.read && (
                  <span className={styles.notificationUnreadLabel}>
                    {COPY.programs.notificationsUnread}
                  </span>
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
            </a>
          </li>
        );
      })}
    </ul>
  );
};

export const ProgramsNotifications = ({
  state,
  onRetry,
  onOpen,
  onMarkRead,
  onViewAll,
  full = false,
}: ProgramsNotificationsProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const readKeyRef = useRef<string | null>(null);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(
    () => new Set()
  );
  const expanded = full || open;
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
    (items: readonly ReadableNotification[]) => {
      if (items.length === 0) {
        return;
      }
      setReadOverrides((current) => {
        const next = new Set(current);
        for (const item of items) {
          next.add(`${item.source_key}:${item.source_revision}`);
        }
        return next;
      });
      onMarkRead(items);
    },
    [onMarkRead]
  );

  useEffect(() => {
    if (!expanded) {
      readKeyRef.current = null;
      return;
    }
    if (effectiveState.kind !== "ready") {
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
      markRead(unread);
    }
  }, [expanded, effectiveState, markRead, state]);

  useEffect(() => {
    if (expanded) {
      panelRef.current?.focus();
      return;
    }
    triggerRef.current?.focus();
  }, [expanded]);

  if (full) {
    return (
      <section
        className={styles.notificationsPage}
        aria-labelledby="programs-notifications-title"
      >
        <header className={styles.notificationsPageHeader}>
          <div>
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
            <span className={`${styles.badge} ${styles.badgeActive}`}>
              {unreadCount}
            </span>
          )}
        </header>
        <NotificationList state={effectiveState} onMarkRead={markRead} />
        {effectiveState.kind === "error" && (
          <button className={styles.retry} type="button" onClick={onRetry}>
            {COPY.programs.notificationsRetry}
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      className={styles.notificationControl}
      aria-label={COPY.programs.notificationBellLabel}
    >
      <button
        ref={triggerRef}
        className={styles.notificationTrigger}
        type="button"
        aria-expanded={open}
        aria-controls="programs-notification-panel"
        aria-haspopup="dialog"
        aria-label={COPY.programs.notificationBellTitle}
        onClick={() => {
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
          <span
            className={`${styles.badge} ${styles.badgeActive} ${styles.notificationBadge}`}
            aria-label={COPY.programs.notificationsCount.replace(
              "{count}",
              String(unreadCount)
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
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
            <strong>{COPY.programs.notificationsTitle}</strong>
            {unreadCount > 0 && <span>{unreadCount}</span>}
          </div>
          <NotificationList state={effectiveState} onMarkRead={markRead} />
          {effectiveState.kind === "error" && (
            <button className={styles.retry} type="button" onClick={onRetry}>
              {COPY.programs.notificationsRetry}
            </button>
          )}
          {effectiveState.kind === "ready" &&
            effectiveState.notifications.has_more && (
              <button
                className={styles.notificationViewAll}
                type="button"
                onClick={onViewAll}
              >
                {COPY.programs.notificationsViewAll}
              </button>
            )}
        </dialog>
      )}
    </section>
  );
};
