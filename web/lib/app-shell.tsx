"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

import { restoreApp, logoutUser, RpcError } from "@/lib/api";
import type { Bootstrap, Session } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { NavBar } from "@/lib/nav-bar";
import { RecoveryView } from "@/lib/recovery-view";
import { loadSession, clearSession } from "@/lib/session";

const DEEP_LINK_KEY = "efcc_deep_link";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";

function ShellFrame({
  bootstrap,
  session,
  children,
}: {
  bootstrap: Bootstrap;
  session: Session;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    let rpcFailed = false;
    try {
      await logoutUser(session);
    } catch {
      rpcFailed = true;
    }
    clearSession();
    sessionStorage.removeItem(DEEP_LINK_KEY);
    if (rpcFailed) {
      sessionStorage.setItem(LOGOUT_FAILED_KEY, "1");
    }
    router.replace("/");
  }, [router, session]);

  return (
    <AppProvider
      bootstrap={bootstrap}
      session={session}
      onSignOut={handleSignOut}
    >
      <div className="shell">
        <NavBar />
        <main className="shell-content">{children}</main>
      </div>
    </AppProvider>
  );
}

function LoadingShell() {
  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <p>{COPY.restore.loading}</p>
    </main>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; bootstrap: Bootstrap; session: Session }
    | { kind: "error"; message: string; code?: string }
  >({ kind: "loading" });
  const mountRef = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      mountRef.current = false;
    },
    []
  );

  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      clearSession();
      sessionStorage.setItem(DEEP_LINK_KEY, pathname);
      router.replace("/");
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        const bootstrap = await restoreApp(stored, {
          signal: controller.signal,
        });
        if (!mountRef.current) {
          return;
        }
        setState({ kind: "ready", bootstrap, session: stored });
      } catch (error) {
        if (!mountRef.current) {
          return;
        }
        // AUTH_REQUIRED means the stored session is dead; clear it and send
        // the user back to login so the deep link can be honored after a
        // fresh login. Any other failure (network, 5xx) is recoverable —
        // keep the stored session and offer retry so the user doesn't lose
        // an otherwise-valid session to a transient blip.
        const code = error instanceof RpcError ? error.problem.code : undefined;
        if (code === "AUTH_REQUIRED") {
          clearSession();
          sessionStorage.setItem(DEEP_LINK_KEY, pathname);
          router.replace("/");
          return;
        }
        const msg =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        setState({ kind: "error", message: msg, code });
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable; tick triggers retry
  }, [router, pathname, tick]);

  if (state.kind === "loading") {
    return <LoadingShell />;
  }
  if (state.kind === "error") {
    // AUTH_REQUIRED is handled inline (clears session + redirects); any
    // error reaching this branch is transient (network / 5xx), so retry
    // is always appropriate. Bumping `tick` re-runs the restore effect.
    return (
      <RecoveryView
        message={state.message}
        safeHref="/"
        onRetry={() => setTick((t) => t + 1)}
      />
    );
  }

  return (
    <ShellFrame bootstrap={state.bootstrap} session={state.session}>
      {children}
    </ShellFrame>
  );
}
