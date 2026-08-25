"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getAccountDirectoryDetail,
  searchAccountDirectory,
} from "@/lib/programs/program-api";
import type {
  AccountDirectoryMember,
  AccountDirectoryView,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { SettingsBackLink } from "./settings-ui";

import styles from "./account-directory-panel.module.css";

const SEARCH_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;
const COPY_ACCOUNT = COPY.accountDirectory;

type DirectoryState =
  | { kind: "idle"; data: null }
  | { kind: "loading"; data: null }
  | { kind: "ready"; data: AccountDirectoryView }
  | { kind: "error"; message: string; data: null };

type DetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; account: AccountDirectoryMember }
  | { kind: "error"; message: string };

function roleLabel(role: AccountDirectoryMember["role"]): string {
  if (role === "Admin") {
    return COPY_ACCOUNT.admin;
  }
  if (role === "Staff") {
    return COPY_ACCOUNT.staff;
  }
  return COPY_ACCOUNT.member;
}

function statusLabel(status: AccountDirectoryMember["status"]): string {
  if (status === "Active") {
    return COPY_ACCOUNT.active;
  }
  if (status === "Pending") {
    return COPY_ACCOUNT.pending;
  }
  if (status === "Suspended") {
    return COPY_ACCOUNT.suspended;
  }
  return COPY_ACCOUNT.deactivated;
}

function statusClass(status: AccountDirectoryMember["status"]): string {
  return status.toLowerCase();
}

function safeReturnHref(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  try {
    const candidate = new URL(value, "https://efcc.internal");
    if (
      candidate.pathname !== "/management" &&
      !candidate.pathname.startsWith("/management/")
    ) {
      return fallback;
    }
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

// oxlint-disable-next-line eslint/complexity -- This component owns the complete read-only directory state machine.
export const AccountDirectoryPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailRef = useRef<HTMLElement>(null);
  const detailStateRef = useRef<HTMLElement>(null);
  const errorFocusPending = useRef(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [role, setRole] = useState<AccountDirectoryMember["role"] | "">(
    (searchParams.get("role") as AccountDirectoryMember["role"] | null) ?? ""
  );
  const [status, setStatus] = useState<AccountDirectoryMember["status"] | "">(
    (searchParams.get("status") as AccountDirectoryMember["status"] | null) ??
      ""
  );
  const [department, setDepartment] = useState(
    searchParams.get("department") ?? ""
  );
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<DirectoryState>({
    kind: "idle",
    data: null,
  });
  const [detailRetryToken, setDetailRetryToken] = useState(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const hasFilters = Boolean(
      role || status || department.trim()
    );
    let current = true;
    if (normalizedQuery.length < MIN_QUERY_LENGTH && !hasFilters) {
      setState({ kind: "idle", data: null });
      return () => {
        current = false;
      };
    }

    setState({ kind: "loading", data: null });
    announce(COPY_ACCOUNT.loading);
    void (async () => {
      try {
        const data = await searchAccountDirectory(normalizedQuery, {
          department: department || undefined,
          limit: SEARCH_LIMIT,
          role: role || undefined,
          status: status || undefined,
        });
        if (!current) {
          return;
        }
        setState({ kind: "ready", data });
        if (data.accounts.length === 0) {
          announce(COPY_ACCOUNT.noResults);
        }
      } catch (error: unknown) {
        if (!current) {
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
        const message =
          error instanceof RpcError && error.problem.code === "FORBIDDEN"
            ? COPY_ACCOUNT.forbidden
            : COPY_ACCOUNT.loadError;
        setState({ kind: "error", message, data: null });
        announce(message);
      }
    })();

    return () => {
      current = false;
    };
  }, [department, query, retryToken, role, router, status]);

  useEffect(() => {
    if (state.kind !== "error" || !errorFocusPending.current) {
      return;
    }
    document.querySelector<HTMLElement>("#account-directory-state")?.focus();
    errorFocusPending.current = false;
  }, [state.kind]);

  const selectedId = searchParams.get("account");
  const [detailState, setDetailState] = useState<DetailState>({ kind: "idle" });

  useEffect(() => {
    let current = true;
    if (!selectedId) {
      setDetailState({ kind: "idle" });
      return () => {
        current = false;
      };
    }
    setDetailState({ kind: "loading" });
    void (async () => {
      try {
        const account = await getAccountDirectoryDetail(selectedId);
        if (current) {
          setDetailState({ kind: "ready", account });
        }
      } catch (error: unknown) {
        if (!current) {
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
        setDetailState({
          kind: "error",
          message: forbidden ? COPY_ACCOUNT.forbidden : "找不到此帳戶。",
        });
      }
    })();
    return () => {
      current = false;
    };
  }, [detailRetryToken, router, selectedId]);

  const selected = detailState.kind === "ready" ? detailState.account : null;

  useEffect(() => {
    if (selected) {
      detailRef.current?.focus();
    }
  }, [selected]);

  useEffect(() => {
    if (
      !selectedId ||
      (detailState.kind !== "loading" && detailState.kind !== "error")
    ) {
      return;
    }
    detailStateRef.current?.focus();
  }, [detailState.kind, selectedId]);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      router.replace("/management?module=accounts");
    }
  };

  const updateFilter = (
    nextRole: AccountDirectoryMember["role"] | "",
    nextStatus: AccountDirectoryMember["status"] | ""
  ) => {
    setRole(nextRole);
    setStatus(nextStatus);
  };

  const updateDepartment = (value: string) => {
    setDepartment(value);
  };

  const returnParams = new URLSearchParams({ module: "accounts" });
  if (query.trim()) {
    returnParams.set("q", query.trim());
  }
  if (role) {
    returnParams.set("role", role);
  }
  if (status) {
    returnParams.set("status", status);
  }
  if (department.trim()) {
    returnParams.set("department", department.trim());
  }
  const returnHref = safeReturnHref(
    searchParams.get("return"),
    `/management?${returnParams}`
  );

  const handleSelect = (account: AccountDirectoryMember) => {
    const params = new URLSearchParams({
      module: "accounts",
      q: query.trim(),
    });
    if (role) {
      params.set("role", role);
    }
    if (status) {
      params.set("status", status);
    }
    if (department.trim()) {
      params.set("department", department.trim());
    }
    params.set("account", account.userId);
    params.set("return", returnHref);
    router.push(`/management?${params.toString()}`);
    announce(account.name);
  };

  const isLoading = state.kind === "loading";
  const isReady = state.kind === "ready";
  const showEmpty =
    isReady &&
    query.trim().length >= MIN_QUERY_LENGTH &&
    state.data.accounts.length === 0;
  const hasResults = isReady && state.data.accounts.length > 0;
  const showWorkspace = Boolean(selectedId) || hasResults;
  const detailSelected = Boolean(selectedId);
  const detailOnly = detailSelected && !hasResults;

  return (
    <section
      aria-busy={isLoading}
      aria-labelledby="account-directory-title"
      className={styles.page}
    >
      <header className={styles.header}>
        <SettingsBackLink href={returnHref} label={COPY_ACCOUNT.back} />
        <h1 className={styles.title} id="account-directory-title" tabIndex={-1}>
          {COPY_ACCOUNT.title}
        </h1>
        <p className={styles.lead}>{COPY_ACCOUNT.lead}</p>
      </header>

      <div className={styles.controls}>
        <label className={styles.field} htmlFor="account-directory-search">
          <span className={styles.fieldLabel}>{COPY_ACCOUNT.searchLabel}</span>
          <input
            aria-describedby="account-directory-title"
            autoComplete="off"
            className={styles.input}
            id="account-directory-search"
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={COPY_ACCOUNT.searchPlaceholder}
            type="search"
            value={query}
          />
        </label>
        <label className={styles.field} htmlFor="account-directory-role">
          <span className={styles.fieldLabel}>{COPY_ACCOUNT.roleLabel}</span>
          <select
            className={styles.select}
            id="account-directory-role"
            onChange={(event) =>
              updateFilter(
                event.target.value as AccountDirectoryMember["role"] | "",
                status
              )
            }
            value={role}
          >
            <option value="">{COPY_ACCOUNT.allRoles}</option>
            <option value="Admin">{COPY_ACCOUNT.admin}</option>
            <option value="Staff">{COPY_ACCOUNT.staff}</option>
            <option value="Member">{COPY_ACCOUNT.member}</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="account-directory-status">
          <span className={styles.fieldLabel}>{COPY_ACCOUNT.statusLabel}</span>
          <select
            className={styles.select}
            id="account-directory-status"
            onChange={(event) =>
              updateFilter(
                role,
                event.target.value as AccountDirectoryMember["status"] | ""
              )
            }
            value={status}
          >
            <option value="">{COPY_ACCOUNT.allStatuses}</option>
            <option value="Active">{COPY_ACCOUNT.active}</option>
            <option value="Pending">{COPY_ACCOUNT.pending}</option>
            <option value="Suspended">{COPY_ACCOUNT.suspended}</option>
            <option value="Deactivated">{COPY_ACCOUNT.deactivated}</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="account-directory-department">
          <span className={styles.fieldLabel}>
            {COPY_ACCOUNT.departmentLabel}
          </span>
          <input
            className={styles.input}
            id="account-directory-department"
            onChange={(event) => updateDepartment(event.target.value)}
            placeholder={COPY_ACCOUNT.departmentPlaceholder}
            type="search"
            value={department}
          />
        </label>
      </div>

      {isLoading && (
        <output
          aria-busy="true"
          aria-live="polite"
          className={styles.state}
          id="account-directory-state"
          tabIndex={-1}
        >
          {COPY_ACCOUNT.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          aria-live="assertive"
          className={styles.error}
          id="account-directory-state"
          role="alert"
          tabIndex={-1}
        >
          <h2>{state.message}</h2>
          <button
            className={styles.retry}
            onClick={() => {
              errorFocusPending.current = true;
              setRetryToken((token) => token + 1);
            }}
            type="button"
          >
            {COPY_ACCOUNT.retry}
          </button>
        </section>
      )}

      {showEmpty && (
        <output aria-live="polite" className={styles.empty}>
          <strong>{COPY_ACCOUNT.noResults}</strong>
          <span>{COPY_ACCOUNT.emptyHint}</span>
        </output>
      )}

      {showWorkspace && (
        <div
          className={`${styles.workspace} ${detailSelected ? styles.detailSelected : ""} ${detailOnly ? styles.detailOnly : ""}`}
        >
          {hasResults && (
            <section
              aria-labelledby="account-directory-results-title"
              className={styles.resultsColumn}
            >
              <div className={styles.metrics}>
                <div>
                  <strong>{state.data.summary.total}</strong>
                  <span>{COPY_ACCOUNT.total}</span>
                </div>
                <div>
                  <strong>{state.data.summary.active}</strong>
                  <span>{COPY_ACCOUNT.activeCount}</span>
                </div>
                <div>
                  <strong>{state.data.summary.elevated}</strong>
                  <span>{COPY_ACCOUNT.elevated}</span>
                </div>
                <div>
                  <strong>{state.data.summary.pending}</strong>
                  <span>{COPY_ACCOUNT.pendingCount}</span>
                </div>
              </div>
              <h2
                className={styles.resultsTitle}
                id="account-directory-results-title"
              >
                {COPY_ACCOUNT.resultsTitle}
              </h2>
              <ul className={styles.results}>
                {state.data.accounts.map((account) => (
                  <li key={account.userId}>
                    <button
                      aria-pressed={selected?.userId === account.userId}
                      className={styles.resultButton}
                      onClick={() => handleSelect(account)}
                      type="button"
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {account.name.slice(0, 1)}
                      </span>
                      <span className={styles.resultCopy}>
                        <strong>{account.name}</strong>
                        <small>
                          {account.username ?? COPY_ACCOUNT.unavailable} ·{" "}
                          {roleLabel(account.role)}
                        </small>
                      </span>
                      <span
                        className={`${styles.status} ${styles[statusClass(account.status)]}`}
                      >
                        {statusLabel(account.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detailState.kind === "loading" ? (
            <output
              ref={(node) => {
                detailStateRef.current = node;
              }}
              aria-busy="true"
              className={styles.detailState}
              id="account-directory-detail-state"
              aria-live="polite"
              tabIndex={-1}
            >
              {COPY_ACCOUNT.loading}
            </output>
          ) : detailState.kind === "error" ? (
            <section
              ref={(node) => {
                detailStateRef.current = node;
              }}
              aria-live="assertive"
              className={styles.detailError}
              id="account-directory-detail-state"
              role="alert"
              tabIndex={-1}
            >
              <strong>{detailState.message}</strong>
              <p>請返回名錄，再重新搜尋此帳戶。</p>
              <button
                className={styles.retry}
                onClick={() => setDetailRetryToken((token) => token + 1)}
                type="button"
              >
                {COPY_ACCOUNT.retry}
              </button>
            </section>
          ) : selected ? (
            <article
              aria-labelledby="account-directory-detail-title"
              className={styles.detail}
              ref={detailRef}
              tabIndex={-1}
            >
              <span className={styles.eyebrow}>{COPY_ACCOUNT.detail}</span>
              <div className={styles.detailHeading}>
                <span className={styles.avatarLarge} aria-hidden="true">
                  {selected.name.slice(0, 1)}
                </span>
                <div>
                  <h2 id="account-directory-detail-title">{selected.name}</h2>
                  <p>{selected.username ?? COPY_ACCOUNT.unavailable}</p>
                </div>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>{COPY_ACCOUNT.role}</dt>
                  <dd>{roleLabel(selected.role)}</dd>
                </div>
                <div>
                  <dt>{COPY_ACCOUNT.status}</dt>
                  <dd>{statusLabel(selected.status)}</dd>
                </div>
                <div>
                  <dt>{COPY_ACCOUNT.contact}</dt>
                  <dd>{selected.phone ?? COPY_ACCOUNT.unavailable}</dd>
                </div>
                <div>
                  <dt>{COPY_ACCOUNT.departments}</dt>
                  <dd>
                    {selected.departments.length > 0
                      ? selected.departments
                          .map((departmentRow) => departmentRow.name)
                          .join("、")
                      : COPY_ACCOUNT.noDepartments}
                  </dd>
                </div>
              </dl>
              <div className={styles.readOnlyNote}>
                <strong>唯讀資料</strong>
                <p>{COPY_ACCOUNT.detailReadOnly}</p>
              </div>
            </article>
          ) : (
            <aside className={styles.detailPlaceholder} aria-live="polite">
              選擇一個帳戶以查看詳細資料。
            </aside>
          )}
        </div>
      )}
    </section>
  );
};
