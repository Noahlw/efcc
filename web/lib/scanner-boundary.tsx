"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const secondaryControl = `${styles.buttonSecondary} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)]`;
const modeTabControl = `${styles.modeButton} min-h-11 h-auto rounded-[var(--radius-sm)] border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2.5 text-base font-bold text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink)] aria-selected:border-[var(--accent)] aria-selected:bg-[var(--surface)] aria-selected:text-[var(--accent-deep)]`;

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
  <Card
    className={styles.card}
    role="region"
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
      <Button
        variant="outline"
        className={secondaryControl}
        type="button"
        ref={actionRef}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    )}
  </Card>
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
        ? COPY.attendance.operatorMode
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
          <Button
            variant="outline"
            className={modeTabControl}
            id="scanner-self-tab"
            type="button"
            role="tab"
            aria-selected={intent.mode === "self"}
            aria-controls="scanner-mode-panel"
            data-scanner-mode="self"
            onClick={() => navigate("self")}
          >
            {COPY.attendance.selfMode}
          </Button>
          <Button
            variant="outline"
            className={modeTabControl}
            id="scanner-assisted-tab"
            type="button"
            role="tab"
            aria-selected={intent.mode === "assisted"}
            aria-controls="scanner-mode-panel"
            data-scanner-mode="assisted"
            onClick={() => navigate("assisted")}
          >
            {COPY.attendance.operatorMode}
          </Button>
        </div>
      )}
      {!assistedRequested && eventsState.kind === "error" && (
        <Alert
          variant="destructive"
          className={styles.status}
          data-tone="error"
        >
          <span>{eventsState.message}</span>
          <Button
            variant="outline"
            className={secondaryControl}
            type="button"
            ref={retryRef}
            onClick={retryEvents}
          >
            {COPY.attendance.assistedRetry}
          </Button>
        </Alert>
      )}
      {malformed && (
        <Alert
          variant="destructive"
          className={styles.status}
          data-tone="error"
        >
          {COPY.attendance.assistedContextStale}
          <Button
            variant="outline"
            className={secondaryControl}
            type="button"
            onClick={recoverToSelf}
          >
            {COPY.attendance.assistedBackToSelf}
          </Button>
        </Alert>
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
