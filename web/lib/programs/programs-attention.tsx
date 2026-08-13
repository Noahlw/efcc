"use client";

import { useEffect, useRef, useState } from "react";

import { COPY } from "@/lib/copy";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import type {
  ManagementAttention,
  ManagementAttentionItem,
} from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

export type ManagementAttentionState =
  | { kind: "loading" }
  | { kind: "ready"; attention: ManagementAttention }
  | { kind: "error"; message: string };

function formatAttentionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function attentionHref(item: ManagementAttentionItem): string {
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

export interface ProgramsAttentionProps {
  state: ManagementAttentionState;
  onRetry: () => void;
}

export function ProgramsAttention({
  state,
  onRetry,
}: ProgramsAttentionProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusPending = useRef(false);

  useEffect(() => {
    if (open) {
      document.getElementById("programs-attention-panel")?.focus();
      return;
    }
    if (returnFocusPending.current) {
      triggerRef.current?.focus();
      returnFocusPending.current = false;
    }
  }, [open]);

  const attention = state.kind === "ready" ? state.attention : null;
  const actionableCount = attention?.total_actionable_count ?? 0;

  return (
    <section className={styles.attentionControl} aria-label={COPY.programs.attentionControlLabel}>
      <button
        ref={triggerRef}
        className={styles.attentionTrigger}
        type="button"
        aria-expanded={open}
        aria-controls="programs-attention-panel"
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{COPY.programs.attentionTitle}</span>
        {actionableCount > 0 && (
          <span
            className={`${styles.badge} ${styles.badgeActive}`}
            aria-label={COPY.programs.attentionCount.replace(
              "{count}",
              String(actionableCount)
            )}
          >
            {actionableCount}
          </span>
        )}
      </button>
      {open && (
        <div
          id="programs-attention-panel"
          className={styles.attentionPopover}
          role="dialog"
          aria-label={COPY.programs.attentionTitle}
          tabIndex={-1}
        >
          {state.kind === "loading" && (
            <output className={styles.attentionState} aria-busy="true">
              {COPY.programs.attentionLoading}
            </output>
          )}
          {state.kind === "error" && (
            <div className={styles.attentionState} role="alert">
              <p>{state.message}</p>
              <button
                className={styles.retry}
                type="button"
                onClick={onRetry}
              >
                {COPY.programs.attentionRetry}
              </button>
            </div>
          )}
          {state.kind === "ready" && state.attention.items.length === 0 && (
            <p className={styles.attentionZero}>
              {COPY.programs.attentionZero}
            </p>
          )}
          {state.kind === "ready" && state.attention.items.length > 0 && (
            <>
              <ul className={styles.attentionList} aria-label={COPY.programs.attentionListLabel}>
                {state.attention.items.map((item) => {
                  const informational = !item.actionable;
                  return (
                    <li
                      key={item.kind === "event" ? item.event_id : `${item.kind}-${item.program_id}`}
                      className={`${styles.attentionItem} ${informational ? styles.attentionInformational : styles.attentionActionable}`}
                    >
                      <a
                        className={styles.attentionItemLink}
                        href={attentionHref(item)}
                        onClick={() => setOpen(false)}
                      >
                        <strong>
                          {item.kind === "enrollment"
                            ? COPY.programs.attentionEnrollmentLabel
                            : item.actionable
                              ? COPY.programs.attentionEventLabel
                              : COPY.programs.attentionEventInformationalLabel}
                        </strong>
                        <span>
                          {item.program_name} · {item.department_name}
                        </span>
                        {item.kind === "enrollment" ? (
                          <span>
                            {COPY.programs.attentionEnrollmentCount.replace(
                              "{count}",
                              String(item.count)
                            )}
                          </span>
                        ) : (
                          <span>
                            {item.name ?? formatAttentionTime(item.starts_at)}
                            {" · "}
                            {formatAttentionTime(item.starts_at)}
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {state.attention.has_more && (
                <a
                  className={styles.attentionViewAll}
                  href={buildProgramsHref({ mode: "management" })}
                  onClick={() => setOpen(false)}
                >
                  {COPY.programs.attentionViewAll}
                </a>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
