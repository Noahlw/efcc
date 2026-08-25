"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { listParticipantCatalog } from "@/lib/programs/program-api";
import type {
  ParticipantCatalogEntry,
  ParticipantCatalogProgram,
  ParticipantCatalogViewerState,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import styles from "@/app/programs/programs.module.css";

/**
 * PUI-02 / Issue #246 — the participant Programs directory. Renders the
 * server-projected catalog (production Worker/D1) as one flat collection with
 * viewer-relative filters, search, accessible status text, and distinct
 * loading/empty/error states. Selecting a row hands off through the existing
 * URL-addressable Program intent — it never renders the nested Programs
 * manager.
 */

export type ParticipantFilter = "all" | "eligible" | "active" | "pending";

export interface ParticipantDirectoryProps {
  /** Opaque Program id carried by the URL intent, if any. */
  programId: string | null;
  /** Server-projected management capability (PUI-01 boundary, preserved). */
  canManage: boolean;
  onManagement: () => void;
  onOpenProgram: (programId: string) => void;
  onHome: () => void;
}

type CatalogState =
  | { kind: "loading" }
  | { kind: "ready"; catalog: ParticipantCatalogEntry[] }
  | { kind: "error"; failure: "forbidden" | "recoverable" };

type StatusKind = "success" | "pending" | "neutral" | "danger";

const FILTERS: readonly {
  value: ParticipantFilter;
  label: string;
}[] = [
  { value: "all", label: COPY.programs.filterAll },
  { value: "eligible", label: COPY.programs.filterEligible },
  { value: "active", label: COPY.programs.filterActive },
  { value: "pending", label: COPY.programs.filterPending },
];

const STATUS_TAG: Record<
  ParticipantCatalogViewerState,
  { label: string; kind: StatusKind }
> = {
  active: { label: COPY.programs.statusActive, kind: "success" },
  pending: { label: COPY.programs.statusPending, kind: "pending" },
  eligible: { label: COPY.programs.statusEligible, kind: "pending" },
  managerOnly: { label: COPY.programs.statusManagerOnly, kind: "neutral" },
  withdrawn: { label: COPY.programs.statusWithdrawn, kind: "neutral" },
  cancelled: { label: COPY.programs.statusCancelled, kind: "neutral" },
  rejected: { label: COPY.programs.statusRejected, kind: "danger" },
  archived: { label: COPY.programs.statusArchived, kind: "neutral" },
};

const SKELETON_ROWS = [0, 1, 2] as const;

function nextEventDateLabel(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("zh-Hant-HK", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Hong_Kong",
    weekday: "long",
  }).formatToParts(date);
  const part = (type: "weekday" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const weekday = part("weekday");
  const month = part("month");
  const day = part("day");
  return weekday && month && day ? `${month}月${day}日（${weekday}）` : "";
}

function catalogSecondaryCopy(program: ParticipantCatalogProgram): string {
  switch (program.viewerState) {
    case "active":
    case "eligible": {
      const nextDate = nextEventDateLabel(program.nextEventStartsAt);
      if (!nextDate) {
        return program.description ?? "";
      }
      const eventCount = COPY.programs.catalogEventCountSuffix.replace(
        "{count}",
        String(program.upcomingEventCount)
      );
      return `${COPY.programs.catalogActivePrefix}${nextDate} · ${eventCount}`;
    }
    case "pending": {
      return COPY.programs.catalogPendingCopy;
    }
    case "managerOnly": {
      return COPY.programs.catalogManagerOnlyCopy;
    }
    case "rejected": {
      return COPY.programs.catalogRejectedCopy;
    }
    case "archived": {
      return COPY.programs.catalogArchivedCopy;
    }
    case "withdrawn": {
      return program.description ?? "";
    }
    case "cancelled": {
      return program.description ?? "";
    }
    default: {
      return program.description ?? "";
    }
  }
}

export const ParticipantDirectory = ({
  programId,
  canManage,
  onManagement,
  onOpenProgram,
  onHome,
}: ParticipantDirectoryProps) => {
  const router = useRouter();
  const [state, setState] = useState<CatalogState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ParticipantFilter>("all");
  const mounted = useRef(true);
  const catalogRequestId = useRef(0);
  const retryFocusPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadCatalog = useCallback(async () => {
    catalogRequestId.current += 1;
    const requestId = catalogRequestId.current;
    setState({ kind: "loading" });
    announce(COPY.programs.catalogLoading);
    try {
      const { catalog } = await listParticipantCatalog();
      if (!mounted.current || catalogRequestId.current !== requestId) {
        return;
      }
      setState({ kind: "ready", catalog });
    } catch (error) {
      if (!mounted.current || catalogRequestId.current !== requestId) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
        return;
      }
      const code = error instanceof RpcError ? error.problem.code : undefined;
      const failure = code === "FORBIDDEN" ? "forbidden" : "recoverable";
      setState({ kind: "error", failure });
      announce(
        failure === "forbidden"
          ? COPY.programs.catalogForbiddenHint
          : COPY.programs.catalogLoadErrorHint
      );
    }
  }, [router]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!retryFocusPending.current || state.kind !== "error") {
      return;
    }
    const panel = document.querySelector<HTMLElement>(
      "#programs-catalog-state"
    );
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  const retryCatalog = () => {
    retryFocusPending.current = true;
    void loadCatalog();
  };

  const programs = useMemo<ParticipantCatalogProgram[] | null>(() => {
    if (state.kind !== "ready") {
      return null;
    }
    const flat = state.catalog.flatMap((entry) => entry.programs);
    // ponytail: stable sort surfaces enrollable programs (Listed + MemberRequest)
    // first — F-C02. Preserves original display_order within each rank;
    // no API contract change, seed display_order (-10 vs 900) is primary.
    return flat.toSorted((a, b) => {
      const aRank =
        a.discoverability === "Listed" && a.enrollment_mode === "MemberRequest"
          ? 0
          : 1;
      const bRank =
        b.discoverability === "Listed" && b.enrollment_mode === "MemberRequest"
          ? 0
          : 1;
      return aRank - bRank;
    });
  }, [state]);

  const filtered = useMemo(() => {
    if (!programs) {
      return [];
    }
    const q = query.trim().toLowerCase();
    return programs.filter((program) => {
      if (filter !== "all" && program.viewerState !== filter) {
        return false;
      }
      if (q === "") {
        return true;
      }
      return (
        program.name.toLowerCase().includes(q) ||
        (program.description ?? "").toLowerCase().includes(q) ||
        (program.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [filter, programs, query]);

  const selectedProgram = useMemo(() => {
    if (!programs || programId === null) {
      return null;
    }
    return programs.find((program) => program.program_id === programId);
  }, [programId, programs]);

  const searching = query.trim() !== "";

  return (
    <>
      {state.kind === "ready" &&
        programId !== null &&
        (selectedProgram ? (
          <div className={styles.intentNotice} role="status">
            <strong>{COPY.programs.directProgramIntent}</strong>
            <span>
              {selectedProgram.name}
              {selectedProgram.category ? ` · ${selectedProgram.category}` : ""}
            </span>
          </div>
        ) : (
          <div className={styles.intentNotice} role="status">
            <strong>{COPY.programs.programUnavailable}</strong>
            <span>{COPY.programs.programUnavailableHint}</span>
          </div>
        ))}

      {state.kind === "loading" && (
        <>
          <div className={styles.directorySearch}>
            <div className={styles.directorySearchRow}>
              <div className={styles.directorySearchInputWrap}>
                <svg
                  aria-hidden="true"
                  className={styles.directorySearchIcon}
                  focusable="false"
                  viewBox="0 0 24 24"
                >
                  <circle
                    cx="11"
                    cy="11"
                    fill="none"
                    r="7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="m20 20-4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                <input
                  id="programs-catalog-search"
                  aria-label={COPY.programs.catalogSearchLabel}
                  placeholder={COPY.programs.catalogSearchLabel}
                  className={styles.input}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  aria-busy="true"
                />
              </div>
              {searching && (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => setQuery("")}
                >
                  {COPY.programs.catalogClearSearch}
                </button>
              )}
            </div>
          </div>

          <div
            className={styles.directoryFilters}
            role="group"
            aria-label={COPY.programs.filterGroupLabel}
          >
            <div className={styles.directoryFilterGroup}>
              {FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  className={styles.filterChip}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section
            id="programs-catalog-state"
            tabIndex={-1}
            className={styles.boundaryState}
            role="status"
            aria-busy="true"
            aria-label={COPY.programs.catalogLoading}
          >
            <span className={styles.directorySrOnly}>
              {COPY.programs.catalogLoading}
            </span>
            <div className={styles.directorySkeletonList} aria-hidden="true">
              {SKELETON_ROWS.map((row) => (
                <div
                  key={row}
                  className={`${styles.directorySkeletonCard} ${
                    row === SKELETON_ROWS.length - 1
                      ? styles.directorySkeletonCardLast
                      : ""
                  }`}
                >
                  <span className={styles.directorySkeletonBar} />
                  <span
                    className={`${styles.directorySkeletonBar} ${styles.directorySkeletonBarShort}`}
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {state.kind === "error" && (
        <section
          id="programs-catalog-state"
          tabIndex={-1}
          className={styles.boundaryError}
          role="alert"
        >
          <h2 className={styles.boundaryTitle}>
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbidden
              : COPY.programs.catalogLoadError}
          </h2>
          <p>
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbiddenHint
              : COPY.programs.catalogLoadErrorHint}
          </p>
          <button
            className={styles.retry}
            type="button"
            onClick={state.failure === "forbidden" ? onHome : retryCatalog}
          >
            {state.failure === "forbidden"
              ? COPY.nav.backToHome
              : COPY.programs.catalogRetry}
          </button>
        </section>
      )}

      {programs && (
        <>
          <div className={styles.directorySearch}>
            <div className={styles.directorySearchRow}>
              <div className={styles.directorySearchInputWrap}>
                <svg
                  aria-hidden="true"
                  className={styles.directorySearchIcon}
                  focusable="false"
                  viewBox="0 0 24 24"
                >
                  <circle
                    cx="11"
                    cy="11"
                    fill="none"
                    r="7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="m20 20-4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                <input
                  id="programs-catalog-search"
                  aria-label={COPY.programs.catalogSearchLabel}
                  placeholder={COPY.programs.catalogSearchLabel}
                  className={styles.input}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                />
              </div>
              {searching && (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => setQuery("")}
                >
                  {COPY.programs.catalogClearSearch}
                </button>
              )}
            </div>
          </div>

          <div
            className={styles.directoryFilters}
            role="group"
            aria-label={COPY.programs.filterGroupLabel}
          >
            <div className={styles.directoryFilterGroup}>
              {FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  className={styles.filterChip}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <section
              id="programs-catalog-state"
              className={`${styles.boundaryState} ${styles.directoryEmpty}`}
            >
              <h2 className={styles.boundaryTitle}>
                {programs.length === 0
                  ? COPY.programs.catalogNoPrograms
                  : COPY.programs.catalogEmpty}
              </h2>
              <p>
                {programs.length === 0
                  ? COPY.programs.catalogNoProgramsHint
                  : COPY.programs.catalogEmptyHint}
              </p>
              <button
                className={styles.retry}
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {COPY.programs.catalogClearFilters}
              </button>
            </section>
          )}

          {filtered.length > 0 && (
            <ul
              className={`${styles.directoryList} ${styles.participantDirectoryList}`}
              aria-label={COPY.programs.catalogListLabel}
            >
              {filtered.map((program) => {
                const tag = STATUS_TAG[program.viewerState];
                const secondaryCopy = catalogSecondaryCopy(program);
                return (
                  <li key={program.program_id} className={styles.directoryItem}>
                    <button
                      className={`${styles.directoryCard} ${styles.participantDirectoryCard}`}
                      aria-label={`${tag.label} · ${program.name}${
                        secondaryCopy ? ` · ${secondaryCopy}` : ""
                      }`}
                      type="button"
                      onClick={() => onOpenProgram(program.program_id)}
                    >
                      <span className={styles.directoryCardBody}>
                        <span className={styles.directoryCardTopRow}>
                          <span
                            className={`${styles.directoryStatus} ${
                              styles[
                                `directoryStatus${tag.kind[0].toUpperCase()}${tag.kind.slice(1)}`
                              ]
                            }`}
                          >
                            {tag.label}
                          </span>
                          {program.category && (
                            <span className={styles.directoryCategory}>
                              {program.category}
                            </span>
                          )}
                        </span>
                        <span className={styles.directoryCardTitle}>
                          {program.name}
                        </span>
                        <span className={styles.directoryCardSecondary}>
                          {program.viewerState === "active" ||
                          program.viewerState === "eligible" ? (
                            nextEventDateLabel(program.nextEventStartsAt) ? (
                              <>
                                {COPY.programs.catalogActivePrefix}
                                {nextEventDateLabel(program.nextEventStartsAt)}
                                {" · "}
                                <span className={styles.nowrap}>
                                  {COPY.programs.catalogEventCountSuffix.replace(
                                    "{count}",
                                    String(program.upcomingEventCount)
                                  )}
                                </span>
                              </>
                            ) : (
                              (program.description ?? "")
                            )
                          ) : (
                            secondaryCopy
                          )}
                        </span>
                      </span>
                      <svg
                        className={styles.directoryChevron}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {canManage && (
        <div className={styles.managementEntry}>
          <div>
            <h3>{COPY.programs.managementMode}</h3>
            <p>{COPY.programs.managementLead}</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={onManagement}
          >
            {COPY.programs.enterManagement}
          </button>
        </div>
      )}
    </>
  );
};
