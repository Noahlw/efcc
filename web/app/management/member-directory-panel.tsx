"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { searchManagementMembers } from "@/lib/programs/program-api";
import type { MemberDirectoryMember } from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { SettingsBackLink } from "./settings-ui";

import styles from "./member-directory-panel.module.css";

type DirectoryState =
  | { kind: "idle"; members: MemberDirectoryMember[] }
  | { kind: "loading"; members: MemberDirectoryMember[] }
  | { kind: "ready"; members: MemberDirectoryMember[] }
  | { kind: "error"; message: string };

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 20;

export const MemberDirectoryPanel = () => {
  const router = useRouter();
  const detailRef = useRef<HTMLElement>(null);
  const errorFocusPending = useRef(false);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [selected, setSelected] = useState<MemberDirectoryMember | null>(null);
  const [state, setState] = useState<DirectoryState>({
    kind: "idle",
    members: [],
  });

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentRequest = (requestId.current += 1);
    let current = true;

    setSelected(null);
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      setState({ kind: "idle", members: [] });
      return () => {
        current = false;
      };
    }

    setState({ kind: "loading", members: [] });
    announce(COPY.managementMembers.loading);

    void (async () => {
      try {
        const { members } = await searchManagementMembers(normalizedQuery, {
          limit: SEARCH_LIMIT,
        });
        if (!current || requestId.current !== currentRequest) {
          return;
        }
        setState({ kind: "ready", members });
        if (members.length === 0) {
          announce(COPY.managementMembers.noResults);
        }
      } catch (error: unknown) {
        if (!current || requestId.current !== currentRequest) {
          return;
        }

        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }

        const forbidden =
          error instanceof RpcError && error.problem.code === "FORBIDDEN";
        const message = forbidden
          ? COPY.managementMembers.forbidden
          : COPY.managementMembers.loadError;
        setState({ kind: "error", message });
        announce(message);
      }
    })();

    return () => {
      current = false;
    };
  }, [query, retryToken, router]);

  useEffect(() => {
    if (state.kind !== "error" || !errorFocusPending.current) {
      return;
    }
    const panel = document.querySelector<HTMLElement>(
      "#member-directory-state"
    );
    panel?.focus();
    errorFocusPending.current = false;
  }, [state.kind]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    detailRef.current?.focus();
  }, [selected]);

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleSelect = (member: MemberDirectoryMember) => {
    setSelected(member);
    announce(member.name);
  };

  const handleRetry = () => {
    errorFocusPending.current = true;
    setRetryToken((token) => token + 1);
  };

  const isLoading = state.kind === "loading";
  const isReady = state.kind === "ready";
  const showEmpty =
    isReady &&
    query.trim().length >= MIN_QUERY_LENGTH &&
    state.members.length === 0;

  return (
    <section
      className={styles.page}
      aria-labelledby="member-directory-title"
      aria-busy={isLoading}
    >
      <header className={styles.header}>
        <SettingsBackLink
          href="/management"
          label={COPY.managementMembers.backToManagement}
        />
        <h1 id="member-directory-title" className={styles.title}>
          {COPY.managementMembers.membersTitle}
        </h1>
        <p id="member-directory-lead" className={styles.lead}>
          {COPY.managementMembers.membersLead}
        </p>
      </header>

      <div className={styles.searchSection}>
        <label className={styles.field} htmlFor="member-directory-search">
          <span className={styles.fieldLabel}>
            {COPY.managementMembers.searchLabel}
          </span>
          <input
            id="member-directory-search"
            className={styles.input}
            type="search"
            value={query}
            placeholder={COPY.managementMembers.searchPlaceholder}
            autoComplete="off"
            aria-describedby="member-directory-lead"
            onChange={handleQueryChange}
          />
        </label>
      </div>

      {isLoading && (
        <output
          id="member-directory-state"
          className={styles.state}
          tabIndex={-1}
          aria-busy="true"
          aria-live="polite"
        >
          {COPY.managementMembers.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          id="member-directory-state"
          className={styles.error}
          tabIndex={-1}
          role="alert"
        >
          <h2 className={styles.stateTitle}>{state.message}</h2>
          <button className={styles.retry} type="button" onClick={handleRetry}>
            {COPY.managementMembers.retry}
          </button>
        </section>
      )}

      {showEmpty && (
        <output className={styles.empty} aria-live="polite">
          <span className={styles.stateTitle}>
            {COPY.managementMembers.noResults}
          </span>
          <span className={styles.stateMessage}>
            {COPY.managementMembers.emptyHint}
          </span>
        </output>
      )}

      {isReady && state.members.length > 0 && (
        <section
          className={styles.resultsSection}
          aria-labelledby="member-directory-results-title"
        >
          <h2
            id="member-directory-results-title"
            className={styles.visuallyHidden}
          >
            {COPY.managementMembers.membersTitle}
          </h2>
          <ul
            className={styles.results}
            aria-label={COPY.managementMembers.membersTitle}
          >
            {state.members.map((member) => (
              <li key={member.userId} className={styles.resultItem}>
                <button
                  className={styles.resultButton}
                  type="button"
                  aria-label={member.name}
                  aria-pressed={selected?.userId === member.userId}
                  onClick={() => handleSelect(member)}
                >
                  <span className={styles.resultCopy}>
                    <span className={styles.resultName}>{member.name}</span>
                    <span className={styles.resultMeta}>
                      {member.role} ·{" "}
                      {member.departments.length > 0
                        ? member.departments
                            .map((department) => department.name)
                            .join("、")
                        : COPY.managementMembers.noDepartments}
                    </span>
                  </span>
                  <svg
                    className={styles.chevron}
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    focusable="false"
                  >
                    <path d="m8 5 7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <article
          ref={detailRef}
          className={styles.detail}
          tabIndex={-1}
          aria-labelledby="member-directory-detail-title"
        >
          <h2 id="member-directory-detail-title" className={styles.detailTitle}>
            {COPY.managementMembers.memberDetail}
          </h2>
          <p className={styles.detailName}>{selected.name}</p>
          <dl className={styles.detailList}>
            <div className={styles.detailRow}>
              <dt>{COPY.managementMembers.memberContact}</dt>
              <dd>
                <span className={styles.detailLabel}>
                  {COPY.managementMembers.detailPhone}
                </span>
                {selected.phone ?? COPY.managementMembers.detailUnavailable}
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.managementMembers.memberRole}</dt>
              <dd>{selected.role}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.managementMembers.detailStatus}</dt>
              <dd>{selected.status}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>{COPY.managementMembers.memberDepartments}</dt>
              <dd>
                {selected.departments.length > 0 ? (
                  <ul className={styles.departmentList}>
                    {selected.departments.map((department) => (
                      <li key={department.id}>{department.name}</li>
                    ))}
                  </ul>
                ) : (
                  COPY.managementMembers.noDepartments
                )}
              </dd>
            </div>
          </dl>
        </article>
      )}
    </section>
  );
};
