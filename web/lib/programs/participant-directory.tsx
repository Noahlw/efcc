"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { listParticipantCatalog } from "@/lib/programs/program-api";
import type {
  ParticipantCatalogEntry,
  ParticipantCatalogProgram,
  ParticipantCatalogViewerState,
} from "@/lib/programs/program-api";
import {
  ScreenFilterChip,
  ScreenFilters,
  ScreenHeader,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSearch,
  ScreenSection,
  ScreenState,
  ScreenStatus,
} from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { useAsyncResource } from "./use-async-resource";

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
  /** Canonical same-origin URL for opening the management workspace. */
  managementHref: string;
  /** Canonical same-origin URL for opening a participant Program. */
  programHref: (programId: string) => string;
  /** Record a same-app row navigation for origin focus restoration. */
  onOpenProgram?: (programId: string) => void;
  /** Program row to focus after returning from a detail route. */
  focusProgramId?: string | null;
  /** Clear a consumed focus restoration marker. */
  onFocusProgram?: () => void;
  /** Safe same-origin escape when the catalog is forbidden. */
  homeHref: string;
}
const PROGRAM_FOCUS_KEY = "efcc_program_focus";

export function rememberParticipantProgramFocus(programId: string): void {
  try {
    sessionStorage.setItem(PROGRAM_FOCUS_KEY, programId);
  } catch {
    // Focus restoration is best-effort when storage is unavailable.
  }
}

function readParticipantProgramFocus(): string | null {
  try {
    return sessionStorage.getItem(PROGRAM_FOCUS_KEY);
  } catch {
    return null;
  }
}

export function clearParticipantProgramFocus(): void {
  try {
    sessionStorage.removeItem(PROGRAM_FOCUS_KEY);
  } catch {
    // Best-effort.
  }
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

interface CatalogSearchControlsProps {
  query: string;
  busy?: boolean;
  onQueryChange: (value: string) => void;
  onClear: () => void;
}

const CatalogSearchControls = ({
  query,
  busy = false,
  onQueryChange,
  onClear,
}: CatalogSearchControlsProps) => (
  <div className="mb-5 flex min-w-0 gap-2 max-[799px]:flex-col">
    <ScreenSearch
      id="programs-catalog-search"
      aria-label={COPY.programs.catalogSearchLabel}
      placeholder={COPY.programs.catalogSearchLabel}
      className="min-w-0 flex-1"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      autoComplete="off"
      aria-describedby={undefined}
      aria-busy={busy}
    />
    {query.trim() !== "" && (
      <Button
        className="h-auto min-h-[var(--screen-touch-target)] whitespace-normal border-[var(--screen-line-strong)] bg-[var(--screen-surface)] px-[var(--screen-control-padding-inline)] py-2 text-[var(--screen-ink)] hover:border-[var(--screen-accent)] hover:bg-[var(--screen-surface-soft)] hover:text-[var(--screen-accent-deep)] max-[799px]:w-full"
        type="button"
        variant="outline"
        onClick={onClear}
      >
        {COPY.programs.catalogClearSearch}
      </Button>
    )}
  </div>
);

interface CatalogFilterChipsProps {
  filter: ParticipantFilter;
  onFilterChange: (value: ParticipantFilter) => void;
}

const CatalogFilterChips = ({
  filter,
  onFilterChange,
}: CatalogFilterChipsProps) => (
  <ScreenFilters
    className="mb-5"
    role="group"
    aria-label={COPY.programs.filterGroupLabel}
  >
    {FILTERS.map(({ value, label }) => (
      <ScreenFilterChip
        key={value}
        selected={filter === value}
        onClick={() => onFilterChange(value)}
      >
        {label}
      </ScreenFilterChip>
    ))}
  </ScreenFilters>
);

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
  programHref,
  onOpenProgram,
  focusProgramId = null,
  onFocusProgram,
  homeHref,
}: ParticipantDirectoryProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ParticipantFilter>("all");
  const storedFocusProgramId = useMemo(readParticipantProgramFocus, []);
  const focusTargetProgramId = focusProgramId ?? storedFocusProgramId;
  const onAuthRequired = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    rememberDeepLink(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    router.replace("/");
  }, [router]);
  const {
    state,
    run,
    retry: retryCatalog,
  } = useAsyncResource<{ catalog: ParticipantCatalogEntry[] }, CatalogState>(
    listParticipantCatalog,
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ catalog }) => ({ kind: "ready", catalog }),
      onError: (error) => ({
        kind: "error",
        failure:
          error instanceof RpcError && error.problem.code === "FORBIDDEN"
            ? "forbidden"
            : "recoverable",
      }),
      announceLoading: COPY.programs.catalogLoading,
      isAuthRequired: (error) =>
        error instanceof RpcError && error.problem.code === "AUTH_REQUIRED",
      onAuthRequired,
      focusTarget: "#programs-catalog-state",
    },
    [router]
  );

  useEffect(() => {
    void run();
  }, [run]);

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
  useEffect(() => {
    if (state.kind !== "ready" || focusTargetProgramId === null) {
      return;
    }
    const row = [
      ...document.querySelectorAll<HTMLElement>("[data-program-row]"),
    ].find((candidate) => candidate.dataset.programId === focusTargetProgramId);
    const target =
      row ??
      document.querySelector<HTMLElement>("#programs-catalog-search") ??
      document.querySelector<HTMLElement>("#programs-catalog-state");
    if (!target) {
      return;
    }
    target.focus();
    clearParticipantProgramFocus();
    onFocusProgram?.();
  }, [focusTargetProgramId, onFocusProgram, state.kind]);

  return (
    <div className="min-w-0 text-[var(--screen-ink)]">
      <ScreenHeader
        headingId="programs-catalog-title"
        lead={COPY.programs.entryLead}
        title={COPY.programs.pageTitle}
      />

      {state.kind === "ready" && programId !== null && (
        <div
          className="my-5 grid min-w-0 gap-1 border-l-2 border-[var(--screen-accent)] bg-[var(--screen-surface-soft)] px-3 py-2 text-sm leading-6"
          role="status"
        >
          <strong className="min-w-0 wrap-anywhere">
            {selectedProgram
              ? COPY.programs.directProgramIntent
              : COPY.programs.programUnavailable}
          </strong>
          <span className="min-w-0 wrap-anywhere text-[var(--screen-muted)]">
            {selectedProgram
              ? `${selectedProgram.name}${
                  selectedProgram.category
                    ? ` · ${selectedProgram.category}`
                    : ""
                }`
              : COPY.programs.programUnavailableHint}
          </span>
        </div>
      )}

      <CatalogSearchControls
        query={query}
        busy={state.kind === "loading"}
        onQueryChange={setQuery}
        onClear={() => setQuery("")}
      />
      <CatalogFilterChips filter={filter} onFilterChange={setFilter} />

      {state.kind === "loading" && (
        <ScreenLoadingRows
          id="programs-catalog-state"
          tabIndex={-1}
          count={3}
          label={COPY.programs.catalogLoading}
        >
          {COPY.programs.catalogLoading}
        </ScreenLoadingRows>
      )}

      {state.kind === "error" && (
        <ScreenState
          id="programs-catalog-state"
          tabIndex={-1}
          kind={state.failure === "forbidden" ? "forbidden" : "error"}
          title={
            <h2 className="m-0 wrap-anywhere text-base font-bold">
              {state.failure === "forbidden"
                ? COPY.programs.catalogForbidden
                : COPY.programs.catalogLoadError}
            </h2>
          }
          description={
            <p className="m-0 wrap-anywhere leading-[1.6]">
              {state.failure === "forbidden"
                ? COPY.programs.catalogForbiddenHint
                : COPY.programs.catalogLoadErrorHint}
            </p>
          }
          action={
            state.failure === "forbidden" ? (
              <Button
                asChild
                className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
                variant="outline"
              >
                <Link href={homeHref} replace>
                  {COPY.nav.backToHome}
                </Link>
              </Button>
            ) : (
              <Button
                className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
                type="button"
                onClick={retryCatalog}
              >
                {COPY.programs.catalogRetry}
              </Button>
            )
          }
        />
      )}

      {programs && (
        <>
          {filtered.length === 0 && (
            <ScreenState
              id="programs-catalog-state"
              kind="empty"
              title={
                <h2 className="m-0 wrap-anywhere text-base font-bold">
                  {programs.length === 0
                    ? COPY.programs.catalogNoPrograms
                    : COPY.programs.catalogEmpty}
                </h2>
              }
              description={
                <p className="m-0 wrap-anywhere leading-[1.6]">
                  {programs.length === 0
                    ? COPY.programs.catalogNoProgramsHint
                    : COPY.programs.catalogEmptyHint}
                </p>
              }
              action={
                <Button
                  className="h-auto min-h-11 w-full whitespace-normal px-4 py-3 text-base font-bold sm:w-fit"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {COPY.programs.catalogClearFilters}
                </Button>
              }
            />
          )}

          {filtered.length > 0 && (
            <ScreenSection title={COPY.programs.catalogSectionTitle}>
              <ScreenRowList>
                <ul
                  className="m-0 grid min-w-0 list-none gap-0 p-0"
                  aria-label={COPY.programs.catalogListLabel}
                >
                  {filtered.map((program) => {
                    const tag = STATUS_TAG[program.viewerState];
                    const secondaryCopy = catalogSecondaryCopy(program);
                    return (
                      <li key={program.program_id} className="min-w-0">
                        <ScreenRow asChild>
                          <Link
                            href={programHref(program.program_id)}
                            data-program-row
                            data-program-id={program.program_id}
                            aria-label={`${tag.label} · ${program.name}${
                              secondaryCopy ? ` · ${secondaryCopy}` : ""
                            }`}
                            onClick={(event) => {
                              if (
                                event.defaultPrevented ||
                                event.button !== 0 ||
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.altKey
                              ) {
                                return;
                              }
                              rememberParticipantProgramFocus(
                                program.program_id
                              );
                              onOpenProgram?.(program.program_id);
                            }}
                          >
                            <ScreenRowMain>
                              <ScreenRowTitle data-program-name>
                                {program.name}
                              </ScreenRowTitle>
                              <ScreenRowMeta>
                                {program.category
                                  ? `${program.category}${secondaryCopy ? " · " : ""}`
                                  : ""}
                                {secondaryCopy}
                              </ScreenRowMeta>
                            </ScreenRowMain>
                            <ScreenRowTrailing>
                              <ScreenStatus role="status" tone={tag.kind}>
                                {tag.label}
                              </ScreenStatus>
                              <ChevronRight
                                aria-hidden="true"
                                className="size-[var(--screen-icon-size)] shrink-0 text-[var(--screen-muted)]"
                                strokeWidth={1.8}
                              />
                            </ScreenRowTrailing>
                          </Link>
                        </ScreenRow>
                      </li>
                    );
                  })}
                </ul>
              </ScreenRowList>
            </ScreenSection>
          )}
        </>
      )}
    </div>
  );
};
