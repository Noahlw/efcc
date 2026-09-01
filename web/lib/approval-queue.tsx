"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DirectoryFrame,
  type DirectoryFrameState,
} from "@/app/management/directory-frame";
import {
  ActionSurface,
  ManagementFilterSheet,
  ManagementPageHeader,
  safeManagementReturnHref,
} from "@/app/management/management-action-framework";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  approveRegistrationsBatch,
  fetchRegistrations,
  type PendingRegistration,
  RegistrationApiError,
  type RegistrationQueueStatus,
} from "@/lib/registration-client";
import { QUEUE_COPY, registrationErrorCopy } from "@/lib/registration-copy";

// The queue implementation below owns the S4 selection and batch action state.
type ApprovalQueueState =
  | { kind: "loading"; status: RegistrationQueueStatus }
  | {
      kind: "ready";
      registrations: PendingRegistration[];
      status: RegistrationQueueStatus;
    }
  | { kind: "error"; message: string; status: RegistrationQueueStatus }
  | { kind: "forbidden" };

function formatSubmittedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-Hant", {
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

type NoticeKind = "success" | "error";

const APPROVAL_UI_COPY = {
  processedTab: "已處理",
  tabsLabel: "註冊審批分類",
  searchLabel: "搜尋申請",
  searchPlaceholder: "按姓名、用戶名稱或電話搜尋",
  roleFilterLabel: "篩選角色",
  allRoles: "全部角色",
  selectAll: "全選目前結果",
  selected: (count: number) => `已選 ${count} 位`,
  reviewSelected: "檢視所選",
  hideSelected: "收起所選",
  clear: "清除",
  selectionRegion: "審批選取集",
  bulkApprove: "核准所選",
  selectedItemsLabel: "所選申請",
  remove: (name: string) => `移除 ${name}`,
  stale: "資料已變更，請重新檢視",
  noMatches: "找不到符合的申請。",
  confirmTitle: "確認核准所選申請",
  confirmCancel: "取消",
  confirmApprove: "確認核准",
  activeAccounts: (count: number) =>
    `核准後會建立 ${count} 個 Active Accounts。`,
  staleConflict: "部分申請已變更，請檢視所選項目後再試。",
  batchLimit: "一次最多核准 100 位申請。",
  selectedAnnouncement: (count: number) => `已選 ${count} 位申請。`,
  deselectedAnnouncement: (name: string) => `已取消選取 ${name}。`,
} as const;

/**
 * Selection is deliberately process-local. It survives the queue/detail
 * route transition, but cannot survive a reload or leak into another browser
 * session. The row snapshot lets the review tray name a stale item without
 * exposing its opaque request ID.
 */
const approvalSelection = new Map<string, PendingRegistration>();
let preserveSelectionForDetail = false;

let approvalFocusRequestId: string | null = null;

export function preserveApprovalSelectionForDetail(requestId?: string) {
  preserveSelectionForDetail = true;
  approvalFocusRequestId = requestId ?? null;
}

export function clearApprovalSelection() {
  approvalSelection.clear();
  preserveSelectionForDetail = false;
  approvalFocusRequestId = null;
}

function approvalStatusLabel(item: PendingRegistration): string {
  if (item.accountStatus === "Active" || item.decision === "Approved") {
    return COPY.approvals.statusApproved;
  }
  if (item.accountStatus === "Rejected" || item.decision === "Rejected") {
    return COPY.approvals.statusRejected;
  }
  return COPY.approvals.statusPending;
}

function approvalStatusBadgeClass(item: PendingRegistration): string {
  if (item.accountStatus === "Active" || item.decision === "Approved") {
    return "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]";
  }
  if (item.accountStatus === "Rejected" || item.decision === "Rejected") {
    return "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]";
  }
  return "border-[var(--pending-border)] bg-[var(--pending-surface)] text-[var(--pending)]";
}

function approvalRoleLabel(role: string): string {
  return (
    COPY.shell.roleLabels[role as keyof typeof COPY.shell.roleLabels] ?? role
  );
}

function approvalMatchesSearch(
  item: PendingRegistration,
  query: string
): boolean {
  const normalized = query.trim().toLocaleLowerCase("zh-Hant");
  if (!normalized) return true;
  return [item.name, item.username, item.phone ?? "", item.role]
    .join(" ")
    .toLocaleLowerCase("zh-Hant")
    .includes(normalized);
}

function approvalIsConflict(error: unknown): boolean {
  return (
    error instanceof RegistrationApiError &&
    (error.status === 409 || error.code === "CONFLICT")
  );
}

function approvalErrorMessage(error: unknown): string {
  return error instanceof RegistrationApiError
    ? registrationErrorCopy(error.code, error.message)
    : QUEUE_COPY.networkError;
}

// oxlint-disable-next-line eslint/complexity -- this component owns the queue, selection, and confirmation state machine.
export const ApprovalQueue = () => {
  const searchParams = useSearchParams();
  const returnHref = safeManagementReturnHref(
    searchParams.get("return"),
    "/management"
  );
  const returnLabel = returnHref.includes("module=settings")
    ? "設定"
    : "返回管理工作";
  const [activeStatus, setActiveStatus] =
    useState<RegistrationQueueStatus>("Pending");
  const [state, setState] = useState<ApprovalQueueState>({
    kind: "loading",
    status: "Pending",
  });
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [
    ...approvalSelection.keys(),
  ]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("success");
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mounted = useRef(true);
  const requestSequence = useRef(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const stateRef = useRef<HTMLParagraphElement>(null);
  const forbiddenHeadingRef = useRef<HTMLHeadingElement>(null);
  const rowLinkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const load = useCallback(async (status: RegistrationQueueStatus) => {
    const sequence = ++requestSequence.current;
    setState({ kind: "loading", status });
    announce(QUEUE_COPY.loading);
    try {
      const registrations = await fetchRegistrations(status);
      if (!mounted.current || sequence !== requestSequence.current) {
        return null;
      }
      if (status === "Pending") {
        for (const registration of registrations) {
          if (approvalSelection.has(registration.requestId)) {
            approvalSelection.set(registration.requestId, registration);
          }
        }
      }
      setState({ kind: "ready", registrations, status });
      return registrations;
    } catch (error) {
      if (!mounted.current || sequence !== requestSequence.current) {
        return null;
      }
      if (
        error instanceof RegistrationApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({ kind: "forbidden" });
        return null;
      }
      const message = approvalErrorMessage(error);
      setState({ kind: "error", message, status });
      announce(message);
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!preserveSelectionForDetail) {
        approvalSelection.clear();
      }
      preserveSelectionForDetail = false;
    };
  }, []);

  useEffect(() => {
    void load(activeStatus);
  }, [activeStatus, load]);

  const registrations =
    state.kind === "ready" && state.status === activeStatus
      ? state.registrations
      : [];
  const filteredRegistrations = useMemo(
    () =>
      registrations.filter(
        (item) =>
          approvalMatchesSearch(item, query) &&
          (!roleFilter || item.role === roleFilter)
      ),
    [query, registrations, roleFilter]
  );
  const selectableIds =
    activeStatus === "Pending"
      ? filteredRegistrations.map((item) => item.requestId)
      : [];
  const allVisibleSelected =
    selectableIds.length > 0 &&
    selectableIds.every((requestId) => selectedIds.includes(requestId));
  const someVisibleSelected = selectableIds.some((requestId) =>
    selectedIds.includes(requestId)
  );
  const selectAllState = allVisibleSelected
    ? true
    : someVisibleSelected
      ? "indeterminate"
      : false;
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((requestId) => approvalSelection.get(requestId))
        .filter((item): item is PendingRegistration => item !== undefined),
    [selectedIds]
  );

  useEffect(() => {
    if (state.kind === "ready") {
      const focusRequestId = approvalFocusRequestId;
      const rowLink = focusRequestId
        ? rowLinkRefs.current.get(focusRequestId)
        : undefined;
      if (rowLink) {
        rowLink.focus();
        approvalFocusRequestId = null;
      } else {
        resultHeadingRef.current?.focus();
      }
    } else if (state.kind === "error") {
      stateRef.current?.focus();
    } else if (state.kind === "forbidden") {
      forbiddenHeadingRef.current?.focus();
    }
  }, [state]);

  function closeConfirmation() {
    setConfirmOpen(false);
  }

  const toggleSelection = (item: PendingRegistration) => {
    if (busy || activeStatus !== "Pending") return;
    const wasSelected = selectedIds.includes(item.requestId);
    if (wasSelected) {
      approvalSelection.delete(item.requestId);
      setSelectedIds((ids) => ids.filter((id) => id !== item.requestId));
      setStaleIds((ids) => {
        const next = new Set(ids);
        next.delete(item.requestId);
        return next;
      });
      announce(APPROVAL_UI_COPY.deselectedAnnouncement(item.name));
      return;
    }
    if (selectedIds.length >= 100) {
      setNotice(APPROVAL_UI_COPY.batchLimit);
      setNoticeKind("error");
      announce(APPROVAL_UI_COPY.batchLimit);
      return;
    }
    approvalSelection.set(item.requestId, item);
    setSelectedIds((ids) => [...ids, item.requestId]);
    announce(APPROVAL_UI_COPY.selectedAnnouncement(selectedIds.length + 1));
  };

  const toggleSelectAll = () => {
    if (busy || activeStatus !== "Pending" || selectableIds.length === 0) {
      return;
    }
    if (allVisibleSelected) {
      for (const requestId of selectableIds) {
        approvalSelection.delete(requestId);
      }
      setSelectedIds((ids) => ids.filter((id) => !selectableIds.includes(id)));
      announce(
        APPROVAL_UI_COPY.selectedAnnouncement(
          selectedIds.length - selectableIds.length
        )
      );
      return;
    }
    const availableIds = selectableIds.filter(
      (requestId) => !selectedIds.includes(requestId)
    );
    const idsToAdd = availableIds.slice(0, 100 - selectedIds.length);
    for (const item of filteredRegistrations) {
      if (idsToAdd.includes(item.requestId)) {
        approvalSelection.set(item.requestId, item);
      }
    }
    setSelectedIds((ids) => {
      const next = new Set(ids);
      for (const requestId of idsToAdd) next.add(requestId);
      return [...next];
    });
    if (idsToAdd.length < availableIds.length) {
      setNotice(APPROVAL_UI_COPY.batchLimit);
      setNoticeKind("error");
      announce(APPROVAL_UI_COPY.batchLimit);
    }
    announce(
      APPROVAL_UI_COPY.selectedAnnouncement(
        new Set([...selectedIds, ...idsToAdd]).size
      )
    );
  };

  const removeSelection = (requestId: string) => {
    if (busy) return;
    const item = approvalSelection.get(requestId);
    approvalSelection.delete(requestId);
    setSelectedIds((ids) => ids.filter((id) => id !== requestId));
    setStaleIds((ids) => {
      const next = new Set(ids);
      next.delete(requestId);
      return next;
    });
    if (item) announce(APPROVAL_UI_COPY.deselectedAnnouncement(item.name));
  };

  const clearSelection = () => {
    if (busy) return;
    approvalSelection.clear();
    setSelectedIds([]);
    setStaleIds(new Set());
    setTrayOpen(false);
    announce(APPROVAL_UI_COPY.selectedAnnouncement(0));
  };

  const reconcileConflict = useCallback(
    async (attemptedIds: string[]) => {
      try {
        const registrations = await fetchRegistrations("Pending");
        if (!mounted.current) return;
        for (const registration of registrations) {
          if (approvalSelection.has(registration.requestId)) {
            approvalSelection.set(registration.requestId, registration);
          }
        }
        const currentIds = new Set(
          registrations.map((registration) => registration.requestId)
        );
        setStaleIds(
          new Set(
            attemptedIds.filter((requestId) => !currentIds.has(requestId))
          )
        );
        if (activeStatus === "Pending") {
          setState({ kind: "ready", registrations, status: "Pending" });
        }
      } catch {
        // The conflict is already visible. Keep the original selection and
        // do not turn this safe reconciliation read into an automatic retry.
      }
    },
    [activeStatus]
  );

  const commitBatch = useCallback(
    async (requestIds: string[]) => {
      if (requestIds.length === 0 || busy) return;
      if (requestIds.length > 100) {
        setNotice(APPROVAL_UI_COPY.batchLimit);
        setNoticeKind("error");
        announce(APPROVAL_UI_COPY.batchLimit);
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        const result = await approveRegistrationsBatch(requestIds);
        if (!mounted.current) return;
        approvalSelection.clear();
        setSelectedIds([]);
        setStaleIds(new Set());
        setNotice(
          `${QUEUE_COPY.done} ${result.approvedCount} Active Accounts 已建立。`
        );
        setNoticeKind("success");
        announce(QUEUE_COPY.done);
        await load(activeStatus);
      } catch (error) {
        if (!mounted.current) return;
        const message = approvalErrorMessage(error);
        setNotice(message);
        setNoticeKind("error");
        announce(message);
        if (approvalIsConflict(error)) {
          setNotice(APPROVAL_UI_COPY.staleConflict);
          announce(APPROVAL_UI_COPY.staleConflict);
          await reconcileConflict(requestIds);
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [activeStatus, busy, load, reconcileConflict]
  );

  const beginBatchConfirmation = () => {
    if (busy || selectedIds.length === 0 || selectedIds.length > 100) return;
    setNotice(null);
    setConfirmOpen(true);
  };

  const acceptBatchConfirmation = () => {
    const requestIds = [...selectedIds];
    closeConfirmation();
    void commitBatch(requestIds);
  };

  const handleTab = (status: RegistrationQueueStatus) => {
    if (busy || status === activeStatus) return;
    setNotice(null);
    setActiveStatus(status);
  };

  const visibleNames = selectedItems;
  const confirmationNames = selectedItems.slice(0, 3);
  const hiddenNameCount = Math.max(
    0,
    selectedItems.length - confirmationNames.length
  );
  const actionSurfaceState = busy
    ? "busy"
    : noticeKind === "error"
      ? notice === APPROVAL_UI_COPY.staleConflict
        ? "conflict"
        : "failure"
      : trayOpen
        ? "review"
        : "selection";

  const frameState: DirectoryFrameState =
    state.kind === "error"
      ? "error"
      : state.kind === "forbidden"
        ? "forbidden"
        : state.kind === "ready" && filteredRegistrations.length === 0
          ? "empty"
          : state.kind;

  return (
    <div className="mx-auto w-full min-w-0">
      <DirectoryFrame
        ariaLabelledBy="approval-queue-title"
        header={
          <div className="grid min-w-0 gap-4">
            <ManagementPageHeader
              action={
                <Button
                  type="button"
                  onClick={() => void load(activeStatus)}
                  className="min-h-11"
                  disabled={busy}
                  aria-busy={state.kind === "loading"}
                  size="lg"
                  variant="outline"
                >
                  {QUEUE_COPY.refresh}
                </Button>
              }
              backHref={returnHref}
              backLabel={returnLabel}
              lead={COPY.approvals.approvalsLead}
              title={COPY.approvals.approvalsTitle}
              titleId="approval-queue-title"
            />
            <div
              className="flex items-center gap-2 border-b border-[var(--line)] pb-2"
              role="tablist"
              aria-label={APPROVAL_UI_COPY.tabsLabel}
            >
              <Button
                type="button"
                role="tab"
                id="approval-pending-tab"
                aria-controls="approval-queue-panel"
                aria-selected={activeStatus === "Pending"}
                className={`min-h-11 ${
                  activeStatus === "Pending"
                    ? "border-b-2 border-[var(--accent)] font-extrabold text-[var(--ink)]"
                    : "text-[var(--ink-muted)]"
                }`}
                onClick={() => handleTab("Pending")}
                disabled={busy}
                size="lg"
                variant="ghost"
              >
                {COPY.approvals.statusPending}
                {activeStatus === "Pending" && state.kind === "ready" && (
                  <span className="ml-1.5 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-bold">
                    {registrations.length}
                  </span>
                )}
              </Button>
              <Button
                type="button"
                role="tab"
                id="approval-processed-tab"
                aria-controls="approval-queue-panel"
                aria-selected={activeStatus === "Processed"}
                className={`min-h-11 ${
                  activeStatus === "Processed"
                    ? "border-b-2 border-[var(--accent)] font-extrabold text-[var(--ink)]"
                    : "text-[var(--ink-muted)]"
                }`}
                onClick={() => handleTab("Processed")}
                disabled={busy}
                size="lg"
                variant="ghost"
              >
                {APPROVAL_UI_COPY.processedTab}
                {activeStatus === "Processed" && state.kind === "ready" && (
                  <span className="ml-1.5 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-bold">
                    {registrations.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
        }
        search={
          <div className="grid min-w-0 gap-2">
            <label
              htmlFor="approval-search"
              className="text-[0.82rem] font-bold text-[var(--ink)]"
            >
              {APPROVAL_UI_COPY.searchLabel}
            </label>
            <Input
              id="approval-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={APPROVAL_UI_COPY.searchPlaceholder}
              className="h-12 min-h-12 w-full min-w-0 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]"
              autoComplete="off"
            />
          </div>
        }
        desktopFilters={
          <div className="grid min-w-0 gap-2">
            <span
              className="text-[0.82rem] font-bold text-[var(--ink)]"
              id="approval-role-filter-label"
            >
              {APPROVAL_UI_COPY.roleFilterLabel}
            </span>
            <Select
              value={roleFilter || "all"}
              onValueChange={(value) =>
                setRoleFilter(value === "all" ? "" : value)
              }
            >
              <SelectTrigger
                id="approval-role-filter"
                aria-labelledby="approval-role-filter-label"
                className="h-12 min-h-12 w-full min-w-0 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]"
                size="default"
              >
                <SelectValue placeholder={APPROVAL_UI_COPY.allRoles} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{APPROVAL_UI_COPY.allRoles}</SelectItem>
                <SelectItem value="Member">
                  {COPY.shell.roleLabels.Member}
                </SelectItem>
                <SelectItem value="Staff">
                  {COPY.shell.roleLabels.Staff}
                </SelectItem>
                <SelectItem value="Admin">
                  {COPY.shell.roleLabels.Admin}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        filter={
          <Button
            aria-label={roleFilter ? "篩選 1" : "篩選"}
            className="min-h-12 min-w-11 border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 font-extrabold text-[var(--ink)] hover:bg-[var(--surface)]"
            onClick={() => setFilterOpen(true)}
            type="button"
            variant="outline"
          >
            篩選{roleFilter ? " 1" : ""}
          </Button>
        }
        filterSheet={
          filterOpen ? (
            <ManagementFilterSheet
              label="篩選申請"
              onClose={() => setFilterOpen(false)}
            >
              <div className="mt-4 grid gap-3">
                <label
                  className="grid min-w-0 gap-2"
                  htmlFor="approval-sheet-role-filter"
                >
                  <span
                    className="text-[0.82rem] font-bold text-[var(--ink)]"
                    id="approval-sheet-role-filter-label"
                  >
                    {APPROVAL_UI_COPY.roleFilterLabel}
                  </span>
                  <Select
                    value={roleFilter || "all"}
                    onValueChange={(value) => {
                      setRoleFilter(value === "all" ? "" : value);
                    }}
                  >
                    <SelectTrigger
                      id="approval-sheet-role-filter"
                      aria-labelledby="approval-sheet-role-filter-label"
                      className="h-12 min-h-12 w-full min-w-0 rounded-[8px] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)]"
                      size="default"
                    >
                      <SelectValue placeholder={APPROVAL_UI_COPY.allRoles} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {APPROVAL_UI_COPY.allRoles}
                      </SelectItem>
                      <SelectItem value="Member">
                        {COPY.shell.roleLabels.Member}
                      </SelectItem>
                      <SelectItem value="Staff">
                        {COPY.shell.roleLabels.Staff}
                      </SelectItem>
                      <SelectItem value="Admin">
                        {COPY.shell.roleLabels.Admin}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setRoleFilter("");
                      setFilterOpen(false);
                    }}
                    className="min-h-11 font-extrabold text-[var(--ink-muted)]"
                  >
                    清除篩選
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => setFilterOpen(false)}
                    className="min-h-11 font-extrabold"
                  >
                    套用篩選
                  </Button>
                </div>
              </div>
            </ManagementFilterSheet>
          ) : null
        }
        loading={
          <p
            aria-label={QUEUE_COPY.loading}
            className="mt-4 grid min-w-0 place-items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center text-[var(--ink-muted)]"
            role="status"
            aria-live="polite"
            tabIndex={-1}
            ref={stateRef}
          >
            {QUEUE_COPY.loading}
          </p>
        }
        error={
          state.kind === "error" ? (
            <div
              className="mt-4 grid min-w-0 gap-3 rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-6 text-center text-[var(--ink)]"
              role="alert"
              tabIndex={-1}
              ref={stateRef}
            >
              <p className="m-0 text-base font-extrabold">{state.message}</p>
              <Button
                className="mx-auto min-h-11 border-[var(--accent)] bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
                onClick={() => void load(activeStatus)}
                type="button"
              >
                重試連接
              </Button>
            </div>
          ) : null
        }
        forbidden={
          <div
            className="mt-4 grid min-w-0 gap-3 rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-6 text-center text-[var(--ink)]"
            role="alert"
            tabIndex={-1}
            ref={forbiddenHeadingRef}
          >
            <p className="m-0 text-base font-extrabold">
              {COPY.error.forbidden}
            </p>
            <Link
              href="/management?module=approvals"
              className="font-bold text-[var(--accent)] underline"
            >
              {COPY.approvals.backToApprovals}
            </Link>
          </div>
        }
        empty={
          <p
            role="status"
            className="mt-4 grid min-w-0 place-items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 text-center text-[var(--ink-muted)]"
          >
            {activeStatus === "Pending"
              ? registrations.length === 0
                ? QUEUE_COPY.empty
                : APPROVAL_UI_COPY.noMatches
              : registrations.length === 0
                ? "目前沒有已處理的申請。"
                : APPROVAL_UI_COPY.noMatches}
          </p>
        }
        hasResults={filteredRegistrations.length > 0}
        list={
          state.kind === "ready" && filteredRegistrations.length > 0 ? (
            <section
              id="approval-queue-panel"
              role="tabpanel"
              aria-labelledby={
                activeStatus === "Pending"
                  ? "approval-pending-tab"
                  : "approval-processed-tab"
              }
              className="grid min-w-0 gap-3"
            >
              {activeStatus === "Pending" && registrations.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <label
                    className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--ink)]"
                    htmlFor="approval-select-all"
                  >
                    <Checkbox
                      id="approval-select-all"
                      aria-label={APPROVAL_UI_COPY.selectAll}
                      checked={selectAllState}
                      onCheckedChange={toggleSelectAll}
                      disabled={busy || selectableIds.length === 0}
                    />
                    <span>{APPROVAL_UI_COPY.selectAll}</span>
                  </label>
                  <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
                    <span className="font-mono">
                      {filteredRegistrations.length} / {registrations.length}
                    </span>
                    <span>{APPROVAL_UI_COPY.batchLimit}</span>
                  </div>
                </div>
              )}

              <h2
                id="approval-results-title"
                className="m-0 text-base font-extrabold text-[var(--ink)] outline-none"
                tabIndex={-1}
                ref={resultHeadingRef}
              >
                {activeStatus === "Pending"
                  ? COPY.approvals.statusPending
                  : APPROVAL_UI_COPY.processedTab}
              </h2>
              <ul
                className="m-0 grid min-w-0 list-none gap-2 p-0"
                aria-label={
                  activeStatus === "Pending"
                    ? COPY.approvals.statusPending
                    : APPROVAL_UI_COPY.processedTab
                }
              >
                {filteredRegistrations.map((item, index) => {
                  const selected = selectedIds.includes(item.requestId);
                  const itemStatus = approvalStatusLabel(item);
                  return (
                    <li
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 hover:border-[var(--line-strong)]"
                      key={item.requestId}
                    >
                      {activeStatus === "Pending" && (
                        <Checkbox
                          id={`approval-select-${index}`}
                          checked={selected}
                          onCheckedChange={() => toggleSelection(item)}
                          disabled={busy}
                          aria-label={`選取 ${item.name}`}
                          className="size-11 shrink-0"
                        />
                      )}
                      <div className="grid min-w-0 gap-1 wrap-anywhere">
                        <Link
                          ref={(node) => {
                            if (node) {
                              rowLinkRefs.current.set(item.requestId, node);
                            } else {
                              rowLinkRefs.current.delete(item.requestId);
                            }
                          }}
                          href={`/management?module=approvals&request=${encodeURIComponent(item.requestId)}`}
                          className="inline-flex min-h-11 min-w-0 items-center whitespace-normal wrap-anywhere text-base font-extrabold text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                          aria-label={`${COPY.approvals.openDetail} ${item.name}`}
                          onClick={(event) => {
                            if (
                              event.button === 0 &&
                              !event.metaKey &&
                              !event.ctrlKey &&
                              !event.shiftKey &&
                              !event.altKey
                            ) {
                              preserveApprovalSelectionForDetail(
                                item.requestId
                              );
                            }
                          }}
                        >
                          {item.name}
                        </Link>
                        <span className="min-w-0 whitespace-normal wrap-anywhere font-mono text-xs text-[var(--ink-muted)]">
                          {item.username}
                        </span>
                        <span className="min-w-0 whitespace-normal wrap-anywhere text-xs text-[var(--ink-muted)]">
                          {item.phone ?? "—"} · {approvalRoleLabel(item.role)} ·{" "}
                          {formatSubmittedAt(item.submittedAt)}
                        </span>
                      </div>
                      <span
                        className={`min-h-[26px] rounded-full border px-2.5 py-1 text-xs font-extrabold whitespace-nowrap ${approvalStatusBadgeClass(item)}`}
                      >
                        {itemStatus}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : undefined
        }
        state={frameState}
        width="wide"
      />

      {notice && (
        <p
          role={noticeKind === "error" ? "alert" : "status"}
          aria-live={noticeKind === "error" ? "assertive" : "polite"}
          className={`mt-4 rounded-[var(--radius-md)] border p-3 text-sm font-bold ${
            noticeKind === "success"
              ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
              : "border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error)]"
          }`}
        >
          {notice}
        </p>
      )}

      {state.kind === "ready" &&
        activeStatus === "Pending" &&
        selectedIds.length > 0 && (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <ActionSurface
              busy={busy}
              disabled={busy}
              label={APPROVAL_UI_COPY.selectionRegion}
              state={actionSurfaceState}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <strong>
                    {APPROVAL_UI_COPY.selected(selectedIds.length)}
                  </strong>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => setTrayOpen((open) => !open)}
                    aria-expanded={trayOpen}
                    disabled={busy}
                    size="lg"
                    variant="outline"
                  >
                    {trayOpen
                      ? APPROVAL_UI_COPY.hideSelected
                      : APPROVAL_UI_COPY.reviewSelected}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={clearSelection}
                    disabled={busy}
                    size="lg"
                    variant="outline"
                  >
                    {APPROVAL_UI_COPY.clear}
                  </Button>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={beginBatchConfirmation}
                      disabled={busy}
                      aria-busy={busy}
                      aria-haspopup="dialog"
                      size="lg"
                      variant="default"
                    >
                      {APPROVAL_UI_COPY.bulkApprove}
                    </Button>
                  </AlertDialogTrigger>
                </div>
              </div>
              {trayOpen && (
                <ul
                  className="m-0 mt-3 grid max-h-48 min-w-0 list-none gap-2 overflow-y-auto p-0"
                  aria-label={APPROVAL_UI_COPY.selectedItemsLabel}
                >
                  {visibleNames.map((item) => (
                    <li
                      key={item.requestId}
                      className="flex min-w-0 items-center justify-between gap-2 rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-sm"
                    >
                      <span className="min-w-0 whitespace-normal wrap-anywhere">
                        {item.name}
                        {staleIds.has(item.requestId) && (
                          <small className="ml-2 text-xs font-bold text-[var(--error)]">
                            {APPROVAL_UI_COPY.stale}
                          </small>
                        )}
                      </span>
                      <Button
                        type="button"
                        className="size-11 min-h-11 min-w-11 shrink-0 p-0 text-sm"
                        onClick={() => removeSelection(item.requestId)}
                        disabled={busy}
                        aria-label={APPROVAL_UI_COPY.remove(item.name)}
                        size="icon"
                        variant="outline"
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ActionSurface>
            <AlertDialogContent
              className="max-w-md"
              aria-labelledby="approval-batch-confirm-title"
              aria-describedby="approval-batch-confirm-body"
            >
              <div className="grid gap-4">
                <AlertDialogTitle id="approval-batch-confirm-title">
                  {APPROVAL_UI_COPY.confirmTitle}
                </AlertDialogTitle>
                <AlertDialogDescription id="approval-batch-confirm-body">
                  {APPROVAL_UI_COPY.activeAccounts(selectedItems.length)}
                </AlertDialogDescription>
                <ul className="m-0 max-h-32 list-disc overflow-y-auto pl-5 text-sm">
                  {confirmationNames.map((item) => (
                    <li key={item.requestId}>{item.name}</li>
                  ))}
                  {hiddenNameCount > 0 && <li>+{hiddenNameCount}</li>}
                </ul>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={closeConfirmation}>
                    {APPROVAL_UI_COPY.confirmCancel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={acceptBatchConfirmation}
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {APPROVAL_UI_COPY.confirmApprove}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}
    </div>
  );
};
