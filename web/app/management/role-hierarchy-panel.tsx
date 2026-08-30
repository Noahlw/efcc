"use client";

import { cva } from "class-variance-authority";
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
import { COPY } from "@/lib/copy";
import type {
  RoleHierarchyView,
  RoleHierarchyDefinition,
  RoleHierarchyOrderTarget,
} from "@/lib/identity";
import {
  getRoleHierarchy,
  renameRoleDefinition,
  createRoleDefinition,
  rescopeRoleDefinition,
  reorderRoleDefinitions,
} from "@/lib/identity/role-hierarchy-api";
import { announce } from "@/lib/live-region";
import { rememberDeepLink } from "@/lib/session";
import { cn } from "@/lib/utils";

import {
  ManagementPageHeader,
  safeManagementReturnHref,
} from "./management-action-framework";

const roleButtonVariants = cva(
  "grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center justify-between gap-2.5 rounded-xl border bg-[var(--surface-raised)] px-2.5 py-2.5 text-left text-base font-normal whitespace-normal text-[var(--ink)] outline-none hover:border-[var(--focus)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30",
  {
    variants: {
      state: {
        default: "border-[var(--line)]",
      },
    },
    defaultVariants: { state: "default" },
  }
);

const categoryToggleVariants = cva(
  "min-h-11 w-full min-w-0 shrink justify-start gap-2 rounded-[var(--radius-sm)] border bg-[var(--surface)] px-2 text-left text-base font-normal whitespace-normal text-[var(--ink)] hover:border-[var(--focus)] hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30",
  {
    variants: {
      expanded: {
        true: "border-[var(--focus)]",
        false: "border-[var(--line)]",
      },
    },
    defaultVariants: { expanded: false },
  }
);

const actionButtonVariants = cva(
  "min-h-11 h-auto rounded-[var(--radius-sm)] px-4 py-2 text-base whitespace-normal",
  {
    variants: {
      tone: {
        primary: "font-extrabold",
        secondary:
          "border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] font-bold hover:bg-[var(--surface)] hover:text-[var(--ink)]",
      },
    },
    defaultVariants: { tone: "primary" },
  }
);

const orderButtonVariants = cva(
  "min-h-11 min-w-11 h-auto rounded-[var(--radius-sm)] px-3 py-2 text-sm font-bold whitespace-normal",
  {
    variants: {
      state: {
        enabled:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]",
        disabled:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]",
      },
    },
    defaultVariants: { state: "enabled" },
  }
);

const fieldClass = "mt-3 grid min-w-0 gap-1.5";
const fieldLabelClass = "text-[0.82rem] font-bold text-[var(--ink)]";

const RENAME_LABEL = "重新命名";
const SCOPE_EDIT_LABEL = "編輯適用範圍";
const DETAIL_BACK_LABEL = "返回身份組列表";
const SAVE_LABEL = "儲存名稱";
const SCOPE_SAVE_LABEL = "儲存適用範圍";
const CANCEL_LABEL = "取消";
const SUCCESS_MESSAGE = "身份組名稱已更新";
const SCOPE_SUCCESS_MESSAGE = "身份組適用範圍已更新";
const SAVING_MESSAGE = "正在儲存名稱…";
const SCOPE_SAVING_MESSAGE = "正在儲存適用範圍…";
const CONFLICT_MESSAGE = "身份組名稱已有更新，請重新載入後再試。";
const SCOPE_CONFLICT_MESSAGE = "身份組適用範圍已有更新，請重新載入後再試。";
const FORBIDDEN_MESSAGE = "您沒有權限執行此操作。";
const NOT_FOUND_MESSAGE = "找不到指定的身份組。";
const INVALID_NAME_MESSAGE = "名稱不可空白，且不可超過 60 個字元。";
const NAME_CONFLICT_MESSAGE = "已存在相同名稱的身份組。";
const ARCHIVED_MESSAGE = "已停用的身份組不可重新命名。";
const SCOPE_ARCHIVED_MESSAGE = "已停用的身份組不可變更適用範圍。";
const LOAD_ERROR_MESSAGE = "身份組資料暫時無法載入，請稍後再試。";

const CREATE_LABEL = "建立身份組";
const PERMISSION_EDIT_LABEL = "編輯權限";
const CREATE_TITLE = "建立身份組";
const CREATE_SAVE_LABEL = "建立";
const CREATE_SAVING_LABEL = "建立中…";
const CREATE_SUCCESS_MESSAGE = "身份組已建立";
const CREATE_SCOPE_LABEL = "適用範圍";
const CREATE_NAME_LABEL = "名稱";
const CREATE_DESCRIPTION_LABEL = "描述（可選）";
const CREATE_MOVE_UP = "上移";
const CREATE_MOVE_DOWN = "下移";
const CREATE_KEEP_MINE = "保留我的排序";
const CREATE_TAKE_LATEST = "採用最新排序";
const ORDER_UPDATED_MESSAGE = "身份組順序已更新";
const ORDER_CONFLICT_MESSAGE = "身份組順序已有更新。";
const REORDERING_MESSAGE = "正在更新身份組順序…";
const CREATE_FORBIDDEN_MESSAGE = "您沒有權限建立身份組。";
const CREATE_INVALID_SCOPE_MESSAGE = "請選擇有效的適用範圍。";
const CREATING_MESSAGE = "正在建立身份組…";
const ORDER_CONFLICT_TITLE = "順序衝突";
const ORDER_CONFLICT_INTRO = "另一位操作者已更新身份組順序。";
const ORDER_CONFLICT_LOCAL = "我的排序";
const ORDER_CONFLICT_AUTHORITATIVE = "最新排序";
const REORDER_GROUP_LABEL = "調整順序";

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; data: RoleHierarchyView }
  | { kind: "error"; message: string };

type RenameState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "name-conflict" }
  | { kind: "archived" }
  | { kind: "not-found" }
  | { kind: "invalid-name" }
  | { kind: "error" };
type ScopeState =
  | { kind: "idle" }
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "invalid-scope" }
  | { kind: "archived" }
  | { kind: "not-found" }
  | { kind: "error" };

type CreateState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "name-conflict" }
  | { kind: "invalid-name" }
  | { kind: "invalid-scope" }
  | { kind: "error" };

interface CreateDraft {
  categoryKey: string;
  scopeOption: string;
  label: string;
  description: string;
}
function scopeOptionValue(scopeKind: string, scopeId: string | null): string {
  return `${scopeKind}:${scopeId ?? "global"}`;
}

/** Local order state the operator is composing (B-479-10 保留我的排序). */
interface OrderDraft {
  categoryKey: string;
  ids: string[];
  dirty: boolean;
}

type OrderConflictState =
  | { kind: "idle" }
  | {
      kind: "pending";
      categoryKey: string;
      /** The two sibling IDs the operator tried to swap. */
      targetIds: [string, string];
      localIds: string[];
      authoritativeIds: string[];
      authoritativeRevision: number;
    };

function safeRoleId(
  value: string | null,
  data: RoleHierarchyView
): string | null {
  if (!value) {
    return null;
  }
  const known = data.categories
    .flatMap((category) => category.definitions)
    .some((definition) => definition.roleDefinitionId === value);
  return known ? value : null;
}

/** Parse the URL role/view into safe state (H-17/H-18). */
function parseUrlState(
  params: URLSearchParams,
  data: RoleHierarchyView
): { roleId: string | null; view: "detail" | "rename" | "list" } {
  const rawRole = params.get("role");
  const roleId = safeRoleId(rawRole, data);
  const rawView = params.get("view");
  // `view=rename` is honored only when the projected role action permits
  // rename; anything else falls back to detail/list (H-10/H-17).
  if (roleId !== null && rawView === "rename") {
    const definition = data.categories
      .flatMap((category) => category.definitions)
      .find((item) => item.roleDefinitionId === roleId);
    if (definition?.actions.some((action) => action.action === "rename")) {
      return { roleId, view: "rename" };
    }
    return { roleId, view: "detail" };
  }
  if (roleId !== null && rawView === "detail") {
    return { roleId, view: "detail" };
  }
  return { roleId: roleId ?? null, view: "list" };
}

function rolesHref(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `/management?${search.toString()}`;
}

/** All definitions in one category, in authoritative position order. */
function definitionsInCategory(
  data: RoleHierarchyView,
  categoryKey: string
): RoleHierarchyDefinition[] {
  const category = data.categories.find(
    (item) => item.categoryKey === categoryKey
  );
  return category
    ? [...category.definitions].sort((a, b) => a.position - b.position)
    : [];
}

/**
 * B-479-07/B-479-08: 上移/下移 move exactly one sibling one step inside
 * the fixed category. Only the two affected sibling positions swap; the
 * parent Category, grants, scope, and assignments are untouched by
 * construction (the mutation kernel only writes position values).
 */
function moveSibling(
  data: RoleHierarchyView,
  categoryKey: string,
  roleDefinitionId: string,
  direction: "up" | "down"
): RoleHierarchyOrderTarget[] | null {
  const siblings = definitionsInCategory(data, categoryKey);
  const index = siblings.findIndex(
    (definition) => definition.roleDefinitionId === roleDefinitionId
  );
  if (index === -1) {
    return null;
  }
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) {
    return null;
  }
  const current = siblings[index];
  const neighbor = siblings[swapWith];
  if (!current || !neighbor) {
    return null;
  }
  return [
    {
      role_definition_id: current.roleDefinitionId,
      position: neighbor.position,
    },
    {
      role_definition_id: neighbor.roleDefinitionId,
      position: current.position,
    },
  ];
}

/** Local order draft for one category (B-479-10 保留我的排序). */
function orderDraftFor(
  data: RoleHierarchyView,
  categoryKey: string
): OrderDraft {
  return {
    categoryKey,
    ids: definitionsInCategory(data, categoryKey).map(
      (definition) => definition.roleDefinitionId
    ),
    dirty: false,
  };
}

// oxlint-disable-next-line eslint/complexity -- The panel owns the complete hierarchy/detail/rename state machine (same convention as account-directory-panel.tsx).
export const RoleHierarchyPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnHref = safeManagementReturnHref(
    searchParams.get("return"),
    "/management"
  );
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  // H-02: expansion state is local to this screen (never persisted).
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("role")
  );
  const [view, setView] = useState<"detail" | "rename" | "list">(
    searchParams.get("view") === "rename"
      ? "rename"
      : searchParams.get("view") === "detail"
        ? "detail"
        : "list"
  );

  const [renameValue, setRenameValue] = useState("");
  const [renameState, setRenameState] = useState<RenameState>({ kind: "idle" });
  const renameSeedRef = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [scopeValue, setScopeValue] = useState("");
  const [scopeState, setScopeState] = useState<ScopeState>({ kind: "idle" });

  const [createView, setCreateView] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    categoryKey: "",
    scopeOption: "",
    label: "",
    description: "",
  });
  const [createState, setCreateState] = useState<CreateState>({
    kind: "idle",
  });
  const createInputRef = useRef<HTMLInputElement | null>(null);
  // B-479-10: the local order draft the operator is composing per category,
  // plus the explicit stale-order conflict awaiting a 保留我的排序 /
  // 採用最新排序 choice before any retry.
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>(
    () => ({})
  );
  const [orderConflict, setOrderConflict] = useState<OrderConflictState>({
    kind: "idle",
  });
  const [reorderingCategory, setReorderingCategory] = useState<string | null>(
    null
  );

  useEffect(() => {
    let current = true;
    setState({ kind: "loading" });
    announce(COPY.permissions.loading);
    void (async () => {
      try {
        const data = await getRoleHierarchy();
        if (!current) {
          return;
        }
        // H-17/H-18: reconcile the URL role/view against the loaded data.
        // Malformed or unknown values fall back to the safe list.
        const urlState = parseUrlState(searchParams, data);
        if (
          urlState.roleId !== selectedId ||
          urlState.view !== view ||
          (urlState.roleId === null && selectedId !== null)
        ) {
          setSelectedId(urlState.roleId);
          setView(urlState.view);
          if (urlState.roleId === null) {
            window.history.replaceState(null, "", "/management?module=roles");
          }
        }
        setState({ kind: "ready", data });
        announce("");
      } catch (error) {
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
          error instanceof RpcError &&
          (error.problem.code === "FORBIDDEN" ||
            error.problem.code === "ROLE_FORBIDDEN")
            ? FORBIDDEN_MESSAGE
            : LOAD_ERROR_MESSAGE;
        setState({ kind: "error", message });
        announce(message);
      }
    })();
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedId/view are revalidated from loaded data, not reload triggers.
  }, [retryToken, router]);

  // H-17: browser Back/forward transitions update the panel state.
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      if (state.kind !== "ready") {
        return;
      }
      const urlState = parseUrlState(params, state.data);
      setSelectedId(urlState.roleId);
      setView(urlState.view);
      setRenameState({ kind: "idle" });
      setScopeState({ kind: "idle" });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [state]);

  const readyData = state.kind === "ready" ? state.data : null;
  const selected =
    readyData && selectedId
      ? (readyData.categories
          .flatMap((category) => category.definitions)
          .find((definition) => definition.roleDefinitionId === selectedId) ??
        null)
      : null;
  // Direct `view=rename` links load the projection first, then seed the input
  // from the authoritative current label. The role ref prevents a user's
  // cleared/edited draft from being overwritten on every keystroke.
  useEffect(() => {
    if (view !== "rename" || !selected) {
      renameSeedRef.current = null;
      return;
    }
    if (renameSeedRef.current !== selected.roleDefinitionId) {
      renameSeedRef.current = selected.roleDefinitionId;
      setRenameValue(selected.label);
    }
  }, [selected, view]);

  useEffect(() => {
    if (view === "detail" && selected) {
      detailRef.current?.focus();
    }
  }, [selected, view]);

  useEffect(() => {
    if (view === "rename" && renameState.kind === "idle") {
      const input = renameInputRef.current;
      input?.focus();
      input?.select();
    }
  }, [renameState.kind, view, selected?.roleDefinitionId]);

  // Focus restore when returning to the list (H-17).
  useEffect(() => {
    if (view === "list" && state.kind === "ready") {
      listHeadingRef.current?.focus();
    }
  }, [view, state.kind]);

  const openDetail = (definition: RoleHierarchyDefinition) => {
    setSelectedId(definition.roleDefinitionId);
    setView("detail");
    setRenameState({ kind: "idle" });
    setScopeState({ kind: "idle" });
    window.history.pushState(
      null,
      "",
      rolesHref({
        module: "roles",
        role: definition.roleDefinitionId,
        view: "detail",
      })
    );
    announce(definition.label);
  };

  const openRename = (definition: RoleHierarchyDefinition) => {
    if (!definition.actions.some((action) => action.action === "rename")) {
      return;
    }
    setRenameValue(definition.label);
    setRenameState({ kind: "idle" });
    setScopeState({ kind: "idle" });
    setView("rename");
    window.history.pushState(
      null,
      "",
      rolesHref({
        module: "roles",
        role: definition.roleDefinitionId,
        view: "rename",
      })
    );
  };

  const goBack = () => {
    if (view === "rename") {
      setView("detail");
      setRenameState({ kind: "idle" });
      setScopeState({ kind: "idle" });
      window.history.replaceState(
        null,
        "",
        rolesHref({
          module: "roles",
          role: selectedId ?? "",
          view: "detail",
        })
      );
      return;
    }
    if (view === "detail") {
      setView("list");
      setSelectedId(null);
      setRenameState({ kind: "idle" });
      window.history.replaceState(null, "", "/management?module=roles");
      setScopeState({ kind: "idle" });
      return;
    }
    router.push(returnHref);
  };

  const classifyRenameError = (
    error: unknown
  ): { state: RenameState; message: string } => {
    if (!(error instanceof RpcError)) {
      return { state: { kind: "error" }, message: LOAD_ERROR_MESSAGE };
    }
    const { code } = error.problem;
    // B10: conflict/idempotency/not-found codes are distinct states — only
    // genuine authorization failures map to the forbidden state.
    if (code === "ROLE_POLICY_CONFLICT" || code === "ROLE_REVISION_CONFLICT") {
      return { state: { kind: "conflict" }, message: CONFLICT_MESSAGE };
    }
    if (code === "ROLE_IDEMPOTENCY_REUSE") {
      return { state: { kind: "conflict" }, message: CONFLICT_MESSAGE };
    }
    if (code === "ROLE_ARCHIVED") {
      return { state: { kind: "archived" }, message: ARCHIVED_MESSAGE };
    }
    if (code === "ROLE_NAME_TAKEN") {
      return {
        state: { kind: "name-conflict" },
        message: NAME_CONFLICT_MESSAGE,
      };
    }
    if (code === "ROLE_NOT_FOUND") {
      return { state: { kind: "not-found" }, message: NOT_FOUND_MESSAGE };
    }
    if (code === "INVALID_NAME") {
      return { state: { kind: "invalid-name" }, message: INVALID_NAME_MESSAGE };
    }
    if (
      code === "FORBIDDEN" ||
      code === "ROLE_FORBIDDEN" ||
      code === "ROLE_ADMIN_PROTECTED" ||
      code === "ROLE_BASELINE_PROTECTED" ||
      code === "ROLE_PROTECTED" ||
      code === "ROLE_HIGHEST_PROTECTED" ||
      code === "ROLE_SCOPE_MISMATCH"
    ) {
      return { state: { kind: "forbidden" }, message: FORBIDDEN_MESSAGE };
    }
    return { state: { kind: "error" }, message: LOAD_ERROR_MESSAGE };
  };

  const submitRename = async () => {
    if (!readyData || !selected || renameState.kind === "submitting") {
      return;
    }
    const label = renameValue.trim();
    if (label.length === 0 || label.length > 60) {
      setRenameState({ kind: "invalid-name" });
      announce(INVALID_NAME_MESSAGE);
      return;
    }
    setRenameState({ kind: "submitting" });
    announce(SAVING_MESSAGE);
    try {
      await renameRoleDefinition(
        selected.roleDefinitionId,
        {
          label,
          baseRevision: readyData.revision,
        },
        crypto.randomUUID()
      );
      setRenameState({ kind: "success" });
      announce(SUCCESS_MESSAGE);
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
    } catch (error) {
      const classified = classifyRenameError(error);
      setRenameState(classified.state);
      announce(classified.message);
    }
  };
  const classifyScopeError = (
    error: unknown
  ): { state: ScopeState; message: string } => {
    if (!(error instanceof RpcError)) {
      return { state: { kind: "error" }, message: LOAD_ERROR_MESSAGE };
    }
    const { code } = error.problem;
    if (
      code === "ROLE_POLICY_CONFLICT" ||
      code === "ROLE_REVISION_CONFLICT" ||
      code === "ROLE_IDEMPOTENCY_REUSE"
    ) {
      return { state: { kind: "conflict" }, message: SCOPE_CONFLICT_MESSAGE };
    }
    if (code === "ROLE_ARCHIVED") {
      return { state: { kind: "archived" }, message: SCOPE_ARCHIVED_MESSAGE };
    }
    if (code === "ROLE_NOT_FOUND") {
      return { state: { kind: "not-found" }, message: NOT_FOUND_MESSAGE };
    }
    if (code === "ROLE_INVALID_PARENT" || code === "ROLE_SCOPE_REQUIRED") {
      return {
        state: { kind: "invalid-scope" },
        message: CREATE_INVALID_SCOPE_MESSAGE,
      };
    }
    if (
      code === "FORBIDDEN" ||
      code === "ROLE_FORBIDDEN" ||
      code === "ROLE_HIGHEST_PROTECTED" ||
      code === "ROLE_SCOPE_MISMATCH" ||
      code === "ROLE_ADMIN_PROTECTED" ||
      code === "ROLE_BASELINE_PROTECTED" ||
      code === "ROLE_PROTECTED"
    ) {
      return { state: { kind: "forbidden" }, message: FORBIDDEN_MESSAGE };
    }
    return { state: { kind: "error" }, message: LOAD_ERROR_MESSAGE };
  };

  const openScope = (definition: RoleHierarchyDefinition) => {
    if (
      !definition.actions.some((action) => action.action === "scope") ||
      (definition.scopeOptions ?? []).length === 0
    ) {
      return;
    }
    const options = definition.scopeOptions ?? [];
    const currentValue = scopeOptionValue(
      definition.scopeKind,
      definition.scopeId
    );
    const [firstOption] = options;
    setScopeValue(
      options.some(
        (option) =>
          scopeOptionValue(option.scope_kind, option.scope_id) === currentValue
      )
        ? currentValue
        : firstOption
          ? scopeOptionValue(firstOption.scope_kind, firstOption.scope_id)
          : ""
    );
    setScopeState({ kind: "editing" });
  };

  const submitScope = async () => {
    if (!readyData || !selected || scopeState.kind === "submitting") {
      return;
    }
    const option = (selected.scopeOptions ?? []).find(
      (candidate) =>
        scopeOptionValue(candidate.scope_kind, candidate.scope_id) ===
        scopeValue
    );
    if (!option) {
      setScopeState({ kind: "invalid-scope" });
      announce(CREATE_INVALID_SCOPE_MESSAGE);
      return;
    }
    setScopeState({ kind: "submitting" });
    announce(SCOPE_SAVING_MESSAGE);
    try {
      await rescopeRoleDefinition(
        selected.roleDefinitionId,
        {
          category_key: option.category_key,
          scope_kind: option.scope_kind,
          scope_id: option.scope_id,
          base_revision: readyData.revision,
        },
        crypto.randomUUID()
      );
      setScopeState({ kind: "success" });
      announce(SCOPE_SUCCESS_MESSAGE);
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
      setScopeState({ kind: "idle" });
    } catch (error) {
      const classified = classifyScopeError(error);
      setScopeState(classified.state);
      announce(classified.message);
    }
  };

  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  const openCreate = (categoryKey: string) => {
    if (!readyData) {
      return;
    }
    const category = readyData.categories.find(
      (item) => item.categoryKey === categoryKey
    );
    if (!category || category.createOptions.length === 0) {
      return;
    }
    const [option] = category.createOptions;
    if (!option) {
      return;
    }
    setCreateDraft({
      categoryKey,
      scopeOption: option.scope_id ?? "global",
      label: "",
      description: "",
    });
    setCreateState({ kind: "idle" });
    setCreateView(true);
  };

  const closeCreate = () => {
    setCreateView(false);
    setCreateState({ kind: "idle" });
  };

  const submitCreate = async () => {
    if (!readyData) {
      return;
    }
    const label = createDraft.label.trim();
    if (label.length === 0 || label.length > 60) {
      setCreateState({ kind: "invalid-name" });
      announce(INVALID_NAME_MESSAGE);
      return;
    }
    const category = readyData.categories.find(
      (item) => item.categoryKey === createDraft.categoryKey
    );
    const option = category?.createOptions.find(
      (candidate) =>
        (candidate.scope_id ?? "global") === createDraft.scopeOption
    );
    if (!category || !option) {
      setCreateState({ kind: "invalid-scope" });
      announce(CREATE_INVALID_SCOPE_MESSAGE);
      return;
    }
    setCreateState({ kind: "submitting" });
    announce(CREATING_MESSAGE);
    try {
      await createRoleDefinition(
        {
          category_key: category.categoryKey,
          label,
          description: createDraft.description.trim(),
          scope_kind: option.scope_kind,
          scope_id: option.scope_id,
          base_revision: readyData.revision,
        },
        crypto.randomUUID()
      );
      setCreateState({ kind: "success" });
      announce(CREATE_SUCCESS_MESSAGE);
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
      setCreateView(false);
      setCreateState({ kind: "idle" });
      setExpandedCategories(
        (current) => new Set([...current, category.categoryKey])
      );
    } catch (error) {
      if (error instanceof RpcError) {
        const { code } = error.problem;
        if (code === "ROLE_FORBIDDEN" || code === "FORBIDDEN") {
          setCreateState({ kind: "forbidden" });
          announce(CREATE_FORBIDDEN_MESSAGE);
          return;
        }
        if (code === "ROLE_NAME_TAKEN") {
          setCreateState({ kind: "name-conflict" });
          announce(NAME_CONFLICT_MESSAGE);
          return;
        }
        if (code === "INVALID_NAME") {
          setCreateState({ kind: "invalid-name" });
          announce(INVALID_NAME_MESSAGE);
          return;
        }
      }
      setCreateState({ kind: "error" });
      announce(LOAD_ERROR_MESSAGE);
    }
  };

  const commitOrder = async (
    categoryKey: string,
    targets: RoleHierarchyOrderTarget[]
  ) => {
    if (!readyData || reorderingCategory !== null) {
      return;
    }
    const [firstTarget, secondTarget] = targets;
    if (!firstTarget || !secondTarget) {
      return;
    }
    setReorderingCategory(categoryKey);
    announce(REORDERING_MESSAGE);
    try {
      const result = await reorderRoleDefinitions(
        categoryKey as "Global" | "Department" | "Program",
        targets,
        readyData.revision,
        crypto.randomUUID()
      );
      // B-479-10: the authoritative response identifies the new revision;
      // the local draft is reset against the authoritative order.
      setOrderDrafts((current) => ({
        ...current,
        [categoryKey]: {
          categoryKey,
          ids: result.orderedRoleDefinitionIds,
          dirty: false,
        },
      }));
      setOrderConflict({ kind: "idle" });
      announce(ORDER_UPDATED_MESSAGE);
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
    } catch (error) {
      if (
        error instanceof RpcError &&
        error.problem.code === "ROLE_ORDER_CONFLICT"
      ) {
        const extension = error.problem as typeof error.problem & {
          orderedRoleDefinitionIds?: unknown;
          currentRevision?: unknown;
        };
        const authoritativeIds = extension.orderedRoleDefinitionIds;
        const authoritativeRevision =
          typeof extension.currentRevision === "number"
            ? extension.currentRevision
            : readyData.revision;
        if (Array.isArray(authoritativeIds)) {
          const localIds = orderDrafts[categoryKey]?.ids ?? [];
          setOrderConflict({
            kind: "pending",
            categoryKey,
            targetIds: [
              firstTarget.role_definition_id,
              secondTarget.role_definition_id,
            ],
            localIds,
            authoritativeIds,
            authoritativeRevision,
          });
          announce(ORDER_CONFLICT_MESSAGE);
          return;
        }
      }
      if (
        error instanceof RpcError &&
        (error.problem.code === "ROLE_FORBIDDEN" ||
          error.problem.code === "FORBIDDEN")
      ) {
        announce(FORBIDDEN_MESSAGE);
      } else {
        announce(LOAD_ERROR_MESSAGE);
      }
    } finally {
      setReorderingCategory(null);
    }
  };

  // B-479-08: 上移/下移 are a sibling-only move through the same kernel.
  const moveSiblingByButton = (
    categoryKey: string,
    roleDefinitionId: string,
    direction: "up" | "down"
  ) => {
    if (!readyData || reorderingCategory !== null) {
      return;
    }
    const targets = moveSibling(
      readyData,
      categoryKey,
      roleDefinitionId,
      direction
    );
    if (targets === null) {
      return;
    }
    const draft =
      orderDrafts[categoryKey] ?? orderDraftFor(readyData, categoryKey);
    const index = draft.ids.indexOf(roleDefinitionId);
    if (index === -1) {
      return;
    }
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= draft.ids.length) {
      return;
    }
    const movedId = draft.ids[index];
    const neighborId = draft.ids[swap];
    if (!movedId || !neighborId) {
      return;
    }
    const nextIds = [...draft.ids];
    nextIds[index] = neighborId;
    nextIds[swap] = movedId;
    setOrderDrafts((current) => ({
      ...current,
      [categoryKey]: { ...draft, ids: nextIds, dirty: true },
    }));
    void commitOrder(categoryKey, targets);
  };
  const commitOrderWithRevision = async (
    categoryKey: string,
    targets: RoleHierarchyOrderTarget[],
    revision: number
  ) => {
    if (!readyData || reorderingCategory !== null) {
      return;
    }
    setReorderingCategory(categoryKey);
    announce(REORDERING_MESSAGE);
    try {
      const result = await reorderRoleDefinitions(
        categoryKey as "Global" | "Department" | "Program",
        targets,
        revision,
        crypto.randomUUID()
      );
      setOrderDrafts((current) => ({
        ...current,
        [categoryKey]: {
          categoryKey,
          ids: result.orderedRoleDefinitionIds,
          dirty: false,
        },
      }));
      announce(ORDER_UPDATED_MESSAGE);
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
    } catch (error) {
      if (
        error instanceof RpcError &&
        error.problem.code === "ROLE_ORDER_CONFLICT"
      ) {
        announce(ORDER_CONFLICT_MESSAGE);
        return;
      }
      announce(LOAD_ERROR_MESSAGE);
    } finally {
      setReorderingCategory(null);
    }
  };

  /** B-479-10: retry the pending reorder with the local order kept. */
  const resolveOrderConflictKeepMine = async () => {
    if (orderConflict.kind !== "pending" || !readyData) {
      return;
    }
    const { targetIds, categoryKey, authoritativeRevision } = orderConflict;
    const siblings = definitionsInCategory(readyData, categoryKey);
    const [firstId, secondId] = targetIds;
    const first = siblings.find(
      (definition) => definition.roleDefinitionId === firstId
    );
    const second = siblings.find(
      (definition) => definition.roleDefinitionId === secondId
    );
    if (!first || !second) {
      setOrderConflict({ kind: "idle" });
      return;
    }
    // 保留我的排序: re-apply the operator's swap of the same two siblings
    // against the authoritative revision.
    const targets: RoleHierarchyOrderTarget[] = [
      { role_definition_id: first.roleDefinitionId, position: second.position },
      { role_definition_id: second.roleDefinitionId, position: first.position },
    ];
    setOrderConflict({ kind: "idle" });
    await commitOrderWithRevision(categoryKey, targets, authoritativeRevision);
  };

  /** B-479-10: retry against the authoritative order (採用最新排序). */
  const resolveOrderConflictTakeLatest = async () => {
    if (orderConflict.kind !== "pending" || !readyData) {
      return;
    }
    const { categoryKey } = orderConflict;
    // 採用最新排序: accept the authoritative order and clear the local
    // draft; the reloaded projection is the authoritative tree.
    setOrderConflict({ kind: "idle" });
    setOrderDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== categoryKey)
      )
    );
    announce(ORDER_UPDATED_MESSAGE);
    try {
      const data = await getRoleHierarchy();
      setState({ kind: "ready", data });
    } catch {
      announce(LOAD_ERROR_MESSAGE);
    }
  };

  return (
    <section
      aria-busy={state.kind === "loading"}
      aria-labelledby="role-hierarchy-title"
      className="mx-auto w-full min-w-0 max-w-[var(--width-container)] px-[clamp(1rem,4vw,2rem)] pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] shell:px-[clamp(1.5rem,4vw,3rem)] shell:pt-8 shell:pb-32 motion-reduce:transition-none motion-reduce:animate-none motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none"
    >
      <ManagementPageHeader
        backHref={returnHref}
        backLabel="返回管理工作"
        lead="按分類檢視身份組；重新命名只可套用於較低順位的身份組。"
        title="身份組"
        titleId="role-hierarchy-title"
        titleRef={listHeadingRef}
      />

      {state.kind === "loading" && (
        <output
          aria-busy="true"
          className="mt-4 block rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-[var(--ink-muted)]"
          tabIndex={-1}
        >
          {COPY.permissions.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          className="mt-4 grid min-w-0 gap-2 rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-4"
          id="role-hierarchy-state"
          tabIndex={-1}
        >
          <h2 className="m-0 text-base">{state.message}</h2>
          <Button
            className="min-h-11 w-fit px-4 font-extrabold"
            onClick={() => setRetryToken((token) => token + 1)}
            type="button"
          >
            {COPY.permissions.retry}
          </Button>
        </section>
      )}

      {readyData && view === "list" && (
        <div className="mt-5 grid gap-5 shell:items-start shell:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {readyData.categories.map((category) => {
            const expanded = expandedCategories.has(category.categoryKey);
            const headingId = `role-category-${category.categoryKey}`;
            const draft = orderDrafts[category.categoryKey];
            const orderedIds =
              draft?.ids ??
              definitionsInCategory(readyData, category.categoryKey).map(
                (definition) => definition.roleDefinitionId
              );
            const orderedDefinitions = orderedIds
              .map((roleDefinitionId) =>
                category.definitions.find(
                  (definition) =>
                    definition.roleDefinitionId === roleDefinitionId
                )
              )
              .filter(
                (definition): definition is RoleHierarchyDefinition =>
                  definition !== undefined
              );
            const reordering = reorderingCategory === category.categoryKey;
            return (
              <section
                aria-labelledby={headingId}
                className="min-w-0"
                key={category.categoryKey}
              >
                <h2
                  className="m-0 mb-2 flex min-w-0 items-baseline gap-2 text-[1.05rem]"
                  id={headingId}
                >
                  <Button
                    aria-controls={`role-category-body-${category.categoryKey}`}
                    aria-expanded={expanded}
                    className={cn(
                      categoryToggleVariants({ expanded }),
                      "min-w-0"
                    )}
                    onClick={() => toggleCategory(category.categoryKey)}
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 shrink-0 text-center text-[var(--ink-muted)]"
                    >
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0 flex-1">{category.label}</span>
                    <span className="shrink-0 text-[0.78rem] font-bold text-[var(--ink-muted)]">
                      {category.childCount}
                    </span>
                  </Button>
                  {category.createOptions.length > 0 && (
                    <Button
                      className={cn(
                        actionButtonVariants({ tone: "primary" }),
                        "ml-2 shrink-0"
                      )}
                      onClick={() => openCreate(category.categoryKey)}
                      size="lg"
                      type="button"
                      variant="default"
                    >
                      {CREATE_LABEL}
                    </Button>
                  )}
                </h2>
                {expanded && (
                  <ul
                    aria-busy={reordering}
                    className="m-0 grid min-w-0 list-none gap-2 p-0"
                    id={`role-category-body-${category.categoryKey}`}
                  >
                    {orderedDefinitions.map((definition, index) => {
                      const canMoveUp = !reordering && index > 0;
                      const canMoveDown =
                        !reordering && index < orderedDefinitions.length - 1;
                      return (
                        <li
                          className="min-w-0"
                          key={definition.roleDefinitionId}
                        >
                          <div className="grid min-w-0 gap-2">
                            <Button
                              aria-label={`${definition.label} · 詳情`}
                              className={cn(
                                roleButtonVariants({ state: "default" })
                              )}
                              onClick={() => openDetail(definition)}
                              size="lg"
                              type="button"
                              variant="outline"
                            >
                              <span className="grid min-w-0 gap-0.5">
                                <strong className="wrap-anywhere">
                                  {definition.label}
                                </strong>
                                <small className="wrap-anywhere text-[0.74rem] text-[var(--ink-muted)]">
                                  {definition.scopeLabel ?? "全教會"} ·{" "}
                                  {definition.assignmentCount} 個已指派 ·{" "}
                                  {definition.grantCount} 項能力
                                  {definition.isProtected ? " · 系統固定" : ""}
                                </small>
                              </span>
                              <span
                                aria-hidden="true"
                                className="text-lg text-[var(--ink-muted)]"
                              >
                                ›
                              </span>
                            </Button>
                            {definition.reorderActions.length > 0 && (
                              <fieldset className="flex gap-2">
                                <legend className="sr-only">
                                  {REORDER_GROUP_LABEL}
                                </legend>
                                <Button
                                  aria-label={`${CREATE_MOVE_UP} · ${definition.label}`}
                                  className={cn(
                                    orderButtonVariants({
                                      state: canMoveUp ? "enabled" : "disabled",
                                    })
                                  )}
                                  disabled={!canMoveUp}
                                  onClick={() =>
                                    moveSiblingByButton(
                                      category.categoryKey,
                                      definition.roleDefinitionId,
                                      "up"
                                    )
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {CREATE_MOVE_UP}
                                </Button>
                                <Button
                                  aria-label={`${CREATE_MOVE_DOWN} · ${definition.label}`}
                                  className={cn(
                                    orderButtonVariants({
                                      state: canMoveDown
                                        ? "enabled"
                                        : "disabled",
                                    })
                                  )}
                                  disabled={!canMoveDown}
                                  onClick={() =>
                                    moveSiblingByButton(
                                      category.categoryKey,
                                      definition.roleDefinitionId,
                                      "down"
                                    )
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {CREATE_MOVE_DOWN}
                                </Button>
                              </fieldset>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {readyData && selected && view === "detail" && (
        <article
          aria-labelledby="role-hierarchy-detail-title"
          className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4"
          ref={detailRef}
          tabIndex={-1}
        >
          <Button
            className="min-h-11 h-auto justify-start gap-1 px-2 py-2 text-base font-bold text-[var(--ink)] hover:bg-transparent hover:text-[var(--accent)]"
            onClick={goBack}
            size="lg"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </Button>
          <h2
            className="m-0 mt-1 wrap-anywhere text-[1.35rem] font-extrabold leading-[1.35]"
            id="role-hierarchy-detail-title"
          >
            {selected.label}
          </h2>
          <p className="m-0 mt-1.5 wrap-anywhere leading-6 text-[var(--ink-muted)]">
            {selected.description}
          </p>
          <dl className="mt-4 grid min-w-0 grid-cols-2 border-t border-l border-[var(--line)]">
            <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
              <dt className="text-xs font-bold text-[var(--ink-muted)]">
                適用範圍
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-bold">
                {selected.scopeLabel ?? "全教會"}
              </dd>
            </div>
            <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
              <dt className="text-xs font-bold text-[var(--ink-muted)]">
                順位
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-bold">
                {selected.position + 1}
              </dd>
            </div>
            <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
              <dt className="text-xs font-bold text-[var(--ink-muted)]">
                已指派帳戶
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-bold">
                {selected.assignmentCount}
              </dd>
            </div>
            <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
              <dt className="text-xs font-bold text-[var(--ink-muted)]">
                能力
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-bold">
                {selected.grantCount}
              </dd>
            </div>
            <div className="min-w-0 border-r border-b border-[var(--line)] p-3">
              <dt className="text-xs font-bold text-[var(--ink-muted)]">
                狀態
              </dt>
              <dd className="m-0 mt-1 wrap-anywhere font-bold">
                {selected.isProtected ? "系統固定" : "可變更"}
              </dd>
            </div>
          </dl>
          {selected.actions.some((action) => action.action === "rename") && (
            <Button
              className={cn(
                actionButtonVariants({ tone: "primary" }),
                "mt-4 w-fit"
              )}
              onClick={() => openRename(selected)}
              size="lg"
              type="button"
              variant="default"
            >
              {RENAME_LABEL}
            </Button>
          )}
          {selected.actions.some((action) => action.action === "scope") &&
            (selected.scopeOptions ?? []).length > 0 && (
              <Button
                className={cn(
                  actionButtonVariants({ tone: "primary" }),
                  "mt-4 w-fit"
                )}
                onClick={() => openScope(selected)}
                size="lg"
                type="button"
                variant="default"
              >
                {SCOPE_EDIT_LABEL}
              </Button>
            )}
          {selected.actions.some(
            (action) => action.action === "permissions"
          ) && (
            <Button
              className={cn(
                actionButtonVariants({ tone: "primary" }),
                "mt-4 w-fit"
              )}
              onClick={() =>
                router.push(
                  `/management?module=permissions&role=${encodeURIComponent(selected.roleDefinitionId)}&view=permissions`
                )
              }
              size="lg"
              type="button"
              variant="default"
            >
              {PERMISSION_EDIT_LABEL}
            </Button>
          )}
          {!selected.isProtected &&
            (selected.assignmentCount > 0 ||
              (selected.assignmentActions ?? []).length > 0 ||
              (selected.lifecycleActions ?? []).length > 0) && (
              <Button
                className={cn(
                  actionButtonVariants({ tone: "primary" }),
                  "mt-4 w-fit"
                )}
                onClick={() => {
                  router.push(
                    `/management?module=accounts&roleDefinition=${encodeURIComponent(selected.roleDefinitionId)}&view=access&return=${encodeURIComponent(`/management?module=roles&role=${encodeURIComponent(selected.roleDefinitionId)}&view=detail`)}`
                  );
                }}
                size="lg"
                type="button"
                variant="default"
              >
                管理已指派帳戶
              </Button>
            )}
          {scopeState.kind !== "idle" && (
            <section
              aria-labelledby="role-hierarchy-scope-title"
              className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4"
            >
              <h3
                className="m-0 wrap-anywhere text-[1.2rem] font-extrabold"
                id="role-hierarchy-scope-title"
              >
                {SCOPE_EDIT_LABEL}
              </h3>
              <label className={fieldClass} htmlFor="role-scope-select">
                <span className={fieldLabelClass}>{CREATE_SCOPE_LABEL}</span>
                <Select
                  disabled={scopeState.kind === "submitting"}
                  onValueChange={(value) => {
                    setScopeValue(value);
                    if (scopeState.kind !== "editing") {
                      setScopeState({ kind: "editing" });
                    }
                  }}
                  value={scopeValue}
                >
                  <SelectTrigger
                    aria-label={CREATE_SCOPE_LABEL}
                    className="min-h-12 w-full rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30"
                    id="role-scope-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selected.scopeOptions ?? []).map((option) => {
                      const value = scopeOptionValue(
                        option.scope_kind,
                        option.scope_id
                      );
                      return (
                        <SelectItem key={value} value={value}>
                          {option.scopeLabel}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </label>
              {scopeState.kind === "invalid-scope" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {CREATE_INVALID_SCOPE_MESSAGE}
                </p>
              )}
              {scopeState.kind === "conflict" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {SCOPE_CONFLICT_MESSAGE}
                </p>
              )}
              {scopeState.kind === "forbidden" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {FORBIDDEN_MESSAGE}
                </p>
              )}
              {scopeState.kind === "archived" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {SCOPE_ARCHIVED_MESSAGE}
                </p>
              )}
              {scopeState.kind === "not-found" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {NOT_FOUND_MESSAGE}
                </p>
              )}
              {scopeState.kind === "error" && (
                <p className="mt-2.5 text-sm text-[var(--error)]">
                  {LOAD_ERROR_MESSAGE}
                </p>
              )}
              {scopeState.kind === "success" && (
                <p className="mt-2.5 text-sm font-bold text-[var(--success)]">
                  {SCOPE_SUCCESS_MESSAGE}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  className={cn(actionButtonVariants({ tone: "secondary" }))}
                  onClick={() => setScopeState({ kind: "idle" })}
                  size="lg"
                  type="button"
                  variant="outline"
                >
                  {CANCEL_LABEL}
                </Button>
                <Button
                  className={cn(actionButtonVariants({ tone: "primary" }))}
                  disabled={scopeState.kind === "submitting"}
                  onClick={() => void submitScope()}
                  size="lg"
                  type="button"
                  variant="default"
                >
                  {scopeState.kind === "submitting"
                    ? SCOPE_SAVING_MESSAGE
                    : SCOPE_SAVE_LABEL}
                </Button>
              </div>
            </section>
          )}
          {selected.isProtected && (
            <p
              className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-2.5 text-sm text-[var(--ink-muted)]"
              role="note"
            >
              受保護系統身份不可重新命名。
            </p>
          )}
        </article>
      )}

      {readyData && selected && view === "rename" && (
        <section
          aria-labelledby="role-hierarchy-rename-title"
          className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4"
        >
          <Button
            className="min-h-11 h-auto justify-start gap-1 px-2 py-2 text-base font-bold text-[var(--ink)] hover:bg-transparent hover:text-[var(--accent)]"
            onClick={goBack}
            size="lg"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </Button>
          <h2
            className="m-0 mt-1 wrap-anywhere text-[1.35rem] font-extrabold leading-[1.35]"
            id="role-hierarchy-rename-title"
          >
            重新命名身份組
          </h2>
          <label className={fieldClass} htmlFor="role-rename-input">
            <span className={fieldLabelClass}>新名稱</span>
            <Input
              autoComplete="off"
              className="min-h-12 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30"
              id="role-rename-input"
              maxLength={60}
              onChange={(event) => {
                setRenameValue(event.target.value);
                if (
                  renameState.kind === "idle" ||
                  renameState.kind === "invalid-name"
                ) {
                  setRenameState({ kind: "dirty" });
                }
              }}
              ref={renameInputRef}
              type="text"
              value={renameValue}
            />
          </label>
          {renameState.kind === "invalid-name" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {INVALID_NAME_MESSAGE}
            </p>
          )}
          {renameState.kind === "name-conflict" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {NAME_CONFLICT_MESSAGE}
            </p>
          )}
          {renameState.kind === "archived" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {ARCHIVED_MESSAGE}
            </p>
          )}
          {renameState.kind === "conflict" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {CONFLICT_MESSAGE}
            </p>
          )}
          {renameState.kind === "forbidden" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {FORBIDDEN_MESSAGE}
            </p>
          )}
          {renameState.kind === "not-found" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {NOT_FOUND_MESSAGE}
            </p>
          )}
          {renameState.kind === "error" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {LOAD_ERROR_MESSAGE}
            </p>
          )}
          {renameState.kind === "success" && (
            <p className="mt-2.5 text-sm font-bold text-[var(--success)]">
              {SUCCESS_MESSAGE}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              className={cn(actionButtonVariants({ tone: "secondary" }))}
              onClick={goBack}
              size="lg"
              type="button"
              variant="outline"
            >
              {CANCEL_LABEL}
            </Button>
            <Button
              className={cn(actionButtonVariants({ tone: "primary" }))}
              disabled={renameState.kind === "submitting"}
              onClick={() => void submitRename()}
              size="lg"
              type="button"
              variant="default"
            >
              {renameState.kind === "submitting" ? "儲存中…" : SAVE_LABEL}
            </Button>
          </div>
        </section>
      )}

      {orderConflict.kind === "pending" && (
        <section
          aria-labelledby="role-order-conflict-title"
          className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-4"
        >
          <h2
            className="m-0 text-[1.2rem] font-extrabold"
            id="role-order-conflict-title"
          >
            {ORDER_CONFLICT_TITLE}
          </h2>
          <p className="m-0 mt-1.5 wrap-anywhere leading-6 text-[var(--ink-muted)]">
            {ORDER_CONFLICT_INTRO}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="m-0 mb-1 text-sm font-extrabold">
                {ORDER_CONFLICT_LOCAL}
              </h3>
              <ol className="m-0 pl-5 text-[var(--ink)]">
                {orderConflict.localIds.map((roleDefinitionId) => {
                  const definition = readyData
                    ? definitionsInCategory(
                        readyData,
                        orderConflict.categoryKey
                      ).find(
                        (item) => item.roleDefinitionId === roleDefinitionId
                      )
                    : undefined;
                  return (
                    <li key={roleDefinitionId}>
                      {definition?.label ?? roleDefinitionId}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h3 className="m-0 mb-1 text-sm font-extrabold">
                {ORDER_CONFLICT_AUTHORITATIVE}
              </h3>
              <ol className="m-0 pl-5 text-[var(--ink)]">
                {orderConflict.authoritativeIds.map((roleDefinitionId) => {
                  const definition = readyData
                    ? definitionsInCategory(
                        readyData,
                        orderConflict.categoryKey
                      ).find(
                        (item) => item.roleDefinitionId === roleDefinitionId
                      )
                    : undefined;
                  return (
                    <li key={roleDefinitionId}>
                      {definition?.label ?? roleDefinitionId}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          <p className="m-0 mt-3 wrap-anywhere text-sm text-[var(--ink-muted)]">
            {ORDER_CONFLICT_MESSAGE}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              className={cn(actionButtonVariants({ tone: "secondary" }))}
              disabled={reorderingCategory !== null}
              onClick={() => void resolveOrderConflictKeepMine()}
              size="lg"
              type="button"
              variant="outline"
            >
              {CREATE_KEEP_MINE}
            </Button>
            <Button
              className={cn(actionButtonVariants({ tone: "primary" }))}
              disabled={reorderingCategory !== null}
              onClick={() => void resolveOrderConflictTakeLatest()}
              size="lg"
              type="button"
              variant="default"
            >
              {CREATE_TAKE_LATEST}
            </Button>
          </div>
        </section>
      )}

      {readyData && createView && (
        <section
          aria-labelledby="role-hierarchy-create-title"
          className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-4"
        >
          <Button
            className="min-h-11 h-auto justify-start gap-1 px-2 py-2 text-base font-bold text-[var(--ink)] hover:bg-transparent hover:text-[var(--accent)]"
            onClick={closeCreate}
            size="lg"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </Button>
          <h2
            className="m-0 mt-1 wrap-anywhere text-[1.35rem] font-extrabold leading-[1.35]"
            id="role-hierarchy-create-title"
          >
            {CREATE_TITLE}
          </h2>
          <label className={fieldClass} htmlFor="role-create-scope">
            <span className={fieldLabelClass}>{CREATE_SCOPE_LABEL}</span>
            <Select
              onValueChange={(value) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  scopeOption: value,
                }))
              }
              value={createDraft.scopeOption}
            >
              <SelectTrigger
                aria-label={CREATE_SCOPE_LABEL}
                className="min-h-12 w-full rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30"
                id="role-create-scope"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {readyData.categories
                  .find(
                    (category) =>
                      category.categoryKey === createDraft.categoryKey
                  )
                  ?.createOptions.map((option) => {
                    const value = option.scope_id ?? "global";
                    return (
                      <SelectItem key={value} value={value}>
                        {option.scopeLabel}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </label>
          <label className={fieldClass} htmlFor="role-create-name">
            <span className={fieldLabelClass}>{CREATE_NAME_LABEL}</span>
            <Input
              autoComplete="off"
              className="min-h-12 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30"
              id="role-create-name"
              maxLength={60}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  label: event.target.value,
                }))
              }
              ref={createInputRef}
              type="text"
              value={createDraft.label}
            />
          </label>
          <label className={fieldClass} htmlFor="role-create-description">
            <span className={fieldLabelClass}>{CREATE_DESCRIPTION_LABEL}</span>
            <Input
              autoComplete="off"
              className="min-h-12 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30"
              id="role-create-description"
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))
              }
              type="text"
              value={createDraft.description}
            />
          </label>
          {createState.kind === "invalid-name" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {INVALID_NAME_MESSAGE}
            </p>
          )}
          {createState.kind === "invalid-scope" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {CREATE_INVALID_SCOPE_MESSAGE}
            </p>
          )}
          {createState.kind === "name-conflict" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {NAME_CONFLICT_MESSAGE}
            </p>
          )}
          {createState.kind === "forbidden" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {CREATE_FORBIDDEN_MESSAGE}
            </p>
          )}
          {createState.kind === "error" && (
            <p className="mt-2.5 text-sm text-[var(--error)]">
              {LOAD_ERROR_MESSAGE}
            </p>
          )}
          {createState.kind === "success" && (
            <p className="mt-2.5 text-sm font-bold text-[var(--success)]">
              {CREATE_SUCCESS_MESSAGE}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              className={cn(actionButtonVariants({ tone: "secondary" }))}
              onClick={closeCreate}
              size="lg"
              type="button"
              variant="outline"
            >
              {CANCEL_LABEL}
            </Button>
            <Button
              className={cn(actionButtonVariants({ tone: "primary" }))}
              disabled={createState.kind === "submitting"}
              onClick={() => void submitCreate()}
              size="lg"
              type="button"
              variant="default"
            >
              {createState.kind === "submitting"
                ? CREATE_SAVING_LABEL
                : CREATE_SAVE_LABEL}
            </Button>
          </div>
        </section>
      )}
    </section>
  );
};
