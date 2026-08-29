"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RpcError } from "@/lib/api";
import { ContextualTaskHeader } from "@/lib/contextual-task-header";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getAccountDirectoryDetail,
  searchAccountDirectory,
} from "@/lib/programs/program-api";
import type {
  AccountDirectoryMember,
  AccountDirectoryView,
} from "@/lib/programs/program-api";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";

import { DirectoryFrame } from "./directory-frame";
import type { DirectoryFrameState } from "./directory-frame";
import {
  ManagementFilterSheet,
  safeManagementReturnHref,
} from "./management-action-framework";

const SEARCH_LIMIT = 50;
const COPY_ACCOUNT = COPY.accountDirectory;
const ALL_FILTER_VALUE = "__all";
const ACCOUNT_INPUT_CLASS =
  "h-12 min-h-12 w-full min-w-0 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30";
const ACCOUNT_SELECT_CLASS =
  "h-12 min-h-12 w-full min-w-0 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)] outline-none focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30";
const ACCOUNT_FIELD_CLASS = "grid min-w-0 gap-2";
const ACCOUNT_FIELD_LABEL_CLASS = "text-[0.82rem] font-bold text-[var(--ink)]";
const ACCOUNT_STATE_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-4)] text-[var(--ink-muted)]";
const ACCOUNT_ERROR_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-[var(--space-4)] text-[var(--ink)]";
const ACCOUNT_EMPTY_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] p-[var(--space-4)] text-[var(--ink-muted)]";
const ACCOUNT_DETAIL_CLASS =
  "min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-4)] text-[var(--ink)]";

interface AccountUrlState {
  query: string;
  role: AccountDirectoryMember["role"] | "";
  status: AccountDirectoryMember["status"] | "";
  department: string;
}

type DirectoryState =
  | { kind: "loading"; data: null }
  | { kind: "ready"; data: AccountDirectoryView }
  | {
      kind: "error";
      failure: "forbidden" | "error";
      message: string;
      data: null;
    };

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
  if (status === "Active") {
    return "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]";
  }
  if (status === "Pending") {
    return "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)]";
  }
  return "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]";
}

function initials(name: string): string {
  return [...name.replaceAll(/\s+/gu, "")].slice(-2).join("");
}

function parseRole(value: string | null): AccountDirectoryMember["role"] | "" {
  return value === "Admin" || value === "Staff" || value === "Member"
    ? value
    : "";
}

function parseStatus(
  value: string | null
): AccountDirectoryMember["status"] | "" {
  return value === "Pending" ||
    value === "Active" ||
    value === "Suspended" ||
    value === "Deactivated"
    ? value
    : "";
}

function buildAccountsHref({
  department,
  query,
  role,
  status,
}: AccountUrlState): string {
  const params = new URLSearchParams({ module: "accounts" });
  if (query.trim()) {
    params.set("q", query.trim());
  }
  if (role) {
    params.set("role", role);
  }
  if (status) {
    params.set("status", status);
  }
  if (department.trim()) {
    params.set("department", department.trim());
  }
  return `/management?${params.toString()}`;
}

function accountErrorMessage(error: unknown): string {
  if (!(error instanceof RpcError)) {
    return COPY_ACCOUNT.loadError;
  }
  const { code, detail, status } = error.problem;
  if (code === "FORBIDDEN") {
    return COPY_ACCOUNT.forbidden;
  }
  if (status === 404 || code === "NOT_FOUND") {
    return errorCopyFor("NOT_FOUND", detail);
  }
  if (
    code === "INTERNAL" ||
    code === "INTERNAL_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "UNAVAILABLE" ||
    code === "MALFORMED_RESPONSE" ||
    code === "MALFORMED_REQUEST"
  ) {
    return COPY_ACCOUNT.loadError;
  }
  return errorCopyFor(code, detail);
}

function AccountRoleSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AccountDirectoryMember["role"] | "";
  onChange: (value: AccountDirectoryMember["role"] | "") => void;
}) {
  return (
    <Select
      onValueChange={(next) =>
        onChange(
          next === ALL_FILTER_VALUE
            ? ""
            : (next as AccountDirectoryMember["role"])
        )
      }
      value={value || ALL_FILTER_VALUE}
    >
      <SelectTrigger
        aria-describedby="account-directory-lead"
        aria-label={COPY_ACCOUNT.roleLabel}
        className={ACCOUNT_SELECT_CLASS}
        id={id}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_FILTER_VALUE}>
          {COPY_ACCOUNT.allRoles}
        </SelectItem>
        <SelectItem value="Admin">{COPY_ACCOUNT.admin}</SelectItem>
        <SelectItem value="Staff">{COPY_ACCOUNT.staff}</SelectItem>
        <SelectItem value="Member">{COPY_ACCOUNT.member}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AccountStatusSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AccountDirectoryMember["status"] | "";
  onChange: (value: AccountDirectoryMember["status"] | "") => void;
}) {
  return (
    <Select
      onValueChange={(next) =>
        onChange(
          next === ALL_FILTER_VALUE
            ? ""
            : (next as AccountDirectoryMember["status"])
        )
      }
      value={value || ALL_FILTER_VALUE}
    >
      <SelectTrigger
        aria-describedby="account-directory-lead"
        aria-label={COPY_ACCOUNT.statusLabel}
        className={ACCOUNT_SELECT_CLASS}
        id={id}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_FILTER_VALUE}>
          {COPY_ACCOUNT.allStatuses}
        </SelectItem>
        <SelectItem value="Active">{COPY_ACCOUNT.active}</SelectItem>
        <SelectItem value="Pending">{COPY_ACCOUNT.pending}</SelectItem>
        <SelectItem value="Suspended">{COPY_ACCOUNT.suspended}</SelectItem>
        <SelectItem value="Deactivated">{COPY_ACCOUNT.deactivated}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function isAuthRequired(error: unknown): error is RpcError {
  return error instanceof RpcError && error.problem.code === "AUTH_REQUIRED";
}

function AccountLoadingState({
  stateRef,
}: {
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <output
      ref={(node) => {
        stateRef.current = node;
      }}
      aria-busy="true"
      aria-live="polite"
      className={ACCOUNT_STATE_CLASS}
      tabIndex={-1}
    >
      {COPY_ACCOUNT.loading}
    </output>
  );
}

function AccountErrorState({
  message,
  onRetry,
  stateRef,
}: {
  message: string;
  onRetry: () => void;
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={(node) => {
        stateRef.current = node;
      }}
      aria-live="assertive"
      className={ACCOUNT_ERROR_CLASS}
      role="alert"
      tabIndex={-1}
    >
      <h2 className="m-0 text-base font-extrabold">{message}</h2>
      <Button
        className="min-h-11 w-fit bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
        onClick={onRetry}
        type="button"
      >
        {COPY_ACCOUNT.retry}
      </Button>
    </section>
  );
}

function AccountEmptyState({
  stateRef,
}: {
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <output
      ref={(node) => {
        stateRef.current = node;
      }}
      aria-live="polite"
      className={ACCOUNT_EMPTY_CLASS}
      tabIndex={-1}
    >
      <strong className="m-0 text-base text-[var(--ink)]">
        {COPY_ACCOUNT.noResults}
      </strong>
      <span>{COPY_ACCOUNT.emptyHint}</span>
    </output>
  );
}

// oxlint-disable-next-line eslint/complexity -- the adapter retains Account-only query, filter, URL, and detail behavior.
export const AccountDirectoryPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stateRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [role, setRole] = useState<AccountDirectoryMember["role"] | "">(
    parseRole(searchParams.get("role"))
  );
  const [status, setStatus] = useState<AccountDirectoryMember["status"] | "">(
    parseStatus(searchParams.get("status"))
  );
  const [department, setDepartment] = useState(
    searchParams.get("department") ?? ""
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [listRetryKey, setListRetryKey] = useState(0);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("account")
  );
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [appendedView, setAppendedView] = useState<AccountDirectoryView | null>(
    null
  );
  const [detailState, setDetailState] = useState<DetailState>({
    kind: "idle",
  });
  const loadMoreRequestId = useRef(0);

  const listResource = useAsyncResource<AccountDirectoryView, DirectoryState>(
    () =>
      searchAccountDirectory(query.trim(), {
        department: department.trim() || undefined,
        limit: SEARCH_LIMIT,
        role: role || undefined,
        status: status || undefined,
      }),
    {
      toLoading: () => ({ kind: "loading", data: null }),
      toReady: (data) => ({ kind: "ready", data }),
      onError: (error) => ({
        kind: "error",
        failure:
          error instanceof RpcError && error.problem.code === "FORBIDDEN"
            ? "forbidden"
            : "error",
        data: null,
        message: accountErrorMessage(error),
      }),
      announceLoading: COPY_ACCOUNT.loading,
      announceReady: (data) =>
        data.accounts.length === 0 ? COPY_ACCOUNT.noResults : undefined,
      isAuthRequired,
      onAuthRequired: () => {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
      },
    },
    [department, query, role, router, status]
  );

  const { state } = listResource;
  const resourceView = state.kind === "ready" ? state.data : null;
  const accountView = appendedView ?? resourceView;
  const accounts = accountView?.accounts ?? [];
  const hasResults = accounts.length > 0;
  const selected = detailState.kind === "ready" ? detailState.account : null;

  useEffect(() => {
    void listResource.run();
  }, [listResource.run]);

  useEffect(() => {
    if (state.kind === "ready") {
      setAppendedView(state.data);
    } else if (state.kind === "loading") {
      setAppendedView(null);
    }
  }, [state]);

  useEffect(() => {
    const syncSelection = () => {
      setSelectedId(new URLSearchParams(window.location.search).get("account"));
    };
    setSelectedId(searchParams.get("account"));
    window.addEventListener("popstate", syncSelection);
    return () => window.removeEventListener("popstate", syncSelection);
  }, [searchParams]);

  useEffect(() => {
    loadMoreRequestId.current += 1;
    setLoadMoreError(null);
  }, [department, query, role, status]);

  useEffect(() => {
    if (!selectedId) {
      setDetailState({ kind: "idle" });
      return;
    }
    let current = true;
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
        if (isAuthRequired(error)) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        setDetailState({
          kind: "error",
          message: accountErrorMessage(error),
        });
      }
    })();
    return () => {
      current = false;
    };
  }, [detailRetryKey, router, selectedId]);

  const updateUrl = (next: AccountUrlState) => {
    window.history.replaceState(null, "", buildAccountsHref(next));
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    updateUrl({ department, query: value, role, status });
  };

  const updateFilter = (
    nextRole: AccountDirectoryMember["role"] | "",
    nextStatus: AccountDirectoryMember["status"] | ""
  ) => {
    setRole(nextRole);
    setStatus(nextStatus);
    setSelectedId(null);
    updateUrl({ department, query, role: nextRole, status: nextStatus });
  };

  const updateDepartment = (value: string) => {
    setDepartment(value);
    setSelectedId(null);
    updateUrl({ department: value, query, role, status });
  };

  const clearFilters = () => {
    setRole("");
    setStatus("");
    setDepartment("");
    setSelectedId(null);
    updateUrl({ department: "", query, role: "", status: "" });
  };

  const returnHref = safeManagementReturnHref(
    searchParams.get("return"),
    buildAccountsHref({ department, query, role, status })
  );

  const handleSelect = (account: AccountDirectoryMember) => {
    const params = new URLSearchParams(
      buildAccountsHref({ department, query, role, status }).split("?")[1]
    );
    params.set("account", account.userId);
    params.set("return", returnHref);
    setSelectedId(account.userId);
    window.history.pushState(null, "", `/management?${params.toString()}`);
    announce(account.name);
  };

  const loadMore = async () => {
    if (!accountView?.nextCursor || isLoadingMore) {
      return;
    }
    const requestId = loadMoreRequestId.current;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = await searchAccountDirectory(query.trim(), {
        cursor: accountView.nextCursor,
        department: department.trim() || undefined,
        limit: SEARCH_LIMIT,
        role: role || undefined,
        status: status || undefined,
      });
      if (requestId !== loadMoreRequestId.current) {
        return;
      }
      const accountsById = new Map(
        accountView.accounts.map((account) => [account.userId, account])
      );
      for (const account of next.accounts) {
        accountsById.set(account.userId, account);
      }
      setAppendedView({
        accounts: [...accountsById.values()],
        nextCursor: next.nextCursor,
        summary: next.summary,
      });
    } catch (error: unknown) {
      if (requestId !== loadMoreRequestId.current) {
        return;
      }
      if (isAuthRequired(error)) {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
        return;
      }
      const message = accountErrorMessage(error);
      setLoadMoreError(message);
      announce(message);
    } finally {
      if (requestId === loadMoreRequestId.current) {
        setIsLoadingMore(false);
      }
    }
  };

  const listRetry = () => {
    setListRetryKey((key) => key + 1);
    listResource.retry();
  };

  const activeFilterCount = [role, status, department.trim()].filter(
    Boolean
  ).length;
  const frameState: DirectoryFrameState =
    state.kind === "error"
      ? state.failure === "forbidden"
        ? "forbidden"
        : "error"
      : state.kind === "ready" && !hasResults
        ? "empty"
        : state.kind;
  const detailKey = selectedId
    ? detailState.kind === "ready"
      ? detailState.account.userId
      : detailState.kind
    : null;

  return (
    <DirectoryFrame
      ariaLabelledBy="account-directory-title"
      detail={
        selectedId ? (
          detailState.kind === "loading" || detailState.kind === "idle" ? (
            <output
              ref={(node) => {
                detailRef.current = node;
              }}
              aria-busy="true"
              aria-live="polite"
              className="grid min-h-[180px] min-w-0 place-items-center content-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-center text-[var(--ink-muted)]"
              tabIndex={-1}
            >
              {COPY_ACCOUNT.loading}
            </output>
          ) : detailState.kind === "error" ? (
            <section
              ref={(node) => {
                detailRef.current = node;
              }}
              aria-live="assertive"
              className="grid min-h-[180px] min-w-0 place-items-center content-center gap-3 rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-center"
              role="alert"
              tabIndex={-1}
            >
              <strong className="wrap-anywhere">{detailState.message}</strong>
              <p className="m-0 wrap-anywhere text-[var(--ink-muted)]">
                請返回名錄，再重新搜尋此帳戶。
              </p>
              <Button
                className="min-h-11 w-fit bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
                onClick={() => setDetailRetryKey((key) => key + 1)}
                type="button"
              >
                {COPY_ACCOUNT.retry}
              </Button>
            </section>
          ) : selected ? (
            <article
              ref={(node) => {
                detailRef.current = node;
              }}
              aria-labelledby="account-directory-detail-title"
              className={ACCOUNT_DETAIL_CLASS}
              tabIndex={-1}
            >
              <span className="text-[0.72rem] font-extrabold tracking-[0.08em] text-[var(--accent)]">
                {COPY_ACCOUNT.detail}
              </span>
              <div className="mt-2 flex min-w-0 items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] font-extrabold text-[1.15rem] text-[var(--accent)]">
                  {selected.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h2
                    className="m-0 wrap-anywhere text-[1.35rem] font-extrabold"
                    id="account-directory-detail-title"
                  >
                    {selected.name}
                  </h2>
                  <p className="m-0 mt-1 wrap-anywhere text-[var(--ink-muted)]">
                    {selected.username ?? COPY_ACCOUNT.unavailable}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-2 border-t border-l border-[var(--line)] max-[479px]:grid-cols-1">
                <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
                  <dt className="text-xs font-bold text-[var(--ink-muted)]">
                    {COPY_ACCOUNT.role}
                  </dt>
                  <dd className="m-0 mt-1 wrap-anywhere font-bold">
                    {roleLabel(selected.role)}
                  </dd>
                </div>
                <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
                  <dt className="text-xs font-bold text-[var(--ink-muted)]">
                    {COPY_ACCOUNT.status}
                  </dt>
                  <dd className="m-0 mt-1 wrap-anywhere font-bold">
                    {statusLabel(selected.status)}
                  </dd>
                </div>
                <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
                  <dt className="text-xs font-bold text-[var(--ink-muted)]">
                    {COPY_ACCOUNT.contact}
                  </dt>
                  <dd className="m-0 mt-1 wrap-anywhere font-bold">
                    {selected.phone ?? COPY_ACCOUNT.unavailable}
                  </dd>
                </div>
                <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
                  <dt className="text-xs font-bold text-[var(--ink-muted)]">
                    {COPY_ACCOUNT.departments}
                  </dt>
                  <dd className="m-0 mt-1 wrap-anywhere font-bold">
                    {selected.departments.length > 0
                      ? selected.departments
                          .map((departmentRow) => departmentRow.name)
                          .join("、")
                      : COPY_ACCOUNT.noDepartments}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 min-w-0 rounded-[8px] border border-[color-mix(in_srgb,var(--focus)_35%,var(--line))] bg-[color-mix(in_srgb,var(--focus)_6%,white)] p-3">
                <strong>唯讀資料</strong>
                <p className="m-0 mt-1 wrap-anywhere leading-6 text-[var(--ink-muted)]">
                  {COPY_ACCOUNT.detailReadOnly}
                </p>
              </div>
              <Button
                className="mt-4 min-h-11 w-full bg-[var(--accent)] font-extrabold text-white hover:bg-[var(--accent-deep)]"
                onClick={() =>
                  router.push(
                    `/management?module=accounts&account=${encodeURIComponent(selected.userId)}&view=access&return=${encodeURIComponent(returnHref)}`
                  )
                }
                type="button"
              >
                查看帳戶權限與身份組
              </Button>
            </article>
          ) : null
        ) : null
      }
      desktopFilters={
        <>
          <label
            className={ACCOUNT_FIELD_CLASS}
            htmlFor="account-directory-role"
          >
            <span className={ACCOUNT_FIELD_LABEL_CLASS}>
              {COPY_ACCOUNT.roleLabel}
            </span>
            <AccountRoleSelect
              id="account-directory-role"
              onChange={(nextRole) => updateFilter(nextRole, status)}
              value={role}
            />
          </label>
          <label
            className={ACCOUNT_FIELD_CLASS}
            htmlFor="account-directory-status"
          >
            <span className={ACCOUNT_FIELD_LABEL_CLASS}>
              {COPY_ACCOUNT.statusLabel}
            </span>
            <AccountStatusSelect
              id="account-directory-status"
              onChange={(nextStatus) => updateFilter(role, nextStatus)}
              value={status}
            />
          </label>
          <label
            className={ACCOUNT_FIELD_CLASS}
            htmlFor="account-directory-department"
          >
            <span className={ACCOUNT_FIELD_LABEL_CLASS}>
              {COPY_ACCOUNT.departmentLabel}
            </span>
            <Input
              aria-describedby="account-directory-lead"
              className={ACCOUNT_INPUT_CLASS}
              id="account-directory-department"
              onChange={(event) => updateDepartment(event.target.value)}
              placeholder={COPY_ACCOUNT.departmentPlaceholder}
              type="search"
              value={department}
            />
          </label>
        </>
      }
      empty={<AccountEmptyState stateRef={stateRef} />}
      error={
        state.kind === "error" && state.failure === "error" ? (
          <AccountErrorState
            message={state.message}
            onRetry={listRetry}
            stateRef={stateRef}
          />
        ) : null
      }
      filter={
        <Button
          aria-label={
            activeFilterCount > 0 ? `篩選 ${activeFilterCount}` : "篩選"
          }
          className="min-h-12 border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 font-extrabold text-[var(--ink)] hover:bg-[var(--surface)]"
          onClick={() => setFilterOpen(true)}
          type="button"
          variant="outline"
        >
          篩選{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
        </Button>
      }
      filterSheet={
        filterOpen ? (
          <ManagementFilterSheet
            label="篩選帳戶"
            onClose={() => setFilterOpen(false)}
          >
            <h2 className="m-0 pr-12 text-lg font-extrabold">篩選帳戶</h2>
            <div className="mt-4 grid gap-3">
              <label
                className={ACCOUNT_FIELD_CLASS}
                htmlFor="account-sheet-role"
              >
                <span className={ACCOUNT_FIELD_LABEL_CLASS}>
                  {COPY_ACCOUNT.roleLabel}
                </span>
                <AccountRoleSelect
                  id="account-sheet-role"
                  onChange={(nextRole) => updateFilter(nextRole, status)}
                  value={role}
                />
              </label>
              <label
                className={ACCOUNT_FIELD_CLASS}
                htmlFor="account-sheet-status"
              >
                <span className={ACCOUNT_FIELD_LABEL_CLASS}>
                  {COPY_ACCOUNT.statusLabel}
                </span>
                <AccountStatusSelect
                  id="account-sheet-status"
                  onChange={(nextStatus) => updateFilter(role, nextStatus)}
                  value={status}
                />
              </label>
              <label
                className={ACCOUNT_FIELD_CLASS}
                htmlFor="account-sheet-department"
              >
                <span className={ACCOUNT_FIELD_LABEL_CLASS}>
                  {COPY_ACCOUNT.departmentLabel}
                </span>
                <Input
                  aria-describedby="account-directory-lead"
                  className={ACCOUNT_INPUT_CLASS}
                  id="account-sheet-department"
                  onChange={(event) => updateDepartment(event.target.value)}
                  placeholder={COPY_ACCOUNT.departmentPlaceholder}
                  type="search"
                  value={department}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                className="min-h-11 border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 font-bold text-[var(--ink)] hover:bg-[var(--surface)]"
                onClick={clearFilters}
                type="button"
                variant="outline"
              >
                清除
              </Button>
              <Button
                className="min-h-11 bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
                onClick={() => setFilterOpen(false)}
                type="button"
              >
                套用篩選
              </Button>
            </div>
          </ManagementFilterSheet>
        ) : null
      }
      forbidden={
        state.kind === "error" && state.failure === "forbidden" ? (
          <AccountErrorState
            message={state.message}
            onRetry={listRetry}
            stateRef={stateRef}
          />
        ) : null
      }
      focus={{
        detailKey,
        detailRef,
        resultsRef,
        retryKey: listRetryKey,
        stateRef,
      }}
      hasDetail={Boolean(selectedId)}
      hasResults={hasResults}
      header={
        <ContextualTaskHeader
          backHref={returnHref}
          backLabel={COPY_ACCOUNT.back}
          headingId="account-directory-title"
          lead={COPY_ACCOUNT.lead}
          title={COPY_ACCOUNT.title}
        />
      }
      list={
        accountView && hasResults
          ? ({ selection }) => (
              <section
                aria-labelledby="account-directory-results-title"
                className="min-w-0"
              >
                <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="flex items-baseline gap-1">
                    <strong className="text-[0.82rem]">
                      {accountView.summary.total}
                    </strong>
                    <span className="wrap-anywhere text-[0.76rem] text-[var(--ink-muted)]">
                      {COPY_ACCOUNT.total}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-[0.82rem]">
                      {accountView.summary.active}
                    </strong>
                    <span className="wrap-anywhere text-[0.76rem] text-[var(--ink-muted)]">
                      {COPY_ACCOUNT.activeCount}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-[0.82rem]">
                      {accountView.summary.elevated}
                    </strong>
                    <span className="wrap-anywhere text-[0.76rem] text-[var(--ink-muted)]">
                      {COPY_ACCOUNT.elevated}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-[0.82rem]">
                      {accountView.summary.pending}
                    </strong>
                    <span className="wrap-anywhere text-[0.76rem] text-[var(--ink-muted)]">
                      {COPY_ACCOUNT.pendingCount}
                    </span>
                  </div>
                </div>
                <h2
                  ref={(node) => {
                    resultsRef.current = node;
                  }}
                  className="m-0 mb-2 wrap-anywhere text-[0.95rem] font-extrabold outline-none"
                  id="account-directory-results-title"
                  tabIndex={-1}
                >
                  {COPY_ACCOUNT.resultsTitle}
                </h2>
                <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
                  {accountView.accounts.map((account) => (
                    <li key={account.userId} className="min-w-0">
                      <Button
                        aria-pressed={selection.selectedId === account.userId}
                        className="grid min-h-[68px] w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left text-[var(--ink)] hover:border-[var(--focus)] hover:shadow-[inset_3px_0_0_var(--focus)] aria-pressed:border-[var(--focus)] aria-pressed:shadow-[inset_3px_0_0_var(--focus)]"
                        onClick={() => selection.onSelect(account.userId)}
                        type="button"
                        variant="ghost"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] font-extrabold text-[var(--accent)]">
                          {initials(account.name)}
                        </span>
                        <span className="grid min-w-0 gap-1">
                          <strong className="wrap-anywhere">
                            {account.name}
                          </strong>
                          <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] text-[var(--ink-muted)]">
                            {account.username ?? COPY_ACCOUNT.unavailable} ·{" "}
                            {roleLabel(account.role)}
                          </small>
                        </span>
                        <span
                          className={`min-h-[26px] rounded-full border px-2 py-1 text-[0.68rem] font-extrabold whitespace-nowrap ${statusClass(account.status)}`}
                        >
                          {statusLabel(account.status)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          : undefined
      }
      loading={<AccountLoadingState stateRef={stateRef} />}
      pagination={
        accountView
          ? {
              error: loadMoreError,
              hasMore: Boolean(accountView.nextCursor),
              label: "載入更多帳戶",
              loading: isLoadingMore,
              loadingLabel: "正在載入更多帳戶…",
              onLoadMore: () => void loadMore(),
              onRetry: () => void loadMore(),
              retryLabel: COPY_ACCOUNT.retry,
            }
          : undefined
      }
      search={
        <>
          <label
            className={ACCOUNT_FIELD_CLASS}
            htmlFor="account-directory-search"
          >
            <span className={ACCOUNT_FIELD_LABEL_CLASS}>
              {COPY_ACCOUNT.searchLabel}
            </span>
            <Input
              aria-describedby="account-directory-lead"
              autoComplete="off"
              className={ACCOUNT_INPUT_CLASS}
              id="account-directory-search"
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={COPY_ACCOUNT.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
          <span className="sr-only" id="account-directory-lead">
            {COPY_ACCOUNT.lead}
          </span>
        </>
      }
      selection={{
        onSelect: (id) => {
          const account = accounts.find((candidate) => candidate.userId === id);
          if (account) {
            handleSelect(account);
          }
        },
        selectedId,
      }}
      state={frameState}
      width="wide"
    />
  );
};
