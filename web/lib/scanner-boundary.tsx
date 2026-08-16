"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { RpcError } from "@/lib/api";
import { AssistedScannerPanel } from "@/lib/assisted-scanner-panel";
import type { AttendanceEventSummary } from "@/lib/attendance";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { listScannerEvents } from "@/lib/programs/program-api";
import { buildScannerHref, parseScannerIntent } from "@/lib/scanner-intent";
import type { ScannerMode } from "@/lib/scanner-intent";
import { SelfCheckInPanel } from "@/lib/self-check-in-panel";
import { clearAuthHint, rememberDeepLink } from "@/lib/session";

import styles from "./attendance-panel.module.css";

type EventState =
  | { kind: "loading" }
  | { kind: "ready"; events: AttendanceEventSummary[] }
  | { kind: "error"; message: string };
const ScannerState = ({
  message,
  actionLabel,
  actionRef,
  onAction,
  tone,
}: {
  message: string;
  actionLabel?: string;
  actionRef?: RefObject<HTMLButtonElement | null>;
  onAction?: () => void;
  tone: "info" | "error";
}) => (
  <section
    className={styles.card}
    aria-labelledby="scanner-state-title"
    tabIndex={-1}
  >
    <h1 id="scanner-state-title" className={styles.title}>
      {COPY.sections.scanner}
    </h1>
    <output className={styles.status} data-tone={tone} aria-live="polite">
      {message}
    </output>
    {actionLabel && onAction && (
      <button
        className={styles.buttonSecondary}
        type="button"
        ref={actionRef}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </section>
);
const AssistedAccessState = ({
  actionRef,
  state,
  available,
  onRetry,
  onRecover,
}: {
  actionRef?: RefObject<HTMLButtonElement | null>;
  state: EventState;
  available: boolean;
  onRetry: () => void;
  onRecover: () => void;
}) => {
  if (state.kind === "loading") {
    return (
      <ScannerState
        message={COPY.attendance.assistedAccessLoading}
        tone="info"
      />
    );
  }
  if (state.kind === "error") {
    return (
      <ScannerState
        message={state.message}
        actionLabel={COPY.attendance.assistedRetry}
        actionRef={actionRef}
        onAction={onRetry}
        tone="error"
      />
    );
  }
  if (!available) {
    return (
      <ScannerState
        message={COPY.attendance.assistedNoAccess}
        actionLabel={COPY.attendance.assistedBackToSelf}
        onAction={onRecover}
        tone="info"
      />
    );
  }
  return null;
};

export const ScannerBoundary = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [eventsState, setEventsState] = useState<EventState>({
    kind: "loading",
  });
  const [eventsReload, setEventsReload] = useState(0);
  const retryRef = useRef<HTMLButtonElement>(null);
  const focusModeRef = useRef<ScannerMode | null>(null);
  const intent = useMemo(() => parseScannerIntent(search), [search]);
  const events = eventsState.kind === "ready" ? eventsState.events : [];
  const assistedAvailable = eventsState.kind === "ready" && events.length > 0;

  const handleAuthRequired = useCallback(() => {
    clearAuthHint();
    rememberDeepLink(
      `${pathname}${window.location.search}${window.location.hash}`
    );
    sessionStorage.setItem("efcc_session_expired", "1");
    router.replace("/");
  }, [pathname, router]);

  useEffect(() => {
    const syncSearch = () => {
      const { search: currentSearch } = window.location;
      setSearch(currentSearch);
    };
    syncSearch();
    window.addEventListener("popstate", syncSearch);
    return () => window.removeEventListener("popstate", syncSearch);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      try {
        const { events: nextEvents } = await listScannerEvents();
        if (!cancelled) {
          setEventsState({ kind: "ready", events: nextEvents });
        }
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          handleAuthRequired();
          return;
        }
        const message =
          error instanceof RpcError
            ? errorCopyFor(error.problem.code, error.problem.detail)
            : COPY.attendance.assistedAccessError;
        setEventsState({ kind: "error", message });
      }
    };
    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [eventsReload, handleAuthRequired]);

  useEffect(() => {
    if (eventsState.kind === "error") {
      announce(eventsState.message);
      retryRef.current?.focus();
    }
  }, [eventsState]);

  useEffect(() => {
    if (focusModeRef.current !== intent.mode) {
      return;
    }
    const tab = document.querySelector<HTMLElement>(
      `[data-scanner-mode="${intent.mode}"]`
    );
    tab?.focus();
    focusModeRef.current = null;
  }, [intent.mode]);

  function navigate(mode: ScannerMode, eventId: string | null = null) {
    const href = buildScannerHref(mode, eventId);
    focusModeRef.current = mode;
    window.history.pushState(null, "", href);
    const { search: currentSearch } = window.location;
    setSearch(currentSearch);
    announce(
      mode === "assisted"
        ? COPY.attendance.assistedMode
        : COPY.attendance.selfMode
    );
  }

  function recoverToSelf() {
    const href = buildScannerHref("self");
    window.history.replaceState(null, "", href);
    const { search: currentSearch } = window.location;
    setSearch(currentSearch);
    announce(COPY.attendance.selfMode);
  }

  function retryEvents() {
    setEventsState({ kind: "loading" });
    setEventsReload((value) => value + 1);
  }

  const { malformed } = intent;
  const assistedRequested = intent.mode === "assisted" && !malformed;
  const requestedEventIsStale =
    assistedRequested &&
    intent.eventId !== null &&
    eventsState.kind === "ready" &&
    !events.some((event) => event.event_id === intent.eventId);
  const showModeTabs = assistedAvailable && !malformed;
  const accessStateVisible =
    assistedRequested && (eventsState.kind !== "ready" || !assistedAvailable);
  const accessState = (
    <AssistedAccessState
      actionRef={retryRef}
      state={eventsState}
      available={assistedAvailable}
      onRetry={retryEvents}
      onRecover={recoverToSelf}
    />
  );

  if (accessStateVisible) {
    return <div className={styles.page}>{accessState}</div>;
  }

  return (
    <>
      {showModeTabs && (
        <div
          className={styles.modeSwitch}
          role="tablist"
          aria-label={COPY.attendance.modeLabel}
        >
          <button
            id="scanner-self-tab"
            className={styles.modeButton}
            type="button"
            role="tab"
            aria-selected={intent.mode === "self"}
            aria-controls="scanner-mode-panel"
            data-scanner-mode="self"
            onClick={() => navigate("self")}
          >
            {COPY.attendance.selfMode}
          </button>
          <button
            id="scanner-assisted-tab"
            className={styles.modeButton}
            type="button"
            role="tab"
            aria-selected={intent.mode === "assisted"}
            aria-controls="scanner-mode-panel"
            data-scanner-mode="assisted"
            onClick={() => navigate("assisted")}
          >
            {COPY.attendance.assistedMode}
          </button>
        </div>
      )}
      {!assistedRequested && eventsState.kind === "error" && (
        <div className={styles.status} data-tone="error" role="alert">
          <span>{eventsState.message}</span>
          <button
            className={styles.buttonSecondary}
            type="button"
            ref={retryRef}
            onClick={retryEvents}
          >
            {COPY.attendance.assistedRetry}
          </button>
        </div>
      )}
      {malformed && (
        <div className={styles.status} data-tone="error" role="alert">
          {COPY.attendance.assistedContextStale}
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={recoverToSelf}
          >
            {COPY.attendance.assistedBackToSelf}
          </button>
        </div>
      )}
      <div
        id="scanner-mode-panel"
        role={showModeTabs ? "tabpanel" : undefined}
        aria-labelledby={
          showModeTabs
            ? intent.mode === "assisted"
              ? "scanner-assisted-tab"
              : "scanner-self-tab"
            : undefined
        }
      >
        {assistedRequested ? (
          <AssistedScannerPanel
            events={events}
            requestedEventId={intent.eventId}
            contextError={
              requestedEventIsStale
                ? COPY.attendance.assistedContextStale
                : null
            }
            onEventChange={(eventId) => navigate("assisted", eventId)}
            onAuthRequired={handleAuthRequired}
          />
        ) : (
          <SelfCheckInPanel title={COPY.attendance.scanTitle} />
        )}
      </div>
    </>
  );
};
