"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getAccountPermissions,
  updateAccountPermissions,
  type AccountPermissionPolicyCapability,
  type AccountPermissionRole,
  type AccountPermissionRoleKey,
  type AccountPermissionsView,
  type PermissionPolicyChange,
  type PermissionPolicyRoleKey,
} from "@/lib/programs/program-api";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";

import { SettingsBackLink } from "./settings-ui";

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

function roleDefinitions(data: AccountPermissionsView): AccountPermissionRole[] {
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

function PolicyCell({
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
}) {
  const cell = capability.roles[role];
  const state = cell.locked
    ? `${COPY.permissions.policyLocked}：${cell.lockReason ?? "此政策格不能修改。"}`
    : dirty
      ? `${COPY.permissions.policyPending} · ${COPY.permissions.policyEditable}`
      : cell.editable
      ? COPY.permissions.policyEditable
      : COPY.permissions.policyReadOnly;

  const content = (
    <>
      <strong>{POLICY_ROLE_COPY[role]}</strong>
      <span>
        {value ? COPY.permissions.policyEnabled : COPY.permissions.policyDisabled}
      </span>
      <small>{state}</small>
    </>
  );
  const className = `${styles.policyCell} ${cell.locked ? styles.lockedCell : ""}`;
  if (cell.editable && onToggle) {
    return (
      <button
        aria-label={`${capability.label} · ${POLICY_ROLE_COPY[role]}`}
        aria-pressed={value}
        className={className}
        data-editable="true"
        data-locked="false"
        onClick={onToggle}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      aria-label={`${capability.label} · ${POLICY_ROLE_COPY[role]}`}
      className={className}
      data-editable={cell.editable ? "true" : "false"}
      data-locked={cell.locked ? "true" : "false"}
      role="group"
    >
      {content}
    </div>
  );
}

function PolicyCapabilityRow({
  capability,
  draft,
  onToggle,
}: {
  capability: AccountPermissionPolicyCapability;
  draft: PolicyDraft;
  onToggle: (role: PermissionPolicyRoleKey, capability: string) => void;
}) {
  return (
    <article className={styles.policyRow}>
      <div className={styles.policyCopy}>
        <strong>{capability.label}</strong>
        <small>{capability.description}</small>
        <code>{capability.key}</code>
      </div>
      <div className={styles.policyCells}>
        {POLICY_ROLE_ORDER.map((role) => {
          const key = draftKey(role, capability.key);
          return (
            <PolicyCell
              capability={capability}
              dirty={draft[key] !== capability.roles[role].value}
              key={role}
              onToggle={
                capability.roles[role].editable
                  ? () => onToggle(role, capability.key)
                  : undefined
              }
              role={role}
              value={draft[key] ?? capability.roles[role].value}
            />
          );
        })}
      </div>
    </article>
  );
}

function PermissionPolicy({
  data,
  draft,
  saveState,
  dirty,
  onToggle,
  onSave,
  onReload,
  conflictRevision,
}: {
  data: AccountPermissionsView;
  draft: PolicyDraft;
  saveState: PolicySaveState;
  dirty: boolean;
  onToggle: (role: PermissionPolicyRoleKey, capability: string) => void;
  onSave: () => void;
  onReload: () => void;
  conflictRevision: number | null;
}) {
  const groups = policyGroups(data.policy.capabilities);
  const canEdit = data.policy.actor.canEdit;
  return (
    <section
      aria-labelledby="permissions-policy-title"
      className={styles.policySection}
    >
      <header className={styles.policyHeader}>
        <div>
          <h2 id="permissions-policy-title" className={styles.sectionTitle}>
            {COPY.permissions.policyTitle}
          </h2>
          <p className={styles.policyLead}>{COPY.permissions.policyLead}</p>
        </div>
        <span className={styles.revision}>
          {`${COPY.permissions.policySynced} ${data.policy.revision}。`}
        </span>
      </header>

      <div className={styles.policyLayout}>
        <div className={styles.groupStack}>
          {groups.map((group) => {
            const capabilities = data.policy.capabilities.filter(
              (capability) => capability.group === group
            );
            return (
              <details className={styles.policyGroup} key={group} open>
                <summary>
                  <strong>{group}</strong>
                  <span>{capabilities.length} 項</span>
                </summary>
                <div className={styles.policyGroupBody}>
                  {capabilities.map((capability) => (
                    <PolicyCapabilityRow
                      capability={capability}
                      key={capability.key}
                      draft={draft}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        <aside
          aria-label={COPY.permissions.policySummary}
          className={styles.reviewPanel}
          role="region"
        >
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
          {canEdit && dirty && (
            <button
              className={styles.saveButton}
              disabled={saveState === "saving"}
              onClick={onSave}
              type="button"
            >
              {saveState === "saving"
                ? COPY.permissions.policySaving
                : COPY.permissions.policySave}
            </button>
          )}
          {canEdit && saveState === "conflict" && (
            <button
              className={styles.reloadButton}
              onClick={onReload}
              type="button"
            >
              {COPY.permissions.policyReload}
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

export function PermissionsPanel() {
  const router = useRouter();
  const { state, run: loadPermissions, retry } = useAsyncResource<
    AccountPermissionsView,
    PermissionsState
  >(() => getAccountPermissions(), {
    toLoading: () => ({ kind: "loading" }),
    toReady: (data) => ({ kind: "ready", data }),
    onError: (error) => {
      const code = error instanceof RpcError ? error.problem.code : undefined;
      if (code === "AUTH_REQUIRED") {
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
  }, [router]);

  const [displayData, setDisplayData] = useState<AccountPermissionsView | null>(
    null
  );
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<PolicySaveState>("idle");
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const preserveDraftOnReload = useRef(false);

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

  const handleToggle = (
    role: PermissionPolicyRoleKey,
    capability: string
  ) => {
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

  const definitions = readyData ? roleDefinitions(readyData) : [];
  const dirty =
    readyData !== null && draft !== null
      ? policyChanges(readyData, draft).length > 0
      : false;

  return (
    <section
      className={styles.page}
      aria-labelledby="permissions-title"
      aria-busy={state.kind === "loading"}
    >
      <header className={styles.header}>
        <SettingsBackLink
          href="/management?module=settings"
          label={COPY.permissions.backToSettings}
        />
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
          <section
            className={styles.section}
            aria-labelledby="permissions-accounts-title"
          >
            <h2 id="permissions-accounts-title" className={styles.sectionTitle}>
              {COPY.permissions.accountsSection}
            </h2>
            <div className={styles.tableWrap}>
              <table
                className={styles.table}
                aria-label={COPY.permissions.accountsSection}
              >
                <caption className={styles.visuallyHidden}>
                  {COPY.permissions.accountsSection}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{COPY.permissions.accountName}</th>
                    <th scope="col">{COPY.permissions.accountRole}</th>
                    <th scope="col">{COPY.permissions.accountDepartment}</th>
                  </tr>
                </thead>
                <tbody>
                  {readyData.accounts.map((account) => {
                    const accountRole =
                      definitions.find((role) => role.key === account.role)?.label ??
                      ROLE_COPY[account.role].label;
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
          </section>

          <section
            className={styles.section}
            aria-labelledby="permissions-roles-title"
          >
            <h2 id="permissions-roles-title" className={styles.sectionTitle}>
              {COPY.permissions.rolesSection}
            </h2>
            <ul className={styles.roleList}>
              {definitions.map((role) => {
                const assigned = role.assignmentState === "assigned";
                return (
                  <li className={styles.roleRow} key={role.key}>
                    <span className={styles.roleCopy}>
                      <span className={styles.roleName}>{role.label}</span>
                      <span className={styles.roleScope}>{role.scope}</span>
                    </span>
                    <span
                      className={`${styles.status} ${assigned ? styles.statusAssigned : ""}`}
                    >
                      {assigned
                        ? COPY.permissions.stateAssigned
                        : COPY.permissions.stateAssignable}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <PermissionPolicy
            conflictRevision={conflictRevision}
            data={readyData}
            draft={draft}
            dirty={dirty}
            onReload={handleReload}
            onSave={() => void handleSave()}
            onToggle={handleToggle}
            saveState={saveState}
          />
        </>
      )}
    </section>
  );
}
