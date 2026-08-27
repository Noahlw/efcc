"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import type {
  AccountPermissionPolicyCapability,
  AccountPermissionRole,
  AccountPermissionRoleKey,
  AccountPermissionsView,
  PermissionPolicyChange,
  PermissionPolicyRoleKey,
} from "@/lib/programs/program-api";
import {
  getAccountPermissions,
  updateAccountPermissions,
} from "@/lib/programs/program-api";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";

import { safeManagementReturnHref } from "./management-action-framework";
import { BackIcon, SettingsBackLink } from "./settings-ui";

import styles from "./permissions-panel.module.css";

const ROLE_ORDER: AccountPermissionRoleKey[] = [
  "admin",
  "department-manager",
  "staff",
];

const ROLE_COPY: Record<
  AccountPermissionRoleKey,
  { label: string; scope: string }
> = {
  admin: {
    label: COPY.permissions.roleAdmin,
    scope: COPY.permissions.roleAdminScope,
  },
  "department-manager": {
    label: COPY.permissions.roleDepartmentManager,
    scope: COPY.permissions.roleDepartmentManagerScope,
  },
  staff: {
    label: COPY.permissions.roleStaff,
    scope: COPY.permissions.roleStaffScope,
  },
};

const POLICY_ROLE_ORDER: PermissionPolicyRoleKey[] = [
  "admin",
  "staff",
  "member",
];

const POLICY_ROLE_COPY: Record<PermissionPolicyRoleKey, string> = {
  admin: COPY.permissions.roleAdmin,
  staff: COPY.permissions.roleStaff,
  member: COPY.permissions.policyRoleMember,
};

const BASELINE_LABEL = "會友基礎";
const BASELINE_SUMMARY = "適用於所有生效帳戶 · 系統固定";
const ROLE_LIST_ARIA_LABEL = COPY.permissions.rolesSection;
const ROLE_DETAIL_BACK_LABEL = "返回角色列表";
const ROLE_DETAIL_TITLE_SUFFIX = "角色詳情";
const ROLE_PERMISSIONS_LABEL = "權限";
const ROLE_ACCOUNTS_LABEL = "已指派帳戶";
const ROLE_PERMISSIONS_BACK_LABEL = "返回角色詳情";
const ASSIGNED_ACCOUNTS_COPY =
  "已指派帳戶只供查看；角色指派仍由既有帳戶流程處理。";
const MEMBER_ACCOUNTS_COPY =
  "會友帳戶不會在此管理清單中列出；會友基礎會套用到所有生效帳戶。";
const PERMISSION_SEARCH_LABEL = "搜尋權限";
const PERMISSION_SEARCH_PLACEHOLDER = "搜尋名稱、說明或權限代號";

type PermissionScreen = "roles" | "role-detail" | "permissions" | "accounts";

type HeadingRef = RefObject<HTMLHeadingElement | null>;

const GLOBAL_ROLE_COPY: Record<
  PermissionPolicyRoleKey,
  { label: string; scope: string }
> = {
  admin: {
    label: COPY.permissions.roleAdmin,
    scope: COPY.permissions.roleAdminScope,
  },
  staff: {
    label: COPY.permissions.roleStaff,
    scope: COPY.permissions.roleStaffScope,
  },
  member: {
    label: COPY.permissions.policyRoleMember,
    scope: "所有生效帳戶都保留會友基礎能力",
  },
};

type PermissionsState =
  | { kind: "loading" }
  | { kind: "ready"; data: AccountPermissionsView }
  | {
      kind: "error";
      failure: "forbidden" | "recoverable";
      message: string;
    };

type PolicyDraft = Record<string, boolean>;
type PolicySaveState = "idle" | "saving" | "success" | "error" | "conflict";

function draftKey(role: PermissionPolicyRoleKey, capability: string): string {
  return `${role}:${capability}`;
}

function policyDraftFromData(data: AccountPermissionsView): PolicyDraft {
  const draft: PolicyDraft = {};
  for (const capability of data.policy.capabilities) {
    for (const role of POLICY_ROLE_ORDER) {
      draft[draftKey(role, capability.key)] = capability.roles[role].value;
    }
  }
  return draft;
}

function policyChanges(
  data: AccountPermissionsView,
  draft: PolicyDraft
): PermissionPolicyChange[] {
  const changes: PermissionPolicyChange[] = [];
  for (const capability of data.policy.capabilities) {
    for (const role of POLICY_ROLE_ORDER) {
      const value = draft[draftKey(role, capability.key)];
      if (value !== capability.roles[role].value) {
        changes.push({ role, capability: capability.key, value });
      }
    }
  }
  return changes;
}

function roleDefinitions(
  data: AccountPermissionsView
): AccountPermissionRole[] {
  return ROLE_ORDER.map((key) => {
    const serverRole = data.roles.find((role) => role.key === key);
    if (serverRole) {
      return serverRole;
    }

    return {
      key,
      ...ROLE_COPY[key],
      assignmentState: data.accounts.some((account) => account.role === key)
        ? "assigned"
        : "assignable",
    };
  });
}

function globalRoleForAccount(
  account: AccountPermissionsView["accounts"][number]
): PermissionPolicyRoleKey | null {
  if (account.role === "admin") {
    return "admin";
  }
  if (account.role === "staff" || account.role === "department-manager") {
    return "staff";
  }
  return null;
}

function accountsForGlobalRole(
  data: AccountPermissionsView,
  role: PermissionPolicyRoleKey
): AccountPermissionsView["accounts"] {
  return data.accounts.filter(
    (account) => globalRoleForAccount(account) === role
  );
}

function policyCapabilityMatches(
  capability: AccountPermissionPolicyCapability,
  query: string
): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    capability.group,
    capability.label,
    capability.description,
    capability.key,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function capabilityCountForRole(
  data: AccountPermissionsView,
  role: PermissionPolicyRoleKey
): { total: number; editable: number } {
  const counts = { total: 0, editable: 0 };
  for (const capability of data.policy.capabilities) {
    const cell = capability.roles[role];
    if (cell.applicable || cell.value) {
      counts.total += 1;
    }
    if (cell.editable && !cell.locked) {
      counts.editable += 1;
    }
  }
  return counts;
}

const POLICY_CHANGE_CONSEQUENCES: Record<string, string> = {
  "account.permissions.write":
    "高風險：會改變全系統角色權限，可能影響其他管理員及同工。",
  "home.publish": "高風險：會影響全教會首頁公開內容。",
  "registration.approval.manage": "高風險：會影響帳戶註冊審批結果。",
  "department.publish": "會改變部門在會友目錄的公開狀態。",
  "program.publish": "會改變課程在會友目錄的公開狀態。",
  "department.manager.assign": "會改變部門管理者及其工作範圍。",
};

function policyChangeConsequence(capability: string): string | null {
  return POLICY_CHANGE_CONSEQUENCES[capability] ?? null;
}

function departmentContext(
  account: AccountPermissionsView["accounts"][number],
  definitions: readonly AccountPermissionRole[]
): string {
  const names = account.departments
    .map((department) => department.name)
    .filter(Boolean);
  if (names.length > 0) {
    return names.join("、");
  }

  return (
    definitions.find((role) => role.key === account.role)?.scope ??
    ROLE_COPY[account.role].scope
  );
}

function policyGroups(
  capabilities: readonly AccountPermissionPolicyCapability[]
): string[] {
  return [...new Set(capabilities.map((capability) => capability.group))];
}

const PolicyCell = ({
  capability,
  role,
  value,
  dirty,
  onToggle,
}: {
  capability: AccountPermissionPolicyCapability;
  role: PermissionPolicyRoleKey;
  value: boolean;
  dirty: boolean;
  onToggle?: () => void;
}) => {
  const cell = capability.roles[role];
  const editable = cell.editable && !cell.locked;
  const state = cell.locked
    ? `${COPY.permissions.policyLocked}：${cell.lockReason ?? "此政策格不能修改。"}`
    : dirty
      ? `${COPY.permissions.policyPending} · ${COPY.permissions.policyEditable}`
      : cell.editable
        ? COPY.permissions.policyEditable
        : COPY.permissions.policyReadOnly;
  const label = `${capability.label} · ${POLICY_ROLE_COPY[role]}`;

  const content = (
    <span className={styles.policyCellCopy}>
      <strong>{POLICY_ROLE_COPY[role]}</strong>
      <span>
        {value
          ? COPY.permissions.policyEnabled
          : COPY.permissions.policyDisabled}
      </span>
      <small>{state}</small>
    </span>
  );
  const className = `${styles.policyCell} ${cell.locked ? styles.lockedCell : ""}`;
  if (editable && onToggle) {
    return (
      <div
        aria-label={label}
        className={className}
        data-editable="true"
        data-locked="false"
        role="group"
      >
        <Switch
          aria-label={label}
          aria-pressed={value}
          checked={value}
          className={styles.policySwitch}
          onCheckedChange={onToggle}
          role="button"
        />
        {content}
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className={className}
      data-editable={editable ? "true" : "false"}
      data-locked={cell.locked ? "true" : "false"}
      role="group"
    >
      {content}
    </div>
  );
};

const PolicyCapabilityRow = ({
  capability,
  draft,
  role,
  onToggle,
}: {
  capability: AccountPermissionPolicyCapability;
  draft: PolicyDraft;
  role: PermissionPolicyRoleKey;
  onToggle: (role: PermissionPolicyRoleKey, capability: string) => void;
}) => {
  const key = draftKey(role, capability.key);
  return (
    <article className={styles.policyRow}>
      <div className={styles.policyCopy}>
        <strong>{capability.label}</strong>
        <small>{capability.description}</small>
        <code>{capability.key}</code>
      </div>
      <div className={styles.policyCells}>
        <PolicyCell
          capability={capability}
          dirty={draft[key] !== capability.roles[role].value}
          onToggle={
            capability.roles[role].editable
              ? () => onToggle(role, capability.key)
              : undefined
          }
          role={role}
          value={draft[key] ?? capability.roles[role].value}
        />
      </div>
    </article>
  );
};

const PermissionPolicy = ({
  data,
  draft,
  headingRef,
  role,
  saveState,
  dirty,
  onToggle,
  onSave,
  onReload,
  conflictRevision,
}: {
  data: AccountPermissionsView;
  draft: PolicyDraft;
  headingRef: HeadingRef;
  role: PermissionPolicyRoleKey;
  saveState: PolicySaveState;
  dirty: boolean;
  onToggle: (role: PermissionPolicyRoleKey, capability: string) => void;
  onSave: () => void;
  onReload: () => void;
  conflictRevision: number | null;
}) => {
  const groups = useMemo(
    () => policyGroups(data.policy.capabilities),
    [data.policy.capabilities]
  );
  const {canEdit} = data.policy.actor;
  const changes = policyChanges(data, draft);
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groups)
  );
  const [reviewOpen, setReviewOpen] = useState(dirty);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    if (!dirty) {
      return;
    }
    setReviewOpen(true);
  }, [dirty]);

  useEffect(() => {
    if (!normalizedQuery) {
      return;
    }
    setExpandedGroups((current) => {
      const next = new Set(current);
      for (const group of groups) {
        const matches = data.policy.capabilities.some(
          (capability) =>
            capability.group === group &&
            policyCapabilityMatches(capability, normalizedQuery)
        );
        if (matches) {
          next.add(group);
        }
      }
      return next;
    });
  }, [data.policy.capabilities, groups, normalizedQuery]);

  const roleCopy = GLOBAL_ROLE_COPY[role];

  return (
    <section
      aria-labelledby="permissions-policy-heading"
      className={styles.policySection}
      data-dirty={dirty ? "true" : "false"}
    >
      <header className={styles.policyHeader}>
        <div>
          <h2
            id="permissions-policy-heading"
            className={styles.sectionTitle}
            ref={headingRef}
            tabIndex={-1}
          >
            {`${COPY.permissions.policyTitle} · ${roleCopy.label}`}
          </h2>
          <p className={styles.policyLead}>{COPY.permissions.policyLead}</p>
        </div>
        <span className={styles.revision}>
          {`${COPY.permissions.policySynced} ${data.policy.revision}。`}
        </span>
      </header>

      <search className={styles.policyToolbar}>
        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>
            {PERMISSION_SEARCH_LABEL}
          </span>
          <Input
            aria-label={PERMISSION_SEARCH_LABEL}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={PERMISSION_SEARCH_PLACEHOLDER}
            type="search"
            value={query}
          />
        </label>
        <span className={styles.policyRoleHint}>
          <span className={styles.visuallyHidden}>目前角色：</span>
          {roleCopy.label}
        </span>
      </search>

      {dirty && canEdit && (
        <div
          aria-label="未儲存變更操作"
          className={styles.reviewActions}
          role="group"
        >
          <span aria-live="polite" className={styles.mobileDraftCount}>
            {`${changes.length} 項未儲存`}
          </span>
          <button
            className={styles.reviewButton}
            onClick={() => setReviewOpen((current) => !current)}
            type="button"
          >
            {reviewOpen ? "隱藏變更" : "檢視變更"}
          </button>
          {saveState !== "conflict" && (
            <button
              className={styles.saveButton}
              disabled={saveState === "saving"}
              aria-busy={saveState === "saving"}
              onClick={onSave}
              type="button"
            >
              {saveState === "saving"
                ? COPY.permissions.policySaving
                : COPY.permissions.policySave}
            </button>
          )}
          {saveState === "conflict" && (
            <button
              className={styles.reloadButton}
              onClick={onReload}
              type="button"
            >
              {COPY.permissions.policyReload}
            </button>
          )}
        </div>
      )}

      <div className={styles.policyLayout}>
        <div className={styles.groupStack}>
          <Accordion
            aria-label="權限分組"
            onValueChange={(values) => setExpandedGroups(new Set(values))}
            type="multiple"
            value={[...expandedGroups]}
          >
            {groups.map((group) => {
              const capabilities = data.policy.capabilities.filter(
                (capability) =>
                  capability.group === group &&
                  policyCapabilityMatches(capability, normalizedQuery)
              );
              const totalCapabilities = data.policy.capabilities.filter(
                (capability) => capability.group === group
              ).length;
              if (capabilities.length === 0) {
                return null;
              }
              return (
                <AccordionItem
                  className={styles.policyGroup}
                  key={group}
                  value={group}
                >
                  <AccordionTrigger className={styles.policyGroupTrigger}>
                    <strong>{group}</strong>
                    <span>{totalCapabilities} 項</span>
                  </AccordionTrigger>
                  <AccordionContent className={styles.policyGroupBody}>
                    {capabilities.map((capability) => (
                      <PolicyCapabilityRow
                        capability={capability}
                        key={capability.key}
                        draft={draft}
                        onToggle={onToggle}
                        role={role}
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          {normalizedQuery &&
            !data.policy.capabilities.some((capability) =>
              policyCapabilityMatches(capability, normalizedQuery)
            ) && <p className={styles.emptySearch}>找不到符合的權限。</p>}
        </div>

        <aside
          aria-label={COPY.permissions.policySummary}
          aria-busy={saveState === "saving"}
          className={styles.reviewPanel}
          role="region"
        >
          <div className={styles.reviewHeader}>
            <h2>
              {saveState === "success"
                ? COPY.permissions.policySaved
                : saveState === "error"
                  ? COPY.permissions.policySaveError
                  : saveState === "conflict"
                    ? COPY.permissions.policyConflict
                    : dirty
                      ? COPY.permissions.policyDirty
                      : COPY.permissions.policySyncedTitle}
            </h2>
            {dirty && (
              <span className={styles.changeCount}>
                {`${changes.length} 項未儲存`}
              </span>
            )}
          </div>
          <p>
            {!canEdit
              ? COPY.permissions.policyStaffReadOnly
              : saveState === "success"
                ? COPY.permissions.policySavedHint
                : saveState === "error"
                  ? COPY.permissions.policySaveErrorHint
                  : saveState === "conflict"
                    ? COPY.permissions.policyConflictHint
                    : dirty
                      ? COPY.permissions.policyDirtyHint
                      : COPY.permissions.policyAdminEditable}
          </p>
          <p className={styles.reviewNotice}>
            {saveState === "conflict" && conflictRevision !== null
              ? `${COPY.permissions.policyConflictRevision} ${conflictRevision}。${COPY.permissions.policyReloadHint}`
              : COPY.permissions.policyReadOnlyNotice}
          </p>
          <div className={styles.changeSummary}>
            <div className={styles.changeSummaryHeading}>
              <h3>{COPY.permissions.policyChangesTitle}</h3>
            </div>
            {reviewOpen && changes.length > 0 ? (
              <ul>
                {changes.map((change) => {
                  const capability = data.policy.capabilities.find(
                    (item) => item.key === change.capability
                  );
                  const previous =
                    capability?.roles[change.role].value ?? false;
                  const consequence = policyChangeConsequence(
                    change.capability
                  );
                  return (
                    <li key={`${change.role}:${change.capability}`}>
                      <strong>{capability?.label ?? change.capability}</strong>
                      <span>
                        {POLICY_ROLE_COPY[change.role]} · {previous ? "✓" : "—"}{" "}
                        →{" "}
                        {change.value
                          ? COPY.permissions.policyChangeEnabled
                          : COPY.permissions.policyChangeDisabled}
                      </span>
                      {consequence && (
                        <small className={styles.changeConsequence}>
                          {consequence}
                        </small>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
};

const InternalBackButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  return (
    <button className={styles.backButton} onClick={onClick} type="button">
      <BackIcon />
      <span>{label}</span>
    </button>
  );
};

const ChevronIcon = () => {
  return (
    <svg
      aria-hidden="true"
      className={styles.chevron}
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="m8 5 7 7-7 7" />
    </svg>
  );
};

const MemberBaseline = () => {
  return (
    <p className={styles.baselineNote} data-system-owned="true" role="note">
      <strong>{BASELINE_LABEL}</strong>
      <span>{BASELINE_SUMMARY}</span>
    </p>
  );
};

const RoleList = ({
  data,
  headingRef,
  onSelect,
}: {
  data: AccountPermissionsView;
  headingRef: HeadingRef;
  onSelect: (role: PermissionPolicyRoleKey) => void;
}) => {
  return (
    <section
      aria-labelledby="permissions-roles-title"
      className={styles.section}
    >
      <header className={styles.listHeader}>
        <div>
          <h2
            className={styles.sectionTitle}
            id="permissions-roles-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {COPY.permissions.rolesSection}
          </h2>
          <p className={styles.sectionLead}>
            固定全域角色按權限範圍分開管理；部門管理者只可管理所屬部門。
          </p>
        </div>
        <span className={styles.roleCount}>3 個全域角色</span>
      </header>
      <ul aria-label={ROLE_LIST_ARIA_LABEL} className={styles.roleList}>
        {POLICY_ROLE_ORDER.map((role) => {
          const roleCopy = GLOBAL_ROLE_COPY[role];
          const assignedCount = accountsForGlobalRole(data, role).length;
          const counts = capabilityCountForRole(data, role);
          return (
            <li className={styles.roleRow} key={role}>
              <button
                aria-label={`${roleCopy.label} · ${ROLE_DETAIL_TITLE_SUFFIX}`}
                className={styles.roleLink}
                data-role={role}
                onClick={() => onSelect(role)}
                type="button"
              >
                <span className={styles.roleCopy}>
                  <span className={styles.roleName}>{roleCopy.label}</span>
                  <span className={styles.roleScope}>{roleCopy.scope}</span>
                  <span className={styles.roleMeta}>
                    {`${assignedCount} 個已指派帳戶 · ${counts.total} 項能力`}
                  </span>
                </span>
                <ChevronIcon />
              </button>
            </li>
          );
        })}
      </ul>
      <MemberBaseline />
    </section>
  );
};

const RoleDetail = ({
  data,
  headingRef,
  onBack,
  onOpenAccounts,
  onOpenPermissions,
  role,
}: {
  data: AccountPermissionsView;
  headingRef: HeadingRef;
  onBack: () => void;
  onOpenAccounts: () => void;
  onOpenPermissions: () => void;
  role: PermissionPolicyRoleKey;
}) => {
  const roleCopy = GLOBAL_ROLE_COPY[role];
  const assignedCount = accountsForGlobalRole(data, role).length;
  const counts = capabilityCountForRole(data, role);
  return (
    <section
      aria-labelledby="permissions-role-detail-title"
      className={styles.section}
    >
      <InternalBackButton label={ROLE_DETAIL_BACK_LABEL} onClick={onBack} />
      <div className={styles.roleDetailHeader}>
        <div>
          <h2
            className={styles.detailTitle}
            id="permissions-role-detail-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {`${roleCopy.label} · ${ROLE_DETAIL_TITLE_SUFFIX}`}
          </h2>
          <p className={styles.detailLead}>{roleCopy.scope}</p>
        </div>
      </div>

      <dl className={styles.roleFacts}>
        <div>
          <dt>全域角色</dt>
          <dd>{roleCopy.label}</dd>
        </div>
        <div>
          <dt>已指派帳戶</dt>
          <dd>{assignedCount}</dd>
        </div>
        <div>
          <dt>適用能力</dt>
          <dd>{counts.total}</dd>
        </div>
      </dl>

      <div className={styles.detailActions}>
        <button
          aria-label={`${roleCopy.label} · ${ROLE_PERMISSIONS_LABEL}`}
          className={styles.detailAction}
          onClick={onOpenPermissions}
          type="button"
        >
          <span>
            <strong>{ROLE_PERMISSIONS_LABEL}</strong>
            <small>查看及核對這個角色的能力</small>
          </span>
          <ChevronIcon />
        </button>
        <button
          aria-label={`${roleCopy.label} · ${ROLE_ACCOUNTS_LABEL}`}
          className={styles.detailAction}
          onClick={onOpenAccounts}
          type="button"
        >
          <span>
            <strong>{ROLE_ACCOUNTS_LABEL}</strong>
            <small>只供查看，不在此變更角色</small>
          </span>
          <ChevronIcon />
        </button>
      </div>

      <aside className={styles.safetyNotice} aria-label="安全限制">
        <strong>安全限制</strong>
        <p>
          {role === "member"
            ? "會友角色不能修改管理權限；一般會友能力由系統固定保留。"
            : role === "staff"
              ? "同工可按獲授權部門協助工作；全域角色仍由系統政策及伺服器核准。"
              : "管理員的政策修改仍受 CAS 版本及至少一名管理員政策編輯者規則保護。"}
        </p>
      </aside>
    </section>
  );
};

const AssignedAccounts = ({
  data,
  definitions,
  headingRef,
  onBack,
  role,
}: {
  data: AccountPermissionsView;
  definitions: readonly AccountPermissionRole[];
  headingRef: HeadingRef;
  onBack: () => void;
  role: PermissionPolicyRoleKey;
}) => {
  const roleCopy = GLOBAL_ROLE_COPY[role];
  const accounts = accountsForGlobalRole(data, role);
  return (
    <section
      aria-labelledby="permissions-assigned-title"
      className={styles.section}
    >
      <InternalBackButton
        label={ROLE_PERMISSIONS_BACK_LABEL}
        onClick={onBack}
      />
      <header className={styles.detailHeader}>
        <div>
          <h2
            className={styles.detailTitle}
            id="permissions-assigned-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {`${ROLE_ACCOUNTS_LABEL} · ${roleCopy.label}`}
          </h2>
          <p className={styles.detailLead}>{ASSIGNED_ACCOUNTS_COPY}</p>
        </div>
        <span className={styles.revision}>{`${accounts.length} 個帳戶`}</span>
      </header>
      {role === "member" && (
        <p className={styles.baselineHint}>{MEMBER_ACCOUNTS_COPY}</p>
      )}
      {accounts.length > 0 ? (
        <div className={styles.tableWrap}>
          <table
            aria-label={`${roleCopy.label} · ${ROLE_ACCOUNTS_LABEL}`}
            className={styles.table}
          >
            <caption className={styles.visuallyHidden}>
              {`${roleCopy.label} · ${ROLE_ACCOUNTS_LABEL}`}
            </caption>
            <thead>
              <tr>
                <th scope="col">{COPY.permissions.accountName}</th>
                <th scope="col">{COPY.permissions.accountRole}</th>
                <th scope="col">{COPY.permissions.accountDepartment}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const accountRole =
                  definitions.find((item) => item.key === account.role)
                    ?.label ?? ROLE_COPY[account.role].label;
                const department = departmentContext(account, definitions);
                return (
                  <tr key={account.userId}>
                    <th scope="row">{account.name}</th>
                    <td>{accountRole}</td>
                    <td>{department}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.emptyState}>目前沒有可顯示的已指派帳戶。</p>
      )}
    </section>
  );
};

function isPolicyRole(value: string | null): value is PermissionPolicyRoleKey {
  return (
    value !== null &&
    POLICY_ROLE_ORDER.includes(value as PermissionPolicyRoleKey)
  );
}

function initialPermissionNavigation(searchParams: URLSearchParams): {
  role: PermissionPolicyRoleKey;
  screen: PermissionScreen;
} {
  const role = isPolicyRole(searchParams.get("role"))
    ? (searchParams.get("role") as PermissionPolicyRoleKey)
    : "admin";
  const requestedScreen = searchParams.get("view");
  const screen: PermissionScreen =
    requestedScreen === "permissions" || requestedScreen === "accounts"
      ? requestedScreen
      : requestedScreen === "detail"
        ? "role-detail"
        : "roles";
  return { role, screen };
}

export const PermissionsPanel = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnHref = safeManagementReturnHref(
    searchParams.get("return"),
    "/management"
  );
  const returnLabel = returnHref.includes("module=settings")
    ? COPY.permissions.backToSettings
    : "返回管理工作";
  const {
    state,
    run: loadPermissions,
    retry,
  } = useAsyncResource<AccountPermissionsView, PermissionsState>(
    () => getAccountPermissions(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (data) => ({ kind: "ready", data }),
      onError: (error) => {
        const code = error instanceof RpcError ? error.problem.code : undefined;
        if (code === "AUTH_REQUIRED") {
          announce("");
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return null;
        }

        const forbidden = code === "FORBIDDEN";
        const message = forbidden
          ? COPY.permissions.forbidden
          : COPY.permissions.loadError;
        announce(message);
        return {
          kind: "error",
          failure: forbidden ? "forbidden" : "recoverable",
          message,
        };
      },
      announceLoading: COPY.permissions.loading,
      focusTarget: "#permissions-panel-state",
    },
    [router]
  );

  const [displayData, setDisplayData] = useState<AccountPermissionsView | null>(
    null
  );
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<PolicySaveState>("idle");
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const preserveDraftOnReload = useRef(false);
  const [activeRole, setActiveRole] = useState<PermissionPolicyRoleKey>(
    () => initialPermissionNavigation(searchParams).role
  );
  const [screen, setScreen] = useState<PermissionScreen>(
    () => initialPermissionNavigation(searchParams).screen
  );
  const viewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const loadingStateRef = useRef<HTMLOutputElement | null>(null);
  const errorStateRef = useRef<HTMLElement | null>(null);

  const fetchedData = state.kind === "ready" ? state.data : null;
  const readyData = displayData ?? fetchedData;

  useEffect(() => {
    if (state.kind !== "ready" || displayData !== null) {
      return;
    }
    const nextData = state.data;
    setDraft((current) => {
      if (current === null) {
        setDraftRevision(nextData.policy.revision);
        return policyDraftFromData(nextData);
      }
      const dirty = policyChanges(nextData, current).length > 0;
      if (preserveDraftOnReload.current) {
        preserveDraftOnReload.current = false;
        setDraftRevision(nextData.policy.revision);
        return current;
      }
      if (!dirty && draftRevision !== nextData.policy.revision) {
        setDraftRevision(nextData.policy.revision);
        return policyDraftFromData(nextData);
      }
      return current;
    });
  }, [displayData, draftRevision, state]);

  const handleToggle = (role: PermissionPolicyRoleKey, capability: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const key = draftKey(role, capability);
      return { ...current, [key]: !current[key] };
    });
    setSaveState("idle");
    setConflictRevision(null);
  };

  const handleSave = async () => {
    if (!readyData || !draft || !readyData.policy.actor.canEdit) {
      return;
    }
    const changes = policyChanges(readyData, draft);
    if (changes.length === 0) {
      return;
    }
    setSaveState("saving");
    setConflictRevision(null);
    announce(COPY.permissions.policySaving);
    try {
      const result = await updateAccountPermissions(
        {
          baseRevision: draftRevision ?? readyData.policy.revision,
          changes,
        },
        crypto.randomUUID()
      );
      setDisplayData(result);
      setDraft(policyDraftFromData(result));
      setDraftRevision(result.policy.revision);
      setSaveState("success");
      announce(COPY.permissions.policySaved);
    } catch (error) {
      if (
        error instanceof RpcError &&
        error.problem.code === "POLICY_REVISION_CONFLICT"
      ) {
        const extension = error.problem as typeof error.problem & {
          currentRevision?: unknown;
        };
        setConflictRevision(
          typeof extension.currentRevision === "number"
            ? extension.currentRevision
            : null
        );
        setSaveState("conflict");
        announce(COPY.permissions.policyConflict);
        return;
      }
      setSaveState("error");
      announce(COPY.permissions.policySaveError);
    }
  };

  const handleReload = () => {
    preserveDraftOnReload.current = true;
    setDisplayData(null);
    setSaveState("idle");
    setConflictRevision(null);
    retry();
  };

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    if (state.kind === "ready") {
      announce("");
    }
  }, [state.kind]);

  const definitions = readyData ? roleDefinitions(readyData) : [];
  const dirty =
    readyData !== null && draft !== null
      ? policyChanges(readyData, draft).length > 0
      : false;

  const selectRole = (role: PermissionPolicyRoleKey) => {
    setActiveRole(role);
    setScreen("role-detail");
  };

  const goToPolicy = () => {
    setScreen("permissions");
  };

  const goToAssignedAccounts = () => {
    setScreen("accounts");
  };

  const goBack = () => {
    setScreen((current) =>
      current === "roles"
        ? "roles"
        : current === "role-detail"
          ? "roles"
          : "role-detail"
    );
  };

  useEffect(() => {
    if (readyData) {
      viewHeadingRef.current?.focus();
    }
  }, [readyData, screen]);

  useEffect(() => {
    if (state.kind === "loading") {
      loadingStateRef.current?.focus();
    } else if (state.kind === "error") {
      errorStateRef.current?.focus();
    }
  }, [state]);

  return (
    <section
      className={styles.page}
      aria-labelledby="permissions-title"
      aria-busy={state.kind === "loading"}
    >
      <header className={styles.header}>
        {(screen === "roles" || readyData === null) && (
          <SettingsBackLink href={returnHref} label={returnLabel} />
        )}
        <h1 id="permissions-title" className={styles.title}>
          {COPY.permissions.permissionsTitle}
        </h1>
        <p className={styles.lead}>{COPY.permissions.permissionsLead}</p>
      </header>

      {state.kind === "loading" && (
        <output
          id="permissions-panel-state"
          tabIndex={-1}
          className={styles.state}
          aria-busy="true"
          ref={loadingStateRef}
        >
          {COPY.permissions.loading}
        </output>
      )}

      {state.kind === "error" && (
        <section
          id="permissions-panel-state"
          tabIndex={-1}
          className={styles.error}
          role="alert"
          ref={errorStateRef}
        >
          <h2 className={styles.stateTitle}>
            {state.failure === "forbidden"
              ? COPY.permissions.forbidden
              : COPY.permissions.loadError}
          </h2>
          {state.message !==
            (state.failure === "forbidden"
              ? COPY.permissions.forbidden
              : COPY.permissions.loadError) && (
            <p className={styles.stateMessage}>{state.message}</p>
          )}
          <button className={styles.retry} type="button" onClick={retry}>
            {COPY.permissions.retry}
          </button>
        </section>
      )}

      {readyData && draft && (
        <>
          {screen === "roles" && (
            <RoleList
              data={readyData}
              headingRef={viewHeadingRef}
              onSelect={selectRole}
            />
          )}
          {screen === "role-detail" && (
            <RoleDetail
              data={readyData}
              headingRef={viewHeadingRef}
              onBack={goBack}
              onOpenAccounts={goToAssignedAccounts}
              onOpenPermissions={goToPolicy}
              role={activeRole}
            />
          )}
          {screen === "permissions" && (
            <>
              <InternalBackButton
                label={ROLE_PERMISSIONS_BACK_LABEL}
                onClick={goBack}
              />
              <PermissionPolicy
                conflictRevision={conflictRevision}
                data={readyData}
                draft={draft}
                dirty={dirty}
                headingRef={viewHeadingRef}
                onReload={handleReload}
                onSave={() => void handleSave()}
                onToggle={handleToggle}
                role={activeRole}
                saveState={saveState}
              />
            </>
          )}
          {screen === "accounts" && (
            <AssignedAccounts
              data={readyData}
              definitions={definitions}
              headingRef={viewHeadingRef}
              onBack={goBack}
              role={activeRole}
            />
          )}
        </>
      )}
    </section>
  );
};
