"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

import { authLogout, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { RecoveryView } from "@/lib/recovery-view";
import { clearAuthHint, restoreBootstrap } from "@/lib/session";

const DEEP_LINK_KEY = "efcc_deep_link";
const LOGOUT_FAILED_KEY = "efcc_logout_failed";

function ShellFrame({
  bootstrap,
  children,
}: {
  bootstrap: Bootstrap;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    let rpcFailed = false;
    try {
      await authLogout();
    } catch {
      rpcFailed = true;
    }
    clearAuthHint();
    sessionStorage.removeItem(DEEP_LINK_KEY);
    announce(rpcFailed ? COPY.logout.failedNotice : COPY.logout.success);
    if (rpcFailed) {
      sessionStorage.setItem(LOGOUT_FAILED_KEY, "1");
    }
    router.replace("/");
  }, [router]);

  return (
    <AppProvider bootstrap={bootstrap} onSignOut={handleSignOut}>
      <div className="shell">
        <NavBar />
        <main className="shell-content">{children}</main>
      </div>
    </AppProvider>
  );
}

function LoadingShell() {
  useEffect(() => {
    announce(COPY.restore.loading);
  }, []);

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
    | { kind: "ready"; bootstrap: Bootstrap }
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
    (async () => {
      try {
        const bootstrap = await restoreBootstrap();
        if (!mountRef.current) {
          return;
        }
        if (bootstrap === null) {
          // No stored session — cold boot straight to login, no restore call.
          sessionStorage.setItem(DEEP_LINK_KEY, pathname);
          router.replace("/");
          return;
        }
        announce(COPY.restore.restored);
        setState({ kind: "ready", bootstrap });
      } catch (error) {
        if (!mountRef.current) {
          return;
        }
        // AUTH_REQUIRED means the refresh cookie is dead (expired or
        // revoked); clear the presence flag and send the user back to login
        // so the deep link can be honored after a fresh login. Any other
        // failure (network, 5xx) is recoverable — offer retry so an
        // otherwise-valid session isn't lost to a transient blip.
        const code = error instanceof RpcError ? error.problem.code : undefined;
        if (code === "AUTH_REQUIRED") {
          clearAuthHint();
          sessionStorage.setItem(DEEP_LINK_KEY, pathname);
          sessionStorage.setItem("efcc_session_expired", "1");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable; tick triggers retry
  }, [router, pathname, tick]);

  if (state.kind === "loading") {
    return <LoadingShell />;
  }
  if (state.kind === "error") {
    // AUTH_REQUIRED is handled inline (clears hint + redirects); any error
    // reaching this branch is transient (network / 5xx), so retry is always
    // appropriate. Bumping `tick` re-runs the restore effect.
    return (
      <RecoveryView
        message={state.message}
        safeHref="/"
        onRetry={() => setTick((t) => t + 1)}
      />
    );
  }

  return <ShellFrame bootstrap={state.bootstrap}>{children}</ShellFrame>;
}
