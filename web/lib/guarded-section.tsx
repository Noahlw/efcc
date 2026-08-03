"use client";

import { useCallback, useEffect, useState, useRef } from "react";

import { authorizedNavigate, RpcError } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { createNavigationController } from "@/lib/navigation-controller";
import { RecoveryView } from "@/lib/recovery-view";
import { getSection, recoverySection } from "@/lib/sections";
import { clearSession } from "@/lib/session";

type GuardState =
  | { kind: "loading" }
  | { kind: "authorizing" }
  | { kind: "ready" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string; code?: string };

export function GuardedSection({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: React.ReactNode;
}) {
  const { bootstrap, session, signOut } = useApp();
  const [state, setState] = useState<GuardState>({ kind: "loading" });
  const mountedRef = useRef(true);
  const ctrlRef = useRef(createNavigationController());

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const authorize = useCallback(() => {
    // Bump generation on every invocation so the forbidden branch (no
    // matching section) also invalidates in-flight authorizations from a
    // prior render. Without this, a stale response can resurrect a
    // section whose permission was revoked while the RPC was pending.
    const gen = ctrlRef.current.nextGeneration();
    const section = getSection(bootstrap.sections, sectionKey);
    if (!section) {
      setState({ kind: "forbidden" });
      return;
    }

    if (section.requiresServerAuth) {
      setState({ kind: "authorizing" });
      announce(COPY.nav.loading);
      (async () => {
        try {
          const { promise } = ctrlRef.current.run(sectionKey, () =>
            authorizedNavigate(session, sectionKey)
          );
          const result = await promise;
          if (!mountedRef.current || !ctrlRef.current.isCurrent(gen)) {
            return;
          }
          setState({ kind: result.authorized ? "ready" : "forbidden" });
        } catch (error) {
          if (!mountedRef.current || !ctrlRef.current.isCurrent(gen)) {
            return;
          }
          if (
            error instanceof RpcError &&
            error.problem.code === "AUTH_REQUIRED"
          ) {
            clearSession();
            signOut();
            return;
          }
          const msg =
            error instanceof RpcError
              ? errorCopyFor(error.problem.code, error.problem.detail)
              : COPY.error.networkError;
          const code =
            error instanceof RpcError ? error.problem.code : undefined;
          setState({ kind: "error", message: msg, code });
        }
      })();
    } else {
      setState({ kind: "ready" });
    }
  }, [sectionKey, bootstrap.sections, session, signOut]);

  useEffect(() => {
    authorize();
  }, [authorize]);

  const handleRetry = useCallback(() => {
    ctrlRef.current.cancelPending(sectionKey);
    authorize();
  }, [authorize, sectionKey]);

  if (state.kind === "loading" || state.kind === "authorizing") {
    return (
      <main
        style={{
          maxWidth: 600,
          margin: "2rem auto",
          padding: "0 1rem",
          fontFamily: "sans-serif",
        }}
      >
        <p>{COPY.nav.loading}</p>
      </main>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <RecoveryView
        message={COPY.error.forbidden}
        safeHref={`/${bootstrap.sections[0]?.key ?? "profile"}`}
      />
    );
  }

  if (state.kind === "error") {
    const isForbidden = state.code === "FORBIDDEN";
    return (
      <RecoveryView
        message={state.message}
        safeHref={`/${recoverySection(bootstrap.sections)}`}
        onRetry={isForbidden ? undefined : handleRetry}
      />
    );
  }

  return children;
}
