"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type {
  ProgramsIntent,
  ProgramsOrigin,
  ProgramsTask,
} from "./programs-intent";
import { ProgramsNotifications } from "./programs-notifications";
import type { ManagementNotificationState } from "./programs-notifications";
import { useAsyncResource } from "./use-async-resource";

import styles from "@/app/programs/programs.module.css";

type AccessState =
  | { kind: "loading" }
  | { kind: "ready"; projection: ProgramsManagementAccess }
  | { kind: "error"; failure: "forbidden" | "recoverable"; message: string };

/** Push (or replace) a Programs boundary href through both the router (SSR)
 * and direct History API (client), then sync the boundary's own `search`
 * state -- every navigate/open callback below shares this one path instead
 * of repeating the router-vs-history branch. */
interface ProgramsHistoryState {
  efccSection: "programs";
  efccParent?: "program-detail";
}

function applyProgramsNavigation(
  router: AppRouterInstance,
  setSearch: (value: string) => void,
  href: string,
  replace = false,
  historyState?: ProgramsHistoryState
): void {
  if (
    !replace &&
    typeof window !== "undefined" &&
    href === `${window.location.pathname}${window.location.search}`
  ) {
    // Rapid double-click/duplicate-call to the exact current URL --
    // skip the push so it does not leave a duplicate history entry.
    return;
  }
  const nextHistoryState = historyState ?? { efccSection: "programs" };
  if (typeof window === "undefined") {
    if (replace) {
      router.replace(href);
    } else {
      router.push(href);
    }
  } else if (replace) {
    window.history.replaceState(nextHistoryState, "", href);
  } else {
    window.history.pushState(nextHistoryState, "", href);
  }
  setSearch(href.slice("/programs".length));
}

function participantOriginHref(origin: ProgramsOrigin | undefined): string {
  switch (origin) {
    case "home": {
      return "/home";
    }
    case "notices": {
      return "/notices";
    }
    case "messages": {
      return "/messages";
    }
    default: {
      return "/programs";
    }
  }
}

const TASK_LABEL_BY_TASK: Record<ProgramsTask, string> = {
  events: COPY.programs.workspaceTaskEvents,
  participants: COPY.programs.workspaceTaskParticipants,
  settings: COPY.programs.workspaceTaskSettings,
  notifications: COPY.programs.workspaceTaskNotifications,
};

/** Which nav-dock tab (if any) should take focus after a mode transition,
 * given the just-requested mode, the mode the URL now resolves to, the
 * previously-focused mode, and whether tabs are even showing. Extracted
 * from ProgramsBoundary's focus effect to keep that function's own
 * complexity down. */
function resolveFocusMode(
  requestedMode: ProgramsIntent["mode"] | null,
  currentMode: ProgramsIntent["mode"],
  previousMode: ProgramsIntent["mode"] | null,
  showModeTabs: boolean
): ProgramsIntent["mode"] | null {
  if (requestedMode === currentMode) {
    return requestedMode;
  }
  if (previousMode !== null && previousMode !== currentMode) {
    return currentMode;
  }
  if (currentMode === "management" && showModeTabs) {
    return "management";
  }
  return null;
}

/** Acknowledge a batch of management notifications. Module-level: it only
 * touches imports, never component state, so it doesn't need to live
 * inside ManagementPanel (and shouldn't be recreated on every render). */
async function markNotificationsRead(
  items: readonly Pick<
    ManagementNotificationItem,
    "source_key" | "source_revision"
  >[]
): Promise<void> {
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

const StatePanel = ({
  id,
  kind,
  title,
  message,
  actionLabel,
  onAction,
}: StatePanelProps) => {
  const content = (
    <>
      {title && <h2 className={styles.boundaryTitle}>{title}</h2>}
      <p>{message}</p>
      {actionLabel && onAction && (
        <Button className={styles.retry} type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </>
  );
  if (kind === "loading") {
    return (
      <output
        id={id}
        tabIndex={id ? -1 : undefined}
        className={styles.boundaryState}
        aria-busy="true"
      >
        <Skeleton className="mb-3 h-4 w-2/3" aria-hidden="true" />
        {content}
      </output>
    );
  }
  return (
    <Alert
      id={id}
      tabIndex={id ? -1 : undefined}
      className={styles.boundaryError}
      variant="destructive"
    >
      {content}
    </Alert>
  );
};

const BoundaryFrame = ({
  children,
  intent,
  onModeChange,
  showModeTabs,
}: {
  children: React.ReactNode;
  intent: ProgramsIntent;
  onModeChange: (mode: "participant" | "management") => void;
  showModeTabs: boolean;
}) => {
  // A selected participant program/event renders its own heading and back
  // action (ParticipantProgramDetail / ParticipantEventDetailPage). Showing
  // the catalog's own <h1>課程</h1> + lead above it wastes ~110px and
  // demotes the real title to <h2> — impeccable critique #391 (T4A/T5A/T7A).
  const showCatalogHeader = !(
    intent.mode === "participant" && intent.programId
  );

  if (!showCatalogHeader) {
    return (
      <section className={styles.boundary}>
        <div id="programs-mode-panel" className={styles.boundaryPanel}>
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.boundary} aria-labelledby="programs-title">
      <header className={styles.boundaryHeader}>
        <h1 id="programs-title" className={styles.cardTitle}>
          {COPY.programs.pageTitle}
        </h1>
        <p className={styles.cardLead}>{COPY.programs.entryLead}</p>
        {showModeTabs && (
          <Tabs
            value={intent.mode}
            onValueChange={(value) =>
              onModeChange(value as "participant" | "management")
            }
          >
            <TabsList
              className={styles.modeSwitch}
              variant="line"
              aria-label={COPY.programs.modeLabel}
            >
              <TabsTrigger
                id="programs-participant-tab"
                className={styles.modeButton}
                value="participant"
                aria-controls="programs-mode-panel"
              >
                {COPY.programs.participantMode}
              </TabsTrigger>
              {intent.mode === "management" && (
                <TabsTrigger
                  id="programs-management-tab"
                  className={styles.modeButton}
                  value="management"
                  aria-controls="programs-mode-panel"
                >
                  {COPY.programs.managementMode}
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
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
};

const ManagementPanel = ({
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
  onOpenProgram: (programId: string, created?: boolean) => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
  onEventChange: (eventId: string | null) => void;
  onBackDirectory: () => void;
}) => {
  const router = useRouter();
  const [attentionRefreshKey, setAttentionRefreshKey] = useState(0);
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);
  const { state: attentionState, run: loadAttention } = useAsyncResource<
    ManagementAttention,
    ManagementAttentionState
  >(
    () => getManagementAttention(),
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
      <output className={styles.boundaryStatus}>
        {COPY.programs.managementScopeReady}
      </output>
      <p className={styles.boundaryHint}>
        {COPY.programs.managementBoundaryHint}
      </p>
      {intent.task === "notifications" && notificationSurface}
      <Button
        className={styles.secondaryButton}
        type="button"
        onClick={onParticipant}
      >
        {COPY.programs.enterParticipant}
      </Button>
      {intent.task === "notifications" ? null : intent.programId ? (
        <ProgramWorkspace
          key={intent.programId}
          programId={intent.programId}
          task={intent.task}
          eventId={intent.eventId ?? null}
          created={intent.created}
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
};

/** The BoundaryFrame body once access has resolved (or is loading/erroring)
 * -- extracted out of ProgramsBoundary purely to keep that function's own
 * branch count under the complexity budget; no logic changed. */
const ProgramsBoundaryBody = ({
  access,
  intent,
  retryAccess,
  onHome,
  navigateMode,
  openManagementProgram,
  navigateManagementTask,
  navigateManagementEvent,
  navigateParticipantEvent,
  navigateParticipantBack,
  openProgram,
}: {
  access: AccessState;
  intent: ProgramsIntent;
  retryAccess: () => void;
  onHome: () => void;
  navigateMode: (
    mode: "participant" | "management",
    replace?: boolean,
    programId?: string | null,
    hash?: string | null
  ) => void;
  openManagementProgram: (programId: string, created?: boolean) => void;
  navigateManagementTask: (
    task: ProgramsTask | null,
    eventId?: string | null
  ) => void;
  navigateManagementEvent: (eventId: string | null) => void;
  navigateParticipantEvent: (eventId: string | null) => void;
  navigateParticipantBack: () => void;
  openProgram: (programId: string) => void;
}) => (
  <>
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
          actionLabel={COPY.nav.backToHome}
          onAction={onHome}
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
          origin={intent.origin}
        />
      ) : intent.programId ? (
        <ParticipantProgramDetail
          programId={intent.programId}
          canManage={access.projection.hasManagementCapability}
          onManagement={() => navigateMode("management")}
          onBack={navigateParticipantBack}
          onOpenEvent={navigateParticipantEvent}
        />
      ) : (
        <ParticipantDirectory
          programId={null}
          canManage={access.projection.hasManagementCapability}
          onManagement={() => navigateMode("management")}
          onHome={onHome}
          onOpenProgram={openProgram}
        />
      ))}
  </>
);

export const ProgramsBoundary = () => {
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
    () => getManagementAccess(),
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

  // Programs is rendered inside the persistent shell outlet, whose inner
  // scroll position survives a client-side mode/detail transition. Reset the
  // outlet when the visible intent changes so the new heading and focused tab
  // are not mounted above the viewport. Keep the fallback assignment for
  // jsdom, where Element#scrollTo is not implemented.
  useEffect(() => {
    if (!locationReady) {
      return;
    }
    const shellContent = document.querySelector<HTMLElement>("#shell-content");
    if (!shellContent) {
      return;
    }
    shellContent.scrollTop = 0;
    shellContent.scrollLeft = 0;
    if (typeof shellContent.scrollTo === "function") {
      shellContent.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [
    intent.created,
    intent.eventId,
    intent.hash,
    intent.malformed,
    intent.mode,
    intent.origin,
    intent.programId,
    intent.task,
    locationReady,
  ]);

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
    applyProgramsNavigation(router, setSearch, href, replace);
    announce(
      mode === "management"
        ? COPY.programs.managementMode
        : COPY.programs.participantMode
    );
  };
  const navigateParticipantBack = () => {
    const href = participantOriginHref(intent.origin);
    if (href === "/programs") {
      navigateMode("participant", true, null);
      return;
    }
    router.replace(href);
  };
  const openManagementProgram = (programId: string, created?: boolean) => {
    const href = buildProgramsHref({
      mode: "management",
      programId,
      created,
      hash: intent.hash,
    });
    applyProgramsNavigation(router, setSearch, href);
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
      created: undefined,
      hash: intent.hash,
    });
    applyProgramsNavigation(router, setSearch, href);
    const taskLabel = task ? TASK_LABEL_BY_TASK[task] : null;
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
    applyProgramsNavigation(router, setSearch, href);
    announce(
      eventId === null ? COPY.programs.events : COPY.programs.eventDetailTitle
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
      origin: intent.origin ?? "programs",
    });
    applyProgramsNavigation(router, setSearch, href, false, {
      efccSection: "programs",
      efccParent: "program-detail",
    });
    announce(
      eventId === null
        ? COPY.programs.programSelected
        : COPY.programs.eventDetailTitle
    );
  };
  // PUI-02: row selection hands off through the canonical opaque Program
  // intent URL — the directory never renders the nested manager.
  const openProgram = (programId: string) => {
    const href = buildProgramsHref({
      mode: "participant",
      programId,
      hash: intent.hash,
      origin: "programs",
    });
    applyProgramsNavigation(router, setSearch, href);
    announce(COPY.programs.programSelected);
  };
  useEffect(() => {
    const mode = resolveFocusMode(
      focusMode.current,
      intent.mode,
      previousMode.current,
      showModeTabs
    );
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
    // The shell owns scrolling; allowing focus() to auto-scroll the inner
    // outlet can jump the newly rendered boundary back to a stale offset.
    tab.focus({ preventScroll: true });
    queueMicrotask(() => {
      if (document.contains(tab)) {
        tab.focus({ preventScroll: true });
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
      <ProgramsBoundaryBody
        access={access}
        intent={intent}
        retryAccess={retryAccess}
        onHome={() => router.replace("/home")}
        navigateMode={navigateMode}
        openManagementProgram={openManagementProgram}
        navigateManagementTask={navigateManagementTask}
        navigateManagementEvent={navigateManagementEvent}
        navigateParticipantEvent={navigateParticipantEvent}
        navigateParticipantBack={navigateParticipantBack}
        openProgram={openProgram}
      />
    </BoundaryFrame>
  );
};
