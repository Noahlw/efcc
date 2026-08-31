"use client";

import { cva } from "class-variance-authority";
import Link from "next/link";
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
import { COPY } from "@/lib/copy";
import type {
  PermissionGrantChange,
  RoleDefinitionDetailView,
  RoleDefinitionPermission,
  RoleHierarchyView,
} from "@/lib/identity";
import {
  getRoleDefinitionDetail,
  getRoleHierarchy,
  updateRoleDefinitionGrants,
} from "@/lib/identity/role-hierarchy-api";
import { announce } from "@/lib/live-region";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";
import { cn } from "@/lib/utils";

import {
  ActionSurface,
  ManagementPageHeader,
  ManagementStickyActionBar,
  safeManagementReturnHref,
} from "./management-action-framework";

const LIST_TITLE = COPY.permissions.permissionsTitle;
const LIST_LEAD = COPY.permissions.permissionsLead;
const DETAIL_LEAD = "只顯示伺服器授權的權限；所有變更都會以政策版本保存。";
const ROLE_LIST_LABEL = COPY.permissions.rolesSection;
const SEARCH_LABEL = "搜尋權限";
const SEARCH_PLACEHOLDER = "搜尋名稱、說明或權限代號";
const BACK_TO_ROLES = "返回身份組列表";
const BACK_TO_MANAGEMENT = "返回管理工作";
const SAVE = "儲存變更";
const SAVING = "正在儲存…";
const SUCCESS = "權限已儲存，顯示最新政策版本。";
const ERROR = "未能儲存權限；草稿仍保留，請稍後再試。";
const CONFLICT =
  "權限政策已有更新；草稿未被覆寫。請先查看最新版本，再選擇重新開始。";
const FORBIDDEN = "您沒有權限查看或編輯此身份組。";
const LOAD_ERROR = COPY.permissions.loadError;
const REVIEW_TITLE = "確認權限變更";
const DEDICATED_REVIEW_TITLE = "詳細檢視權限變更";
const REVIEW_CONFIRM = "確認儲存";
const REVIEW_CANCEL = "返回編輯";
const DISCARD_RESTART = "捨棄草稿並重新開始";
const LOCKED = "已鎖定";

const HIGH_RISK_KEYS = new Set([
  "account.permissions.write",
  "registration.approval.manage",
  "home.publish",
]);

const roleButtonVariants = cva(
  "flex h-auto min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-left whitespace-normal outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
  {
    variants: {
      state: {
        active: "border-primary",
        default: "border-border",
      },
    },
    defaultVariants: { state: "default" },
  }
);

const permissionRowVariants = cva(
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-background p-3",
  {
    variants: {
      state: {
        clean: "border-border",
        changed: "border-primary bg-primary/5",
      },
      disabled: {
        true: "opacity-70",
        false: "",
      },
    },
    defaultVariants: { state: "clean", disabled: false },
  }
);

const stateSurfaceVariants = cva("mt-6 rounded-lg border p-4", {
  variants: {
    kind: {
      loading: "block border-border",
      error: "grid gap-3 border-destructive bg-destructive/10",
      forbidden: "border-destructive bg-destructive/10",
    },
  },
});

type Draft = Record<string, boolean>;
type ReviewKind = "sheet" | "dedicated" | null;
type SaveState =
  | "clean"
  | "dirty"
  | "saving"
  | "success"
  | "error"
  | "conflict";

type LoadedData = {
  hierarchy: RoleHierarchyView;
  detail: RoleDefinitionDetailView | null;
  roleId: string | null;
};

type PanelState =
  | { kind: "loading" }
  | { kind: "list"; data: LoadedData }
  | { kind: "detail"; data: LoadedData }
  | { kind: "forbidden"; message: string }
  | { kind: "error"; message: string };

function initialRoleId(params: URLSearchParams): string | null {
  const role = params.get("role");
  const view = params.get("view");
  if (!role || (view !== null && view !== "permissions")) {
    return null;
  }
  return role;
}

function isKnownRole(hierarchy: RoleHierarchyView, roleId: string): boolean {
  return hierarchy.categories.some((category) =>
    category.definitions.some(
      (definition) => definition.roleDefinitionId === roleId
    )
  );
}

function draftFromDetail(detail: RoleDefinitionDetailView): Draft {
  return Object.fromEntries(
    detail.permissions.map((permission) => [
      permission.capability,
      permission.value,
    ])
  );
}

function changedPermissions(
  detail: RoleDefinitionDetailView,
  draft: Draft | null
): PermissionGrantChange[] {
  if (!draft) {
    return [];
  }
  return detail.permissions.flatMap((permission) => {
    const value = draft[permission.capability];
    return value !== permission.value
      ? [{ capability: permission.capability, value }]
      : [];
  });
}

function capabilityMatches(
  permission: RoleDefinitionPermission,
  query: string
): boolean {
  if (!query) {
    return true;
  }
  return [
    permission.group,
    permission.label,
    permission.description,
    permission.capability,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function permissionGroups(
  permissions: readonly RoleDefinitionPermission[],
  query: string
): { group: string; permissions: RoleDefinitionPermission[] }[] {
  const groups: { group: string; permissions: RoleDefinitionPermission[] }[] =
    [];
  for (const permission of permissions) {
    if (!capabilityMatches(permission, query)) {
      continue;
    }
    const existing = groups.find((item) => item.group === permission.group);
    if (existing) {
      existing.permissions.push(permission);
    } else {
      groups.push({ group: permission.group, permissions: [permission] });
    }
  }
  return groups;
}

function isHighRisk(
  change: PermissionGrantChange,
  permissions: readonly RoleDefinitionPermission[]
): boolean {
  if (HIGH_RISK_KEYS.has(change.capability)) {
    return true;
  }
  return (
    permissions.find(
      (permission) => permission.capability === change.capability
    )?.risk === "high"
  );
}

function displayValue(value: boolean): string {
  return value ? "已啟用" : "未啟用";
}

function reviewChanges(
  changes: readonly PermissionGrantChange[],
  permissions: readonly RoleDefinitionPermission[]
) {
  return (
    <ul className="grid gap-2" aria-label="待儲存權限變更">
      {changes.map((change) => {
        const permission = permissions.find(
          (item) => item.capability === change.capability
        );
        return (
          <li
            className="grid gap-1 rounded-lg border border-border bg-background p-3"
            key={change.capability}
          >
            <strong>{permission?.label ?? change.capability}</strong>
            <span className="text-muted-foreground text-xs">
              {displayValue(change.value)}
            </span>
            {isHighRisk(change, permissions) && (
              <span className="text-destructive text-xs">高風險變更</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function switchId(capability: string): string {
  return `permission-${capability.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export const PermissionEditorPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnHref = safeManagementReturnHref(
    searchParams.get("return"),
    "/management"
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(() =>
    initialRoleId(new URLSearchParams(searchParams.toString()))
  );
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [review, setReview] = useState<ReviewKind>(null);
  const [detailOverride, setDetailOverride] =
    useState<RoleDefinitionDetailView | null>(null);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const detailRoleRef = useRef<string | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const resource = useAsyncResource<LoadedData, PanelState>(
    async () => {
      const hierarchy = await getRoleHierarchy();
      if (!selectedRoleId || !isKnownRole(hierarchy, selectedRoleId)) {
        return { hierarchy, detail: null, roleId: selectedRoleId };
      }
      try {
        return {
          hierarchy,
          detail: await getRoleDefinitionDetail(selectedRoleId),
          roleId: selectedRoleId,
        };
      } catch (error) {
        if (
          error instanceof RpcError &&
          error.problem.code === "ROLE_NOT_FOUND"
        ) {
          return { hierarchy, detail: null, roleId: selectedRoleId };
        }
        throw error;
      }
    },
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (data) =>
        data.detail ? { kind: "detail", data } : { kind: "list", data },
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return null;
        }
        if (
          error instanceof RpcError &&
          ["ROLE_FORBIDDEN", "ROLE_SCOPE_MISMATCH"].includes(
            error.problem.code ?? ""
          )
        ) {
          return { kind: "forbidden", message: FORBIDDEN };
        }
        return { kind: "error", message: LOAD_ERROR };
      },
      announceLoading: "正在載入權限…",
      focusTarget: "#permission-editor-state",
    },
    [selectedRoleId, router]
  );

  useEffect(() => {
    void resource.run();
  }, [resource.run]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      idempotencyKeyRef.current = null;
      setSelectedRoleId(initialRoleId(params));
      setDetailOverride(null);
      setDraft(null);
      setReview(null);
      setSaveState("clean");
      setQuery("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const loadedDetail =
    resource.state.kind === "detail" ? resource.state.data.detail : null;
  const detail = detailOverride ?? loadedDetail;

  useEffect(() => {
    if (resource.state.kind !== "list") {
      return;
    }
    const data = resource.state.data;
    if (data.roleId !== selectedRoleId) {
      return;
    }
    const invalidSelectedRole = selectedRoleId !== null && data.detail === null;
    const malformedUrl =
      selectedRoleId === null &&
      (searchParams.get("role") !== null || searchParams.get("view") !== null);
    if (!invalidSelectedRole && !malformedUrl) {
      return;
    }
    setSelectedRoleId(null);
    window.history.replaceState(null, "", "/management?module=permissions");
    setDetailOverride(null);
    setDraft(null);
    setBaseRevision(null);
    idempotencyKeyRef.current = null;
    setSaveState("clean");
  }, [resource.state, searchParams, selectedRoleId]);

  useEffect(() => {
    const roleId = loadedDetail?.roleDefinition.roleDefinitionId ?? null;
    if (!loadedDetail || roleId === null || detailRoleRef.current === roleId) {
      return;
    }
    idempotencyKeyRef.current = null;
    detailRoleRef.current = roleId;
    setDetailOverride(null);
    setDraft(draftFromDetail(loadedDetail));
    setBaseRevision(loadedDetail.revision);
    setConflictRevision(null);
    setSaveState("clean");
    setReview(null);
    setQuery("");
  }, [loadedDetail]);

  useEffect(() => {
    if (resource.state.kind === "list") {
      listHeadingRef.current?.focus();
    } else if (resource.state.kind === "detail" && detail) {
      detailHeadingRef.current?.focus();
    }
  }, [resource.state.kind, detail]);

  const changes = useMemo(
    () => (detail ? changedPermissions(detail, draft) : []),
    [detail, draft]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = detail
    ? permissionGroups(detail.permissions, normalizedQuery)
    : [];
  const busy = saveState === "saving";

  const selectRole = (roleId: string, label: string) => {
    detailRoleRef.current = null;
    idempotencyKeyRef.current = null;
    setSelectedRoleId(roleId);
    setDetailOverride(null);
    setDraft(null);
    setBaseRevision(null);
    setSaveState("clean");
    setReview(null);
    announce(label);
  };

  const goToRoleList = () => {
    detailRoleRef.current = null;
    idempotencyKeyRef.current = null;
    setSelectedRoleId(null);
    setDetailOverride(null);
    setDraft(null);
    setBaseRevision(null);
    setConflictRevision(null);
    setReview(null);
    setSaveState("clean");
    setQuery("");
    window.history.replaceState(null, "", "/management?module=permissions");
    announce(ROLE_LIST_LABEL);
  };

  const retryLoad = () => {
    detailRoleRef.current = null;
    idempotencyKeyRef.current = null;
    setDetailOverride(null);
    setDraft(null);
    setBaseRevision(null);
    setConflictRevision(null);
    setReview(null);
    setSaveState("clean");
    resource.retry();
  };

  const togglePermission = (
    permission: RoleDefinitionPermission,
    value: boolean
  ) => {
    if (!detail || !draft || busy || !permission.editable) {
      return;
    }
    const nextDraft = { ...draft, [permission.capability]: value };
    setDraft(nextDraft);
    const nextChanges = changedPermissions(detail, nextDraft);
    setSaveState(nextChanges.length === 0 ? "clean" : "dirty");
    setConflictRevision(null);
    announce(`${permission.label} ${displayValue(value)}`);
  };

  const openReview = () => {
    if (
      !detail ||
      !baseRevision ||
      changes.length === 0 ||
      busy ||
      !detail.caller.canWrite
    ) {
      return;
    }
    const dedicated =
      changes.length > 3 ||
      changes.some((change) => isHighRisk(change, detail.permissions));
    setReview(dedicated ? "dedicated" : "sheet");
  };

  const closeReview = () => {
    setReview(null);
  };

  const discardAndRestart = () => {
    if (!detail) {
      return;
    }
    setDraft(draftFromDetail(detail));
    idempotencyKeyRef.current = null;
    setBaseRevision(detail.revision);
    setConflictRevision(null);
    setSaveState("clean");
    setReview(null);
    announce("已採用最新權限政策；草稿已捨棄。");
  };

  const submitChanges = async () => {
    if (
      !detail ||
      !draft ||
      baseRevision === null ||
      changes.length === 0 ||
      busy
    ) {
      return;
    }
    setReview(null);
    setSaveState("saving");
    announce(SAVING);
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const result = await updateRoleDefinitionGrants(
        detail.roleDefinition.roleDefinitionId,
        { baseRevision, changes },
        idempotencyKey
      );
      setDetailOverride(result);
      setDraft(draftFromDetail(result));
      setBaseRevision(result.revision);
      setConflictRevision(null);
      setSaveState("success");
      idempotencyKeyRef.current = null;
    } catch (error) {
      if (
        error instanceof RpcError &&
        error.problem.code === "ROLE_POLICY_CONFLICT"
      ) {
        setSaveState("conflict");
        const revision =
          typeof error.problem.data?.authoritativeRevision === "number"
            ? error.problem.data.authoritativeRevision
            : null;
        setConflictRevision(revision);
        try {
          const latest = await getRoleDefinitionDetail(
            detail.roleDefinition.roleDefinitionId
          );
          setDetailOverride(latest);
          if (revision === null) {
            setConflictRevision(latest.revision);
          }
        } catch {
          // Keep the dirty draft visible if authoritative recovery is unavailable.
        }
        return;
      }
      setSaveState("error");
    }
  };

  const renderRoleList = (hierarchy: RoleHierarchyView) => (
    <section
      className="grid gap-4"
      aria-labelledby="permission-editor-list-title"
    >
      <h2
        className="text-lg font-semibold"
        id="permission-editor-list-title"
        ref={listHeadingRef}
        tabIndex={-1}
      >
        {ROLE_LIST_LABEL}
      </h2>
      <ul aria-label={ROLE_LIST_LABEL} className="grid gap-3">
        {hierarchy.categories.map((category) => (
          <li className="grid gap-2" key={category.categoryKey}>
            <h3 className="text-sm font-semibold text-muted-foreground">
              {category.label}
            </h3>
            <ul className="grid gap-2">
              {category.definitions.map((definition) => (
                <li key={definition.roleDefinitionId}>
                  <Button
                    asChild
                    className={cn(
                      roleButtonVariants({
                        state:
                          definition.roleDefinitionId === selectedRoleId
                            ? "active"
                            : "default",
                      })
                    )}
                    variant="outline"
                  >
                    <Link
                      href={`/management?module=permissions&role=${encodeURIComponent(definition.roleDefinitionId)}&view=permissions`}
                      onClick={() =>
                        selectRole(
                          definition.roleDefinitionId,
                          definition.label
                        )
                      }
                    >
                      <span className="grid min-w-0 gap-1 wrap-anywhere text-left">
                        <strong className="wrap-anywhere">
                          {definition.label}
                        </strong>
                        <span className="wrap-anywhere text-muted-foreground text-xs">
                          {definition.scopeLabel ?? "全教會"} ·{" "}
                          {definition.assignmentCount} 個已指派 ·{" "}
                          {definition.grantCount} 項能力
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-auto text-muted-foreground text-xl"
                      >
                        ›
                      </span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );

  const renderDetail = () => {
    if (!detail) {
      return null;
    }
    return (
      <>
        <ActionSurface
          label={`權限編輯：${detail.roleDefinition.label}`}
          state={
            saveState === "conflict"
              ? "conflict"
              : saveState === "error"
                ? "failure"
                : saveState === "saving"
                  ? "busy"
                  : "selection"
          }
          busy={busy}
        >
          <div className="grid min-w-0 gap-4 p-4">
            <div className="grid min-w-0 gap-1">
              <h2
                className="min-w-0 wrap-anywhere text-xl font-semibold"
                id="permission-editor-detail-title"
                ref={detailHeadingRef}
                tabIndex={-1}
              >
                {detail.roleDefinition.label}
              </h2>
              <p className="min-w-0 wrap-anywhere text-muted-foreground text-sm">
                {detail.roleDefinition.description}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">適用範圍</dt>
                <dd className="font-medium">
                  {detail.roleDefinition.scopeLabel ?? "全教會"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">已指派帳戶</dt>
                <dd className="font-medium">
                  {detail.assignedAccounts.length}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">目前版本</dt>
                <dd className="font-medium">{detail.revision}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">狀態</dt>
                <dd className="font-medium">
                  {detail.roleDefinition.isArchived ? "已停用" : "生效"}
                </dd>
              </div>
            </dl>
            <label className="grid gap-2" htmlFor="permission-search">
              <span className="text-sm font-medium">{SEARCH_LABEL}</span>
              <Input
                className="min-h-11"
                id="permission-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                role="searchbox"
                type="search"
                value={query}
              />
            </label>
            {(saveState === "error" || saveState === "conflict") && (
              <div
                className="grid gap-2"
                id="permission-editor-feedback"
                role="alert"
              >
                <p>{saveState === "conflict" ? CONFLICT : ERROR}</p>
                {saveState === "conflict" && conflictRevision !== null && (
                  <p className="text-sm">最新政策版本：{conflictRevision}</p>
                )}
                {saveState === "conflict" && (
                  <Button
                    className="min-h-11"
                    onClick={discardAndRestart}
                    type="button"
                    variant="outline"
                  >
                    {DISCARD_RESTART}
                  </Button>
                )}
              </div>
            )}
            {saveState === "success" && <p role="status">{SUCCESS}</p>}
            <div className="grid gap-5" aria-label="連續權限清單">
              {groups.length === 0 && (
                <p className="text-muted-foreground">找不到符合的權限。</p>
              )}
              {groups.map((group) => (
                <section className="grid gap-2" key={group.group}>
                  <h3 className="border-b border-border pb-2 text-base font-semibold">
                    {group.group}
                  </h3>
                  <ul className="grid gap-2">
                    {group.permissions.map((permission) => {
                      const value =
                        draft?.[permission.capability] ?? permission.value;
                      const changed = value !== permission.value;
                      const disabled =
                        permission.locked || !permission.editable || busy;
                      const id = switchId(permission.capability);
                      return (
                        <li
                          className={cn(
                            permissionRowVariants({
                              state: changed ? "changed" : "clean",
                              disabled,
                            })
                          )}
                          data-capability={permission.capability}
                          key={permission.capability}
                        >
                          <div
                            className="grid min-w-0 gap-1"
                            id={`${id}-description`}
                          >
                            <label className="font-medium" htmlFor={id}>
                              {permission.label}
                              {changed && (
                                <span className="ml-2 text-primary text-xs">
                                  待儲存
                                </span>
                              )}
                            </label>
                            <span className="text-muted-foreground text-sm">
                              {permission.description}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {displayValue(value)} · {permission.capability}
                            </span>
                            {permission.locked && (
                              <span
                                className="text-muted-foreground text-xs"
                                id={`${id}-lock-reason`}
                              >
                                {LOCKED}：
                                {permission.lockReason ??
                                  "此項權限目前不可修改。"}
                              </span>
                            )}
                          </div>
                          <Switch
                            aria-describedby={
                              permission.locked
                                ? `${id}-lock-reason`
                                : `${id}-description`
                            }
                            aria-disabled={disabled || undefined}
                            aria-label={permission.label}
                            aria-busy={busy || undefined}
                            checked={value}
                            className="min-h-11 min-w-11"
                            disabled={disabled}
                            id={id}
                            onCheckedChange={(checked) =>
                              togglePermission(permission, checked)
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </ActionSurface>
        {detail.caller.canWrite && (
          <ManagementStickyActionBar
            busy={busy}
            disabled={changes.length === 0 || busy || saveState === "conflict"}
            label="權限儲存操作"
            state={
              saveState === "conflict"
                ? "conflict"
                : saveState === "error"
                  ? "failure"
                  : busy
                    ? "busy"
                    : changes.length > 0
                      ? "dirty"
                      : "save"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">
                {changes.length > 0
                  ? `${changes.length} 項待儲存 · 版本 ${baseRevision ?? detail.revision}`
                  : `版本 ${detail.revision}`}
              </span>
              <Button
                className="min-h-11"
                disabled={
                  changes.length === 0 || busy || saveState === "conflict"
                }
                onClick={openReview}
                ref={saveButtonRef}
                type="button"
              >
                {busy ? SAVING : SAVE}
              </Button>
            </div>
          </ManagementStickyActionBar>
        )}
        {!detail.caller.canWrite && (
          <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
            {detail.roleDefinition.isProtected
              ? "受保護身份的權限由系統固定。"
              : "您只有查看此身份組權限。"}
          </p>
        )}
      </>
    );
  };

  const state = resource.state;
  const headerTitle = detail
    ? `${LIST_TITLE} · ${detail.roleDefinition.label}`
    : LIST_TITLE;
  const headerLead = detail ? DETAIL_LEAD : LIST_LEAD;

  return (
    <main
      aria-busy={state.kind === "loading" || busy}
      className="mx-auto w-full min-w-0 max-w-6xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8"
    >
      <ManagementPageHeader
        backHref={detail ? "/management?module=permissions" : returnHref}
        backLabel={detail ? BACK_TO_ROLES : BACK_TO_MANAGEMENT}
        lead={headerLead}
        onBackClick={detail ? goToRoleList : undefined}
        title={headerTitle}
        titleId="permission-editor-title"
      />
      {state.kind === "loading" && (
        <output
          aria-busy="true"
          className={cn(stateSurfaceVariants({ kind: "loading" }))}
          id="permission-editor-state"
          tabIndex={-1}
        >
          正在載入權限…
        </output>
      )}
      {state.kind === "error" && (
        <section
          className={cn(stateSurfaceVariants({ kind: "error" }))}
          id="permission-editor-state"
          role="alert"
          tabIndex={-1}
        >
          <p>{state.message}</p>
          <Button
            className="min-h-11"
            onClick={retryLoad}
            type="button"
            variant="outline"
          >
            重試連接
          </Button>
        </section>
      )}
      {state.kind === "forbidden" && (
        <section
          className={cn(stateSurfaceVariants({ kind: "forbidden" }))}
          id="permission-editor-state"
          role="alert"
          tabIndex={-1}
        >
          {state.message}
        </section>
      )}
      {state.kind === "list" && (
        <div className="mt-6">{renderRoleList(state.data.hierarchy)}</div>
      )}
      {state.kind === "detail" && <div className="mt-6">{renderDetail()}</div>}

      <Sheet
        open={review === "sheet"}
        onOpenChange={(open) => !open && closeReview()}
      >
        <SheetContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            saveButtonRef.current?.focus();
          }}
          className="max-h-[min(70dvh,32rem)] pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
          side="bottom"
        >
          <SheetHeader>
            <SheetTitle>{REVIEW_TITLE}</SheetTitle>
            <SheetDescription>
              請核對今次變更；確認後會以一個政策版本儲存。
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4">
            {detail && reviewChanges(changes, detail.permissions)}
          </div>
          <SheetFooter>
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={closeReview}
              type="button"
              variant="outline"
            >
              {REVIEW_CANCEL}
            </Button>
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() => void submitChanges()}
              type="button"
            >
              {REVIEW_CONFIRM}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={review === "dedicated"}
        onOpenChange={(open) => !open && closeReview()}
      >
        <AlertDialogContent
          className="max-h-[min(80dvh,42rem)] overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            saveButtonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{DEDICATED_REVIEW_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              這次變更包含超過三項或高風險權限。請逐項確認後再提交。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {detail && reviewChanges(changes, detail.permissions)}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={closeReview}>
              {REVIEW_CANCEL}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void submitChanges()}
            >
              {REVIEW_CONFIRM}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
