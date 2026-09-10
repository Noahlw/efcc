"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { ScreenHeader, ScreenState } from "@/lib/screen-foundations";
import { rememberDeepLink } from "@/lib/session";

import { ManagementDirectory } from "./management-directory";
import {
  ParticipantDirectory,
  clearParticipantProgramFocus,
  rememberParticipantProgramFocus,
} from "./participant-directory";
import { ParticipantEventDetailPage } from "./participant-event-detail-page";
import { ParticipantProgramDetail } from "./participant-program-detail";
import { ProgramWorkspace } from "./program-workspace";
import type { ProgramsManagementAccess } from "./programs-access";
import { buildProgramsHref, parseProgramsIntent } from "./programs-intent";
import type {
  ProgramsIntent,
  ProgramsOrigin,
  ProgramsTask,
} from "./programs-intent";
import { ProgramsNotifications } from "./programs-notifications";
import type { ManagementNotificationState } from "./programs-notifications";
import { useAsyncResource } from "./use-async-resource";
import { WorkspaceRouteProvider } from "./workspace-context";

type ManagementAttentionState =
  | { kind: "loading" }
  | { kind: "ready"; attention: ManagementAttention }
  | { kind: "error"; message: string };

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
    href ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`
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
function participantOriginHref(
  origin: ProgramsOrigin | undefined,
  hash: string | null | undefined
): string {
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
      return `/programs${hash ?? ""}`;
    }
  }
}
const TASK_LABEL_BY_TASK: Record<ProgramsTask, string> = {
  events: COPY.programs.workspaceTaskEvents,
  participants: COPY.programs.workspaceTaskParticipants,
  schedule: COPY.programs.workspaceTaskSchedule,
  settings: COPY.programs.workspaceTaskSettings,
  notifications: COPY.programs.workspaceTaskNotifications,
};

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
    throw error;
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
  if (kind === "loading") {
    return (
      <ScreenState
        id={id}
        tabIndex={id ? -1 : undefined}
        kind="loading"
        title={<span className="wrap-anywhere">{message}</span>}
        description={
          <div className="grid gap-2 py-2" aria-hidden="true">
            <span className="h-4 w-2/3 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
            <span className="h-16 w-full rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
          </div>
        }
      />
    );
  }
  return (
    <ScreenState
      id={id}
      tabIndex={id ? -1 : undefined}
      kind="error"
      title={
        <h2 className="m-0 wrap-anywhere text-[length:var(--screen-child-title-size)] font-extrabold leading-[var(--screen-child-title-leading)]">
          {title}
        </h2>
      }
      description={<p className="m-0 wrap-anywhere leading-[1.6]">{message}</p>}
      action={
        actionLabel && onAction ? (
          <Button
            variant="outline"
            className="h-auto min-h-11 w-fit whitespace-normal border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-base font-bold text-[var(--screen-danger)] hover:bg-[var(--screen-danger-surface)] hover:text-[var(--screen-danger)]"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : undefined
      }
    />
  );
};

const BoundaryFrame = ({
  children,
  showFallbackHeader,
}: {
  children: React.ReactNode;
  showFallbackHeader: boolean;
}) => (
  <div
    id="programs-mode-panel"
    className="min-h-0 w-full min-w-0"
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- preserve the Programs region contract
    role="region"
    aria-label={showFallbackHeader ? undefined : COPY.programs.pageTitle}
    aria-labelledby={showFallbackHeader ? "programs-title" : undefined}
  >
    <div hidden={!showFallbackHeader} aria-hidden={!showFallbackHeader}>
      <ScreenHeader
        headingId="programs-title"
        title={COPY.programs.pageTitle}
        lead={showFallbackHeader ? COPY.programs.entryLead : undefined}
      />
    </div>
    {children}
  </div>
);

const ManagementPanel = ({
  projection,
  intent,
  onRecoverParticipant,
  onOpenProgram,
  onTaskChange,
  onEventChange,
  onBackDirectory,
  directoryQuery,
  onDirectoryQueryChange,
  directoryFocusProgramId,
}: {
  projection: ProgramsManagementAccess;
  intent: ProgramsIntent;
  onRecoverParticipant: () => void;
  onOpenProgram: (programId: string, created?: boolean) => void;
  onTaskChange: (task: ProgramsTask | null, eventId?: string | null) => void;
  onEventChange: (eventId: string | null) => void;
  onBackDirectory: () => void;
  directoryQuery: string;
  onDirectoryQueryChange: (query: string) => void;
  directoryFocusProgramId: string | null;
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
      departmentId={intent.departmentId}
      hash={intent.hash}
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
      {intent.task === "notifications" ? null : (
        <div className="mb-5 flex min-w-0 justify-end">
          {notificationSurface}
        </div>
      )}
      {intent.task === "notifications" ? notificationSurface : null}
      {intent.task === "notifications" ? null : intent.programId ? (
        <WorkspaceRouteProvider
          value={{
            departmentId: intent.departmentId ?? null,
            hash: intent.hash,
          }}
        >
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
        </WorkspaceRouteProvider>
      ) : (
        <ManagementDirectory
          departmentId={intent.departmentId}
          hash={intent.hash}
          query={directoryQuery}
          onQueryChange={onDirectoryQueryChange}
          focusProgramId={directoryFocusProgramId}
          onOpenProgram={onOpenProgram}
        />
      )}
    </>
  );
};

/** The BoundaryFrame body once access has resolved (or is loading/erroring)
 * -- extracted out of ProgramsBoundary purely to keep that function's own
 * branch count under the complexity budget; no logic changed. */
/* oxlint-disable-next-line eslint/complexity -- the boundary is the single route-intent state machine for all participant and management branches. */
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
  navigateParticipantEventBack,
  directoryQuery,
  onDirectoryQueryChange,
  directoryFocusProgramId,
  participantFocusProgramId,
  onParticipantProgramOpen,
  onParticipantProgramFocus,
}: {
  access: AccessState;
  intent: ProgramsIntent;
  retryAccess: () => void;
  onHome: () => void;
  navigateMode: (
    mode: "participant" | "management",
    replace?: boolean,
    programId?: string | null,
    hash?: string | null,
    departmentId?: string | null
  ) => void;
  openManagementProgram: (programId: string, created?: boolean) => void;
  navigateManagementTask: (
    task: ProgramsTask | null,
    eventId?: string | null
  ) => void;
  navigateManagementEvent: (eventId: string | null) => void;
  navigateParticipantEvent: (eventId: string | null) => void;
  navigateParticipantBack: () => void;
  navigateParticipantEventBack: () => void;
  directoryQuery: string;
  onDirectoryQueryChange: (query: string) => void;
  directoryFocusProgramId: string | null;
  participantFocusProgramId: string | null;
  onParticipantProgramOpen: (programId: string) => void;
  onParticipantProgramFocus: () => void;
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
        directoryQuery={directoryQuery}
        onDirectoryQueryChange={onDirectoryQueryChange}
        directoryFocusProgramId={directoryFocusProgramId}
        intent={intent}
        onRecoverParticipant={() => navigateMode("participant", true)}
        onOpenProgram={openManagementProgram}
        onTaskChange={navigateManagementTask}
        onEventChange={navigateManagementEvent}
        onBackDirectory={() =>
          navigateMode(
            "management",
            true,
            null,
            intent.hash,
            intent.departmentId
          )
        }
      />
    )}
    {access.kind === "ready" &&
      intent.mode === "participant" &&
      (intent.programId && intent.eventId ? (
        <ParticipantEventDetailPage
          programId={intent.programId}
          eventId={intent.eventId}
          origin={intent.origin}
          hash={intent.hash}
          onBack={navigateParticipantEventBack}
        />
      ) : intent.programId ? (
        <ParticipantProgramDetail
          programId={intent.programId}
          backHref={participantOriginHref(intent.origin, intent.hash)}
          onBack={navigateParticipantBack}
          eventHref={(eventId) =>
            buildProgramsHref({
              mode: "participant",
              programId: intent.programId,
              eventId,
              hash: intent.hash,
              origin: intent.origin ?? "programs",
            })
          }
          managementHref={buildProgramsHref({
            mode: "management",
            programId: intent.programId ?? null,
            departmentId: intent.departmentId,
            hash: intent.hash,
          })}
          canManage={access.projection.hasManagementCapability}
          onOpenEvent={navigateParticipantEvent}
        />
      ) : (
        <ParticipantDirectory
          programId={null}
          canManage={access.projection.hasManagementCapability}
          managementHref={buildProgramsHref({
            mode: "management",
            programId: intent.programId ?? null,
            departmentId: intent.departmentId,
            hash: intent.hash,
          })}
          programHref={(programId) =>
            buildProgramsHref({
              mode: "participant",
              programId,
              hash: intent.hash,
              origin: "programs",
            })
          }
          onOpenProgram={onParticipantProgramOpen}
          focusProgramId={participantFocusProgramId}
          onFocusProgram={onParticipantProgramFocus}
          homeHref="/home"
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
  const [managementDirectoryQuery, setManagementDirectoryQuery] = useState("");
  const [directoryFocusProgramId, setDirectoryFocusProgramId] = useState<
    string | null
  >(null);
  const participantFocusProgramId = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/programs"
      ) {
        clearParticipantProgramFocus();
      }
    },
    []
  );
  const updateManagementDirectoryQuery = (query: string) => {
    setManagementDirectoryQuery(query);
    setDirectoryFocusProgramId(null);
  };
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

  const managementModeReady =
    access.kind === "ready" && access.projection.hasManagementCapability;
  const boundaryStateVisible =
    intent.malformed ||
    access.kind !== "ready" ||
    (intent.mode === "management" && !managementModeReady);
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
    hash = intent.hash,
    departmentId: string | null | undefined = intent.departmentId
  ) => {
    const href = buildProgramsHref({
      mode,
      programId,
      departmentId: mode === "management" ? departmentId : undefined,
      hash,
    });
    applyProgramsNavigation(router, setSearch, href, replace);
    announce(
      mode === "management"
        ? COPY.programs.managementMode
        : COPY.programs.participantMode
    );
  };
  const openManagementProgram = (programId: string, created?: boolean) => {
    setDirectoryFocusProgramId(programId);
    const href = buildProgramsHref({
      mode: "management",
      programId,
      departmentId: intent.departmentId,
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
      departmentId: intent.departmentId,
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
      departmentId: intent.departmentId,
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
  const navigateParticipantBack = () => {
    const href = participantOriginHref(intent.origin, intent.hash);
    if (intent.origin === undefined || intent.origin === "programs") {
      if (intent.programId) {
        rememberParticipantProgramFocus(intent.programId);
      }
      applyProgramsNavigation(router, setSearch, href, true, {
        efccSection: "programs",
      });
      return;
    }
    router.replace(href);
  };
  const navigateParticipantEventBack = () => {
    if (!intent.programId) {
      return;
    }
    if (intent.origin === undefined || intent.origin === "programs") {
      applyProgramsNavigation(
        router,
        setSearch,
        buildProgramsHref({
          mode: "participant",
          programId: intent.programId,
          origin: intent.origin ?? "programs",
          hash: intent.hash,
        }),
        true,
        { efccSection: "programs" }
      );
      return;
    }
    router.replace(participantOriginHref(intent.origin, intent.hash));
  };
  if (intent.malformed) {
    return (
      <BoundaryFrame showFallbackHeader>
        <StatePanel
          id="programs-access-state"
          kind="error"
          title={COPY.programs.malformedIntent}
          message={COPY.programs.malformedIntentHint}
          actionLabel={COPY.programs.backToEntry}
          onAction={() => navigateMode("participant", true, null)}
        />
      </BoundaryFrame>
    );
  }

  return (
    <BoundaryFrame
      showFallbackHeader={
        intent.malformed ||
        access.kind !== "ready" ||
        (intent.mode === "management" &&
          !access.projection.hasManagementCapability)
      }
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
        navigateParticipantEventBack={navigateParticipantEventBack}
        directoryQuery={managementDirectoryQuery}
        onDirectoryQueryChange={updateManagementDirectoryQuery}
        directoryFocusProgramId={directoryFocusProgramId}
        participantFocusProgramId={participantFocusProgramId.current}
        onParticipantProgramOpen={(programId) => {
          participantFocusProgramId.current = programId;
        }}
        onParticipantProgramFocus={() => {
          participantFocusProgramId.current = null;
        }}
      />
    </BoundaryFrame>
  );
};
