"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type { Section } from "@/lib/api";
import { RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { ApprovalQueue } from "@/lib/approval-queue";
import { COPY, errorCopyFor } from "@/lib/copy";
import {
  ManagementMembersError,
  searchManagementMembers,
  type ManagementMember,
} from "@/lib/management-api";
import { announce } from "@/lib/live-region";
import { ManagementDirectory } from "@/lib/programs/management-directory";
import { getManagementAccess } from "@/lib/programs/program-api";
import type { Department } from "@/lib/programs/program-api";
import { ProgramForm } from "@/lib/programs/program-form";
import type { ProgramsManagementAccess } from "@/lib/programs/programs-access";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { rememberDeepLink } from "@/lib/session";

import styles from "@/app/management/management.module.css";

const AttendanceOperatorPanel = lazy(() =>
  import("@/lib/attendance-operator-panel").then(
    ({ AttendanceOperatorPanel: Component }) => ({ default: Component })
  )
);

export type ManagementModule =
  | "approvals"
  | "members"
  | "permissions"
  | "programs"
  | "events"
  | "care"
  | "home";

export interface ManagementHubRow {
  key: ManagementModule;
  label: string;
  description: string;
}

export interface ManagementHubGroup {
  key: "membership" | "operations" | "content";
  label: string;
  rows: ManagementHubRow[];
}

const MODULE_KEYS: readonly ManagementModule[] = [
  "approvals",
  "members",
  "permissions",
  "programs",
  "events",
  "care",
  "home",
];

function isManagementModule(value: string | null): value is ManagementModule {
  return value !== null && MODULE_KEYS.includes(value as ManagementModule);
}

/**
 * Project rows from server-authenticated profile, sections, and access data.
 * No browser-side role can add a row: each entry requires the matching
 * server-shaped section or management scope before it reaches the UI.
 */
export function projectManagementHubGroups(
  profile: { role: string },
  sections: readonly Section[],
  access: ProgramsManagementAccess
): ManagementHubGroup[] {
  const sectionKeys = new Set(sections.map((section) => section.key));
  const staffOrAdmin = profile.role === "Admin" || profile.role === "Staff";
  const canManagePrograms = access.hasManagementCapability;
  const canSearchMembers = staffOrAdmin || access.departmentScopes > 0;
  const rows: Record<ManagementHubGroup["key"], ManagementHubRow[]> = {
    membership: [],
    operations: [],
    content: [],
  };

  if (staffOrAdmin) {
    rows.membership.push({
      key: "approvals",
      label: COPY.management.registrationApprovals,
      description: COPY.management.registrationApprovalsHint,
    });
  }
  if (canSearchMembers) {
    rows.membership.push({
      key: "members",
      label: COPY.management.memberDirectory,
      description: COPY.management.memberDirectoryHint,
    });
  }
  if (sectionKeys.has("permissions")) {
    rows.membership.push({
      key: "permissions",
      label: COPY.management.accountPermissions,
      description: COPY.management.accountPermissionsHint,
    });
  }

  if (canManagePrograms) {
    rows.operations.push({
      key: "programs",
      label: COPY.management.programManagement,
      description: COPY.management.programManagementHint,
    });
  }
  if (
    sectionKeys.has("events") &&
    (staffOrAdmin || canManagePrograms)
  ) {
    rows.operations.push({
      key: "events",
      label: COPY.management.eventOperations,
      description: COPY.management.eventOperationsHint,
    });
  }
  if (sectionKeys.has("care")) {
    rows.operations.push({
      key: "care",
      label: COPY.management.careOperations,
      description: COPY.management.careOperationsHint,
    });
  }

  // The Home CMS endpoint owns its own capability. Only a server projection
  // that names that capability (or its explicit section key) can expose it.
  if (
    sections.some(
      (section) =>
        section.key === "home-cms" || section.capability === "home.publish"
    )
  ) {
    rows.content.push({
      key: "home",
      label: COPY.management.homeContent,
      description: COPY.management.homeContentHint,
    });
  }

  return (Object.keys(rows) as ManagementHubGroup["key"][])
    .map((key) => ({
      key,
      label:
        key === "membership"
          ? COPY.management.groupMembership
          : key === "operations"
            ? COPY.management.groupOperations
            : COPY.management.groupContent,
      rows: rows[key],
    }))
    .filter((group) => group.rows.length > 0);
}

type AccessState =
  | { kind: "loading" }
  | { kind: "ready"; projection: ProgramsManagementAccess }
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };

function readModuleFromLocation(): ManagementModule | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("module");
  return isManagementModule(value) ? value : null;
}

function readEventIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("eventId");
  return value?.trim() || null;
}

function useManagementModule() {
  const [module, setModule] = useState<ManagementModule | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setModule(readModuleFromLocation());
      setEventId(readEventIdFromLocation());
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = useCallback((next: ManagementModule | null) => {
    if (typeof window === "undefined") return;
    const href = next ? `/management?module=${next}` : "/management";
    window.history.pushState({}, "", href);
    setModule(next);
    setEventId(null);
    announce(next ? COPY.management.pageTitle : COPY.management.backToHub);
  }, []);

  return { module, eventId, navigate };
}

export function ManagementHub() {
  const router = useRouter();
  const { bootstrap } = useApp();
  const { module, eventId, navigate } = useManagementModule();
  const [access, setAccess] = useState<AccessState>({ kind: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAccess({ kind: "loading" });
    (async () => {
      try {
        const projection = await getManagementAccess(true);
        if (!cancelled) setAccess({ kind: "ready", projection });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        setAccess({
          kind: "error",
          failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
          message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryKey, router]);

  const groups = useMemo(
    () =>
      access.kind === "ready"
        ? projectManagementHubGroups(
            bootstrap.profile,
            bootstrap.sections,
            access.projection
          )
        : [],
    [access, bootstrap]
  );

  if (access.kind === "loading") {
    return (
      <section className={styles.page} aria-labelledby="management-title">
        <header className={styles.header}>
          <h1 id="management-title" className={styles.title}>
            {COPY.management.pageTitle}
          </h1>
        </header>
        <p className={styles.state} role="status" aria-busy="true">
          {COPY.management.loading}
        </p>
      </section>
    );
  }

  if (access.kind === "error") {
    return (
      <section className={styles.page} aria-labelledby="management-title">
        <header className={styles.header}>
          <h1 id="management-title" className={styles.title}>
            {COPY.management.pageTitle}
          </h1>
        </header>
        <section className={styles.errorState} role="alert" tabIndex={-1}>
          <h2 className={styles.errorTitle}>
            {access.failure === "forbidden"
              ? COPY.management.forbidden
              : COPY.management.loadError}
          </h2>
          <p className={styles.errorMessage}>
            {access.failure === "forbidden"
              ? COPY.management.forbiddenHint
              : access.message}
          </p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            {COPY.management.retry}
          </button>
        </section>
      </section>
    );
  }

  const activeRow = groups.flatMap((group) => group.rows).find(
    (row) => row.key === module
  );

  if (module && !activeRow) {
    return (
      <section className={styles.page} aria-labelledby="management-title">
        <header className={styles.header}>
          <h1 id="management-title" className={styles.title}>
            {COPY.management.pageTitle}
          </h1>
        </header>
        <section className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>{COPY.management.forbidden}</h2>
          <p className={styles.errorMessage}>{COPY.management.forbiddenHint}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => navigate(null)}
          >
            {COPY.management.backToHub}
          </button>
        </section>
      </section>
    );
  }

  if (module && activeRow) {
    return (
      <section className={styles.page} aria-labelledby="management-module-title">
        <div className={styles.moduleFrame}>
          <header className={styles.moduleHeader}>
            <div>
              <h1 id="management-module-title" className={styles.moduleTitle}>
                {activeRow.label}
              </h1>
              <p className={styles.moduleLead}>{activeRow.description}</p>
            </div>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate(null)}
            >
              {COPY.management.backToHub}
            </button>
          </header>
          <ModuleSurface
            module={module}
            eventId={eventId}
            profile={bootstrap.profile}
            sections={bootstrap.sections}
            access={access.projection}
            onOpenProgram={(programId) =>
              router.push(
                buildProgramsHref({
                  mode: "management",
                  programId,
                })
              )
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="management-title">
      <header className={styles.header}>
        <h1 id="management-title" className={styles.title}>
          {COPY.management.pageTitle}
        </h1>
        <p className={styles.lead}>{COPY.management.pageLead}</p>
        <p className={styles.status} role="status">
          {COPY.programs.managementScopeReady}
        </p>
      </header>
      {groups.length === 0 ? (
        <section className={styles.emptyState} role="status">
          <h2 className={styles.emptyTitle}>{COPY.management.forbidden}</h2>
          <p className={styles.emptyMessage}>{COPY.management.forbiddenHint}</p>
        </section>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.key} className={styles.group}>
              <h2 className={styles.groupTitle}>{group.label}</h2>
              <ul className={styles.rowList}>
                {group.rows.map((row) => (
                  <li key={row.key} className={styles.rowItem}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => navigate(row.key)}
                    >
                      <span className={styles.rowLabel}>{row.label}</span>
                      <span className={styles.rowDescription}>
                        {row.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function ModuleSurface({
  module,
  eventId,
  profile,
  sections,
  access,
  onOpenProgram,
}: {
  module: ManagementModule;
  eventId: string | null;
  profile: {
    name: string;
    username: string;
    role: string;
    status: string;
  };
  sections: readonly Section[];
  access: ProgramsManagementAccess;
  onOpenProgram: (programId: string) => void;
}) {
  if (module === "approvals") return <ApprovalQueue />;
  if (module === "members") return <MemberDirectory />;
  if (module === "programs") {
    return <ProgramsSurface onOpenProgram={onOpenProgram} />;
  }
  if (module === "events") {
    return (
      <Suspense
        fallback={
          <p className={styles.state} role="status" aria-busy="true">
            {COPY.management.loading}
          </p>
        }
      >
        <AttendanceOperatorPanel eventId={eventId} />
      </Suspense>
    );
  }
  if (module === "permissions") {
    return <PermissionsProjection profile={profile} sections={sections} access={access} />;
  }
  if (module === "care") {
    return <CareSurface />;
  }
  return (
    <a className={styles.primaryButton} href="/management/home">
      {COPY.management.homeContent}
    </a>
  );
}

function ProgramsSurface({
  onOpenProgram,
}: {
  onOpenProgram: (programId: string) => void;
}) {
  const [createDepartments, setCreateDepartments] = useState<
    Department[] | null
  >(null);

  if (createDepartments) {
    return (
      <ProgramForm
        departments={createDepartments}
        onSaved={(programId) => {
          setCreateDepartments(null);
          onOpenProgram(programId);
        }}
        onCancel={() => setCreateDepartments(null)}
      />
    );
  }

  return (
    <ManagementDirectory
      onOpenProgram={onOpenProgram}
      onCreateProgram={setCreateDepartments}
    />
  );
}

function CareSurface() {
  return (
    <section
      className={styles.careSurface}
      aria-labelledby="management-care-title"
    >
      <h2 id="management-care-title" className={styles.moduleTitle}>
        {COPY.sections.care}
      </h2>
      <p>{COPY.management.careUnavailable}</p>
    </section>
  );
}

function MemberDirectory() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; members: ManagementMember[] }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [selectedMember, setSelectedMember] =
    useState<ManagementMember | null>(null);
  const debounceRef = useRef<number | null>(null);
  const searchSequence = useRef(0);

  const runSearch = useCallback(async (trimmed: string) => {
    const sequence = ++searchSequence.current;
    setSelectedMember(null);
    setState({ kind: "loading" });
    try {
      const members = await searchManagementMembers(trimmed);
      if (sequence !== searchSequence.current) return;
      setState(
        members.length ? { kind: "ready", members } : { kind: "empty" }
      );
    } catch (error) {
      if (sequence !== searchSequence.current) return;
      const message =
        error instanceof ManagementMembersError &&
        (error.status === 401 || error.status === 403)
          ? COPY.management.memberSearchForbidden
          : COPY.management.memberSearchError;
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchSequence.current += 1;
      if (trimmed.length === 0) {
        setSelectedMember(null);
        setState({ kind: "idle" });
      }
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void runSearch(trimmed);
    }, 250);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, runSearch]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState({
        kind: "error",
        message: COPY.management.memberSearchMinLength,
      });
      return;
    }
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void runSearch(trimmed);
  };

  return (
    <div className={styles.moduleFrame}>
      <form className={styles.searchForm} onSubmit={submit}>
        <label className={styles.searchLabel} htmlFor="management-member-search">
          {COPY.management.memberSearchLabel}
        </label>
        <p className={styles.searchHint}>{COPY.management.memberSearchHint}</p>
        <div className={styles.searchRow}>
          <input
            id="management-member-search"
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={COPY.management.memberSearchPlaceholder}
            autoComplete="off"
          />
          <button className={styles.primaryButton} type="submit">
            {COPY.management.memberSearchSubmit}
          </button>
        </div>
      </form>
      {state.kind === "loading" && (
        <p className={styles.state} role="status" aria-busy="true">
          {COPY.management.memberSearchLoading}
        </p>
      )}
      {state.kind === "error" && (
        <p className={styles.errorState} role="alert">
          {state.message}
        </p>
      )}
      {state.kind === "empty" && (
        <p className={styles.emptyState} role="status">
          {COPY.management.memberSearchEmpty}
        </p>
      )}
      {state.kind === "ready" && (
        <section aria-labelledby="management-member-results-title">
          <h2
            id="management-member-results-title"
            className={styles.moduleTitle}
          >
            {COPY.management.memberSearchResults}
          </h2>
          <ul className={styles.memberResults}>
            {state.members.map((member) => (
              <li key={member.user_id}>
                <button
                  className={styles.memberRow}
                  type="button"
                  onClick={() => setSelectedMember(member)}
                >
                  <span className={styles.memberName}>{member.name}</span>
                  <span className={styles.memberUsername}>
                    {member.username}
                  </span>
                  <span className={styles.memberMeta}>
                    {member.role} · {member.phone || COPY.management.memberPhoneUnavailable}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {selectedMember && (
        <aside
          className={styles.memberDetail}
          aria-labelledby="management-member-detail-title"
        >
          <div className={styles.memberDetailHeader}>
            <div>
              <p className={styles.memberDetailKicker}>
                {COPY.management.memberDetailTitle}
              </p>
              <h2
                id="management-member-detail-title"
                className={styles.moduleTitle}
              >
                {selectedMember.name}
              </h2>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setSelectedMember(null)}
            >
              {COPY.management.memberDetailClose}
            </button>
          </div>
          <dl className={styles.memberDetailList}>
            <div>
              <dt>{COPY.management.memberDetailUsername}</dt>
              <dd>{selectedMember.username}</dd>
            </div>
            <div>
              <dt>{COPY.management.memberDetailRole}</dt>
              <dd>{selectedMember.role}</dd>
            </div>
            <div>
              <dt>{COPY.management.memberDetailPhone}</dt>
              <dd>
                {selectedMember.phone || COPY.management.memberPhoneUnavailable}
              </dd>
            </div>
            <div>
              <dt>{COPY.management.memberDetailDepartments}</dt>
              <dd>
                {selectedMember.departments?.length ? (
                  <ul className={styles.memberDepartmentList}>
                    {selectedMember.departments.map((department) => (
                      <li key={department.department_id}>
                        {department.name} · {department.code}
                      </li>
                    ))}
                  </ul>
                ) : (
                  COPY.management.memberDepartmentUnavailable
                )}
              </dd>
            </div>
          </dl>
        </aside>
      )}
    </div>
  );
}

function PermissionsProjection({
  profile,
  sections,
  access,
}: {
  profile: {
    name: string;
    username: string;
    role: string;
    status: string;
  };
  sections: readonly Section[];
  access: ProgramsManagementAccess;
}) {
  return (
    <div className={styles.moduleFrame}>
      <dl className={styles.permissionsSummary}>
        <div>
          <dt>{COPY.management.permissionProfile}</dt>
          <dd>
            {profile.name} · {profile.username}
          </dd>
        </div>
        <div>
          <dt>{COPY.management.permissionRole}</dt>
          <dd>{profile.role}</dd>
        </div>
        <div>
          <dt>{COPY.management.permissionStatus}</dt>
          <dd>{profile.status}</dd>
        </div>
        <div>
          <dt>{COPY.management.permissionManagementScopes}</dt>
          <dd>{access.departmentScopes}</dd>
        </div>
        <div>
          <dt>{COPY.management.permissionProgramScopes}</dt>
          <dd>{access.programScopes}</dd>
        </div>
      </dl>
      <section aria-labelledby="management-permissions-table-title">
        <h2
          id="management-permissions-table-title"
          className={styles.moduleTitle}
        >
          {COPY.management.permissionCapabilities}
        </h2>
        <div className={styles.permissionsTableWrap}>
          <table className={styles.permissionsTable}>
            <thead>
              <tr>
                <th scope="col">{COPY.management.permissionSection}</th>
                <th scope="col">{COPY.management.permissionCapability}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.key}>
                  <td>{section.label}</td>
                  <td>{section.capability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
