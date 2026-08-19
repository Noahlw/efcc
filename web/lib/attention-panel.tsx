"use client";

import { useEffect, useId, useRef, useState } from "react";

import { COPY } from "@/lib/copy";

export interface AttentionItem {
  id: string;
  title: string;
  detail?: string;
}

export interface AttentionNotice extends AttentionItem {
  unread: boolean;
}

/** Empty by design: later tickets can supply typed attention data here. */
export interface AttentionData {
  pendingItems: readonly AttentionItem[];
  notices: readonly AttentionNotice[];
}

export const EMPTY_ATTENTION_DATA: AttentionData = {
  pendingItems: [],
  notices: [],
};

type AttentionTab = "pending" | "notices";

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ),
  ];
}

export const AttentionPanel = ({
  open,
  onClose,
  data = EMPTY_ATTENTION_DATA,
}: {
  open: boolean;
  onClose: () => void;
  data?: AttentionData;
}) => {
  const [tab, setTab] = useState<AttentionTab>("pending");
  const panelRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const panel = panelRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) {
        return;
      }
      const focusable = focusableElements(panel);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const unreadNoticeCount = data.notices.filter(
    (notice) => notice.unread
  ).length;
  const activeItems = tab === "pending" ? data.pendingItems : data.notices;
  const emptyTitle =
    tab === "pending"
      ? COPY.attention.pendingEmptyTitle
      : COPY.attention.noticesEmptyTitle;
  const emptyHint =
    tab === "pending"
      ? COPY.attention.pendingEmptyHint
      : COPY.attention.noticesEmptyHint;

  return (
    <div className="attention-overlay">
      <button
        type="button"
        tabIndex={-1}
        className="attention-overlay__backdrop"
        aria-label={COPY.attention.close}
        onClick={onClose}
      />
      <dialog
        ref={panelRef}
        open
        className="attention-panel"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="attention-panel__header">
          <h2 id={titleId}>{COPY.attention.title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="attention-panel__close"
            onClick={onClose}
          >
            {COPY.attention.close}
          </button>
        </header>

        <div
          className="attention-panel__tabs"
          role="tablist"
          aria-label={COPY.attention.tabsLabel}
        >
          <button
            type="button"
            role="tab"
            id={`${panelId}-pending-tab`}
            aria-controls={`${panelId}-pending-panel`}
            aria-selected={tab === "pending"}
            className="attention-panel__tab"
            onClick={() => setTab("pending")}
          >
            {COPY.attention.pendingTab}
          </button>
          <button
            type="button"
            role="tab"
            id={`${panelId}-notices-tab`}
            aria-controls={`${panelId}-notices-panel`}
            aria-selected={tab === "notices"}
            className="attention-panel__tab"
            onClick={() => setTab("notices")}
          >
            {COPY.attention.noticesTab}
          </button>
        </div>

        <div
          id={
            tab === "pending"
              ? `${panelId}-pending-panel`
              : `${panelId}-notices-panel`
          }
          className="attention-panel__body"
          role="tabpanel"
          aria-labelledby={
            tab === "pending"
              ? `${panelId}-pending-tab`
              : `${panelId}-notices-tab`
          }
          tabIndex={0}
        >
          {activeItems.length > 0 ? (
            <ul className="attention-panel__list">
              {activeItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="attention-panel__empty">
              <span className="attention-panel__empty-mark" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <h3>{emptyTitle}</h3>
              <p>{emptyHint}</p>
            </div>
          )}
        </div>

        <span className="sr-only">
          {COPY.attention.badgeCount(
            unreadNoticeCount + data.pendingItems.length
          )}
        </span>
      </dialog>
    </div>
  );
};
