"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { listParticipantCatalog } from "@/lib/programs/program-api";
import type {
  ParticipantCatalogEntry,
  ProgramSummary,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import styles from "@/app/programs/programs.module.css";

/**
 * PUI-02 / Issue #246 — the participant Programs directory. Renders the
 * server-projected catalog (production Worker/D1) as one flat, coherent
 * collection with search, concise lifecycle/participation filters, Department
 * and category recognition context, accessible lifecycle status text, and
 * distinct loading/empty/empty-search/stale/forbidden-item/recoverable states.
 * Selecting a row hands off through the existing URL-addressable Program
 * intent — it never renders the nested Programs manager.
 */

export type LifecycleFilter = "All" | ProgramSummary["lifecycle"];
export type ParticipationFilter = "All" | ProgramSummary["enrollment_mode"];

export interface ParticipantDirectoryProps {
  /** Opaque Program id carried by the URL intent, if any. */
  programId: string | null;
  /** Server-projected management capability (PUI-01 boundary, preserved). */
  canManage: boolean;
  onManagement: () => void;
  onOpenProgram: (programId: string) => void;
}

type CatalogState =
  | { kind: "loading" }
  | { kind: "ready"; catalog: ParticipantCatalogEntry[] }
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };

const LIFECYCLE_LABEL: Record<ProgramSummary["lifecycle"], string> = {
  Draft: COPY.programs.filterDraft,
  Active: COPY.programs.filterActive,
  Archived: COPY.programs.filterArchived,
};

const PARTICIPATION_LABEL: Record<ProgramSummary["enrollment_mode"], string> = {
  MemberRequest: COPY.programs.filterMemberRequest,
  ManagerOnly: COPY.programs.filterManagerOnly,
};

const LIFECYCLE_FILTERS: readonly LifecycleFilter[] = [
  "All",
  "Active",
  "Draft",
  "Archived",
];
const PARTICIPATION_FILTERS: readonly ParticipationFilter[] = [
  "All",
  "MemberRequest",
  "ManagerOnly",
];

interface ReadyCatalog {
  catalog: ParticipantCatalogEntry[];
  programs: ProgramSummary[];
  departmentName: (departmentId: string) => string;
}

export const ParticipantDirectory = ({
  programId,
  canManage,
  onManagement,
  onOpenProgram,
}: ParticipantDirectoryProps) => {
  const router = useRouter();
  const [state, setState] = useState<CatalogState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("All");
  const [participation, setParticipation] =
    useState<ParticipationFilter>("All");
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
      const message =
        error instanceof RpcError
          ? errorCopyFor(code, error.problem.detail)
          : COPY.error.networkError;
      setState({
        kind: "error",
        failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
        message,
      });
      announce(message);
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

  const ready = useMemo<ReadyCatalog | null>(() => {
    if (state.kind !== "ready") {
      return null;
    }
    const departments = new Map(
      state.catalog.map((entry) => [
        entry.department.department_id,
        entry.department,
      ])
    );
    return {
      catalog: state.catalog,
      programs: state.catalog.flatMap((entry) => entry.programs),
      departmentName: (departmentId: string) =>
        departments.get(departmentId)?.name ?? "",
    };
  }, [state]);

  const filtered = useMemo(() => {
    if (!ready) {
      return [];
    }
    const q = query.trim().toLowerCase();
    return ready.programs.filter((program) => {
      if (lifecycle !== "All" && program.lifecycle !== lifecycle) {
        return false;
      }
      if (
        participation !== "All" &&
        program.enrollment_mode !== participation
      ) {
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
  }, [lifecycle, participation, query, ready]);

  const selectedProgram = useMemo(() => {
    if (!ready || programId === null) {
      return null;
    }
    return ready.programs.find((program) => program.program_id === programId);
  }, [programId, ready]);

  const searching = query.trim() !== "";

  return (
    <>
      <h2 className={styles.boundaryTitle}>{COPY.programs.participantMode}</h2>
      <p className={styles.boundaryLead}>{COPY.programs.participantLead}</p>

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
        <section
          id="programs-catalog-state"
          tabIndex={-1}
          className={styles.boundaryState}
          role="status"
          aria-busy="true"
        >
          <p>{COPY.programs.catalogLoading}</p>
        </section>
      )}

      {state.kind === "error" && (
        <section
          id="programs-catalog-state"
          tabIndex={-1}
          className={styles.boundaryError}
          role="alert"
        >
          <h3 className={styles.boundaryTitle}>
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbidden
              : COPY.programs.catalogLoadError}
          </h3>
          <p>
            {state.failure === "forbidden"
              ? COPY.programs.catalogForbiddenHint
              : state.message}
          </p>
          <button className={styles.retry} type="button" onClick={retryCatalog}>
            {COPY.programs.catalogRetry}
          </button>
        </section>
      )}

      {ready && ready.programs.length === 0 && (
        <section id="programs-catalog-state" className={styles.boundaryState}>
          <h3 className={styles.boundaryTitle}>{COPY.programs.catalogEmpty}</h3>
          <p>{COPY.programs.catalogEmptyHint}</p>
        </section>
      )}

      {ready && ready.programs.length > 0 && (
        <>
          <div className={styles.directorySearch}>
            <label
              className={styles.directorySearchLabel}
              htmlFor="programs-catalog-search"
            >
              {COPY.programs.catalogSearchLabel}
            </label>
            <div className={styles.directorySearchRow}>
              <input
                id="programs-catalog-search"
                className={styles.input}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={COPY.programs.catalogSearchPlaceholder}
                autoComplete="off"
              />
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

          <fieldset className={styles.directoryFilters}>
            <legend>{COPY.programs.catalogFilterLifecycle}</legend>
            <div className={styles.directoryFilterGroup}>
              {LIFECYCLE_FILTERS.map((value) => (
                <button
                  key={value}
                  className={styles.filterChip}
                  type="button"
                  aria-pressed={lifecycle === value}
                  onClick={() => setLifecycle(value)}
                >
                  {value === "All"
                    ? COPY.programs.filterAll
                    : LIFECYCLE_LABEL[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.directoryFilters}>
            <legend>{COPY.programs.catalogFilterParticipation}</legend>
            <div className={styles.directoryFilterGroup}>
              {PARTICIPATION_FILTERS.map((value) => (
                <button
                  key={value}
                  className={styles.filterChip}
                  type="button"
                  aria-pressed={participation === value}
                  onClick={() => setParticipation(value)}
                >
                  {value === "All"
                    ? COPY.programs.filterAll
                    : PARTICIPATION_LABEL[value]}
                </button>
              ))}
            </div>
          </fieldset>

          {filtered.length === 0 && (
            <section
              id="programs-catalog-state"
              className={styles.boundaryState}
            >
              <h3 className={styles.boundaryTitle}>
                {COPY.programs.catalogNoMatches}「{query.trim()}」
              </h3>
              <p>{COPY.programs.catalogNoMatchesHint}</p>
              <button
                className={styles.retry}
                type="button"
                onClick={() => setQuery("")}
              >
                {COPY.programs.catalogClearSearch}
              </button>
            </section>
          )}

          {filtered.length > 0 && (
            <ul
              className={styles.directoryList}
              aria-label={COPY.programs.catalogListLabel}
            >
              {filtered.map((program) => {
                const departmentName = ready.departmentName(
                  program.department_id
                );
                return (
                  <li key={program.program_id} className={styles.directoryItem}>
                    <button
                      className={styles.directoryCard}
                      type="button"
                      onClick={() => onOpenProgram(program.program_id)}
                    >
                      <span className={styles.directoryCardTitle}>
                        {program.name}
                      </span>
                      {program.description && (
                        <span className={styles.directoryCardDescription}>
                          {program.description}
                        </span>
                      )}
                      <span className={styles.directoryCardMeta}>
                        {departmentName && (
                          <span className={styles.directoryMetaItem}>
                            {departmentName}
                          </span>
                        )}
                        {program.category && (
                          <span className={styles.directoryMetaItem}>
                            {program.category}
                          </span>
                        )}
                        <span
                          className={`${styles.directoryStatus} ${styles[`directoryStatus${program.lifecycle}`]}`}
                        >
                          {LIFECYCLE_LABEL[program.lifecycle]}
                        </span>
                      </span>
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
