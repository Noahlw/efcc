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
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";

type HubState =
  | { kind: "loading" }
  | (ManagementHubView & { kind: "ready" })
  | {
      kind: "error";
      failure: "forbidden" | "recoverable";
      message: string;
    };

function HubIcon({
  rowKey,
  chevron = false,
}: {
  rowKey: string;
  chevron?: boolean;
}) {
  if (chevron) {
    return (
      <svg
        className="size-5 shrink-0 stroke-[var(--ink-muted)] fill-none stroke-[2] stroke-linecap-round stroke-linejoin-round"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  const common = {
    className:
      "size-6 shrink-0 stroke-[var(--accent,#9c302c)] fill-none stroke-[1.75] stroke-linecap-round stroke-linejoin-round",
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
    <li className="m-0 p-0">
      <Link
        className="grid min-h-[4.25rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left text-[var(--ink)] transition-colors hover:bg-[var(--surface,#f4f5f3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus,#176a87)] focus-visible:ring-offset-2"
        href={row.href}
      >
        <span className="flex min-w-0 items-center gap-3.5">
          <HubIcon rowKey={row.key} />
          <span className="grid min-w-0 gap-0.5">
            <span className="block min-w-0 text-base font-bold leading-[1.35] text-[var(--ink)] wrap-anywhere">
              {row.label}
            </span>
            <span className="block min-w-0 text-[0.875rem] font-normal leading-[1.4] text-[var(--ink-muted)] wrap-anywhere">
              {row.description}
            </span>
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
    <section className="min-w-0" aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-2 text-[1.1rem] font-bold leading-[1.35] text-[var(--ink)] wrap-anywhere"
      >
        {group.label}
      </h2>
      <ul className="m-0 list-none overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-0 shadow-none [&>li+li]:border-t [&>li+li]:border-[var(--line)]">
        {group.rows.map((row) => (
          <HubRow key={row.key} row={row} />
        ))}
      </ul>
    </section>
  );
}

function EntryCard({ entryCard }: { entryCard: ManagementHubRow }) {
  return (
    <section className="min-w-0" aria-labelledby="management-entry-label">
      <p
        id="management-entry-label"
        className="mb-2 text-[0.875rem] font-bold leading-[1.35] text-[var(--ink-muted)] wrap-anywhere"
      >
        {COPY.management.anotherEntry}
      </p>
      <Link
        className="grid min-h-[4.25rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-left text-[var(--ink)] transition-colors hover:bg-[var(--surface,#f4f5f3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus,#176a87)] focus-visible:ring-offset-2"
        href={entryCard.href}
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="block min-w-0 text-base font-bold leading-[1.35] text-[var(--ink)] wrap-anywhere">
            {entryCard.label}
          </span>
          <span className="block min-w-0 text-[0.875rem] font-normal leading-[1.4] text-[var(--ink-muted)] wrap-anywhere">
            {entryCard.description}
          </span>
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
    <div
      data-slot="management-hub-grid"
      className="mt-[1.625rem] grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
    >
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
  const {
    state,
    run: loadHub,
    retry,
  } = useAsyncResource<ManagementHubView, HubState>(
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
    <section
      className="mx-auto w-full max-w-[1040px] min-w-0 px-4 pb-16 pt-8 text-[var(--ink)] min-[481px]:px-6"
      aria-labelledby="management-hub-title"
    >
      <header className="pb-1">
        <h1
          id="management-hub-title"
          className="text-[clamp(1.5rem,5.5vw,2rem)] font-extrabold leading-tight tracking-[-0.02em] text-[var(--ink)] wrap-anywhere"
        >
          {COPY.management.managementTitle}
        </h1>
        <p className="mt-1 text-base font-normal leading-[1.6] text-[var(--ink-muted)] wrap-anywhere">
          {COPY.management.managementLead}
        </p>
      </header>

      {state.kind === "loading" && (
        <output
          id="management-hub-state"
          tabIndex={-1}
          className="mt-8 block rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center text-base text-[var(--ink-muted)]"
          aria-busy="true"
        >
          {COPY.management.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          id="management-hub-state"
          tabIndex={-1}
          className="mt-8 rounded-[12px] border border-[var(--error-border,#e5b4b0)] bg-[var(--error-surface,#fbeeed)] p-6 text-center text-[var(--ink)]"
          role="alert"
        >
          <h2 className="text-lg font-bold leading-snug text-[var(--error,#b3261e)]">
            {state.failure === "forbidden"
              ? COPY.management.forbidden
              : COPY.management.loadError}
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {state.message}
          </p>
          <button
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface,#f4f5f3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus,#176a87)]"
            type="button"
            onClick={retry}
          >
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
            className="mt-8 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center text-[var(--ink)]"
            role="status"
            aria-live="polite"
          >
            <h2 className="text-lg font-bold leading-snug">
              {COPY.management.emptyTitle}
            </h2>
            <Link
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface,#f4f5f3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus,#176a87)]"
              href="/"
            >
              {COPY.management.backHome}
            </Link>
          </section>
        )}
    </section>
  );
}
