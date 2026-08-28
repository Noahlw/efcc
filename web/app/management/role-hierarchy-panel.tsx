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
        // H-18: malformed/unknown role values fall back to the safe list.
        const known = safeRoleId(selectedId, data);
        if (selectedId !== null && known === null) {
          setSelectedId(null);
          setView("list");
          window.history.replaceState(null, "", "/management?module=roles");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedId is revalidated from loaded data, not a reload trigger.
  }, [retryToken, router]);

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

  const openDetail = (definition: RoleHierarchyDefinition) => {
    setSelectedId(definition.roleDefinitionId);
    setView("detail");
    setRenameState({ kind: "idle" });
    const params = new URLSearchParams({
      module: "roles",
      role: definition.roleDefinitionId,
      view: "detail",
    });
    window.history.pushState(null, "", `/management?${params.toString()}`);
    announce(definition.label);
  };

  const openRename = (definition: RoleHierarchyDefinition) => {
    setRenameValue(definition.label);
    setRenameState({ kind: "idle" });
    setView("rename");
    const params = new URLSearchParams({
      module: "roles",
      role: definition.roleDefinitionId,
      view: "rename",
    });
    window.history.pushState(null, "", `/management?${params.toString()}`);
  };

  const goBack = () => {
    if (view === "rename") {
      setView("detail");
      setRenameState({ kind: "idle" });
      const params = new URLSearchParams({
        module: "roles",
        role: selectedId ?? "",
        view: "detail",
      });
      window.history.pushState(null, "", `/management?${params.toString()}`);
      return;
    }
    if (view === "detail") {
      setView("list");
      setSelectedId(null);
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
    if (code === "ROLE_POLICY_CONFLICT" || code === "ROLE_REVISION_CONFLICT") {
      return { state: { kind: "conflict" }, message: CONFLICT_MESSAGE };
    }
    if (code === "ROLE_NAME_TAKEN") {
      return {
        state: { kind: "name-conflict" },
        message: NAME_CONFLICT_MESSAGE,
      };
    }
    if (code === "INVALID_NAME") {
      return { state: { kind: "invalid-name" }, message: INVALID_NAME_MESSAGE };
    }
    if (code === "FORBIDDEN" || code?.startsWith("ROLE_")) {
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
          requestFingerprint: JSON.stringify({
            op: "rename",
            role: selected.roleDefinitionId,
            label,
            base: readyData.revision,
          }),
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

  return (
    <section
      aria-busy={state.kind === "loading"}
      aria-labelledby="role-hierarchy-title"
      className={styles.page}
    >
      <header className={styles.header}>
        <SettingsBackLink href={returnHref} label="返回管理工作" />
        <h1 className={styles.title} id="role-hierarchy-title" tabIndex={-1}>
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
          {readyData.categories.map((category) => (
            <section
              aria-labelledby={`role-category-${category.categoryKey}`}
              className={styles.category}
              key={category.categoryKey}
            >
              <h2
                className={styles.categoryTitle}
                id={`role-category-${category.categoryKey}`}
              >
                {category.label}
                <span className={styles.categoryCount}>
                  {category.childCount}
                </span>
              </h2>
              <ul className={styles.roleList}>
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
            </section>
          ))}
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
          {renameState.kind === "error" && (
            <p className={styles.feedback} role="alert">
              {LOAD_ERROR_MESSAGE}
            </p>
          )}
          {renameState.kind === "success" && (
            <output className={styles.success}>{SUCCESS_MESSAGE}</output>
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
