"use client";
/* oxlint-disable eslint/complexity eslint/require-await eslint/no-use-before-define unicorn/no-negated-condition unicorn/consistent-function-scoping jsx-a11y/prefer-tag-over-role -- preserve the existing boundary state machine while adding the participant visual projection. */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import {
  getManagementAccess,
  getManagementAttention,
  getManagementNotifications,
  markManagementNotificationsRead,
} from "@/lib/programs/program-api";
import type {
  ManagementAttention,
  ManagementNotificationItem,
  ManagementNotifications,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import { ManagementDirectory } from "./management-directory";
import { ParticipantDirectory } from "./participant-directory";
import { ParticipantEventDetailPage } from "./participant-event-detail-page";
import { ParticipantProgramDetail } from "./participant-program-detail";
import { ProgramWorkspace } from "./program-workspace";
import type { ProgramsManagementAccess } from "./programs-access";
import type { ManagementAttentionState } from "./programs-attention";
import { buildProgramsHref, parseProgramsIntent } from "./programs-intent";
import type { ProgramsIntent, ProgramsTask } from "./programs-intent";
import { ProgramsNotifications } from "./programs-notifications";
import type { ManagementNotificationState } from "./programs-notifications";
import { useAsyncResource } from "./use-async-resource";

import styles from "@/app/programs/programs.module.css";

type AccessState =
  | { kind: "loading" }
  | { kind: "ready"; projection: ProgramsManagementAccess }
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };

export function ProgramsBoundary() {
  const router = useRouter();
  const pathname = usePathname();
  const routeQuery = useSearchParams().toString();
  const routeHash = typeof window === "undefined" ? "" : window.location.hash;
  const routeKey = `${pathname}?${routeQuery}${routeHash}`;
  const [search, setSearch] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const previousMode = useRef<ProgramsIntent["mode"] | null>(null);
  const focusMode = useRef<ProgramsIntent["mode"] | null>(null);
  const retryFocusPending = useRef(false);
  const intent = useMemo(() => parseProgramsIntent(search), [search]);
  const { state: access, run: loadAccess } = useAsyncResource<
    ProgramsManagementAccess,
    AccessState
  >(
    async () => getManagementAccess(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (projection) => ({ kind: "ready", projection }),
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          rememberDeepLink(
            typeof window === "undefined"
              ? pathname
              : `${pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return null;
        }
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return {
          kind: "error",
          failure: code === "FORBIDDEN" ? "forbidden" : "recoverable",
          message,
        };
      },
      announceLoading: COPY.programs.accessLoading,
      announceReady: (projection) =>
        projection.hasManagementCapability
          ? COPY.programs.managementScopeReady
          : undefined,
    },
    [pathname]
  );
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

  useEffect(() => {
    if (!locationReady || intent.malformed) {
      return;
    }
    const request = { cancelled: false };
    void loadAccess(request);
    return () => {
      request.cancelled = true;
    };
  }, [intent.malformed, intent.mode, loadAccess, locationReady]);

  const managementModeReady =
    access.kind === "ready" && access.projection.hasManagementCapability;
  const boundaryStateVisible =
    intent.malformed ||
    access.kind !== "ready" ||
    (intent.mode === "management" && !managementModeReady);
  const showModeTabs = intent.mode === "management" && managementModeReady;

  useEffect(() => {
    if (!retryFocusPending.current && !boundaryStateVisible) {
      return;
    }
    const panel = document.querySelector<HTMLElement>("#programs-access-state");
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [access.kind, boundaryStateVisible]);
  const retryAccess = () => {
    retryFocusPending.current = true;
    void loadAccess();
  };
  const navigateMode = (
    mode: "participant" | "management",
    replace = false,
    programId = intent.programId,
    hash = intent.hash
  ) => {
    const href = buildProgramsHref({
      mode,
      programId,
      hash,
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
  const openManagementProgram = (programId: string) => {
    const href = buildProgramsHref({
      mode: "management",
      programId,
      hash: intent.hash,
    });
    if (typeof window === "undefined") {
      router.push(href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    announce(COPY.programs.programSelected);
  };
  const navigateManagementTask = (
    task: ProgramsTask | null,
    eventId?: string | null
  ) => {
    if (!intent.programId && task !== "notifications") {
      return;
    }
    const href = buildProgramsHref({
      mode: "management",
      programId: task === "notifications" ? null : intent.programId,
      task,
      eventId,
      hash: intent.hash,
    });
    if (typeof window === "undefined") {
      router.push(href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    const taskLabel =
      task === "events"
        ? COPY.programs.workspaceTaskEvents
        : task === "participants"
          ? COPY.programs.workspaceTaskParticipants
          : task === "settings"
            ? COPY.programs.workspaceTaskSettings
            : task === "notifications"
              ? COPY.programs.workspaceTaskNotifications
              : null;
    announce(
      taskLabel
        ? `${COPY.programs.workspaceTaskLabel}：${taskLabel}`
        : COPY.programs.workspaceTitle
    );
  };
  // EVT-01 (#251): Event deep links live under the management events task;
  // null returns to the list.
  const navigateManagementEvent = (eventId: string | null) => {
    if (!intent.programId) {
      return;
    }
    const href = buildProgramsHref({
      mode: "management",
      programId: intent.programId,
      task: "events",
      eventId,
      hash: intent.hash,
    });
    if (typeof window === "undefined") {
      router.push(href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    announce(
      eventId !== null ? COPY.programs.eventDetailTitle : COPY.programs.events
    );
  };
  // PUI-05 (#323): participant Event Detail deep links carry program + event
  // on the participant boundary; null returns to the Program detail.
  const navigateParticipantEvent = (eventId: string | null) => {
    if (!intent.programId) {
      return;
    }
    const href = buildProgramsHref({
      mode: "participant",
      programId: intent.programId,
      eventId,
      hash: intent.hash,
    });
    if (typeof window === "undefined") {
      router.push(href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    announce(
      eventId !== null
        ? COPY.programs.eventDetailTitle
        : COPY.programs.programSelected
    );
  };
  // PUI-02: row selection hands off through the canonical opaque Program
  // intent URL — the directory never renders the nested manager.
  const openProgram = (programId: string) => {
    const href = buildProgramsHref({
      mode: "participant",
      programId,
      hash: intent.hash,
    });
    if (typeof window === "undefined") {
      router.push(href);
    } else {
      window.history.pushState(null, "", href);
    }
    setSearch(href.slice("/programs".length));
    announce(COPY.programs.programSelected);
  };
  useEffect(() => {
    const requestedMode = focusMode.current;
    const mode =
      requestedMode === intent.mode
        ? requestedMode
        : previousMode.current !== null && previousMode.current !== intent.mode
          ? intent.mode
          : intent.mode === "management" && showModeTabs
            ? "management"
            : null;
    if (!locationReady || mode === null) {
      return;
    }
    const tab = document.querySelector<HTMLElement>(
      mode === "management"
        ? "#programs-management-tab"
        : "#programs-participant-tab"
    );
    if (!tab) {
      return;
    }
    previousMode.current = intent.mode;
    tab.focus();
    queueMicrotask(() => {
      if (document.contains(tab)) {
        tab.focus();
      }
    });
    focusMode.current = null;
  }, [intent.malformed, intent.mode, locationReady, showModeTabs]);

  if (intent.malformed) {
    return (
      <BoundaryFrame
        intent={intent}
        onModeChange={navigateMode}
        showModeTabs={false}
      >
        <StatePanel
          id="programs-access-state"
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
            id="programs-access-state"
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
            id="programs-access-state"
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
          intent={intent}
          onParticipant={() => navigateMode("participant")}
          onRecoverParticipant={() => navigateMode("participant", true)}
          onOpenProgram={openManagementProgram}
          onTaskChange={navigateManagementTask}
          onEventChange={navigateManagementEvent}
          onBackDirectory={() => navigateMode("management", true, null)}
        />
      )}
      {access.kind === "ready" &&
        intent.mode === "participant" &&
        (intent.programId && intent.eventId ? (
          <ParticipantEventDetailPage
            programId={intent.programId}
            eventId={intent.eventId}
          />
        ) : intent.programId ? (
          <ParticipantProgramDetail
            programId={intent.programId}
            canManage={access.projection.hasManagementCapability}
            onManagement={() => navigateMode("management")}
            onBack={() => navigateMode("participant", true, null)}
            onOpenEvent={navigateParticipantEvent}
          />
        ) : (
          <ParticipantDirectory
            programId={null}
            canManage={access.projection.hasManagementCapability}
            onManagement={() => navigateMode("management")}
            onOpenProgram={openProgram}
          />
        ))}
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
  const participantDetail =
    intent.mode === "participant" &&
    !intent.malformed &&
    intent.programId !== null;
  const detailTitle = intent.eventId
    ? COPY.programs.eventDetailTitle
    : COPY.programs.programDetailTitle;
  const panelLabelledBy = showModeTabs
    ? intent.mode === "management"
      ? "programs-management-tab"
      : "programs-participant-tab"
    : intent.mode === "management"
      ? "programs-title"
      : undefined;
  return (
    <section
      className={`${styles.boundary} ${
        intent.mode === "participant" ? styles.participantBoundary : ""
      }`}
      aria-labelledby={
        intent.mode === "management" ? "programs-title" : undefined
      }
    >
      {intent.mode === "management" && (
        <header className={styles.boundaryHeader}>
          <h1 id="programs-title" className={styles.cardTitle}>
            {COPY.programs.pageTitle}
          </h1>
          <p className={styles.cardLead}>{COPY.programs.entryLead}</p>
          {showModeTabs && (
            <div
              className={styles.modeSwitch}
              role="tablist"
              aria-label={COPY.programs.modeLabel}
            >
              <button
                id="programs-participant-tab"
                className={styles.modeButton}
                type="button"
                role="tab"
                aria-selected={false}
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
      )}
      <div
        id="programs-mode-panel"
        className={styles.boundaryPanel}
        role={showModeTabs ? "tabpanel" : "region"}
        aria-labelledby={panelLabelledBy}
        aria-label={
          participantDetail
            ? detailTitle
            : intent.mode === "participant"
              ? COPY.programs.catalogTitle
              : undefined
        }
      >
        {children}
      </div>
    </section>
  );
}
function ManagementPanel({
  projection,
  intent,
  onParticipant,
  onRecoverParticipant,
  onOpenProgram,
  onTaskChange,
  onEventChange,
  onBackDirectory,
}: {
  projection: ProgramsManagementAccess;
  intent: ProgramsIntent;
  onParticipant: () => void;
  onRecoverParticipant: () => void;
  onOpenProgram: (programId: string) => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
  onEventChange: (eventId: string | null) => void;
  onBackDirectory: () => void;
}) {
  const router = useRouter();
  const [attentionRefreshKey, setAttentionRefreshKey] = useState(0);
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);
  const { state: attentionState, run: loadAttention } = useAsyncResource<
    ManagementAttention,
    ManagementAttentionState
  >(
    async () => getManagementAttention(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (attention) => ({ kind: "ready", attention }),
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
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return { kind: "error", message };
      },
      // router is read through optionsRef; including its unstable identity in
      // deps would restart the attention request on every shell render.
      announceLoading: COPY.programs.attentionLoading,
      announceReady: (data) =>
        data.items.length === 0 ? COPY.programs.attentionZero : undefined,
    },
    [
      attentionRefreshKey,
      intent.mode,
      intent.programId,
      intent.task,
      intent.eventId,
    ]
  );
  useEffect(() => {
    if (!intent.programId || intent.task === "notifications") {
      return;
    }
    void loadAttention();
  }, [intent.programId, intent.task, loadAttention]);
  const attention =
    attentionState.kind === "ready" ? attentionState.attention : null;
  // Bumps both resources: the workspace's own /attention counts AND the
  // global bell's /notifications feed share no cache, so a caller that only
  // refreshed attention left the bell showing a stale pre-mutation badge
  // until the next mount/bell-open (#256 NTF-01 AC4 "without a manual
  // reload").
  const refreshAttention = () => {
    setAttentionRefreshKey((current) => current + 1);
    setNotificationRefreshKey((current) => current + 1);
  };
  const {
    state: notificationState,
    run: loadNotifications,
    retry: retryNotifications,
  } = useAsyncResource<ManagementNotifications, ManagementNotificationState>(
    () => getManagementNotifications(),
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (notifications) => ({ kind: "ready", notifications }),
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
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        announce(message);
        return { kind: "error", message };
      },
      announceLoading: COPY.programs.notificationsLoading,
    },
    [
      notificationRefreshKey,
      intent.mode,
      intent.programId,
      intent.task,
      intent.eventId,
    ]
  );
  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);
  const markNotificationsRead = async (
    items: readonly Pick<
      ManagementNotificationItem,
      "source_key" | "source_revision"
    >[]
  ) => {
    if (items.length === 0) {
      return;
    }
    try {
      await markManagementNotificationsRead(items);
    } catch (error: unknown) {
      const code = error instanceof RpcError ? error.problem.code : undefined;
      announce(
        error instanceof RpcError
          ? errorCopyFor(code, error.problem.detail)
          : COPY.error.networkError
      );
    }
  };
  const refreshNotifications = () =>
    setNotificationRefreshKey((current) => current + 1);
  const notificationSurface = (
    <ProgramsNotifications
      state={notificationState}
      onRetry={retryNotifications}
      onOpen={refreshNotifications}
      onMarkRead={markNotificationsRead}
      onViewAll={() => {
        onTaskChange("notifications");
      }}
      full={intent.task === "notifications"}
    />
  );

  if (!projection.hasManagementCapability) {
    return (
      <StatePanel
        id="programs-access-state"
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
      <div className={styles.managementHeaderRow}>
        <div>
          <h2 className={styles.boundaryTitle}>
            {COPY.programs.managementMode}
          </h2>
          <p className={styles.boundaryLead}>{COPY.programs.managementLead}</p>
        </div>
        {intent.task !== "notifications" && notificationSurface}
      </div>
      <p className={styles.boundaryStatus} role="status">
        {COPY.programs.managementScopeReady}
      </p>
      <p className={styles.boundaryHint}>
        {COPY.programs.managementBoundaryHint}
      </p>
      {intent.task === "notifications" && notificationSurface}
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={onParticipant}
      >
        {COPY.programs.enterParticipant}
      </button>
      {intent.task === "notifications" ? null : intent.programId ? (
        <ProgramWorkspace
          key={intent.programId}
          programId={intent.programId}
          task={intent.task}
          eventId={intent.eventId ?? null}
          attention={attention}
          onAttentionRefresh={refreshAttention}
          onBack={onBackDirectory}
          onTaskChange={onTaskChange}
          onEventChange={onEventChange}
        />
      ) : (
        <ManagementDirectory onOpenProgram={onOpenProgram} />
      )}
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
