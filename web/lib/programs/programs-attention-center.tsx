"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import {
  getAttention,
  markAttentionNotificationsRead,
  updateTaskPriority,
} from "@/lib/attention-api";
import type {
  AttentionModule,
  AttentionNotification,
  AttentionTask,
  AttentionView,
  TaskPriority,
} from "@/lib/attention-api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { Icon } from "@/lib/icons";

import styles from "./programs-attention-center.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; view: AttentionView }
  | { kind: "error"; message: string };

const MODULE_ORDER: readonly AttentionModule[] = [
  "membership",
  "programs",
  "attendance",
  "home",
];

const MODULE_LABELS: Record<AttentionModule, string> = {
  membership: COPY.attention.moduleMembership,
  programs: COPY.attention.modulePrograms,
  attendance: COPY.attention.moduleAttendance,
  home: COPY.attention.moduleHome,
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: COPY.attention.priorityHigh,
  normal: COPY.attention.priorityNormal,
  low: COPY.attention.priorityLow,
};
const priorityFromValue = (value: string): TaskPriority =>
  value === "high" || value === "low" ? value : "normal";

const dateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
};

const groupTasks = (tasks: readonly AttentionTask[]) => {
  const grouped: Record<AttentionModule, AttentionTask[]> = {
    membership: [],
    programs: [],
    attendance: [],
    home: [],
  };
  for (const task of tasks) {
    grouped[task.module].push(task);
  }
  return grouped;
};

export interface ProgramsAttentionCenterProps {
  actorRole: string;
}

// oxlint-disable-next-line complexity
export const ProgramsAttentionCenter = ({
  actorRole,
}: ProgramsAttentionCenterProps) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tasks" | "notifications">("tasks");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", view: await getAttention() });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.error.unavailable,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) {
      const panel = panelRef.current;
      if (panel) {
        if (typeof panel.showModal === "function") {
          if (!panel.open) panel.showModal();
        } else {
          panel.setAttribute("open", "");
        }
      }
      panel?.focus();
      void load();
      return;
    }
    triggerRef.current?.focus();
  }, [load, open]);

  const view = state.kind === "ready" ? state.view : null;
  const grouped = useMemo(() => groupTasks(view?.tasks ?? []), [view]);
  const unreadNotifications =
    view?.notifications.filter(({ read }) => !read) ?? [];
  const actionableCount = view?.actionable_count ?? 0;
  const hasUnread = (view?.unread_count ?? 0) > 0;

  const handleMarkAllRead = async () => {
    if (unreadNotifications.length === 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      await markAttentionNotificationsRead(
        unreadNotifications.map(({ notification_id }) => notification_id)
      );
      await load();
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.attention.updateFailed,
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePriority = async (task: AttentionTask, next: TaskPriority) => {
    if (busy || task.priority === next) {
      return;
    }
    setBusy(true);
    try {
      await updateTaskPriority(task.task_id, next);
      await load();
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.attention.updateFailed,
      });
    } finally {
      setBusy(false);
    }
  };

  const renderNotification = (notification: AttentionNotification) => (
    <li key={notification.notification_id} className={styles.item}>
      {notification.href ? (
        <a
          className={styles.itemLink}
          href={notification.href}
          onClick={() => setOpen(false)}
        >
          <strong>{notification.title}</strong>
          <span>{notification.body}</span>
          <time dateTime={notification.created_at}>
            {dateLabel(notification.created_at)}
          </time>
        </a>
      ) : (
        <div className={styles.itemContent}>
          <strong>{notification.title}</strong>
          <span>{notification.body}</span>
          <time dateTime={notification.created_at}>
            {dateLabel(notification.created_at)}
          </time>
        </div>
      )}
    </li>
  );

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={COPY.attention.bellLabel}
        aria-expanded={open}
        aria-controls="attention-center-panel"
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" size={20} />
        {actionableCount > 0 ? (
          <span className={styles.count} aria-label={`${actionableCount}`}>
            {actionableCount}
          </span>
        ) : (
          hasUnread && <span className={styles.dot} aria-hidden="true" />
        )}
      </button>
      {open && (
        <dialog
          id="attention-center-panel"
          ref={panelRef}
          className={styles.panel}
          aria-modal="true"
          aria-label={COPY.attention.title}
          tabIndex={-1}
          onCancel={() => setOpen(false)}
        >
          <header className={styles.header}>
            <h2>{COPY.attention.title}</h2>
            <button
              type="button"
              aria-label={COPY.attention.close}
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={20} />
            </button>
          </header>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tasks"}
              className={tab === "tasks" ? styles.tabActive : styles.tab}
              onClick={() => setTab("tasks")}
            >
              {COPY.attention.tasksTab}
              {actionableCount > 0 && (
                <span className={styles.tabCount}>{actionableCount}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "notifications"}
              className={
                tab === "notifications" ? styles.tabActive : styles.tab
              }
              onClick={() => setTab("notifications")}
            >
              {COPY.attention.notificationsTab}
              {hasUnread && <span className={styles.tabDot} />}
            </button>
          </div>
          {state.kind === "loading" && (
            <output className={styles.state} aria-busy="true">
              {COPY.attention.loading}
            </output>
          )}
          {state.kind === "error" && (
            <div className={styles.state} role="alert">
              <p>{state.message}</p>
              <button type="button" className={styles.retry} onClick={load}>
                {COPY.attention.retry}
              </button>
            </div>
          )}
          {state.kind === "ready" && tab === "tasks" && (
            <div className={styles.content}>
              {view?.tasks.length === 0 ? (
                <p className={styles.empty}>{COPY.attention.emptyTasks}</p>
              ) : (
                MODULE_ORDER.map((module) => {
                  const tasks = grouped[module];
                  if (tasks.length === 0) {
                    return null;
                  }
                  return (
                    <section key={module} className={styles.group}>
                      <h3>{MODULE_LABELS[module]}</h3>
                      <ul className={styles.list}>
                        {tasks.map((task) => (
                          <li key={task.task_id} className={styles.item}>
                            <a
                              className={styles.itemLink}
                              href={task.href}
                              onClick={() => setOpen(false)}
                            >
                              <strong>{task.title}</strong>
                              <span>{dateLabel(task.submitted_at)}</span>
                              {task.warning && (
                                <span className={styles.warning}>
                                  {COPY.attention.warning}
                                </span>
                              )}
                            </a>
                            <label className={styles.priority}>
                              <span>{COPY.attention.taskPriorityLabel}</span>
                              {actorRole === "Admin" ? (
                                <select
                                  value={task.priority}
                                  disabled={busy}
                                  onChange={(event) =>
                                    void handlePriority(
                                      task,
                                      priorityFromValue(
                                        event.currentTarget.value
                                      )
                                    )
                                  }
                                >
                                  {Object.entries(PRIORITY_LABELS).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    )
                                  )}
                                </select>
                              ) : (
                                <span className={styles.priorityChip}>
                                  {PRIORITY_LABELS[task.priority]}
                                </span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}
            </div>
          )}
          {state.kind === "ready" && tab === "notifications" && (
            <div className={styles.content}>
              {unreadNotifications.length > 0 && (
                <button
                  type="button"
                  className={styles.markRead}
                  disabled={busy}
                  onClick={() => void handleMarkAllRead()}
                >
                  {COPY.attention.markAllRead}
                </button>
              )}
              {view?.notifications.length === 0 ? (
                <p className={styles.empty}>
                  {COPY.attention.emptyNotifications}
                </p>
              ) : (
                <ul
                  className={styles.list}
                  aria-label={COPY.attention.notificationListLabel}
                >
                  {view?.notifications.map(renderNotification)}
                </ul>
              )}
            </div>
          )}
        </dialog>
      )}
    </div>
  );
};
