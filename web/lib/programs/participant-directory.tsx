"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { listParticipantCatalog } from "@/lib/programs/program-api";
import type {
  ParticipantCatalogEntry,
  ParticipantCatalogProgram,
  ParticipantCatalogViewerState,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";
import { cn } from "@/lib/utils";

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

const SKELETON_ROWS = [0, 1, 2] as const;
const catalogStatusVariants = cva(
  "inline-flex min-h-6 items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-bold leading-tight",
  {
    variants: {
      tone: {
        success:
          "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]",
        pending:
          "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)]",
        neutral:
          "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]",
        danger:
          "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

type CatalogStatusTone = NonNullable<
  VariantProps<typeof catalogStatusVariants>["tone"]
>;

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
  <div className="mb-5 min-w-0">
    <div className="flex min-w-0 gap-2 max-[799px]:flex-col">
      <div className="relative flex min-w-0 flex-1">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[var(--ink-muted)]"
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
        <Input
          id="programs-catalog-search"
          aria-label={COPY.programs.catalogSearchLabel}
          placeholder={COPY.programs.catalogSearchLabel}
          className="h-auto min-h-11 border-[var(--line-strong)] bg-[var(--surface-raised)] py-3 pr-3 pl-10 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
          aria-busy={busy}
        />
      </div>
      {query.trim() !== "" && (
        <Button
          className="h-auto min-h-11 whitespace-normal border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--surface)] hover:text-[var(--accent-deep)] max-[799px]:w-full"
          type="button"
          variant="outline"
          onClick={onClear}
        >
          {COPY.programs.catalogClearSearch}
        </Button>
      )}
    </div>
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
  <div
    className="mb-4 min-w-0"
    role="group"
    aria-label={COPY.programs.filterGroupLabel}
  >
    <div className="flex min-w-0 flex-wrap gap-2">
      {FILTERS.map(({ value, label }) => (
        <Button
          key={value}
          className="h-auto min-h-11 min-w-11 whitespace-normal px-3.5 py-2 text-sm font-bold"
          variant={filter === value ? "default" : "outline"}
          type="button"
          aria-pressed={filter === value}
          onClick={() => onFilterChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  </div>
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
  canManage,
  managementHref,
  programHref,
  onOpenProgram,
  focusProgramId = null,
  onFocusProgram,
  homeHref,
}: ParticipantDirectoryProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ParticipantFilter>("all");
  const [storedFocusProgramId] = useState(readParticipantProgramFocus);
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
    <div className="min-w-0 text-[var(--ink)]">
      {state.kind === "ready" && programId !== null && (
        <div
          className="my-6 grid min-w-0 gap-1 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm leading-6"
          role="status"
        >
          <strong className="min-w-0 wrap-anywhere">
            {selectedProgram
              ? COPY.programs.directProgramIntent
              : COPY.programs.programUnavailable}
          </strong>
          <span className="min-w-0 wrap-anywhere text-[var(--ink-muted)]">
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
        <section
          id="programs-catalog-state"
          tabIndex={-1}
          className="grid min-w-0 max-w-[60ch] gap-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)]"
          role="status"
          aria-busy="true"
          aria-label={COPY.programs.catalogLoading}
        >
          <span className="sr-only">{COPY.programs.catalogLoading}</span>
          <div
            className="min-w-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-raised)]"
            aria-hidden="true"
          >
            {SKELETON_ROWS.map((row) => (
              <div
                key={row}
                className="min-h-[88px] border-b border-[var(--line)] p-4 last:border-b-0"
              >
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-3 h-3 w-[62%]" />
              </div>
            ))}
          </div>
        </section>
      )}

      {state.kind === "error" && (
        <Alert
          id="programs-catalog-state"
          tabIndex={-1}
          className="grid min-w-0 max-w-[60ch] gap-1.5 border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-[var(--ink)]"
          variant="destructive"
        >
          <h2 className="m-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight">
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbidden
              : COPY.programs.catalogLoadError}
          </h2>
          <p className="m-0 mb-3 wrap-anywhere leading-[1.6]">
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbiddenHint
              : COPY.programs.catalogLoadErrorHint}
          </p>
          {state.failure === "forbidden" ? (
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
          )}
        </Alert>
      )}

      {programs && (
        <>
          {filtered.length === 0 && (
            <Card
              id="programs-catalog-state"
              className="grid min-w-0 max-w-[60ch] gap-1.5 border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)]"
            >
              <h2 className="m-0 wrap-anywhere text-[1.35rem] font-extrabold leading-tight">
                {programs.length === 0
                  ? COPY.programs.catalogNoPrograms
                  : COPY.programs.catalogEmpty}
              </h2>
              <p className="m-0 mb-3 wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
                {programs.length === 0
                  ? COPY.programs.catalogNoProgramsHint
                  : COPY.programs.catalogEmptyHint}
              </p>
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
            </Card>
          )}

          {filtered.length > 0 && (
            <ul
              className="mt-3 grid min-w-0 list-none gap-0 p-0"
              aria-label={COPY.programs.catalogListLabel}
            >
              {filtered.map((program) => {
                const tag = STATUS_TAG[program.viewerState];
                const secondaryCopy = catalogSecondaryCopy(program);
                const nextDate = nextEventDateLabel(program.nextEventStartsAt);
                return (
                  <li
                    key={program.program_id}
                    className="min-w-0 border-t border-[var(--line)] first:border-t-0"
                  >
                    <Button
                      asChild
                      className="grid h-auto min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-none border-0 bg-transparent px-3 py-3 text-left text-[var(--ink)] whitespace-normal hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                    >
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
                          rememberParticipantProgramFocus(program.program_id);
                          onOpenProgram?.(program.program_id);
                        }}
                      >
                        <span className="block min-w-0">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge
                              className={cn(
                                catalogStatusVariants({
                                  tone: tag.kind as CatalogStatusTone,
                                })
                              )}
                              variant="outline"
                              role="status"
                            >
                              {tag.label}
                            </Badge>
                            {program.category && (
                              <span className="min-w-0 wrap-anywhere text-xs font-bold text-[var(--ink-muted)]">
                                {program.category}
                              </span>
                            )}
                          </span>
                          <span
                            className="mt-1 block min-w-0 wrap-anywhere text-base font-extrabold leading-[1.35]"
                            data-program-name
                          >
                            {program.name}
                          </span>
                          <span className="mt-1 block min-w-0 wrap-anywhere text-sm leading-[1.5] text-[var(--ink-muted)]">
                            {program.viewerState === "active" ||
                            program.viewerState === "eligible" ? (
                              nextDate ? (
                                <>
                                  {COPY.programs.catalogActivePrefix}
                                  {nextDate}
                                  {" · "}
                                  <span className="wrap-anywhere">
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
                          className="size-5 shrink-0 text-[var(--ink-muted)]"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="m9 6 6 6-6 6"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {canManage && (
        <div className="mt-5 flex min-w-0 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 max-[799px]:flex-col max-[799px]:items-stretch">
          <div className="min-w-0">
            <h3 className="m-0 wrap-anywhere text-base font-extrabold">
              {COPY.programs.managementMode}
            </h3>
            <p className="m-0 mt-1 wrap-anywhere leading-[1.5] text-[var(--ink-muted)]">
              {COPY.programs.managementLead}
            </p>
          </div>
          <Button
            asChild
            className="h-auto min-h-11 whitespace-normal px-4 py-3 text-base font-extrabold max-[799px]:w-full"
          >
            <Link href={managementHref}>{COPY.programs.enterManagement}</Link>
          </Button>
        </div>
      )}
    </div>
  );
};
