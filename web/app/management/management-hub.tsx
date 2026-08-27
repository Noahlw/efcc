"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getManagementHub,
  type ManagementHubGroup,
  type ManagementHubRow,
  type ManagementHubView,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";
import { useAsyncResource } from "@/lib/programs/use-async-resource";

import styles from "./management-hub.module.css";

type HubState =
  | { kind: "loading" }
  | ManagementHubView & { kind: "ready" }
  | {
      kind: "error";
      failure: "forbidden" | "recoverable";
      message: string;
    };

function HubIcon({ rowKey, chevron = false }: { rowKey: string; chevron?: boolean }) {
  if (chevron) {
    return (
      <svg
        className={styles.chevron}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  const common = {
    className: styles.icon,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;

  switch (rowKey) {
    case "approvals":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5.5 19c.55-3.05 2.75-4.75 6.5-4.75s5.95 1.7 6.5 4.75" />
        </svg>
      );
    case "attendance":
      return (
        <svg {...common}>
          <rect x="4.5" y="5.5" width="15" height="14" rx="2" />
          <path d="M8 3.75v3.5M16 3.75v3.5M4.5 10h15" />
        </svg>
      );
    case "members":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="16.5" cy="9" r="2.25" />
          <path d="M3.75 19c.45-3 2.3-4.75 5.25-4.75S13.8 16 14.25 19M14.25 14.9c2.9-.25 4.8 1.05 5.4 4.1" />
        </svg>
      );
    case "home-content":
      return (
        <svg {...common}>
          <path d="M6 3.75h8l4 4V20.25H6z" />
          <path d="M14 3.75v4h4M9 12h6M9 15.5h6" />
        </svg>
      );
    case "permissions":
    case "departments":
    default:
      return (
        <svg {...common}>
          <path d="M12 3.75 19 6.5v5.25c0 4.1-2.55 7.05-7 8.5-4.45-1.45-7-4.4-7-8.5V6.5z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}

function HubRow({ row }: { row: ManagementHubRow }) {
  return (
    <li className={styles.rowItem}>
      <Link className={styles.row} href={row.href}>
        <span className={styles.rowLead}>
          <HubIcon rowKey={row.key} />
          <span className={styles.rowCopy}>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={styles.rowDescription}>{row.description}</span>
          </span>
        </span>
        <HubIcon rowKey={row.key} chevron />
      </Link>
    </li>
  );
}

function HubGroup({ group }: { group: ManagementHubGroup }) {
  const headingId = `management-group-${group.key}`;
  return (
    <section className={styles.groupSection} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.groupLabel}>
        {group.label}
      </h2>
      <ul className={styles.groupCard}>
        {group.rows.map((row) => (
          <HubRow key={row.key} row={row} />
        ))}
      </ul>
    </section>
  );
}

function EntryCard({ entryCard }: { entryCard: ManagementHubRow }) {
  return (
    <section className={styles.entrySection} aria-labelledby="management-entry-label">
      <p id="management-entry-label" className={styles.entryLabel}>
        {COPY.management.anotherEntry}
      </p>
      <Link className={styles.entryLink} href={entryCard.href}>
        <span className={styles.entryCopy}>
          <span className={styles.entryTitle}>{entryCard.label}</span>
          <span className={styles.entryDescription}>{entryCard.description}</span>
        </span>
        <HubIcon rowKey={entryCard.key} chevron />
      </Link>
    </section>
  );
}

function DirectoryContent({ groups, entryCard }: ManagementHubView) {
  const visibleGroups = groups.filter((group) => group.rows.length > 0);
  const contentIndex = visibleGroups.findIndex(
    (group) => group.key === "content-and-system"
  );
  const operationsIndex = visibleGroups.findIndex(
    (group) => group.key === "ministry-operations"
  );
  const entryIndex =
    contentIndex >= 0
      ? contentIndex
      : operationsIndex >= 0
        ? operationsIndex + 1
        : visibleGroups.length;

  return (
    <div className={styles.groupGrid}>
      {visibleGroups.map((group, index) => (
        <Fragment key={group.key}>
          {entryCard && index === entryIndex && (
            <EntryCard entryCard={entryCard} />
          )}
          <HubGroup group={group} />
        </Fragment>
      ))}
      {entryCard && entryIndex === visibleGroups.length && (
        <EntryCard entryCard={entryCard} />
      )}
    </div>
  );
}

export function ManagementHub() {
  const router = useRouter();
  const { state, run: loadHub, retry } = useAsyncResource<
    ManagementHubView,
    HubState
  >(
    () => getManagementHub(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (data) => ({ kind: "ready", ...data }),
      onError: (error) => {
        const code = error instanceof RpcError ? error.problem.code : undefined;
        if (code === "AUTH_REQUIRED") {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return null;
        }

        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return {
          kind: "error",
          failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
          message,
        };
      },
      announceLoading: COPY.management.loading,
      focusTarget: "#management-hub-state",
    },
    [router]
  );

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  return (
    <section className={styles.page} aria-labelledby="management-hub-title">
      <header className={styles.header}>
        <h1 id="management-hub-title" className={styles.title}>
          {COPY.management.managementTitle}
        </h1>
        <p className={styles.lead}>{COPY.management.managementLead}</p>
      </header>

      {state.kind === "loading" && (
        <output
          id="management-hub-state"
          tabIndex={-1}
          className={styles.state}
          aria-busy="true"
        >
          {COPY.management.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          id="management-hub-state"
          tabIndex={-1}
          className={styles.error}
          role="alert"
        >
          <h2 className={styles.stateTitle}>
            {state.failure === "forbidden"
              ? COPY.management.forbidden
              : COPY.management.loadError}
          </h2>
          <p className={styles.stateMessage}>{state.message}</p>
          <button className={styles.retry} type="button" onClick={retry}>
            {COPY.management.retry}
          </button>
        </section>
      )}

      {state.kind === "ready" &&
      (state.groups.some((group) => group.rows.length > 0) ||
        Boolean(state.entryCard)) ? (
        <DirectoryContent groups={state.groups} entryCard={state.entryCard} />
      ) : null}

      {state.kind === "ready" &&
        state.groups.every((group) => group.rows.length === 0) &&
        !state.entryCard && (
          <section
            id="management-hub-state"
            tabIndex={-1}
            className={styles.empty}
            role="status"
            aria-live="polite"
          >
            <h2 className={styles.stateTitle}>{COPY.management.emptyTitle}</h2>
            <Link className={styles.backLink} href="/">
              {COPY.management.backHome}
            </Link>
          </section>
        )}
    </section>
  );
}
