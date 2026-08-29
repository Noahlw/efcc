"use client";

import { cva } from "class-variance-authority";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { RpcError } from "@/lib/api";
import type {
  AccountAccessLifecycleImpact,
  AccountAccessMutationResult,
  AccountAccessView,
  EffectiveAccessGroups,
} from "@/lib/identity/account-access";
import {
  getAccountAccess,
  mutateAccountAssignments,
  revokeAccountAssignments,
  searchEligibleAccounts,
  updateRoleDefinitionLifecycle,
} from "@/lib/identity/account-access-api";
import type {
  RoleHierarchyDefinition,
  RoleHierarchyView,
} from "@/lib/identity/role-hierarchy";
import { getRoleHierarchy } from "@/lib/identity/role-hierarchy-api";
import { announce } from "@/lib/live-region";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { cn } from "@/lib/utils";

import { DirectoryFrame } from "./directory-frame";

const panelVariants = cva(
  "mx-auto grid min-w-0 w-full gap-[var(--space-4)] px-[var(--space-4)] pb-[var(--space-9)] pt-[var(--space-4)] text-[var(--ink)]",
  {
    variants: {
      mode: {
        detail: "max-w-[1180px]",
        safe: "max-w-[760px]",
      },
    },
    defaultVariants: { mode: "detail" },
  }
);

const cardClass =
  "min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-4)]";
const stateClass =
  "grid min-h-[180px] min-w-0 place-items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center text-[var(--ink-muted)]";
const actionClass = "min-h-11 font-extrabold";

const EMPTY_GROUPS: EffectiveAccessGroups = {
  Global: [],
  Department: [],
  Program: [],
};

function returnHref(value: string | null): string {
  return value?.startsWith("/management")
    ? value
    : "/management?module=accounts";
}

function errorMessage(error: unknown): string {
  if (error instanceof RpcError) {
    if (error.problem.code === "ROLE_POLICY_CONFLICT")
      return "資料已有更新，請重新載入後再試。";
    if (error.problem.code === "ROLE_FORBIDDEN")
      return "您沒有權限執行此操作。";
    if (error.problem.code === "ROLE_SCOPE_MISMATCH")
      return "身份組超出你的可管理範圍。";
    if (error.problem.code === "ROLE_ASSIGNMENT_DUPLICATE")
      return "已有相同身份組，未重複指派。";
    if (error.problem.detail) return error.problem.detail;
  }
  return "帳戶權限暫時無法載入，請稍後再試。";
}
function statusKind(error: unknown): "error" | "conflict" {
  return error instanceof RpcError &&
    error.problem.code === "ROLE_POLICY_CONFLICT"
    ? "conflict"
    : "error";
}
function preservesMutationKey(error: unknown): boolean {
  if (!(error instanceof RpcError)) {
    return false;
  }
  const status = error.problem.status;
  return (
    status === 0 ||
    error.problem.code === "NETWORK_ERROR" ||
    (error.problem.code === "MALFORMED_RESPONSE" &&
      status !== undefined &&
      status >= 200 &&
      status < 300)
  );
}

function roleScopeLabel(
  role: Pick<RoleHierarchyDefinition, "scopeLabel">
): string {
  return role.scopeLabel ?? "全教會";
}

function effectiveGrantCount(groups: EffectiveAccessGroups): number {
  return (
    groups.Global.length + groups.Department.length + groups.Program.length
  );
}

function impactText(groups: EffectiveAccessGroups): string {
  const count = effectiveGrantCount(groups);
  return count === 0
    ? "沒有直接受影響的有效權限。"
    : `共 ${count} 項有效權限。`;
}
function revokePreview(
  groups: EffectiveAccessGroups,
  roleLabel: string
): { lost: EffectiveAccessGroups; retained: EffectiveAccessGroups } {
  const lost: EffectiveAccessGroups = {
    Global: [],
    Department: [],
    Program: [],
  };
  const retained: EffectiveAccessGroups = {
    Global: [],
    Department: [],
    Program: [],
  };
  for (const scope of ["Global", "Department", "Program"] as const) {
    for (const grant of groups[scope]) {
      const sources = grant.sources.filter((source) => source !== roleLabel);
      const next = {
        ...grant,
        sources,
        sourceRoleDefinitionIds: [...grant.sourceRoleDefinitionIds],
      };
      if (sources.length === 0) {
        lost[scope].push(next);
      } else {
        retained[scope].push(next);
      }
    }
  }
  return { lost, retained };
}

const Group = ({
  label,
  grants,
  idPrefix,
}: {
  label: keyof EffectiveAccessGroups;
  grants: EffectiveAccessGroups[keyof EffectiveAccessGroups];
  idPrefix?: string;
}) => (
  <section
    aria-labelledby={`${idPrefix ?? "account-access"}-${label.toLowerCase()}-title`}
    className="min-w-0"
  >
    <h3
      className="m-0 text-[0.95rem] font-extrabold"
      id={`${idPrefix ?? "account-access"}-${label.toLowerCase()}-title`}
    >
      {label}
    </h3>
    {grants.length === 0 ? (
      <p className="m-0 mt-2 text-sm text-[var(--ink-muted)]">
        目前沒有有效權限。
      </p>
    ) : (
      <ul className="m-0 mt-2 grid min-w-0 list-none gap-2 p-0">
        {grants.map((grant) => (
          <li
            className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-3"
            key={`${grant.scopeKind}:${grant.scopeId ?? "global"}:${grant.capability}`}
          >
            <strong className="wrap-anywhere block">{grant.label}</strong>
            <span className="wrap-anywhere block text-sm text-[var(--ink-muted)]">
              {grant.description}
            </span>
            <small className="wrap-anywhere mt-1 block text-xs text-[var(--accent)]">
              來源：{grant.sources.join("、")}
            </small>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const ImpactGroups = ({ impact }: { impact: AccountAccessLifecycleImpact }) => (
  <div className="grid min-w-0 gap-3">
    <strong className="wrap-anywhere block">
      {impact.action === "archive" ? "停用影響" : "恢復影響"}：{impact.label}
    </strong>
    <section aria-labelledby="account-access-impact-lost-title">
      <h4
        className="m-0 text-sm font-extrabold"
        id="account-access-impact-lost-title"
      >
        可能失去
      </h4>
      <div className="mt-2 grid min-w-0 gap-3">
        <Group
          idPrefix="account-access-impact-lost"
          label="Global"
          grants={impact.lost.Global}
        />
        <Group
          idPrefix="account-access-impact-lost"
          label="Department"
          grants={impact.lost.Department}
        />
        <Group
          idPrefix="account-access-impact-lost"
          label="Program"
          grants={impact.lost.Program}
        />
      </div>
    </section>
    <section aria-labelledby="account-access-impact-retained-title">
      <h4
        className="m-0 text-sm font-extrabold"
        id="account-access-impact-retained-title"
      >
        保留
      </h4>
      <div className="mt-2 grid min-w-0 gap-3">
        <Group
          idPrefix="account-access-impact-retained"
          label="Global"
          grants={impact.retained.Global}
        />
        <Group
          idPrefix="account-access-impact-retained"
          label="Department"
          grants={impact.retained.Department}
        />
        <Group
          idPrefix="account-access-impact-retained"
          label="Program"
          grants={impact.retained.Program}
        />
      </div>
    </section>
  </div>
);
interface EligibleAccount {
  userId: string;
  name: string;
  username: string;
  identities: readonly {
    roleDefinitionId: string;
    label: string;
    scopeLabel: string | null;
  }[];
}
type AccountResourceState =
  | { kind: "loading"; data: null }
  | { kind: "ready"; data: AccountAccessView }
  | { kind: "error"; message: string; code: string | null; data: null };
export const AccountAccessPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountUserId = searchParams.get("account");
  const roleDefinitionId = searchParams.get("roleDefinition");
  const viewParam = searchParams.get("view");
  const stateRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const mutationKeyRef = useRef<string | null>(null);
  const mutationIntentRef = useRef<string | null>(null);
  const [view, setView] = useState<AccountAccessView | null>(null);
  const [hierarchy, setHierarchy] = useState<RoleHierarchyView | null>(null);
  const [search, setSearch] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const [eligibleAccounts, setEligibleAccounts] = useState<
    readonly EligibleAccount[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [revokeRoleId, setRevokeRoleId] = useState<string | null>(null);
  const [lifecycleRoleId, setLifecycleRoleId] = useState<string | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore">(
    "archive"
  );
  const [status, setStatus] = useState<{
    kind: "error" | "success" | "conflict";
    message: string;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resetMutationKey = () => {
    mutationKeyRef.current = null;
    mutationIntentRef.current = null;
  };
  const mutationKeyFor = (intent: string): string => {
    if (
      mutationKeyRef.current === null ||
      mutationIntentRef.current !== intent
    ) {
      mutationKeyRef.current = crypto.randomUUID();
      mutationIntentRef.current = intent;
    }
    return mutationKeyRef.current;
  };
  const accountResource = useAsyncResource<
    AccountAccessView,
    AccountResourceState
  >(
    () => {
      if (!accountUserId) return Promise.reject(new Error("missing account"));
      return getAccountAccess(accountUserId);
    },
    {
      toLoading: () => ({ kind: "loading", data: null }),
      toReady: (data) => ({ kind: "ready", data }),
      onError: (error) => ({
        kind: "error",
        data: null,
        message: errorMessage(error),
        code: error instanceof RpcError ? (error.problem.code ?? null) : null,
      }),
      announceLoading: "正在載入帳戶權限…",
      isAuthRequired: (error) =>
        error instanceof RpcError && error.problem.code === "AUTH_REQUIRED",
      onAuthRequired: () => router.replace("/"),
      focusTarget: "[data-account-access-state]",
    },
    [accountUserId, router]
  );

  useEffect(() => {
    mutationKeyRef.current = null;
    mutationIntentRef.current = null;
  }, [accountUserId, roleDefinitionId]);

  useEffect(() => {
    if (!accountUserId || viewParam !== "access") return;
    setView(null);
    setStatus(null);
    void accountResource.run();
  }, [accountResource.run, accountUserId, viewParam]);

  useEffect(() => {
    if (accountResource.state.kind === "ready") {
      setView(accountResource.state.data);
    } else if (accountResource.state.kind === "error") {
      setView(null);
    }
  }, [accountResource.state]);

  useEffect(() => {
    if (
      accountResource.state.kind === "error" &&
      (accountResource.state.code === "ROLE_TARGET_INELIGIBLE" ||
        accountResource.state.code === "ROLE_NOT_FOUND")
    ) {
      router.replace("/management?module=accounts");
    }
  }, [accountResource.state, router]);

  useEffect(() => {
    if ((!accountUserId && !roleDefinitionId) || viewParam !== "access") return;
    let current = true;
    void getRoleHierarchy()
      .then((result) => {
        if (current) setHierarchy(result);
      })
      .catch(() => {
        if (current) setHierarchy(null);
      });
    return () => {
      current = false;
    };
  }, [accountUserId, roleDefinitionId, viewParam]);

  useEffect(() => {
    if (!accountUserId || viewParam !== "access") return;
    const query = search.trim();
    if (!query) {
      setCandidateCount(0);
      setEligibleAccounts([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      void searchEligibleAccounts(query, { offset: 0, limit: 20 })
        .then((result) => {
          if (current) {
            setCandidateCount(result.accounts.length);
            setEligibleAccounts(result.accounts);
          }
        })
        .catch(() => {
          if (current) {
            setCandidateCount(0);
            setEligibleAccounts([]);
          }
        });
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [accountUserId, search, viewParam]);

  const activeIds = useMemo(
    () =>
      new Set(
        (view?.activeAssignments ?? []).map(
          (assignment) => assignment.roleDefinitionId
        )
      ),
    [view]
  );
  const assignableRoles = useMemo(() => {
    if (!hierarchy) return [];
    return hierarchy.categories
      .flatMap((category) => category.definitions)
      .filter((role) => {
        return (
          !role.isArchived &&
          !role.isProtected &&
          !activeIds.has(role.roleDefinitionId)
        );
      });
  }, [activeIds, hierarchy]);
  const selectedRoles = assignableRoles.filter((role) =>
    selectedIds.includes(role.roleDefinitionId)
  );
  const roleDefinition = hierarchy?.categories
    .flatMap((category) => category.definitions)
    .find((role) => role.roleDefinitionId === roleDefinitionId);
  const roleFirst = !accountUserId && roleDefinitionId !== null;
  const revokeAssignment = view?.activeAssignments.find(
    (assignment) => assignment.roleDefinitionId === revokeRoleId
  );
  const revokeImpact =
    revokeAssignment && view
      ? revokePreview(view.effectiveAccess, revokeAssignment.label)
      : { lost: EMPTY_GROUPS, retained: EMPTY_GROUPS };
  const archiveRoleDefinitionIds = view?.actions.archiveRoleDefinitionIds ?? [];
  const restoreRoleDefinitionIds = view?.actions.restoreRoleDefinitionIds ?? [];
  const lifecycleAssignments =
    view?.activeAssignments.filter((assignment) =>
      archiveRoleDefinitionIds.includes(assignment.roleDefinitionId)
    ) ?? [];
  const lifecycleHistory =
    view?.revokedAssignments.filter((assignment) =>
      restoreRoleDefinitionIds.includes(assignment.roleDefinitionId)
    ) ?? [];
  const lifecycleImpact = lifecycleRoleId
    ? view?.lifecycleImpacts[lifecycleRoleId]
    : undefined;

  const goBack = () => router.replace(returnHref(searchParams.get("return")));

  const toggleRole = (roleId: string, checked: boolean) => {
    resetMutationKey();
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, roleId])]
        : current.filter((id) => id !== roleId)
    );
    setStatus(null);
  };

  const confirmAdd = async () => {
    if (!view || !accountUserId || selectedIds.length === 0) return;
    setMutating(true);
    setStatus(null);
    const roleIds = [...selectedIds].sort().join(",");
    const key = mutationKeyFor(
      `grant|${accountUserId}|${view.revision}|${roleIds}`
    );
    try {
      const result = await mutateAccountAssignments(
        accountUserId,
        {
          baseRevision: view.revision,
          roleDefinitionIds: selectedIds,
        },
        key
      );
      setView(result);
      setSelectedIds([]);
      setReviewOpen(false);
      resetMutationKey();
      setStatus({
        kind: "success",
        message:
          result.duplicateRoleDefinitionIds.length > 0
            ? "身份組已更新；重複項目沒有再次指派。"
            : "身份組已一次更新。",
      });
      announce("身份組已更新");
    } catch (error) {
      if (!preservesMutationKey(error)) {
        resetMutationKey();
      }
      const message = errorMessage(error);
      setStatus({ kind: statusKind(error), message });
    } finally {
      setMutating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!view || !accountUserId || !revokeRoleId) return;
    setMutating(true);
    setStatus(null);
    const key = mutationKeyFor(
      `revoke|${accountUserId}|${view.revision}|${revokeRoleId}`
    );
    try {
      const result = await revokeAccountAssignments(
        accountUserId,
        {
          baseRevision: view.revision,
          roleDefinitionIds: [revokeRoleId],
        },
        key
      );
      setView(result);
      setRevokeRoleId(null);
      resetMutationKey();
      setStatus({
        kind: "success",
        message: "身份組已撤銷，歷史記錄仍然保留。",
      });
      announce("身份組已撤銷");
    } catch (error) {
      if (!preservesMutationKey(error)) {
        resetMutationKey();
      }
      setStatus({ kind: statusKind(error), message: errorMessage(error) });
    } finally {
      setMutating(false);
    }
  };

  const confirmLifecycle = async () => {
    if (!lifecycleRoleId) return;
    const baseRevision = view?.revision ?? hierarchy?.revision;
    if (baseRevision === undefined) return;
    setMutating(true);
    setStatus(null);
    const key = mutationKeyFor(
      `lifecycle|${lifecycleAction}|${lifecycleRoleId}|${baseRevision}`
    );
    try {
      const result = await updateRoleDefinitionLifecycle(
        lifecycleRoleId,
        {
          action: lifecycleAction,
          baseRevision,
        },
        key
      );
      resetMutationKey();
      setLifecycleRoleId(null);
      setStatus({
        kind: "success",
        message:
          lifecycleAction === "archive"
            ? "身份組已停用並撤銷生效指派。"
            : "身份組已恢復；歷史指派沒有自動重新啟用。",
      });
      announce(lifecycleAction === "archive" ? "身份組已停用" : "身份組已恢復");
      if (accountUserId) {
        setView(await getAccountAccess(accountUserId));
      } else {
        setHierarchy(await getRoleHierarchy());
      }
      void result;
    } catch (error) {
      if (!preservesMutationKey(error)) {
        resetMutationKey();
      }
      setStatus({ kind: statusKind(error), message: errorMessage(error) });
    } finally {
      setMutating(false);
    }
  };

  const retryAccount = () => {
    setRetryKey((key) => key + 1);
    accountResource.retry();
  };

  if ((!accountUserId && !roleDefinitionId) || viewParam !== "access") {
    return (
      <section className={panelVariants({ mode: "safe" })}>
        <div
          className={stateClass}
          ref={(node) => {
            stateRef.current = node;
          }}
          role="status"
          tabIndex={-1}
        >
          <h1 className="m-0 text-xl font-extrabold">帳戶權限</h1>
          <p className="m-0">請從帳戶名錄選擇一個帳戶。</p>
          <Button
            className={actionClass}
            onClick={goBack}
            type="button"
            variant="outline"
          >
            返回帳戶名錄
          </Button>
        </div>
      </section>
    );
  }

  const resourceState = accountResource.state;
  const loading = resourceState.kind === "loading";
  const failed = resourceState.kind === "error";
  const loadError =
    resourceState.kind === "error" ? resourceState.message : null;
  const roleLifecycleActions = roleDefinition?.lifecycleActions ?? [];
  const roleFirstDetail = roleFirst ? (
    hierarchy === null ? (
      <section
        className={stateClass}
        data-account-access-state
        ref={stateRef}
        role="status"
        tabIndex={-1}
      >
        正在載入身份組…
      </section>
    ) : !roleDefinition ? (
      <section
        className={stateClass}
        data-account-access-state
        ref={stateRef}
        role="alert"
        tabIndex={-1}
      >
        <strong>找不到指定的身份組。</strong>
        <Button
          className={actionClass}
          onClick={goBack}
          type="button"
          variant="outline"
        >
          返回身份組列表
        </Button>
      </section>
    ) : (
      <article
        aria-labelledby="account-access-role-title"
        className={cn(
          "grid min-w-0 gap-[var(--space-4)]",
          panelVariants({ mode: "detail" })
        )}
        ref={detailRef}
        tabIndex={-1}
      >
        <header className={cardClass}>
          <Button
            className="mb-3 min-h-11 px-3"
            onClick={goBack}
            type="button"
            variant="ghost"
          >
            ‹ 返回
          </Button>
          <span className="text-xs font-extrabold tracking-[0.08em] text-[var(--accent)]">
            ACCOUNT ACCESS
          </span>
          <h1
            className="m-0 mt-1 wrap-anywhere text-[1.45rem] font-extrabold"
            id="account-access-role-title"
          >
            {roleDefinition.label}
          </h1>
          <p className="m-0 mt-1 wrap-anywhere text-sm text-[var(--ink-muted)]">
            {roleScopeLabel(roleDefinition)} · 目前版本：{hierarchy.revision}
          </p>
          {status && (
            <p
              aria-live="polite"
              className="m-0 mt-3 wrap-anywhere rounded-[var(--radius-sm)] border p-3"
              role={status.kind === "success" ? "status" : "alert"}
            >
              {status.message}
            </p>
          )}
        </header>
        <section
          aria-labelledby="account-access-role-accounts-title"
          className={cardClass}
        >
          <h2
            className="m-0 text-base font-extrabold"
            id="account-access-role-accounts-title"
          >
            已指派帳戶
          </h2>
          {(roleDefinition.assignedAccountUserIds ?? []).length === 0 ? (
            <p className="m-0 mt-3 text-sm text-[var(--ink-muted)]">
              目前沒有已指派帳戶。
            </p>
          ) : (
            <ul className="m-0 mt-3 grid min-w-0 gap-2 p-0 [list-style:none]">
              {(roleDefinition.assignedAccountUserIds ?? []).map(
                (assignedAccountUserId) => (
                  <li key={assignedAccountUserId}>
                    <Button
                      className="min-h-11 w-full justify-start border border-[var(--line)] bg-[var(--surface)] text-left text-[var(--ink)]"
                      onClick={() =>
                        router.push(
                          `/management?module=accounts&account=${encodeURIComponent(assignedAccountUserId)}&view=access&return=${encodeURIComponent(`/management?module=accounts&roleDefinition=${encodeURIComponent(roleDefinition.roleDefinitionId)}&view=access`)}`
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {assignedAccountUserId}
                    </Button>
                  </li>
                )
              )}
            </ul>
          )}
        </section>
        {roleLifecycleActions.length > 0 && (
          <section
            aria-labelledby="account-access-role-lifecycle-title"
            className={cardClass}
          >
            <h2
              className="m-0 text-base font-extrabold"
              id="account-access-role-lifecycle-title"
            >
              身份組生命週期
            </h2>
            <p className="m-0 mt-1 text-sm text-[var(--ink-muted)]">
              這項操作保留已指派帳戶歷史；恢復不會自動重新指派。
            </p>
            <div className="mt-3 flex min-w-0 flex-wrap gap-2">
              {roleLifecycleActions.map((action) => (
                <Button
                  className={actionClass}
                  key={action.action}
                  onClick={() => {
                    resetMutationKey();
                    setLifecycleRoleId(roleDefinition.roleDefinitionId);
                    setLifecycleAction(action.action);
                  }}
                  type="button"
                  variant="outline"
                >
                  {action.action === "archive" ? "停用" : "恢復"}{" "}
                  {roleDefinition.label}
                </Button>
              ))}
            </div>
          </section>
        )}
      </article>
    )
  ) : null;

  return (
    <DirectoryFrame
      ariaLabelledBy="account-access-title"
      className="min-w-0"
      content="detail"
      detail={
        roleFirst ? (
          roleFirstDetail
        ) : loading ? (
          <output
            aria-busy="true"
            className={stateClass}
            data-account-access-state
            ref={(node) => {
              stateRef.current = node;
            }}
            tabIndex={-1}
          >
            正在載入帳戶權限…
          </output>
        ) : failed || !view ? (
          <section
            aria-live="assertive"
            className={stateClass}
            data-account-access-state
            ref={(node) => {
              stateRef.current = node;
              detailRef.current = node;
            }}
            role="alert"
            tabIndex={-1}
          >
            <strong>{loadError ?? "帳戶權限暫時無法載入。"}</strong>
            <Button
              className={actionClass}
              onClick={retryAccount}
              type="button"
              variant="outline"
            >
              重試
            </Button>
          </section>
        ) : (
          <article
            aria-labelledby="account-access-account-title"
            className={cn(
              "grid min-w-0 gap-[var(--space-4)]",
              panelVariants({ mode: "detail" })
            )}
            ref={(node) => {
              detailRef.current = node;
            }}
            tabIndex={-1}
          >
            <header className={cardClass}>
              <Button
                className="mb-3 min-h-11 px-3"
                onClick={goBack}
                type="button"
                variant="ghost"
              >
                ‹ 返回
              </Button>
              <span className="text-xs font-extrabold tracking-[0.08em] text-[var(--accent)]">
                ACCOUNT ACCESS
              </span>
              <h1
                className="m-0 mt-1 wrap-anywhere text-[1.45rem] font-extrabold"
                id="account-access-account-title"
              >
                {view.account.name}
              </h1>
              <p className="m-0 mt-1 wrap-anywhere text-sm text-[var(--ink-muted)]">
                {view.account.username} · {view.account.status}
              </p>
              <p className="m-0 mt-3 text-sm text-[var(--ink-muted)]">
                目前版本：{view.revision}
              </p>
              {status && (
                <p
                  aria-live="polite"
                  className={cn(
                    "m-0 mt-3 wrap-anywhere rounded-[var(--radius-sm)] border p-3",
                    status.kind === "success"
                      ? "border-[var(--success-border)] bg-[var(--success-surface)]"
                      : "border-[var(--error-border)] bg-[var(--error-surface)]"
                  )}
                  role={status.kind === "success" ? "status" : "alert"}
                >
                  {status.message}
                </p>
              )}
            </header>

            <section
              aria-labelledby="account-access-assigned-title"
              className={cardClass}
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className="m-0 text-base font-extrabold"
                    id="account-access-assigned-title"
                  >
                    已指派身份組
                  </h2>
                  <p className="m-0 mt-1 text-sm text-[var(--ink-muted)]">
                    可加入多個較低順位身份組；每次變更一次提交。
                  </p>
                </div>
                {view.actions.assign && (
                  <Button
                    className={actionClass}
                    disabled={selectedRoles.length === 0}
                    onClick={() => setReviewOpen(true)}
                    type="button"
                  >
                    檢視新增 ({selectedRoles.length})
                  </Button>
                )}
              </div>
              {view.activeAssignments.length === 0 ? (
                <p className="m-0 mt-3 text-sm text-[var(--ink-muted)]">
                  目前沒有一般身份組指派。
                </p>
              ) : (
                <ul className="m-0 mt-3 grid min-w-0 gap-2 p-0 [list-style:none]">
                  {view.activeAssignments.map((assignment) => (
                    <li
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] p-3"
                      key={assignment.assignmentId}
                    >
                      <span className="min-w-0">
                        <strong className="wrap-anywhere block">
                          {assignment.label}
                        </strong>
                        <small className="wrap-anywhere block text-[var(--ink-muted)]">
                          {roleScopeLabel(assignment)} · {assignment.grantedAt}
                        </small>
                      </span>
                      {view.actions.revokeRoleDefinitionIds.includes(
                        assignment.roleDefinitionId
                      ) && (
                        <Button
                          aria-label={`撤銷 ${assignment.label}`}
                          className={actionClass}
                          disabled={mutating}
                          onClick={() => {
                            resetMutationKey();
                            setRevokeRoleId(assignment.roleDefinitionId);
                          }}
                          type="button"
                          variant="outline"
                        >
                          撤銷
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="account-access-search-title"
              className={cardClass}
            >
              <h2
                className="m-0 text-base font-extrabold"
                id="account-access-search-title"
              >
                新增身份組
              </h2>
              <label
                className="mt-3 grid min-w-0 gap-2"
                htmlFor="account-access-search"
              >
                <span className="text-sm font-bold">搜尋可用帳戶</span>
                <Input
                  aria-describedby="account-access-search-hint"
                  className="min-h-11"
                  id="account-access-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋生效帳戶"
                  type="search"
                  value={search}
                />
              </label>
              <p
                className="m-0 mt-2 text-xs text-[var(--ink-muted)]"
                id="account-access-search-hint"
              >
                只顯示可管理的生效帳戶候選；目前符合 {candidateCount} 個。
              </p>
              {search.trim() && (
                <ul
                  aria-label="可選擇帳戶"
                  className="m-0 mt-3 grid min-w-0 gap-2 p-0 [list-style:none]"
                >
                  {eligibleAccounts.length === 0 ? (
                    <li className="text-sm text-[var(--ink-muted)]">
                      找不到符合的生效帳戶。
                    </li>
                  ) : (
                    eligibleAccounts.map((candidate) => (
                      <li className="min-w-0" key={candidate.userId}>
                        <Button
                          className="min-h-11 w-full justify-start border border-[var(--line)] bg-[var(--surface)] text-left text-[var(--ink)]"
                          onClick={() =>
                            router.push(
                              `/management?module=accounts&account=${encodeURIComponent(candidate.userId)}&view=access&return=${encodeURIComponent(`/management?module=accounts&account=${accountUserId}&view=access`)}`
                            )
                          }
                          type="button"
                          variant="outline"
                        >
                          <span className="min-w-0">
                            <strong className="wrap-anywhere block">
                              {candidate.name}
                            </strong>
                            <small className="wrap-anywhere block text-[var(--ink-muted)]">
                              {candidate.username}
                            </small>
                          </span>
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <div
                className="mt-4 grid min-w-0 gap-2"
                data-account-access-identities
              >
                {assignableRoles.length === 0 ? (
                  <p className="m-0 text-sm text-[var(--ink-muted)]">
                    沒有可新增的身份組。
                  </p>
                ) : (
                  assignableRoles.map((role) => (
                    <label
                      className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] p-3"
                      key={role.roleDefinitionId}
                    >
                      <span className="min-w-0">
                        <strong className="wrap-anywhere block">
                          {role.label}
                        </strong>
                        <small className="wrap-anywhere block text-[var(--ink-muted)]">
                          {roleScopeLabel(role)}
                        </small>
                      </span>
                      <Switch
                        aria-label={`新增 ${role.label}`}
                        className="min-h-11 min-w-11"
                        checked={selectedIds.includes(role.roleDefinitionId)}
                        disabled={mutating || !view.actions.assign}
                        onCheckedChange={(checked) =>
                          toggleRole(role.roleDefinitionId, checked)
                        }
                      />
                    </label>
                  ))
                )}
              </div>
            </section>

            <section
              aria-labelledby="account-access-effective-title"
              className={cardClass}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    className="m-0 text-base font-extrabold"
                    id="account-access-effective-title"
                  >
                    有效權限與來源
                  </h2>
                  <span className="text-xs text-[var(--ink-muted)]">
                    加總，不會互相抵銷
                  </span>
                </div>
                <Button
                  className={actionClass}
                  onClick={() => setDetailsOpen(true)}
                  type="button"
                  variant="outline"
                >
                  查看權限詳情
                </Button>
              </div>
              <div className="mt-4 grid min-w-0 gap-4">
                <Group label="Global" grants={view.effectiveAccess.Global} />
                <Group
                  label="Department"
                  grants={view.effectiveAccess.Department}
                />
                <Group label="Program" grants={view.effectiveAccess.Program} />
              </div>
            </section>

            <section
              aria-labelledby="account-access-history-title"
              className={cardClass}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <h2
                  className="m-0 text-base font-extrabold"
                  id="account-access-history-title"
                >
                  撤銷與歷史
                </h2>
                <Button
                  className={actionClass}
                  onClick={() => setHistoryOpen((open) => !open)}
                  type="button"
                  variant="outline"
                >
                  {historyOpen
                    ? "收起歷史"
                    : `查看歷史 (${view.revokedAssignments.length})`}
                </Button>
              </div>
              {historyOpen &&
                (view.revokedAssignments.length === 0 ? (
                  <p className="m-0 mt-3 text-sm text-[var(--ink-muted)]">
                    尚未有撤銷記錄。
                  </p>
                ) : (
                  <ul className="m-0 mt-3 grid min-w-0 gap-2 p-0 [list-style:none]">
                    {view.revokedAssignments.map((assignment) => (
                      <li
                        className="min-w-0 rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] p-3"
                        key={assignment.assignmentId}
                      >
                        <strong className="wrap-anywhere block">
                          {assignment.label}
                        </strong>
                        <small className="wrap-anywhere block text-[var(--ink-muted)]">
                          已撤銷：{assignment.revokedAt ?? "—"} · assignment{" "}
                          {assignment.assignmentId}
                        </small>
                      </li>
                    ))}
                  </ul>
                ))}
            </section>

            {(lifecycleAssignments.length > 0 ||
              lifecycleHistory.length > 0) && (
              <section
                aria-labelledby="account-access-lifecycle-title"
                className={cardClass}
              >
                <h2
                  className="m-0 text-base font-extrabold"
                  id="account-access-lifecycle-title"
                >
                  身份組生命週期
                </h2>
                <p className="m-0 mt-1 text-sm text-[var(--ink-muted)]">
                  停用會撤銷所有生效指派；恢復不會自動重新指派。
                </p>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                  {lifecycleAssignments.map((assignment) => (
                    <Button
                      className={actionClass}
                      key={`archive-${assignment.roleDefinitionId}`}
                      onClick={() => {
                        resetMutationKey();
                        setLifecycleRoleId(assignment.roleDefinitionId);
                        setLifecycleAction("archive");
                      }}
                      type="button"
                      variant="outline"
                    >
                      停用 {assignment.label}
                    </Button>
                  ))}
                  {lifecycleHistory.map((assignment) => (
                    <Button
                      className={actionClass}
                      key={`restore-${assignment.roleDefinitionId}`}
                      onClick={() => {
                        resetMutationKey();
                        setLifecycleRoleId(assignment.roleDefinitionId);
                        setLifecycleAction("restore");
                      }}
                      type="button"
                      variant="outline"
                    >
                      恢復 {assignment.label}
                    </Button>
                  ))}
                </div>
              </section>
            )}
          </article>
        )
      }
      filter={null}
      header={
        <div className="sr-only">
          <h1 id="account-access-title">帳戶權限</h1>
        </div>
      }
      hasDetail
      search={null}
      selection={{
        selectedId: accountUserId,
        onSelect: (selectedAccountUserId) =>
          router.push(
            `/management?module=accounts&account=${encodeURIComponent(selectedAccountUserId)}&view=access&return=${encodeURIComponent(returnHref(searchParams.get("return")))}`
          ),
      }}
      state={
        roleFirst
          ? "ready"
          : loading
            ? "loading"
            : failed || !view
              ? "error"
              : "ready"
      }
      width="wide"
      focus={{
        stateRef,
        resultsRef: detailRef,
        detailRef,
        detailKey: accountResource.state.kind,
        retryKey,
      }}
    >
      <span />
      <Sheet onOpenChange={setReviewOpen} open={reviewOpen}>
        <SheetContent
          className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
          side="bottom"
        >
          <SheetHeader>
            <SheetTitle>確認新增身份組</SheetTitle>
            <SheetDescription>
              以下身份組會一次提交；任何一項不符合授權，整批都不會變更。
            </SheetDescription>
          </SheetHeader>
          <ul
            aria-label="待新增身份組"
            className="m-0 grid gap-2 px-4 [list-style:none]"
          >
            {selectedRoles.map((role) => (
              <li
                className="rounded-[var(--radius-sm)] border border-[var(--line)] p-3"
                key={role.roleDefinitionId}
              >
                <strong className="wrap-anywhere block">{role.label}</strong>
                <small className="wrap-anywhere text-[var(--ink-muted)]">
                  {roleScopeLabel(role)}
                </small>
              </li>
            ))}
          </ul>
          <SheetFooter>
            <Button
              className={actionClass}
              disabled={mutating}
              onClick={() => void confirmAdd()}
              type="button"
            >
              {mutating ? "提交中…" : "確認一次新增"}
            </Button>
            <Button
              className={actionClass}
              onClick={() => setReviewOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Dialog onOpenChange={setDetailsOpen} open={detailsOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>有效權限詳情</DialogTitle>
            <DialogDescription>
              每項權限都列出提供它的身份組及適用範圍。
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            {view && (
              <Group label="Global" grants={view.effectiveAccess.Global} />
            )}
            {view && (
              <Group
                label="Department"
                grants={view.effectiveAccess.Department}
              />
            )}
            {view && (
              <Group label="Program" grants={view.effectiveAccess.Program} />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setRevokeRoleId(null);
        }}
        open={revokeRoleId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認撤銷身份組？</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeAssignment
                ? `${revokeAssignment.label} 的撤銷會保留歷史記錄。可能失去：${impactText(revokeImpact.lost)}；保留：${impactText(revokeImpact.retained)}。`
                : "請確認這項撤銷。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutating}
              onClick={(event) => {
                event.preventDefault();
                void confirmRevoke();
              }}
            >
              確認撤銷
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setLifecycleRoleId(null);
        }}
        open={lifecycleRoleId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lifecycleAction === "archive"
                ? "確認停用身份組？"
                : "確認恢復身份組？"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid min-w-0 gap-3">
                {lifecycleAction === "archive" && lifecycleImpact ? (
                  <ImpactGroups impact={lifecycleImpact} />
                ) : lifecycleAction === "archive" ? (
                  <p className="m-0 text-sm text-[var(--ink-muted)]">
                    目前沒有生效指派或有效權限會受影響。
                  </p>
                ) : (
                  <p className="m-0 text-sm text-[var(--ink-muted)]">
                    恢復不會自動重新啟用任何歷史指派。
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutating}
              onClick={(event) => {
                event.preventDefault();
                void confirmLifecycle();
              }}
            >
              確認
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DirectoryFrame>
  );
};
