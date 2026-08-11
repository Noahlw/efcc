"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { rememberDeepLink } from "@/lib/session";
import { listDepartments, listPrograms } from "@/lib/programs/program-api";

import styles from "@/app/programs/programs.module.css";

import {
  buildProgramsHref,
  parseProgramsIntent,
} from "./programs-intent";
import type { ProgramsIntent } from "./programs-intent";
import { projectManagementAccess } from "./programs-access";
import type { ProgramsManagementAccess } from "./programs-access";

interface ReadyAccess {
  kind: "ready";
  projection: ProgramsManagementAccess;
}

type AccessState =
  | { kind: "loading" }
  | ReadyAccess
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };


export function ProgramsBoundary() {
  const router = useRouter();
  const pathname = usePathname();
  const routeQuery = useSearchParams().toString();
  const routeHash =
    typeof window === "undefined" ? "" : window.location.hash;
  const routeKey = `${pathname}?${routeQuery}${routeHash}`;
  const [search, setSearch] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const [access, setAccess] = useState<AccessState>({ kind: "loading" });
  const mounted = useRef(true);
  const previousMode = useRef<ProgramsIntent["mode"] | null>(null);
  const focusMode = useRef<ProgramsIntent["mode"] | null>(null);
  const retryFocusPending = useRef(false);
  const intent = useMemo(() => parseProgramsIntent(search), [search]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const syncSearch = () =>
      setSearch(`${window.location.search}${window.location.hash}`);
    syncSearch();
    setLocationReady(true);
    window.addEventListener("popstate", syncSearch);
    window.addEventListener("hashchange", syncSearch);
    return () => {
      window.removeEventListener("popstate", syncSearch);
      window.removeEventListener("hashchange", syncSearch);
    };
  }, [routeKey]);

  const loadAccess = useCallback(
    async (request?: { cancelled: boolean }) => {
      setAccess({ kind: "loading" });
      announce(COPY.programs.accessLoading);
      try {
        const { departments } = await listDepartments();
        if (!mounted.current || request?.cancelled) {
          return;
        }
        const departmentAccess = projectManagementAccess(departments, []);
        if (departmentAccess.hasManagementCapability) {
          setAccess({ kind: "ready", projection: departmentAccess });
          announce(COPY.programs.managementScopeReady);
          return;
        }

        const programResponses = await Promise.all(
          departments.map(({ department_id }) => listPrograms(department_id))
        );
        if (!mounted.current || request?.cancelled) {
          return;
        }
        const projection = projectManagementAccess(
          departments,
          programResponses.map(({ programs }) => programs)
        );
        setAccess({ kind: "ready", projection });
        if (projection.hasManagementCapability) {
          announce(COPY.programs.managementScopeReady);
        }
      } catch (error) {
        if (!mounted.current || request?.cancelled) {
          return;
        }
        if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
          rememberDeepLink(
            typeof window === "undefined"
              ? pathname
              : `${pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        setAccess({
          kind: "error",
          failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
          message,
        });
        announce(message);
      }
    },
    [pathname, router]
  );

  useEffect(() => {
    if (!locationReady || intent.malformed) {
      return;
    }
    const request = { cancelled: false };
    void loadAccess(request);
    return () => {
      request.cancelled = true;
    };
  }, [intent.malformed, loadAccess, locationReady]);

  useEffect(() => {
    if (!retryFocusPending.current || access.kind !== "loading") {
      return;
    }
    const panel = document.getElementById("programs-access-state");
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [access.kind]);
  const retryAccess = () => {
    retryFocusPending.current = true;
    void loadAccess();
  };
  const managementModeReady =
    access.kind === "ready" && access.projection.hasManagementCapability;
  const showModeTabs = intent.mode === "participant" || managementModeReady;

  const navigateMode = (
    mode: "participant" | "management",
    replace = false
  ) => {
    const href = buildProgramsHref({
      mode,
      programId: intent.programId,
      hash: intent.hash,
    });
    focusMode.current = mode;
    if (typeof window === "undefined") {
      if (replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    } else if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    announce(
      mode === "management"
        ? COPY.programs.managementMode
        : COPY.programs.participantMode
    );
  };
  useEffect(() => {
    const requestedMode = focusMode.current;
    const mode =
      requestedMode === intent.mode
        ? requestedMode
        : previousMode.current !== null && previousMode.current !== intent.mode
          ? intent.mode
          : null;
    previousMode.current = intent.mode;
    if (!locationReady || mode === null) {
      return;
    }
    const tab = document.getElementById(
      mode === "management"
        ? "programs-management-tab"
        : "programs-participant-tab"
    );
    if (!tab) {
      return;
    }
    tab.focus();
    focusMode.current = null;
  }, [intent.malformed, intent.mode, locationReady, showModeTabs]);

  if (intent.malformed) {
    return (
      <BoundaryFrame intent={intent} onModeChange={navigateMode} showModeTabs={false}>
        <StatePanel
          kind="error"
          title={COPY.programs.malformedIntent}
          message={COPY.programs.malformedIntentHint}
          actionLabel={COPY.programs.backToEntry}
          onAction={() => navigateMode("participant", true)}
        />
      </BoundaryFrame>
    );
  }

  return (
    <BoundaryFrame
      intent={intent}
      onModeChange={navigateMode}
      showModeTabs={showModeTabs}
    >
      {access.kind === "loading" && (
        <StatePanel
          id="programs-access-state"
          kind="loading"
          message={COPY.programs.accessLoading}
        />
      )}
      {access.kind === "error" &&
        access.failure === "forbidden" &&
        intent.mode === "participant" && (
          <StatePanel
            kind="error"
            title={COPY.error.forbidden}
            message={COPY.nav.unauthorized}
            actionLabel={COPY.programs.retryAccess}
            onAction={retryAccess}
          />
        )}
      {access.kind === "error" &&
        (intent.mode === "management" || access.failure === "recoverable") && (
          <StatePanel
            kind="error"
            title={
              access.failure === "forbidden"
                ? COPY.programs.managementForbidden
                : COPY.error.unavailable
            }
            message={
              access.failure === "forbidden"
                ? COPY.programs.managementForbiddenHint
                : access.message
            }
            actionLabel={
              access.failure === "forbidden"
                ? COPY.programs.enterParticipant
                : COPY.programs.retryAccess
            }
            onAction={
              access.failure === "forbidden"
                ? () => navigateMode("participant", true)
                : retryAccess
            }
          />
        )}
      {access.kind === "ready" && intent.mode === "management" && (
        <ManagementPanel
          projection={access.projection}
          onParticipant={() => navigateMode("participant")}
          onRecoverParticipant={() => navigateMode("participant", true)}
        />
      )}
      {access.kind === "ready" && intent.mode === "participant" && (
        <ParticipantPanel
          programId={intent.programId}
          canManage={access.projection.hasManagementCapability}
          onManagement={() => navigateMode("management")}
        />
      )}
    </BoundaryFrame>
  );
}

function BoundaryFrame({
  children,
  intent,
  onModeChange,
  showModeTabs,
}: {
  children: React.ReactNode;
  intent: ProgramsIntent;
  onModeChange: (mode: "participant" | "management") => void;
  showModeTabs: boolean;
}) {
  return (
    <section className={styles.boundary} aria-labelledby="programs-title">
      <header className={styles.boundaryHeader}>
        <h1 id="programs-title" className={styles.cardTitle}>
          {COPY.programs.pageTitle}
        </h1>
        <p className={styles.cardLead}>{COPY.programs.entryLead}</p>
        {showModeTabs && (
          <div
            className={`${styles.modeSwitch} ${
              intent.mode === "participant" ? styles.modeSwitchSingle : ""
            }`}
            role="tablist"
            aria-label={COPY.programs.modeLabel}
          >
            <button
              id="programs-participant-tab"
              className={styles.modeButton}
              type="button"
              role="tab"
              aria-selected={intent.mode === "participant"}
              aria-controls="programs-mode-panel"
              onClick={() => onModeChange("participant")}
            >
              {COPY.programs.participantMode}
            </button>
            {intent.mode === "management" && (
              <button
                id="programs-management-tab"
                className={styles.modeButton}
                type="button"
                role="tab"
                aria-selected
                aria-controls="programs-mode-panel"
              >
                {COPY.programs.managementMode}
              </button>
            )}
          </div>
        )}
      </header>
      <div
        id="programs-mode-panel"
        className={styles.boundaryPanel}
        role={showModeTabs ? "tabpanel" : "region"}
        aria-labelledby={
          showModeTabs
            ? intent.mode === "management"
              ? "programs-management-tab"
              : "programs-participant-tab"
            : "programs-title"
        }
      >
        {children}
      </div>
    </section>
  );
}

function ParticipantPanel({
  programId,
  canManage,
  onManagement,
}: {
  programId: string | null;
  canManage: boolean;
  onManagement: () => void;
}) {
  return (
    <>
      <h2 className={styles.boundaryTitle}>{COPY.programs.participantMode}</h2>
      <p className={styles.boundaryLead}>{COPY.programs.participantLead}</p>
      {programId !== null && (
        <div className={styles.intentNotice} role="status">
          <strong>{COPY.programs.directProgramIntent}</strong>
          <span>{COPY.programs.directProgramIntentHint}</span>
        </div>
      )}
      {canManage && (
        <div className={styles.managementEntry}>
          <div>
            <h3>{COPY.programs.managementMode}</h3>
            <p>{COPY.programs.managementLead}</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={onManagement}
          >
            {COPY.programs.enterManagement}
          </button>
        </div>
      )}
    </>
  );
}

function ManagementPanel({
  projection,
  onParticipant,
  onRecoverParticipant,
}: {
  projection: ProgramsManagementAccess;
  onParticipant: () => void;
  onRecoverParticipant: () => void;
}) {
  if (!projection.hasManagementCapability) {
    return (
      <StatePanel
        kind="error"
        title={COPY.programs.noManagementScope}
        message={COPY.programs.noManagementScopeHint}
        actionLabel={COPY.programs.enterParticipant}
        onAction={onRecoverParticipant}
      />
    );
  }

  return (
    <>
      <h2 className={styles.boundaryTitle}>{COPY.programs.managementMode}</h2>
      <p className={styles.boundaryLead}>{COPY.programs.managementLead}</p>
      <p className={styles.boundaryStatus} role="status">
        {COPY.programs.managementScopeReady}
      </p>
      <p className={styles.boundaryHint}>
        {COPY.programs.managementBoundaryHint}
      </p>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={onParticipant}
      >
        {COPY.programs.enterParticipant}
      </button>
    </>
  );
}

type StatePanelProps =
  | {
      id?: string;
      kind: "loading";
      title?: never;
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    }
  | {
      id?: string;
      kind: "error";
      title: string;
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    };

function StatePanel({
  id,
  kind,
  title,
  message,
  actionLabel,
  onAction,
}: StatePanelProps) {
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={kind === "error" ? styles.boundaryError : styles.boundaryState}
      aria-busy={kind === "loading" ? "true" : undefined}
      role={kind === "error" ? "alert" : "status"}
    >
      {title && <h2 className={styles.boundaryTitle}>{title}</h2>}
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className={styles.retry} type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
