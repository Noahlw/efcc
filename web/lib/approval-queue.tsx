"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ManagementPageHeader,
  ManagementStickyActionBar,
  safeManagementReturnHref,
} from "@/app/management/management-action-framework";
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

import styles from "./approval-queue.module.css";

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

export function preserveApprovalSelectionForDetail() {
  preserveSelectionForDetail = true;
}

export function clearApprovalSelection() {
  approvalSelection.clear();
  preserveSelectionForDetail = false;
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

function approvalStatusClass(item: PendingRegistration): string {
  if (item.accountStatus === "Active" || item.decision === "Approved") {
    return styles.statusApproved;
  }
  if (item.accountStatus === "Rejected" || item.decision === "Rejected") {
    return styles.statusRejected;
  }
  return styles.statusPending;
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
export function ApprovalQueue() {
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
  const selectAllRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (status: RegistrationQueueStatus) => {
    const sequence = ++requestSequence.current;
    setState({ kind: "loading", status });
    announce(QUEUE_COPY.loading);
    try {
      const registrations = await fetchRegistrations(status);
      if (
        !mounted.current ||
        sequence !== requestSequence.current
      ) {
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
      if (
        !mounted.current ||
        sequence !== requestSequence.current
      ) {
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!confirmOpen) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-confirm-dismiss]")?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeConfirmation();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [confirmOpen]);

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
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((requestId) => approvalSelection.get(requestId))
        .filter((item): item is PendingRegistration => item !== undefined),
    [selectedIds]
  );

  useEffect(() => {
    const checkbox = selectAllRef.current;
    if (!checkbox) return;
    const visibleSelected = filteredRegistrations.filter((item) =>
      selectedIds.includes(item.requestId)
    ).length;
    checkbox.indeterminate =
      visibleSelected > 0 && visibleSelected < filteredRegistrations.length;
  });

  useEffect(() => {
    if (state.kind === "ready") {
      resultHeadingRef.current?.focus();
    } else if (state.kind === "error") {
      stateRef.current?.focus();
    } else if (state.kind === "forbidden") {
      forbiddenHeadingRef.current?.focus();
    }
  }, [state]);

  function closeConfirmation() {
    setConfirmOpen(false);
    queueMicrotask(() => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    });
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
          new Set(attemptedIds.filter((requestId) => !currentIds.has(requestId)))
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
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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

  if (state.kind === "forbidden") {
    return (
      <section
        aria-labelledby="approval-queue-forbidden-title"
        className={styles.forbiddenState}
      >
        <h1
          id="approval-queue-forbidden-title"
          ref={forbiddenHeadingRef}
          tabIndex={-1}
          className={styles.title}
        >
          {COPY.approvals.approvalsTitle}
        </h1>
        <p role="alert">{COPY.error.forbidden}</p>
        <Link href="/profile" className={styles.back}>
          {COPY.nav.backToProfile}
        </Link>
      </section>
    );
  }

  const visibleNames = selectedItems;
  const confirmationNames = selectedItems.slice(0, 3);
  const hiddenNameCount = Math.max(
    0,
    selectedItems.length - confirmationNames.length
  );

  return (
    <section
      aria-busy={state.kind === "loading" || busy}
      aria-labelledby="approval-queue-title"
      className={styles.page}
    >
      <ManagementPageHeader
        action={
          <button
            type="button"
            onClick={() => void load(activeStatus)}
            className={styles.refresh}
            disabled={busy}
            aria-busy={state.kind === "loading"}
          >
            {QUEUE_COPY.refresh}
          </button>
        }
        backHref={returnHref}
        backLabel={returnLabel}
        lead={COPY.approvals.approvalsLead}
        title={COPY.approvals.approvalsTitle}
        titleId="approval-queue-title"
      />

      <div
        className={styles.tabs}
        role="tablist"
        aria-label={APPROVAL_UI_COPY.tabsLabel}
      >
        <button
          type="button"
          role="tab"
          id="approval-pending-tab"
          aria-controls="approval-queue-panel"
          aria-selected={activeStatus === "Pending"}
          className={styles.tab}
          onClick={() => handleTab("Pending")}
          disabled={busy}
        >
          {COPY.approvals.statusPending}
          {activeStatus === "Pending" && state.kind === "ready" && (
            <span className={styles.tabCount}>{registrations.length}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          id="approval-processed-tab"
          aria-controls="approval-queue-panel"
          aria-selected={activeStatus === "Processed"}
          className={styles.tab}
          onClick={() => handleTab("Processed")}
          disabled={busy}
        >
          {APPROVAL_UI_COPY.processedTab}
          {activeStatus === "Processed" && state.kind === "ready" && (
            <span className={styles.tabCount}>{registrations.length}</span>
          )}
        </button>
      </div>

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={`${styles.notice} ${
            noticeKind === "success"
              ? styles.noticeSuccess
              : styles.noticeError
          }`}
        >
          {notice}
        </p>
      )}

      {state.kind === "loading" && (
        <p
          className={styles.loading}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          ref={stateRef}
        >
          {QUEUE_COPY.loading}
        </p>
      )}

      {state.kind === "error" && (
        <p
          role="alert"
          className={styles.error}
          tabIndex={-1}
          ref={stateRef}
        >
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <section
          id="approval-queue-panel"
          role="tabpanel"
          aria-labelledby={
            activeStatus === "Pending"
              ? "approval-pending-tab"
              : "approval-processed-tab"
          }
          className={styles.panel}
        >
          <div className={styles.controls}>
            <label className={styles.field} htmlFor="approval-search">
              <span className={styles.fieldLabel}>
                {APPROVAL_UI_COPY.searchLabel}
              </span>
              <input
                id="approval-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={APPROVAL_UI_COPY.searchPlaceholder}
                className={styles.input}
                autoComplete="off"
              />
            </label>
            <label className={styles.field} htmlFor="approval-role-filter">
              <span className={styles.fieldLabel}>
                {APPROVAL_UI_COPY.roleFilterLabel}
              </span>
              <select
                id="approval-role-filter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className={styles.select}
              >
                <option value="">{APPROVAL_UI_COPY.allRoles}</option>
                <option value="Member">{COPY.shell.roleLabels.Member}</option>
                <option value="Staff">{COPY.shell.roleLabels.Staff}</option>
                <option value="Admin">{COPY.shell.roleLabels.Admin}</option>
              </select>
            </label>
          </div>

          {activeStatus === "Pending" && registrations.length > 0 && (
            <div className={styles.selectAllRow}>
              <label className={styles.checkboxLabel} htmlFor="approval-select-all">
                <input
                  ref={selectAllRef}
                  id="approval-select-all"
                  type="checkbox"
                  checked={allVisibleSelected}
                  aria-checked={
                    allVisibleSelected
                      ? "true"
                      : someVisibleSelected
                        ? "mixed"
                        : "false"
                  }
                  onChange={toggleSelectAll}
                  disabled={busy || selectableIds.length === 0}
                />
                <span>{APPROVAL_UI_COPY.selectAll}</span>
              </label>
              <span className={styles.loadedHint}>
                {filteredRegistrations.length} / {registrations.length}
              </span>
              <span className={styles.limitHint}>
                {APPROVAL_UI_COPY.batchLimit}
              </span>
            </div>
          )}

          {registrations.length === 0 ? (
            <p role="status" className={styles.empty}>
              {activeStatus === "Pending"
                ? QUEUE_COPY.empty
                : "目前沒有已處理的申請。"}
            </p>
          ) : filteredRegistrations.length === 0 ? (
            <p role="status" className={styles.empty}>
              {APPROVAL_UI_COPY.noMatches}
            </p>
          ) : (
            <>
              <h2
                id="approval-results-title"
                className={styles.resultsHeading}
                tabIndex={-1}
                ref={resultHeadingRef}
              >
                {activeStatus === "Pending"
                  ? COPY.approvals.statusPending
                  : APPROVAL_UI_COPY.processedTab}
              </h2>
              <ul
                className={styles.rows}
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
                    <li className={styles.row} key={item.requestId}>
                      {activeStatus === "Pending" && (
                        <input
                          id={`approval-select-${index}`}
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelection(item)}
                          disabled={busy}
                          aria-label={`選取 ${item.name}`}
                          className={styles.checkbox}
                        />
                      )}
                      <div className={styles.identity}>
                        <Link
                          href={`/management?module=approvals&request=${encodeURIComponent(item.requestId)}`}
                          className={styles.detailLink}
                          aria-label={`${COPY.approvals.openDetail} ${item.name}`}
                          onClick={(event) => {
                            if (
                              event.button === 0 &&
                              !event.metaKey &&
                              !event.ctrlKey &&
                              !event.shiftKey &&
                              !event.altKey
                            ) {
                              preserveApprovalSelectionForDetail();
                            }
                          }}
                        >
                          {item.name}
                        </Link>
                        <span className={styles.username}>{item.username}</span>
                        <span className={styles.meta}>
                          {item.phone ?? "—"} · {approvalRoleLabel(item.role)} · {formatSubmittedAt(item.submittedAt)}
                        </span>
                      </div>
                      <span className={`${styles.status} ${approvalStatusClass(item)}`}>
                        {itemStatus}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {activeStatus === "Pending" && selectedIds.length > 0 && (
        <ManagementStickyActionBar label={APPROVAL_UI_COPY.selectionRegion}>
          <div className={styles.tray}>
            <div className={styles.trayMain}>
              <strong>{APPROVAL_UI_COPY.selected(selectedIds.length)}</strong>
              <button
                type="button"
                className={styles.trayLink}
                onClick={() => setTrayOpen((open) => !open)}
                aria-expanded={trayOpen}
              >
                {trayOpen
                  ? APPROVAL_UI_COPY.hideSelected
                  : APPROVAL_UI_COPY.reviewSelected}
              </button>
            </div>
            <div className={styles.trayActions}>
              <button
                type="button"
                className={styles.clear}
                onClick={clearSelection}
                disabled={busy}
              >
                {APPROVAL_UI_COPY.clear}
              </button>
              <button
                type="button"
                className={styles.bulkApprove}
                onClick={beginBatchConfirmation}
                disabled={busy}
                aria-busy={busy}
              >
                {APPROVAL_UI_COPY.bulkApprove}
              </button>
            </div>
            {trayOpen && (
              <ul
                className={styles.trayItems}
                aria-label={APPROVAL_UI_COPY.selectedItemsLabel}
              >
                {visibleNames.map((item) => (
                  <li key={item.requestId} className={styles.trayItem}>
                    <span>
                      {item.name}
                      {staleIds.has(item.requestId) && (
                        <small className={styles.stale}>
                          {APPROVAL_UI_COPY.stale}
                        </small>
                      )}
                    </span>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeSelection(item.requestId)}
                      disabled={busy}
                      aria-label={APPROVAL_UI_COPY.remove(item.name)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ManagementStickyActionBar>
      )}

      <div className={styles.backWrap}>
        <Link href="/" className={styles.back}>
          {QUEUE_COPY.backToHome}
        </Link>
      </div>

      {confirmOpen && (
        <dialog
          ref={dialogRef}
          className={styles.confirmDialog}
          aria-modal="true"
          aria-labelledby="approval-batch-confirm-title"
          aria-describedby="approval-batch-confirm-body"
        >
          <div className={styles.confirmSurface}>
            <h2 id="approval-batch-confirm-title">
              {APPROVAL_UI_COPY.confirmTitle}
            </h2>
            <p id="approval-batch-confirm-body">
              {APPROVAL_UI_COPY.activeAccounts(selectedItems.length)}
            </p>
            <ul className={styles.confirmNames}>
              {confirmationNames.map((item) => (
                <li key={item.requestId}>{item.name}</li>
              ))}
              {hiddenNameCount > 0 && <li>+{hiddenNameCount}</li>}
            </ul>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.clear}
                data-confirm-dismiss
                onClick={closeConfirmation}
              >
                {APPROVAL_UI_COPY.confirmCancel}
              </button>
              <button
                type="button"
                className={styles.bulkApprove}
                onClick={acceptBatchConfirmation}
                disabled={busy}
                aria-busy={busy}
              >
                {APPROVAL_UI_COPY.confirmApprove}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
