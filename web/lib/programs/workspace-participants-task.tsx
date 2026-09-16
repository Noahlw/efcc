"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import type {
  EnrollmentApprovalRun,
  EnrollmentApprovalRunItem,
} from "@/lib/programs/enrollment-approval-run";
import {
  assistedEnroll,
  cancelEnrollment,
  cancelEnrollmentApprovalRun,
  continueEnrollmentApprovalRun,
  decideEnrollmentRequest,
  isUnknownMutationOutcome,
  listEnrollmentApprovalRuns,
  listEnrollmentSnapshot,
  reconcileEnrollmentApprovalRun,
  startEnrollmentApprovalRun,
} from "@/lib/programs/program-api";
import type { Enrollment, EnrollmentRequest } from "@/lib/programs/program-api";
import {
  ScreenEditor,
  ScreenField,
  ScreenLoadingRows,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenSection,
  ScreenState,
  ScreenStatus,
  ScreenTab,
  ScreenTabs,
} from "@/lib/screen-foundations";

import { MemberPicker } from "./member-picker";
import { useAsyncResource } from "./use-async-resource";
import {
  formatEventTime,
  redirectToLoginIfRequired,
  useWorkspaceTaskContext,
} from "./workspace-context";

type ParticipantTab = "pending" | "active" | "history";
type ParticipantFailure = "forbidden" | "stale" | "conflict" | "server";
interface CancelRetry {
  enrollmentId: string;
  idempotencyKey: string;
  reason: string;
}

type ApprovalItemStatus =
  | "queued"
  | "processing"
  | "approved"
  | "stale"
  | "denied"
  | "already_processed"
  | "error";

const APPROVAL_COPY = {
  searchLabel: "搜尋待審批報名",
  searchPlaceholder: "姓名、用戶名稱或成員 ID",
  noSearchMatches: "找不到符合的待審批報名。",
  selectVisible: "選取目前顯示的待審批報名",
  select: "選取",
  deselect: "取消選取",
  selected: (count: number) => `已選 ${count} 位`,
  reviewSelected: "檢視所選",
  clear: "清除",
  selectedList: "所選報名",
  reviewTitle: "確認核准所選報名",
  reviewBody: (count: number) =>
    `你選擇了 ${count} 位成員。系統會逐一核准，個別結果會保留。`,
  confirmApprove: "確認核准",
  processing: (completed: number, total: number) =>
    `處理中 ${completed}/${total} 項`,
  complete: "全部完成",
  partial: (completed: number, total: number, unresolved: number) =>
    `已處理 ${completed}/${total} 項，仍有 ${unresolved} 項未完成。請重新整理後繼續。`,
  queued: "等待處理",
  processingItem: "處理中",
  approved: "已核准",
  stale: "資料已更新",
  denied: "未獲授權",
  alreadyProcessed: "已處理",
  error: "未完成",
  details: "查看詳情",
  hideDetails: "收起詳情",
  continueRemaining: "繼續處理餘下項目",
  reconcile: "重新核對結果",
  cancelRun: "取消後續處理",
  cancelled: "已取消後續處理；已完成結果會保留。",
  reconciliationRequired: "部分核准結果未能確認，請先核對後再繼續。",
  managerCancelTitle: "取消成員報名？",
  managerCancelBody: (member: string) =>
    `你即將取消 ${member} 的課程報名。取消後會保留報名歷史，並通知成員。`,
  managerCancelReason: "取消原因",
  managerCancelReasonPlaceholder: "請輸入取消原因",
  managerCancelReasonRequired: "取消成員報名前必須填寫原因。",
  managerCancelConfirm: "確認取消",
} as const;

type ParticipantsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      requests: EnrollmentRequest[];
      enrollments: Enrollment[];
    }
  | {
      kind: "error";
      failure: ParticipantFailure;
      message: string;
    };

function participantIssue(error: unknown): {
  failure: ParticipantFailure;
  message: string;
} {
  const code = error instanceof RpcError ? error.problem.code : undefined;
  if (code === "FORBIDDEN") {
    return {
      failure: "forbidden",
      message: COPY.programs.workspaceParticipantsForbidden,
    };
  }
  if (code === "STALE") {
    return {
      failure: "stale",
      message: COPY.programs.workspaceParticipantsStale,
    };
  }
  if (code === "CONFLICT" || code === "ENROLLMENT_DUPLICATE") {
    return {
      failure: "conflict",
      message:
        code === "ENROLLMENT_DUPLICATE"
          ? `${COPY.programs.workspaceParticipantsConflict} ${COPY.programs.enrollmentDuplicate}`
          : COPY.programs.workspaceParticipantsConflict,
    };
  }
  return {
    failure: "server",
    message:
      error instanceof RpcError
        ? errorCopyFor(code, error.problem.detail)
        : COPY.error.networkError,
  };
}

function memberLabel(
  member: Pick<
    EnrollmentRequest | EnrollmentApprovalRunItem,
    "member_name" | "member_username" | "member_user_id"
  >
): string {
  return member.member_name ?? member.member_username ?? member.member_user_id;
}

function approvalStatusTone(
  status: ApprovalItemStatus
): "success" | "pending" | "accent" | "info" | "neutral" | "danger" {
  if (status === "approved") {
    return "success";
  }
  if (status === "processing") {
    return "accent";
  }
  if (status === "stale") {
    return "pending";
  }
  if (status === "denied" || status === "error") {
    return "danger";
  }
  return "neutral";
}

function approvalStatusMessage(status: ApprovalItemStatus): string {
  if (status === "queued") {
    return APPROVAL_COPY.queued;
  }
  if (status === "processing") {
    return APPROVAL_COPY.processingItem;
  }
  if (status === "approved") {
    return APPROVAL_COPY.approved;
  }
  if (status === "stale") {
    return APPROVAL_COPY.stale;
  }
  if (status === "denied") {
    return APPROVAL_COPY.denied;
  }
  if (status === "already_processed") {
    return APPROVAL_COPY.alreadyProcessed;
  }
  return APPROVAL_COPY.error;
}

function approvalItemStatus(
  item: EnrollmentApprovalRunItem
): ApprovalItemStatus {
  if (item.status === "not_started") {
    return "queued";
  }
  if (item.status === "in_flight") {
    return "processing";
  }
  if (item.status === "completed") {
    return "approved";
  }
  if (item.error_code === "STALE_REQUEST_VERSION") {
    return "stale";
  }
  if (
    item.error_code === "FORBIDDEN" ||
    item.error_code === "ENROLLMENT_ACCOUNT_INACTIVE"
  ) {
    return "denied";
  }
  if (
    item.error_code === "REQUEST_ALREADY_HANDLED" ||
    item.error_code === "ENROLLMENT_DUPLICATE"
  ) {
    return "already_processed";
  }
  return "error";
}

function approvalItemNeedsRetry(item: EnrollmentApprovalRunItem): boolean {
  return item.status === "failed" && item.retryable;
}

function approvalItemMessage(item: EnrollmentApprovalRunItem): string | null {
  if (item.detail) {
    return item.detail;
  }
  if (item.status === "outcome_unknown") {
    return APPROVAL_COPY.reconciliationRequired;
  }
  return null;
}

function approvalRunHasUnresolvedWork(run: EnrollmentApprovalRun): boolean {
  return run.items.some(
    (item) =>
      item.status === "not_started" ||
      (item.status === "failed" && item.retryable)
  );
}

function approvalRunNeedsReconciliation(run: EnrollmentApprovalRun): boolean {
  return run.items.some(
    (item) => item.status === "in_flight" || item.status === "outcome_unknown"
  );
}

function isAmbiguousCancelError(error: unknown): boolean {
  if (!(error instanceof RpcError)) {
    return true;
  }
  return (
    error.problem.status === 0 ||
    error.problem.code === "NETWORK_ERROR" ||
    error.problem.code === "MALFORMED_RESPONSE" ||
    error.problem.code === "MALFORMED_REQUEST" ||
    error.problem.code === "UNAVAILABLE"
  );
}

function requestStatusLabel(status: EnrollmentRequest["status"]): string {
  if (status === "Pending") {
    return COPY.programs.requestPending;
  }
  if (status === "Approved") {
    return COPY.programs.requestApproved;
  }
  if (status === "Rejected") {
    return COPY.programs.requestRejected;
  }
  return COPY.programs.requestWithdrawn;
}

// oxlint-disable-next-line eslint/complexity -- this task owns selection, per-item approval, cancellation, and recovery states.
export const ParticipantsTask = () => {
  const {
    program,
    onAttentionRefresh,
    onWorkspaceRefresh,
    onMutationBlockChange,
  } = useWorkspaceTaskContext();
  const programId = program.program_id;
  const canManage = program.capabilities.manage;
  const { state, run, refresh, retry } = useAsyncResource<
    { requests: EnrollmentRequest[]; enrollments: Enrollment[] },
    ParticipantsState
  >(
    () => listEnrollmentSnapshot(programId),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: ({ requests, enrollments }) => ({
        kind: "ready",
        requests,
        enrollments,
      }),
      onError: (error) => {
        if (redirectToLoginIfRequired(error)) {
          return null;
        }
        return { kind: "error", ...participantIssue(error) };
      },
    },
    [programId]
  );
  const [refreshSuccess, setRefreshSuccess] = useState<string>(
    COPY.programs.decisionMade
  );
  const [tab, setTab] = useState<ParticipantTab>("pending");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshingAction, setRefreshingAction] = useState<string | null>(null);
  const [cancelRetry, setCancelRetry] = useState<CancelRetry | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Enrollment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(
    null
  );
  const [pendingQuery, setPendingQuery] = useState("");
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [expandedRequestIds, setExpandedRequestIds] = useState<string[]>([]);
  const [approvalReviewOpen, setApprovalReviewOpen] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalRun, setApprovalRun] = useState<EnrollmentApprovalRun | null>(
    null
  );
  const [approvalRefreshError, setApprovalRefreshError] = useState<
    string | null
  >(null);
  const [unknownMutationIds, setUnknownMutationIds] = useState<
    Record<string, boolean>
  >({});
  const [participantsStale, setParticipantsStale] = useState(false);
  const [assistedBusy, setAssistedBusy] = useState(false);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const addParticipantWasOpenRef = useRef(false);
  // Most recent successful snapshot: a failed refresh after a successful
  // mutation keeps the queue rendered from the last-known data instead of
  // ejecting the operator into the full-panel error state.
  const lastReadyRef = useRef<Extract<
    ParticipantsState,
    { kind: "ready" }
  > | null>(null);
  const mountedRef = useRef(true);
  const approvalSequenceRef = useRef(0);
  const attentionRefreshRef = useRef(onAttentionRefresh);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  useEffect(() => {
    attentionRefreshRef.current = onAttentionRefresh;
  }, [onAttentionRefresh]);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    if (state.kind === "ready") {
      lastReadyRef.current = state;
    }
    if (state.kind === "error" && lastReadyRef.current !== null) {
      setParticipantsStale(true);
    }
  }, [state]);
  useEffect(() => {
    if (addParticipantWasOpenRef.current && !addParticipantOpen) {
      document
        .querySelector<HTMLElement>("#programs-add-participant-trigger")
        ?.focus();
    }
    addParticipantWasOpenRef.current = addParticipantOpen;
  }, [addParticipantOpen]);
  const mutationBusy =
    busyRequestId !== null ||
    busyEnrollmentId !== null ||
    assistedBusy ||
    approvalBusy ||
    refreshingAction !== null;
  const hasUnknownMutation = Object.values(unknownMutationIds).some(Boolean);
  const approvalRunActive = approvalRun?.status === "active";
  const approvalRunBlocked =
    approvalRun?.items.some(
      (item) => item.status === "in_flight" || item.status === "outcome_unknown"
    ) ?? false;
  const mutationBlocked =
    state.kind !== "ready" ||
    hasUnknownMutation ||
    approvalRunActive ||
    approvalRunBlocked ||
    participantsStale;

  const refreshSharedWorkspace = useCallback(async (): Promise<boolean> => {
    if (!onWorkspaceRefresh) {
      return true;
    }
    try {
      return (await onWorkspaceRefresh()) !== undefined;
    } catch {
      return false;
    }
  }, [onWorkspaceRefresh]);

  const reconcileApprovalRun = useCallback(
    async (
      runId: string,
      refreshProjections = true
    ): Promise<EnrollmentApprovalRun | null> => {
      try {
        const result = await reconcileEnrollmentApprovalRun(programId, runId);
        if (!mountedRef.current) {
          return result.run;
        }
        setApprovalRun(result.run);
        const blocked = result.run.items.some(
          (item) =>
            item.status === "in_flight" || item.status === "outcome_unknown"
        );
        if (blocked) {
          setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
          onMutationBlockChange?.(true);
        } else {
          setApprovalRefreshError(null);
          onMutationBlockChange?.(hasUnknownMutation);
        }
        if (refreshProjections) {
          let snapshot: Awaited<ReturnType<typeof refresh>> | undefined;
          try {
            snapshot = await refresh();
          } catch {
            snapshot = undefined;
          }
          const workspaceReconciled = await refreshSharedWorkspace();
          if (!mountedRef.current) {
            return result.run;
          }
          if (workspaceReconciled && snapshot !== undefined) {
            setParticipantsStale(false);
            attentionRefreshRef.current();
          } else {
            setParticipantsStale(true);
            onMutationBlockChange?.(true);
          }
        }
        return result.run;
      } catch (error) {
        if (mountedRef.current) {
          setApprovalRefreshError(
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.programs.programTransportAmbiguous
          );
          onMutationBlockChange?.(true);
        }
        return null;
      }
    },
    [
      hasUnknownMutation,
      onMutationBlockChange,
      programId,
      refresh,
      refreshSharedWorkspace,
    ]
  );

  useEffect(() => {
    if (!canManage) {
      setApprovalRun(null);
      return;
    }
    let active = true;
    const loadApprovalRun = async () => {
      try {
        const { runs } = await listEnrollmentApprovalRuns(programId);
        if (!active || !mountedRef.current) {
          return;
        }
        const activeRun =
          runs.find(
            (candidate) =>
              candidate.status === "active" ||
              approvalRunNeedsReconciliation(candidate)
          ) ?? null;
        setApprovalRun(activeRun);
        if (activeRun) {
          await reconcileApprovalRun(activeRun.run_id);
        }
      } catch (error) {
        if (active && mountedRef.current) {
          setApprovalRefreshError(
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.programs.programTransportAmbiguous
          );
        }
      }
    };
    void loadApprovalRun();
    return () => {
      active = false;
    };
  }, [canManage, programId, reconcileApprovalRun]);

  const reconcileUnknownParticipants = async (ids: string[]) => {
    let workspaceReconciled = true;
    if (onWorkspaceRefresh) {
      try {
        workspaceReconciled = (await onWorkspaceRefresh()) !== undefined;
      } catch {
        workspaceReconciled = false;
      }
    }
    const snapshot = await run();
    const reconciled = workspaceReconciled && snapshot !== undefined;
    setUnknownMutationIds((current) => {
      const idsToClear = new Set(ids);
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => !idsToClear.has(id))
      );
      if (!reconciled) {
        for (const id of ids) {
          next[id] = true;
        }
      }
      return next;
    });
    onMutationBlockChange?.(!reconciled);
    if (reconciled) {
      setParticipantsStale(false);
      setNotice(COPY.programs.workspaceReconciled);
      announce(COPY.programs.workspaceReconciled);
    } else {
      setParticipantsStale(true);
      setApprovalRefreshError(COPY.programs.programTransportAmbiguous);
      announce(COPY.programs.programTransportAmbiguous);
    }
  };

  useEffect(() => {
    if (refreshingAction === null || state.kind === "loading") {
      return;
    }
    if (state.kind === "ready") {
      setCancelRetry(null);
      setNotice(refreshSuccess);
      announce(refreshSuccess);
      setRefreshingAction(null);
    } else if (lastReadyRef.current !== null) {
      const staleMessage = `${refreshSuccess} ${COPY.programs.workspaceParticipantsSavedStale}`;
      setNotice(staleMessage);
      announce(staleMessage);
      setRefreshingAction(null);
    }
  }, [refreshSuccess, refreshingAction, state]);

  useEffect(() => {
    if (state.kind !== "ready") {
      return;
    }
    const pendingIds = new Set(
      state.requests
        .filter((request) => request.status === "Pending")
        .map((request) => request.request_id)
    );
    setSelectedRequestIds((current) =>
      current.filter((requestId) => pendingIds.has(requestId))
    );
  }, [state]);

  const queue = useMemo(() => {
    const snapshot =
      state.kind === "ready"
        ? state
        : state.kind === "error" && lastReadyRef.current
          ? lastReadyRef.current
          : null;
    if (snapshot === null) {
      return null;
    }
    const active = snapshot.enrollments.filter(
      ({ status }) => status === "Active"
    );
    // Every enrollment row (Active or Cancelled) tells the Approved
    // request's story once; an Approved request stays out of history as
    // long as ANY linked enrollment row exists.
    const enrolledRequestIds = new Set(
      snapshot.enrollments.flatMap(({ request_id }) =>
        request_id ? [request_id] : []
      )
    );
    const pending = snapshot.requests.filter(
      ({ status }) => status === "Pending"
    );
    const historyRequests = snapshot.requests.filter(
      ({ status, request_id }) =>
        status !== "Pending" &&
        !(status === "Approved" && enrolledRequestIds.has(request_id))
    );
    const historyEnrollments = snapshot.enrollments.filter(
      ({ status }) => status === "Cancelled"
    );
    return {
      pending,
      active,
      historyRequests,
      historyEnrollments,
      counts: {
        pending: pending.length,
        active: active.length,
        history: historyRequests.length + historyEnrollments.length,
      },
    };
  }, [state]);

  useEffect(() => {
    if (queue?.counts.pending === 0) {
      setTab((current) => (current === "pending" ? "active" : current));
    }
  }, [queue]);

  const visiblePending = useMemo(() => {
    if (!queue) {
      return [];
    }
    const query = pendingQuery.trim().toLocaleLowerCase();
    if (!query) {
      return queue.pending;
    }
    return queue.pending.filter((request) =>
      [request.member_name, request.member_username, request.member_user_id]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [pendingQuery, queue]);

  const selectedPendingRequests = useMemo(() => {
    if (!queue) {
      return [];
    }
    const selected = new Set(selectedRequestIds);
    return queue.pending.filter((request) => selected.has(request.request_id));
  }, [queue, selectedRequestIds]);

  const toggleRequestSelection = (requestId: string, selected: boolean) => {
    setSelectedRequestIds((current) => {
      if (selected) {
        return current.includes(requestId) ? current : [...current, requestId];
      }
      return current.filter((id) => id !== requestId);
    });
  };

  const toggleVisibleSelection = (selected: boolean) => {
    const visibleIds = visiblePending.map((request) => request.request_id);
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      for (const requestId of visibleIds) {
        if (selected) {
          next.add(requestId);
        } else {
          next.delete(requestId);
        }
      }
      return [...next];
    });
  };

  /* oxlint-disable eslint/complexity -- explicit sequential recovery owns the run state transitions. */
  const runApprovalSequence = useCallback(
    async (runId: string) => {
      if (!mountedRef.current) {
        return;
      }
      const sequence = approvalSequenceRef.current + 1;
      approvalSequenceRef.current = sequence;
      setApprovalBusy(true);
      setApprovalRefreshError(null);
      setNotice(null);
      let current: EnrollmentApprovalRun | null = approvalRun;
      try {
        while (mountedRef.current && approvalSequenceRef.current === sequence) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- approvals are deliberately settled one at a time before the next claim.
          const result = await continueEnrollmentApprovalRun(
            programId,
            runId,
            crypto.randomUUID()
          );
          if (!mountedRef.current || approvalSequenceRef.current !== sequence) {
            return;
          }
          current = result.run;
          setApprovalRun(current);
          if (result.item?.status === "completed") {
            onAttentionRefresh();
          }
          if (
            result.item === null ||
            approvalRunNeedsReconciliation(current) ||
            !approvalRunHasUnresolvedWork(current)
          ) {
            break;
          }
          // Each request is settled by the Worker before this explicit
          // continuation schedules the next one.
        }
        if (!mountedRef.current || !current) {
          return;
        }
        if (approvalRunNeedsReconciliation(current)) {
          const message = APPROVAL_COPY.reconciliationRequired;
          setApprovalRefreshError(message);
          setNotice(message);
          announce(message);
          onMutationBlockChange?.(true);
        } else if (current.status === "cancelled") {
          setNotice(APPROVAL_COPY.cancelled);
          announce(APPROVAL_COPY.cancelled);
        } else if (approvalRunHasUnresolvedWork(current)) {
          setNotice(
            APPROVAL_COPY.partial(
              current.items.filter(
                (item) =>
                  item.status === "completed" || item.status === "failed"
              ).length,
              current.items.length,
              current.items.filter((item) => approvalItemNeedsRetry(item))
                .length
            )
          );
        } else {
          setNotice(APPROVAL_COPY.complete);
          announce(APPROVAL_COPY.complete);
        }
        if (!(await refreshSharedWorkspace())) {
          setParticipantsStale(true);
        }
        const snapshot = await refresh();
        if (snapshot === undefined) {
          setParticipantsStale(true);
        }
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }
        if (isUnknownMutationOutcome(error)) {
          setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
          setNotice(APPROVAL_COPY.reconciliationRequired);
          announce(APPROVAL_COPY.reconciliationRequired);
          onMutationBlockChange?.(true);
          // The run id is known even when the acknowledgement was not. A
          // read/reconcile may confirm a committed Enrollment without replay.
          await reconcileApprovalRun(runId);
        } else if (!redirectToLoginIfRequired(error)) {
          const message =
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.error.networkError;
          setApprovalRefreshError(message);
          announce(message);
        }
      } finally {
        if (mountedRef.current) {
          setApprovalBusy(false);
        }
      }
    },
    [
      approvalRun,
      onAttentionRefresh,
      onMutationBlockChange,
      programId,
      reconcileApprovalRun,
      refresh,
      refreshSharedWorkspace,
    ]
  );
  /* oxlint-enable eslint/complexity */

  const handleApproveSelected = async () => {
    if (
      selectedPendingRequests.length === 0 ||
      mutationBlocked ||
      approvalRun?.status === "active"
    ) {
      return;
    }
    setApprovalReviewOpen(false);
    setApprovalRefreshError(null);
    setSelectedRequestIds([]);
    setNotice(null);
    try {
      const started = await startEnrollmentApprovalRun(
        programId,
        selectedPendingRequests.map((request) => request.request_id),
        crypto.randomUUID()
      );
      if (!mountedRef.current) {
        return;
      }
      setApprovalRun(started.run);
      if (started.created) {
        await runApprovalSequence(started.run.run_id);
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      if (isUnknownMutationOutcome(error)) {
        setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
        setNotice(APPROVAL_COPY.reconciliationRequired);
        announce(APPROVAL_COPY.reconciliationRequired);
        try {
          const { runs } = await listEnrollmentApprovalRuns(programId);
          if (!mountedRef.current) {
            return;
          }
          const recovered =
            runs.find((candidate) => candidate.status === "active") ?? null;
          if (recovered) {
            setApprovalRun(recovered);
            await reconcileApprovalRun(recovered.run_id);
          }
        } catch {
          // The next explicit refresh can retry the durable run lookup.
        }
      } else if (!redirectToLoginIfRequired(error)) {
        const message =
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.error.networkError;
        setApprovalRefreshError(message);
        announce(message);
      }
    }
  };

  // oxlint-disable-next-line eslint/complexity -- cancellation also reconciles and refreshes an in-flight run.
  const handleCancelApprovalRun = async () => {
    const activeRun = approvalRun;
    if (!activeRun || activeRun.status !== "active") {
      return;
    }
    approvalSequenceRef.current += 1;
    setApprovalBusy(true);
    setApprovalRefreshError(null);
    try {
      const result = await cancelEnrollmentApprovalRun(
        programId,
        activeRun.run_id,
        crypto.randomUUID()
      );
      if (!mountedRef.current) {
        return;
      }
      let finalRun = result.run;
      if (approvalRunNeedsReconciliation(finalRun)) {
        setApprovalRun(finalRun);
        setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
        finalRun =
          (await reconcileApprovalRun(activeRun.run_id, false)) ?? finalRun;
        if (!mountedRef.current) {
          return;
        }
      }
      setApprovalRun(finalRun);
      if (approvalRunNeedsReconciliation(finalRun)) {
        setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
      } else {
        setApprovalRefreshError(null);
      }
      setNotice(APPROVAL_COPY.cancelled);
      announce(APPROVAL_COPY.cancelled);
      onAttentionRefresh();
      const workspaceReconciled = await refreshSharedWorkspace();
      if (!mountedRef.current) {
        return;
      }
      const snapshot = await refresh();
      if (!mountedRef.current) {
        return;
      }
      if (!workspaceReconciled || snapshot === undefined) {
        setParticipantsStale(true);
      }
      onMutationBlockChange?.(
        approvalRunNeedsReconciliation(finalRun) || hasUnknownMutation
      );
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      if (isUnknownMutationOutcome(error)) {
        setApprovalRefreshError(APPROVAL_COPY.reconciliationRequired);
        setNotice(APPROVAL_COPY.reconciliationRequired);
        announce(APPROVAL_COPY.reconciliationRequired);
        const reconciled = await reconcileApprovalRun(activeRun.run_id, false);
        if (!mountedRef.current || !reconciled) {
          return;
        }
        const workspaceReconciled = await refreshSharedWorkspace();
        if (!mountedRef.current) {
          return;
        }
        const snapshot = await refresh();
        if (!mountedRef.current) {
          return;
        }
        if (!workspaceReconciled || snapshot === undefined) {
          setParticipantsStale(true);
        }
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setApprovalRefreshError(message);
      announce(message);
    } finally {
      if (mountedRef.current) {
        setApprovalBusy(false);
      }
    }
  };

  const handleDecision = async (
    request: EnrollmentRequest,
    action: "Approved" | "Rejected"
  ) => {
    if (mutationBlocked || unknownMutationIds[request.request_id]) {
      return;
    }
    setBusyRequestId(request.request_id);
    setNotice(null);
    setActionErrors((current) => {
      const { [request.request_id]: _, ...next } = current;
      return next;
    });
    try {
      await decideEnrollmentRequest(
        programId,
        request.request_id,
        action,
        notes[request.request_id],
        request.request_version
      );
      setSelectedRequestIds((current) =>
        current.filter((id) => id !== request.request_id)
      );
      onAttentionRefresh();
      if (!(await refreshSharedWorkspace())) {
        setParticipantsStale(true);
      }
      setRefreshSuccess(COPY.programs.decisionMade);
      setRefreshingAction(request.request_id);
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      if (isUnknownMutationOutcome(error)) {
        onMutationBlockChange?.(true);
        setUnknownMutationIds((current) => ({
          ...current,
          [request.request_id]: true,
        }));
        setActionErrors((current) => ({
          ...current,
          [request.request_id]: COPY.programs.programTransportAmbiguous,
        }));
        setRefreshSuccess(COPY.programs.workspaceReconciled);
        setRefreshingAction(request.request_id);
        announce(COPY.programs.programTransportAmbiguous);
        void reconcileUnknownParticipants([request.request_id]);
        return;
      }
      const issue = participantIssue(error);
      setActionErrors((current) => ({
        ...current,
        [request.request_id]: issue.message,
      }));
      announce(issue.message);
    } finally {
      setBusyRequestId(null);
    }
  };
  const handleCancelEnrollment = async (
    enrollment: Enrollment,
    reason: string,
    retryKey?: string
  ) => {
    if (mutationBlocked || unknownMutationIds[enrollment.enrollment_id]) {
      return;
    }
    const idempotencyKey =
      retryKey ??
      (cancelRetry?.enrollmentId === enrollment.enrollment_id
        ? cancelRetry.idempotencyKey
        : crypto.randomUUID());
    setCancelRetry({
      enrollmentId: enrollment.enrollment_id,
      idempotencyKey,
      reason,
    });
    setBusyEnrollmentId(enrollment.enrollment_id);
    setNotice(null);
    setActionErrors((current) => {
      const { [enrollment.enrollment_id]: _, ...next } = current;
      return next;
    });
    try {
      await cancelEnrollment(
        programId,
        enrollment.enrollment_id,
        idempotencyKey,
        reason
      );
      onAttentionRefresh();
      if (!(await refreshSharedWorkspace())) {
        setParticipantsStale(true);
      }
      setRefreshSuccess(COPY.programs.enrollmentCancelledNotice);
      setRefreshingAction(enrollment.enrollment_id);
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        setCancelRetry(null);
        return;
      }
      if (isUnknownMutationOutcome(error)) {
        onMutationBlockChange?.(true);
        setCancelRetry(null);
        setUnknownMutationIds((current) => ({
          ...current,
          [enrollment.enrollment_id]: true,
        }));
        setActionErrors((current) => ({
          ...current,
          [enrollment.enrollment_id]: COPY.programs.programTransportAmbiguous,
        }));
        setRefreshSuccess(COPY.programs.workspaceReconciled);
        setRefreshingAction(enrollment.enrollment_id);
        announce(COPY.programs.programTransportAmbiguous);
        void reconcileUnknownParticipants([enrollment.enrollment_id]);
        return;
      }
      if (!isAmbiguousCancelError(error)) {
        setCancelRetry(null);
      }
      const issue = participantIssue(error);
      setActionErrors((current) => ({
        ...current,
        [enrollment.enrollment_id]: issue.message,
      }));
      announce(issue.message);
    } finally {
      setBusyEnrollmentId(null);
    }
  };

  const openCancelDialog = (enrollment: Enrollment) => {
    setCancelTarget(enrollment);
    setCancelReason(
      cancelRetry?.enrollmentId === enrollment.enrollment_id
        ? cancelRetry.reason
        : ""
    );
    setCancelReasonError(null);
  };

  const confirmCancelEnrollment = (event: MouseEvent<HTMLButtonElement>) => {
    const enrollment = cancelTarget;
    const reason = cancelReason.trim();
    if (!enrollment) {
      return;
    }
    if (!reason) {
      event.preventDefault();
      setCancelReasonError(APPROVAL_COPY.managerCancelReasonRequired);
      return;
    }
    setCancelTarget(null);
    setCancelReasonError(null);
    void handleCancelEnrollment(enrollment, reason);
  };

  const handleAssisted = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationBlocked || unknownMutationIds.assisted) {
      return;
    }
    const memberUserId = String(
      new FormData(event.currentTarget).get("member_user_id") ?? ""
    ).trim();
    if (!memberUserId) {
      setAssistedError(COPY.programs.memberSearchHint);
      return;
    }
    setAssistedBusy(true);
    setAssistedError(null);
    setNotice(null);
    try {
      await assistedEnroll(programId, memberUserId);
      onAttentionRefresh();
      if (!(await refreshSharedWorkspace())) {
        setParticipantsStale(true);
      }
      setAddParticipantOpen(false);
      setRefreshSuccess(COPY.programs.assistedSubmitted);
      setRefreshingAction("assisted");
      void run();
    } catch (error) {
      if (redirectToLoginIfRequired(error)) {
        return;
      }
      if (isUnknownMutationOutcome(error)) {
        onMutationBlockChange?.(true);
        setUnknownMutationIds((current) => ({ ...current, assisted: true }));
        setAssistedError(COPY.programs.programTransportAmbiguous);
        setRefreshSuccess(COPY.programs.workspaceReconciled);
        setRefreshingAction("assisted");
        announce(COPY.programs.programTransportAmbiguous);
        void reconcileUnknownParticipants(["assisted"]);
        return;
      }
      const issue = participantIssue(error);
      setAssistedError(issue.message);
      announce(issue.message);
    } finally {
      setAssistedBusy(false);
    }
  };
  const refreshParticipants = async () => {
    if (approvalRun && approvalRunNeedsReconciliation(approvalRun)) {
      const reconciled = await reconcileApprovalRun(approvalRun.run_id);
      if (!reconciled || approvalRunNeedsReconciliation(reconciled)) {
        return;
      }
      if (hasUnknownMutation) {
        await reconcileUnknownParticipants(Object.keys(unknownMutationIds));
      }
      return;
    }
    if (hasUnknownMutation) {
      await reconcileUnknownParticipants(Object.keys(unknownMutationIds));
      return;
    }
    setActionErrors({});
    setNotice(null);
    setApprovalRefreshError(null);
    setRefreshSuccess(COPY.programs.workspaceParticipantsRefreshSuccess);
    setRefreshingAction("refresh");
    const snapshot = await run();
    const workspaceReconciled = await refreshSharedWorkspace();
    if (workspaceReconciled && snapshot !== undefined) {
      setParticipantsStale(false);
      onMutationBlockChange?.(false);
    } else {
      setParticipantsStale(true);
    }
  };

  const renderPending = () => {
    if (queue === null || queue.pending.length === 0) {
      return (
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.pending} />
      );
    }
    const visibleIds = visiblePending.map((request) => request.request_id);
    const selectedVisibleCount = visibleIds.filter((requestId) =>
      selectedRequestIds.includes(requestId)
    ).length;
    const allVisibleSelected =
      visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    return (
      <div className="grid min-w-0 gap-3">
        {canManage && (
          <div className="grid min-w-0 gap-3 rounded-[var(--screen-radius-card)] border border-[var(--screen-line)] bg-[var(--screen-surface-soft)] p-3">
            <ScreenField
              htmlFor="participants-pending-search"
              label={APPROVAL_COPY.searchLabel}
            >
              <Input
                id="participants-pending-search"
                className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                type="search"
                value={pendingQuery}
                placeholder={APPROVAL_COPY.searchPlaceholder}
                onChange={(event) => setPendingQuery(event.target.value)}
                disabled={approvalBusy || approvalRun?.status === "active"}
              />
            </ScreenField>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Checkbox
                checked={
                  allVisibleSelected
                    ? true
                    : selectedVisibleCount > 0
                      ? "indeterminate"
                      : false
                }
                aria-label={APPROVAL_COPY.selectVisible}
                onCheckedChange={(checked) =>
                  toggleVisibleSelection(checked === true)
                }
                disabled={
                  approvalBusy ||
                  approvalRun?.status === "active" ||
                  visibleIds.length === 0
                }
              />
              <span className="min-w-0 wrap-anywhere text-sm text-[var(--screen-muted)]">
                {APPROVAL_COPY.selectVisible} ({selectedVisibleCount}/
                {visibleIds.length})
              </span>
              {selectedPendingRequests.length > 0 && (
                <span className="ml-auto min-w-0 wrap-anywhere text-sm font-semibold text-[var(--screen-ink)]">
                  {APPROVAL_COPY.selected(selectedPendingRequests.length)}
                </span>
              )}
            </div>
            {selectedPendingRequests.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
                <Button
                  type="button"
                  className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                  onClick={() => setApprovalReviewOpen(true)}
                  disabled={mutationBusy || approvalRun?.status === "active"}
                >
                  {APPROVAL_COPY.reviewSelected}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface)]"
                  onClick={() => setSelectedRequestIds([])}
                  disabled={mutationBusy || approvalRun?.status === "active"}
                >
                  {APPROVAL_COPY.clear}
                </Button>
              </div>
            )}
          </div>
        )}
        {visiblePending.length === 0 ? (
          <ScreenState kind="empty" title={APPROVAL_COPY.noSearchMatches} />
        ) : (
          <ScreenRowList aria-label={COPY.programs.requests}>
            <ul className="m-0 grid min-w-0 list-none gap-0 p-0">
              {visiblePending.map((request) => {
                const member = memberLabel(request);
                const selected = selectedRequestIds.includes(
                  request.request_id
                );
                const expanded = expandedRequestIds.includes(
                  request.request_id
                );
                return (
                  <li key={request.request_id} className="min-w-0">
                    <ScreenRow
                      className="items-start flex-wrap"
                      aria-busy={busyRequestId === request.request_id}
                    >
                      {canManage && (
                        <Checkbox
                          checked={selected}
                          aria-label={`${selected ? APPROVAL_COPY.deselect : APPROVAL_COPY.select} ${member}`}
                          onCheckedChange={(checked) =>
                            toggleRequestSelection(
                              request.request_id,
                              checked === true
                            )
                          }
                          disabled={
                            mutationBusy || approvalRun?.status === "active"
                          }
                        />
                      )}
                      <ScreenRowMain className="min-w-0 flex-1">
                        <ScreenRowTitle>{member}</ScreenRowTitle>
                        <ScreenRowMeta>
                          <ScreenStatus tone="pending">
                            {requestStatusLabel(request.status)}
                          </ScreenStatus>
                          <span className="ml-2">
                            {formatEventTime(request.submitted_at)}
                          </span>
                        </ScreenRowMeta>
                      </ScreenRowMain>
                      {canManage && (
                        <div className="flex min-w-0 basis-full flex-wrap items-center gap-[var(--screen-utility-gap)]">
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-fit text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedRequestIds((current) =>
                                expanded
                                  ? current.filter(
                                      (id) => id !== request.request_id
                                    )
                                  : [...current, request.request_id]
                              )
                            }
                            disabled={mutationBusy}
                          >
                            {expanded
                              ? APPROVAL_COPY.hideDetails
                              : APPROVAL_COPY.details}
                          </Button>
                          <Button
                            type="button"
                            className="w-fit border-[var(--screen-success)] bg-transparent text-[var(--screen-success)] hover:bg-[var(--screen-success-surface)]"
                            variant="outline"
                            onClick={() =>
                              void handleDecision(request, "Approved")
                            }
                            disabled={
                              mutationBusy ||
                              approvalRun?.status === "active" ||
                              mutationBlocked ||
                              unknownMutationIds[request.request_id] === true
                            }
                          >
                            {COPY.programs.approve}
                          </Button>
                          <Button
                            type="button"
                            className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                            variant="outline"
                            onClick={() =>
                              void handleDecision(request, "Rejected")
                            }
                            disabled={
                              mutationBusy ||
                              approvalRun?.status === "active" ||
                              mutationBlocked ||
                              unknownMutationIds[request.request_id] === true
                            }
                          >
                            {COPY.programs.reject}
                          </Button>
                        </div>
                      )}
                      {expanded && canManage && (
                        <ScreenField
                          className="basis-full"
                          htmlFor={`participants-note-${request.request_id}`}
                          label={COPY.programs.decisionNote}
                        >
                          <Textarea
                            id={`participants-note-${request.request_id}`}
                            className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
                            value={notes[request.request_id] ?? ""}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [request.request_id]: event.target.value,
                              }))
                            }
                            disabled={mutationBusy}
                          />
                        </ScreenField>
                      )}
                      {actionErrors[request.request_id] && (
                        <Alert className="basis-full" variant="destructive">
                          {actionErrors[request.request_id]}
                        </Alert>
                      )}
                    </ScreenRow>
                  </li>
                );
              })}
            </ul>
          </ScreenRowList>
        )}
      </div>
    );
  };

  const renderActive = () => {
    if (queue === null || queue.active.length === 0) {
      return (
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.active} />
      );
    }
    return (
      <ScreenRowList>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
          aria-label={COPY.programs.workspaceActiveParticipants}
        >
          {queue.active.map((enrollment) => {
            const request =
              state.kind === "ready"
                ? state.requests.find(
                    ({ request_id }) => request_id === enrollment.request_id
                  )
                : undefined;
            return (
              <li key={enrollment.enrollment_id} className="min-w-0">
                <ScreenRow
                  className="items-start flex-wrap"
                  aria-busy={busyEnrollmentId === enrollment.enrollment_id}
                >
                  <ScreenRowMain>
                    <ScreenRowTitle>
                      {enrollment.member_name ??
                        enrollment.member_username ??
                        enrollment.member_user_id}
                    </ScreenRowTitle>
                    <ScreenRowMeta>
                      <ScreenStatus tone="success">
                        {COPY.programs.enrollmentActive}
                      </ScreenStatus>
                      {request && (
                        <span className="ml-2">
                          {requestStatusLabel(request.status)}
                        </span>
                      )}
                      <span className="ml-2">
                        {formatEventTime(enrollment.enrolled_at)}
                      </span>
                    </ScreenRowMeta>
                  </ScreenRowMain>
                  {canManage && (
                    <div className="flex min-w-0 basis-full flex-wrap items-center gap-[var(--screen-utility-gap)]">
                      <Button
                        type="button"
                        className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
                        variant="outline"
                        onClick={() => openCancelDialog(enrollment)}
                        disabled={
                          mutationBusy ||
                          mutationBlocked ||
                          cancelRetry?.enrollmentId ===
                            enrollment.enrollment_id ||
                          unknownMutationIds[enrollment.enrollment_id] === true
                        }
                      >
                        {COPY.programs.cancelEnrollment}
                      </Button>
                    </div>
                  )}
                  {actionErrors[enrollment.enrollment_id] && (
                    <Alert className="basis-full" variant="destructive">
                      {actionErrors[enrollment.enrollment_id]}
                      {cancelRetry?.enrollmentId ===
                        enrollment.enrollment_id && (
                        <Button
                          type="button"
                          className="mt-2 w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                          variant="outline"
                          onClick={() =>
                            void handleCancelEnrollment(
                              enrollment,
                              cancelRetry.reason,
                              cancelRetry.idempotencyKey
                            )
                          }
                          disabled={mutationBusy}
                        >
                          {COPY.error.retry}
                        </Button>
                      )}
                    </Alert>
                  )}
                </ScreenRow>
              </li>
            );
          })}
        </ul>
      </ScreenRowList>
    );
  };

  const renderHistory = () => {
    if (queue === null || queue.counts.history === 0) {
      return (
        <ScreenState kind="empty" title={COPY.programs.tabsEmpty.history} />
      );
    }
    return (
      <ScreenRowList>
        <ul
          className="m-0 grid min-w-0 list-none gap-0 p-0"
          aria-label={COPY.programs.enrollmentHistory}
        >
          {queue.historyRequests.map((request) => (
            <li key={`request-${request.request_id}`} className="min-w-0">
              <ScreenRow>
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {request.member_name ??
                      request.member_username ??
                      request.member_user_id}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {request.decision_note ??
                      formatEventTime(
                        request.decided_at ?? request.submitted_at
                      )}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenStatus
                  tone={request.status === "Rejected" ? "danger" : "neutral"}
                >
                  {requestStatusLabel(request.status)}
                </ScreenStatus>
              </ScreenRow>
            </li>
          ))}
          {queue.historyEnrollments.map((enrollment) => (
            <li
              key={`enrollment-${enrollment.enrollment_id}`}
              className="min-w-0"
            >
              <ScreenRow>
                <ScreenRowMain>
                  <ScreenRowTitle>
                    {enrollment.member_name ??
                      enrollment.member_username ??
                      enrollment.member_user_id}
                  </ScreenRowTitle>
                  <ScreenRowMeta>
                    {formatEventTime(
                      enrollment.cancelled_at ?? enrollment.enrolled_at
                    )}
                  </ScreenRowMeta>
                </ScreenRowMain>
                <ScreenStatus tone="neutral">
                  {COPY.programs.enrollmentCancelled}
                </ScreenStatus>
              </ScreenRow>
            </li>
          ))}
        </ul>
      </ScreenRowList>
    );
  };

  const renderApprovalRun = () => {
    if (approvalRun === null) {
      return null;
    }
    const completed = approvalRun.items.filter(
      ({ status }) => status === "completed" || status === "failed"
    ).length;
    const unresolved = approvalRun.items.filter(
      (item) =>
        item.status === "not_started" ||
        item.status === "in_flight" ||
        item.status === "outcome_unknown" ||
        approvalItemNeedsRetry(item)
    ).length;
    const progress = approvalBusy
      ? APPROVAL_COPY.processing(completed, approvalRun.items.length)
      : approvalRun.status === "cancelled"
        ? APPROVAL_COPY.cancelled
        : approvalRunNeedsReconciliation(approvalRun)
          ? APPROVAL_COPY.reconciliationRequired
          : unresolved > 0
            ? APPROVAL_COPY.partial(
                completed,
                approvalRun.items.length,
                unresolved
              )
            : APPROVAL_COPY.complete;
    return (
      <section
        className="grid min-w-0 gap-3 rounded-[var(--screen-radius-card)] border border-[var(--screen-line)] bg-[var(--screen-surface-soft)] p-3"
        aria-label="報名審批結果"
      >
        <p
          className="m-0 wrap-anywhere text-sm font-semibold text-[var(--screen-ink)]"
          aria-live="polite"
        >
          {progress}
        </p>
        <ul
          className="m-0 grid min-w-0 list-none gap-2 p-0"
          aria-label={APPROVAL_COPY.selectedList}
        >
          {approvalRun.items.map((item) => (
            <li
              key={item.item_id}
              className="flex min-w-0 flex-wrap items-start gap-2"
            >
              <span className="min-w-0 flex-1 wrap-anywhere text-sm text-[var(--screen-ink)]">
                {memberLabel(item)}
              </span>
              <ScreenStatus tone={approvalStatusTone(approvalItemStatus(item))}>
                {approvalStatusMessage(approvalItemStatus(item))}
              </ScreenStatus>
              {approvalItemMessage(item) && (
                <span className="basis-full wrap-anywhere text-sm text-[var(--screen-muted)]">
                  {approvalItemMessage(item)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          {approvalRun.status === "active" &&
            !approvalRunNeedsReconciliation(approvalRun) &&
            approvalRunHasUnresolvedWork(approvalRun) && (
              <Button
                type="button"
                className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                onClick={() => void runApprovalSequence(approvalRun.run_id)}
                disabled={approvalBusy}
              >
                {APPROVAL_COPY.continueRemaining}
              </Button>
            )}
          {approvalRunNeedsReconciliation(approvalRun) && (
            <Button
              type="button"
              variant="outline"
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface)]"
              onClick={() => void reconcileApprovalRun(approvalRun.run_id)}
              disabled={approvalBusy}
            >
              {APPROVAL_COPY.reconcile}
            </Button>
          )}
          {approvalRun.status === "active" && (
            <Button
              type="button"
              variant="outline"
              className="w-fit border-[var(--screen-danger)] bg-transparent text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)]"
              onClick={() => void handleCancelApprovalRun()}
              disabled={approvalBusy}
            >
              {APPROVAL_COPY.cancelRun}
            </Button>
          )}
        </div>
        {approvalRefreshError !== null && (
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
            <Alert tone="warning" announcement="polite">
              {approvalRefreshError}
            </Alert>
            <Button
              type="button"
              variant="outline"
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface)]"
              onClick={refreshParticipants}
              disabled={mutationBusy}
            >
              {COPY.programs.workspaceParticipantsRefresh}
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <ScreenSection
      title={COPY.programs.workspaceTaskParticipants}
      headingId="programs-workspace-participants-title"
      aria-busy={state.kind === "loading"}
      action={
        canManage ? (
          <Button
            id="programs-add-participant-trigger"
            type="button"
            className="w-fit bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
            onClick={() => {
              setAssistedError(null);
              setAddParticipantOpen(true);
            }}
            disabled={mutationBusy || mutationBlocked}
          >
            {COPY.programs.workspaceParticipantsAdd}
          </Button>
        ) : undefined
      }
    >
      <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
        {COPY.programs.workspaceTaskParticipantsLead}
      </p>
      {notice !== null && (
        <Alert tone="success" announcement="polite">
          {notice}
        </Alert>
      )}
      {renderApprovalRun()}
      {(participantsStale ||
        (state.kind === "error" && lastReadyRef.current !== null)) && (
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--screen-utility-gap)]">
          <Alert tone="warning" announcement="polite">
            {COPY.programs.workspaceParticipantsRefreshFailed}
          </Alert>
          <Button
            className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
            variant="outline"
            type="button"
            onClick={refreshParticipants}
          >
            {COPY.programs.workspaceParticipantsRefresh}
          </Button>
        </div>
      )}
      <AlertDialog
        open={approvalReviewOpen}
        onOpenChange={setApprovalReviewOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{APPROVAL_COPY.reviewTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {APPROVAL_COPY.reviewBody(selectedPendingRequests.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul
            className="m-0 grid min-w-0 list-none gap-2 p-0"
            aria-label={APPROVAL_COPY.selectedList}
          >
            {selectedPendingRequests.map((request) => (
              <li
                key={request.request_id}
                className="min-w-0 wrap-anywhere text-sm text-[var(--screen-ink)]"
              >
                {memberLabel(request)}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.attention.close}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleApproveSelected()}
              disabled={
                selectedPendingRequests.length === 0 ||
                mutationBlocked ||
                approvalRun?.status === "active"
              }
            >
              {APPROVAL_COPY.confirmApprove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReasonError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {APPROVAL_COPY.managerCancelTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? APPROVAL_COPY.managerCancelBody(memberLabel(cancelTarget))
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ScreenField
            htmlFor="participants-manager-cancel-reason"
            label={APPROVAL_COPY.managerCancelReason}
          >
            <Textarea
              id="participants-manager-cancel-reason"
              className="border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-base"
              placeholder={APPROVAL_COPY.managerCancelReasonPlaceholder}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              aria-invalid={cancelReasonError !== null}
            />
          </ScreenField>
          {cancelReasonError !== null && (
            <Alert variant="destructive">{cancelReasonError}</Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.attention.close}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelEnrollment}
              disabled={mutationBusy || mutationBlocked}
            >
              {APPROVAL_COPY.managerCancelConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet open={addParticipantOpen} onOpenChange={setAddParticipantOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-[var(--screen-radius-sheet)] border-[var(--screen-line)] bg-[var(--screen-surface)] p-0 text-[var(--screen-ink)] shadow-[var(--screen-shadow-sheet)]"
        >
          <SheetHeader className="relative border-b border-[var(--screen-line)] px-[var(--screen-gutter)] py-3">
            <SheetTitle className="pr-12 text-xl font-bold text-[var(--screen-ink)]">
              {COPY.programs.workspaceParticipantsAdd}
            </SheetTitle>
            <SheetDescription className="text-[var(--screen-muted)]">
              {COPY.programs.assistedEnrollAck}
            </SheetDescription>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                aria-label={COPY.attention.close}
              >
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </SheetHeader>
          <ScreenEditor
            className="gap-4 overflow-y-auto px-[var(--screen-gutter)] py-4"
            onSubmit={handleAssisted}
          >
            <MemberPicker
              programId={programId}
              name="member_user_id"
              label={COPY.programs.memberId}
              placeholder={COPY.programs.memberIdPlaceholder}
              excludeEnrolled
            />
            {assistedError !== null && (
              <Alert variant="destructive">{assistedError}</Alert>
            )}
            <SheetFooter className="grid grid-cols-[1fr_1.2fr] gap-[var(--screen-utility-gap)] p-0">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                >
                  {COPY.attention.close}
                </Button>
              </SheetClose>
              <Button
                type="submit"
                className="bg-[var(--screen-accent)] text-white hover:bg-[var(--screen-accent-deep)]"
                disabled={
                  mutationBusy ||
                  mutationBlocked ||
                  unknownMutationIds.assisted === true
                }
              >
                {assistedBusy
                  ? COPY.programs.submitting
                  : COPY.programs.assistedEnroll}
              </Button>
            </SheetFooter>
          </ScreenEditor>
        </SheetContent>
      </Sheet>
      {state.kind === "loading" && (
        <ScreenLoadingRows
          label={COPY.programs.workspaceTaskParticipantsLoading}
        />
      )}
      {state.kind === "error" && lastReadyRef.current === null && (
        <ScreenState
          kind={state.failure === "forbidden" ? "forbidden" : "error"}
          title={state.message}
          action={
            <Button
              className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
              variant="outline"
              type="button"
              onClick={() => {
                setActionErrors({});
                retry();
              }}
            >
              {COPY.programs.workspaceTaskParticipantsRetry}
            </Button>
          }
        />
      )}
      {queue !== null && (
        <>
          <ScreenTabs
            aria-label={COPY.programs.workspaceTaskParticipants}
            role="tablist"
          >
            {(
              [
                ["pending", COPY.programs.tabsPending, queue.counts.pending],
                ["active", COPY.programs.tabsActive, queue.counts.active],
                ["history", COPY.programs.tabsHistory, queue.counts.history],
              ] as const
            ).map(([value, label, count]) => (
              <ScreenTab
                key={value}
                id={`participants-${value}-tab`}
                role="tab"
                aria-controls={`participants-${value}-panel`}
                aria-selected={tab === value}
                selected={tab === value}
                onClick={() => setTab(value)}
              >
                {label} ({count})
              </ScreenTab>
            ))}
          </ScreenTabs>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-[var(--screen-utility-gap)]">
            {state.kind !== "error" && (
              <Button
                type="button"
                className="w-fit border-[var(--screen-line-strong)] bg-transparent text-[var(--screen-ink)] hover:bg-[var(--screen-surface-soft)]"
                variant="outline"
                onClick={refreshParticipants}
                disabled={mutationBusy}
              >
                {COPY.programs.workspaceParticipantsRefresh}
              </Button>
            )}
          </div>
          {queue.counts.pending + queue.counts.active + queue.counts.history ===
            0 && (
            <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
              {COPY.programs.workspaceTaskParticipantsEmpty}
            </p>
          )}
          <section
            id={`participants-${tab}-panel`}
            role="tabpanel"
            aria-labelledby={`participants-${tab}-tab`}
            tabIndex={0}
          >
            {tab === "pending"
              ? renderPending()
              : tab === "active"
                ? renderActive()
                : renderHistory()}
          </section>
        </>
      )}
    </ScreenSection>
  );
};
