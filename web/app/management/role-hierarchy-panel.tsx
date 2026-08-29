"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

import { safeManagementReturnHref } from "./management-action-framework";
import { SettingsBackLink } from "./settings-ui";

import styles from "./role-hierarchy-panel.module.css";

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
      className={styles.page}
    >
      <header className={styles.header}>
        <SettingsBackLink href={returnHref} label="返回管理工作" />
        <h1
          className={styles.title}
          id="role-hierarchy-title"
          ref={listHeadingRef}
          tabIndex={-1}
        >
          身份組
        </h1>
        <p className={styles.lead}>
          按分類檢視身份組；重新命名只可套用於較低順位的身份組。
        </p>
      </header>

      {state.kind === "loading" && (
        <output aria-busy="true" tabIndex={-1}>
          {COPY.permissions.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          className={styles.error}
          id="role-hierarchy-state"
          tabIndex={-1}
        >
          <h2>{state.message}</h2>
          <button
            className={styles.retry}
            onClick={() => setRetryToken((token) => token + 1)}
            type="button"
          >
            {COPY.permissions.retry}
          </button>
        </section>
      )}

      {readyData && view === "list" && (
        <div className={styles.categories}>
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
                className={styles.category}
                key={category.categoryKey}
              >
                <h2 className={styles.categoryTitle} id={headingId}>
                  <button
                    aria-controls={`role-category-body-${category.categoryKey}`}
                    aria-expanded={expanded}
                    className={styles.categoryToggle}
                    onClick={() => toggleCategory(category.categoryKey)}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.categoryMarker}>
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span className={styles.categoryLabel}>
                      {category.label}
                    </span>
                    <span className={styles.categoryCount}>
                      {category.childCount}
                    </span>
                  </button>
                  {category.createOptions.length > 0 && (
                    <button
                      className={styles.categoryCreate}
                      onClick={() => openCreate(category.categoryKey)}
                      type="button"
                    >
                      {CREATE_LABEL}
                    </button>
                  )}
                </h2>
                {expanded && (
                  <ul
                    className={styles.roleList}
                    id={`role-category-body-${category.categoryKey}`}
                    aria-busy={reordering}
                  >
                    {orderedDefinitions.map((definition, index) => {
                      const canMoveUp = !reordering && index > 0;
                      const canMoveDown =
                        !reordering && index < orderedDefinitions.length - 1;
                      return (
                        <li
                          className={styles.roleRow}
                          key={definition.roleDefinitionId}
                        >
                          <div className={styles.roleRowMain}>
                            <button
                              aria-label={`${definition.label} · 詳情`}
                              className={styles.roleButton}
                              onClick={() => openDetail(definition)}
                              type="button"
                            >
                              <span className={styles.roleCopy}>
                                <strong>{definition.label}</strong>
                                <small>
                                  {definition.scopeLabel ?? "全教會"} ·{" "}
                                  {definition.assignmentCount} 個已指派 ·{" "}
                                  {definition.grantCount} 項能力
                                  {definition.isProtected ? " · 系統固定" : ""}
                                </small>
                              </span>
                              <span
                                aria-hidden="true"
                                className={styles.chevron}
                              >
                                ›
                              </span>
                            </button>
                            {definition.reorderActions.length > 0 && (
                              <fieldset className={styles.orderControls}>
                                <legend className="sr-only">
                                  {REORDER_GROUP_LABEL}
                                </legend>
                                <button
                                  aria-label={`${CREATE_MOVE_UP} · ${definition.label}`}
                                  className={styles.orderButton}
                                  disabled={!canMoveUp}
                                  onClick={() =>
                                    moveSiblingByButton(
                                      category.categoryKey,
                                      definition.roleDefinitionId,
                                      "up"
                                    )
                                  }
                                  type="button"
                                >
                                  {CREATE_MOVE_UP}
                                </button>
                                <button
                                  aria-label={`${CREATE_MOVE_DOWN} · ${definition.label}`}
                                  className={styles.orderButton}
                                  disabled={!canMoveDown}
                                  onClick={() =>
                                    moveSiblingByButton(
                                      category.categoryKey,
                                      definition.roleDefinitionId,
                                      "down"
                                    )
                                  }
                                  type="button"
                                >
                                  {CREATE_MOVE_DOWN}
                                </button>
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
          className={styles.detail}
          ref={detailRef}
          tabIndex={-1}
        >
          <button className={styles.back} onClick={goBack} type="button">
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </button>
          <h2 id="role-hierarchy-detail-title">{selected.label}</h2>
          <p className={styles.detailLead}>{selected.description}</p>
          <dl className={styles.facts}>
            <div>
              <dt>適用範圍</dt>
              <dd>{selected.scopeLabel ?? "全教會"}</dd>
            </div>
            <div>
              <dt>順位</dt>
              <dd>{selected.position + 1}</dd>
            </div>
            <div>
              <dt>已指派帳戶</dt>
              <dd>{selected.assignmentCount}</dd>
            </div>
            <div>
              <dt>能力</dt>
              <dd>{selected.grantCount}</dd>
            </div>
            <div>
              <dt>狀態</dt>
              <dd>{selected.isProtected ? "系統固定" : "可變更"}</dd>
            </div>
          </dl>
          {selected.actions.some((action) => action.action === "rename") && (
            <button
              className={styles.renameButton}
              onClick={() => openRename(selected)}
              type="button"
            >
              {RENAME_LABEL}
            </button>
          )}
          {selected.actions.some((action) => action.action === "scope") &&
            (selected.scopeOptions ?? []).length > 0 && (
              <button
                className={styles.renameButton}
                onClick={() => openScope(selected)}
                type="button"
              >
                {SCOPE_EDIT_LABEL}
              </button>
            )}
          <button
            className={styles.renameButton}
            onClick={() =>
              router.push(
                `/management?module=permissions&role=${encodeURIComponent(selected.roleDefinitionId)}&view=permissions`
              )
            }
            type="button"
          >
            {PERMISSION_EDIT_LABEL}
          </button>
          {scopeState.kind !== "idle" && (
            <section
              aria-labelledby="role-hierarchy-scope-title"
              className={styles.rename}
            >
              <h3 id="role-hierarchy-scope-title">{SCOPE_EDIT_LABEL}</h3>
              <label className={styles.field} htmlFor="role-scope-select">
                <span className={styles.fieldLabel}>{CREATE_SCOPE_LABEL}</span>
                <select
                  className={styles.input}
                  disabled={scopeState.kind === "submitting"}
                  id="role-scope-select"
                  onChange={(event) => {
                    setScopeValue(event.target.value);
                    if (scopeState.kind !== "editing") {
                      setScopeState({ kind: "editing" });
                    }
                  }}
                  value={scopeValue}
                >
                  {(selected.scopeOptions ?? []).map((option) => (
                    <option
                      key={scopeOptionValue(option.scope_kind, option.scope_id)}
                      value={scopeOptionValue(
                        option.scope_kind,
                        option.scope_id
                      )}
                    >
                      {option.scopeLabel}
                    </option>
                  ))}
                </select>
              </label>
              {scopeState.kind === "invalid-scope" && (
                <p className={styles.feedback}>
                  {CREATE_INVALID_SCOPE_MESSAGE}
                </p>
              )}
              {scopeState.kind === "conflict" && (
                <p className={styles.feedback}>{SCOPE_CONFLICT_MESSAGE}</p>
              )}
              {scopeState.kind === "forbidden" && (
                <p className={styles.feedback}>{FORBIDDEN_MESSAGE}</p>
              )}
              {scopeState.kind === "archived" && (
                <p className={styles.feedback}>{SCOPE_ARCHIVED_MESSAGE}</p>
              )}
              {scopeState.kind === "not-found" && (
                <p className={styles.feedback}>{NOT_FOUND_MESSAGE}</p>
              )}
              {scopeState.kind === "error" && (
                <p className={styles.feedback}>{LOAD_ERROR_MESSAGE}</p>
              )}
              {scopeState.kind === "success" && (
                <p className={styles.success}>{SCOPE_SUCCESS_MESSAGE}</p>
              )}
              <div className={styles.actions}>
                <button
                  className={styles.cancel}
                  onClick={() => setScopeState({ kind: "idle" })}
                  type="button"
                >
                  {CANCEL_LABEL}
                </button>
                <button
                  className={styles.save}
                  disabled={scopeState.kind === "submitting"}
                  onClick={() => void submitScope()}
                  type="button"
                >
                  {scopeState.kind === "submitting"
                    ? SCOPE_SAVING_MESSAGE
                    : SCOPE_SAVE_LABEL}
                </button>
              </div>
            </section>
          )}
          {selected.isProtected && (
            <p className={styles.protectedNote} role="note">
              受保護系統身份不可重新命名。
            </p>
          )}
        </article>
      )}

      {readyData && selected && view === "rename" && (
        <section
          aria-labelledby="role-hierarchy-rename-title"
          className={styles.rename}
        >
          <button className={styles.back} onClick={goBack} type="button">
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </button>
          <h2 id="role-hierarchy-rename-title">重新命名身份組</h2>
          <label className={styles.field} htmlFor="role-rename-input">
            <span className={styles.fieldLabel}>新名稱</span>
            <input
              autoComplete="off"
              className={styles.input}
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
              value={renameValue}
            />
          </label>
          {renameState.kind === "invalid-name" && (
            <p className={styles.feedback}>{INVALID_NAME_MESSAGE}</p>
          )}
          {renameState.kind === "name-conflict" && (
            <p className={styles.feedback}>{NAME_CONFLICT_MESSAGE}</p>
          )}
          {renameState.kind === "archived" && (
            <p className={styles.feedback}>{ARCHIVED_MESSAGE}</p>
          )}
          {renameState.kind === "conflict" && (
            <p className={styles.feedback}>{CONFLICT_MESSAGE}</p>
          )}
          {renameState.kind === "forbidden" && (
            <p className={styles.feedback}>{FORBIDDEN_MESSAGE}</p>
          )}
          {renameState.kind === "not-found" && (
            <p className={styles.feedback}>{NOT_FOUND_MESSAGE}</p>
          )}
          {renameState.kind === "error" && (
            <p className={styles.feedback}>{LOAD_ERROR_MESSAGE}</p>
          )}
          {renameState.kind === "success" && (
            <p className={styles.success}>{SUCCESS_MESSAGE}</p>
          )}
          <div className={styles.actions}>
            <button className={styles.cancel} onClick={goBack} type="button">
              {CANCEL_LABEL}
            </button>
            <button
              className={styles.save}
              disabled={renameState.kind === "submitting"}
              onClick={() => void submitRename()}
              type="button"
            >
              {renameState.kind === "submitting" ? "儲存中…" : SAVE_LABEL}
            </button>
          </div>
        </section>
      )}

      {orderConflict.kind === "pending" && (
        <section
          aria-labelledby="role-order-conflict-title"
          className={styles.orderConflict}
        >
          <h2 id="role-order-conflict-title">{ORDER_CONFLICT_TITLE}</h2>
          <p className={styles.orderConflictLead}>{ORDER_CONFLICT_INTRO}</p>
          <div className={styles.orderConflictColumns}>
            <div>
              <h3>{ORDER_CONFLICT_LOCAL}</h3>
              <ol className={styles.orderConflictList}>
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
              <h3>{ORDER_CONFLICT_AUTHORITATIVE}</h3>
              <ol className={styles.orderConflictList}>
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
          <p className={styles.orderConflictHint}>{ORDER_CONFLICT_MESSAGE}</p>
          <div className={styles.actions}>
            <button
              className={styles.cancel}
              disabled={reorderingCategory !== null}
              onClick={() => void resolveOrderConflictKeepMine()}
              type="button"
            >
              {CREATE_KEEP_MINE}
            </button>
            <button
              className={styles.save}
              disabled={reorderingCategory !== null}
              onClick={() => void resolveOrderConflictTakeLatest()}
              type="button"
            >
              {CREATE_TAKE_LATEST}
            </button>
          </div>
        </section>
      )}

      {readyData && createView && (
        <section
          aria-labelledby="role-hierarchy-create-title"
          className={styles.rename}
        >
          <button className={styles.back} onClick={closeCreate} type="button">
            <span aria-hidden="true">‹</span>
            {DETAIL_BACK_LABEL}
          </button>
          <h2 id="role-hierarchy-create-title">{CREATE_TITLE}</h2>
          <label className={styles.field} htmlFor="role-create-scope">
            <span className={styles.fieldLabel}>{CREATE_SCOPE_LABEL}</span>
            <select
              className={styles.input}
              id="role-create-scope"
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  scopeOption: event.target.value,
                }))
              }
              value={createDraft.scopeOption}
            >
              {readyData.categories
                .find(
                  (category) => category.categoryKey === createDraft.categoryKey
                )
                ?.createOptions.map((option) => (
                  <option
                    key={option.scope_id ?? "global"}
                    value={option.scope_id ?? "global"}
                  >
                    {option.scopeLabel}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field} htmlFor="role-create-name">
            <span className={styles.fieldLabel}>{CREATE_NAME_LABEL}</span>
            <input
              autoComplete="off"
              className={styles.input}
              id="role-create-name"
              maxLength={60}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  label: event.target.value,
                }))
              }
              ref={createInputRef}
              value={createDraft.label}
            />
          </label>
          <label className={styles.field} htmlFor="role-create-description">
            <span className={styles.fieldLabel}>
              {CREATE_DESCRIPTION_LABEL}
            </span>
            <input
              autoComplete="off"
              className={styles.input}
              id="role-create-description"
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))
              }
              value={createDraft.description}
            />
          </label>
          {createState.kind === "invalid-name" && (
            <p className={styles.feedback}>{INVALID_NAME_MESSAGE}</p>
          )}
          {createState.kind === "invalid-scope" && (
            <p className={styles.feedback}>{CREATE_INVALID_SCOPE_MESSAGE}</p>
          )}
          {createState.kind === "name-conflict" && (
            <p className={styles.feedback}>{NAME_CONFLICT_MESSAGE}</p>
          )}
          {createState.kind === "forbidden" && (
            <p className={styles.feedback}>{CREATE_FORBIDDEN_MESSAGE}</p>
          )}
          {createState.kind === "error" && (
            <p className={styles.feedback}>{LOAD_ERROR_MESSAGE}</p>
          )}
          {createState.kind === "success" && (
            <p className={styles.success}>{CREATE_SUCCESS_MESSAGE}</p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.cancel}
              onClick={closeCreate}
              type="button"
            >
              {CANCEL_LABEL}
            </button>
            <button
              className={styles.save}
              disabled={createState.kind === "submitting"}
              onClick={() => void submitCreate()}
              type="button"
            >
              {createState.kind === "submitting"
                ? CREATE_SAVING_LABEL
                : CREATE_SAVE_LABEL}
            </button>
          </div>
        </section>
      )}
    </section>
  );
};
