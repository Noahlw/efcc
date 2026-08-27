"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

/**
 * Attention overlay (Spec 089-S1) on the local shadcn/Radix Dialog primitive.
 *
 * Role/state, keyboard (Escape), focus trap, focus restore, and the modal
 * overlay are the Radix Dialog observable contract (TK-03): the dialog is
 * `role="dialog"`, labelled by the title, focus moves into the panel on open
 * and back to the bell trigger on close, and Escape closes. The tab list
 * keeps explicit `role="tab"`/`aria-selected` semantics (TK-02 variant).
 */
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
  const panelId = useId();

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="attention-panel !top-4 !left-auto !right-4 !w-auto !max-w-[calc(100vw-2rem)] !translate-x-0 !translate-y-0 !gap-0 !rounded-xl !p-0"
      >
        <header className="attention-panel__header">
          <DialogTitle className="attention-panel__title">
            {COPY.attention.title}
          </DialogTitle>
          <Button
            type="button"
            variant="outline"
            data-dialog-close
            className="attention-panel__close border-[var(--line-strong)] bg-transparent px-3 text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface)]"
            onClick={onClose}
          >
            {COPY.attention.close}
          </Button>
        </header>

        <div
          className="attention-panel__tabs"
          role="tablist"
          aria-label={COPY.attention.tabsLabel}
        >
          <Button
            type="button"
            variant="ghost"
            role="tab"
            id={`${panelId}-pending-tab`}
            aria-controls={`${panelId}-pending-panel`}
            aria-selected={tab === "pending"}
            className="attention-panel__tab rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm font-bold text-[var(--ink-muted)] hover:bg-transparent hover:text-[var(--ink)]"
            onClick={() => setTab("pending")}
          >
            {COPY.attention.pendingTab}
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            id={`${panelId}-notices-tab`}
            aria-controls={`${panelId}-notices-panel`}
            aria-selected={tab === "notices"}
            className="attention-panel__tab rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm font-bold text-[var(--ink-muted)] hover:bg-transparent hover:text-[var(--ink)]"
            onClick={() => setTab("notices")}
          >
            {COPY.attention.noticesTab}
          </Button>
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
      </DialogContent>
    </Dialog>
  );
};
