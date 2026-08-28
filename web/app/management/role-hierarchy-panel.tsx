"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  RoleHierarchyView,
  RoleHierarchyDefinition,
} from "@/lib/identity";
import {
  getRoleHierarchy,
  renameRoleDefinition,
} from "@/lib/identity/role-hierarchy-api";
import { announce } from "@/lib/live-region";
import { rememberDeepLink } from "@/lib/session";

import { safeManagementReturnHref } from "./management-action-framework";
import { SettingsBackLink } from "./settings-ui";

import styles from "./role-hierarchy-panel.module.css";

const RENAME_LABEL = "重新命名";
const DETAIL_BACK_LABEL = "返回身份組列表";
const SAVE_LABEL = "儲存名稱";
const CANCEL_LABEL = "取消";
const SUCCESS_MESSAGE = "身份組名稱已更新";
const SAVING_MESSAGE = "正在儲存名稱…";
const CONFLICT_MESSAGE = "身份組名稱已有更新，請重新載入後再試。";
const FORBIDDEN_MESSAGE = "您沒有權限執行此操作。";
const NOT_FOUND_MESSAGE = "找不到指定的身份組。";
const INVALID_NAME_MESSAGE = "名稱不可空白，且不可超過 60 個字元。";
const NAME_CONFLICT_MESSAGE = "已存在相同名稱的身份組。";
const LOAD_ERROR_MESSAGE = "身份組資料暫時無法載入，請稍後再試。";

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
  | { kind: "not-found" }
  | { kind: "invalid-name" }
  | { kind: "error" };

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
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);

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
          error instanceof RpcError && error.problem.code === "FORBIDDEN"
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

  useEffect(() => {
    if (view === "detail" && selected) {
      detailRef.current?.focus();
    }
  }, [selected, view]);

  useEffect(() => {
    if (view === "rename" && renameState.kind === "idle") {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renameState.kind, view]);

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
      window.history.pushState(
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
        <output aria-busy="true" aria-live="polite" tabIndex={-1}>
          {COPY.permissions.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          aria-live="assertive"
          className={styles.error}
          id="role-hierarchy-state"
          role="alert"
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
                </h2>
                {expanded && (
                  <ul
                    className={styles.roleList}
                    id={`role-category-body-${category.categoryKey}`}
                  >
                    {category.definitions.map((definition) => (
                      <li
                        className={styles.roleRow}
                        key={definition.roleDefinitionId}
                      >
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
                          <span aria-hidden="true" className={styles.chevron}>
                            ›
                          </span>
                        </button>
                      </li>
                    ))}
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
                if (renameState.kind === "invalid-name") {
                  setRenameState({ kind: "dirty" });
                }
              }}
              ref={renameInputRef}
              value={renameValue}
            />
          </label>
          {renameState.kind === "invalid-name" && (
            <p className={styles.feedback} role="alert">
              {INVALID_NAME_MESSAGE}
            </p>
          )}
          {renameState.kind === "name-conflict" && (
            <p className={styles.feedback} role="alert">
              {NAME_CONFLICT_MESSAGE}
            </p>
          )}
          {renameState.kind === "conflict" && (
            <p className={styles.feedback} role="alert">
              {CONFLICT_MESSAGE}
            </p>
          )}
          {renameState.kind === "forbidden" && (
            <p className={styles.feedback} role="alert">
              {FORBIDDEN_MESSAGE}
            </p>
          )}
          {renameState.kind === "not-found" && (
            <p className={styles.feedback} role="alert">
              {NOT_FOUND_MESSAGE}
            </p>
          )}
          {renameState.kind === "error" && (
            <p className={styles.feedback} role="alert">
              {LOAD_ERROR_MESSAGE}
            </p>
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
    </section>
  );
};
