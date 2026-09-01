"use client";

import { cva } from "class-variance-authority";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { authLogout, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import { COPY, errorCopyFor } from "@/lib/copy";
import { ForbiddenView } from "@/lib/forbidden-view";
import { announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { OfflineBanner } from "@/lib/offline-banner";
import {
  clearAccessCache,
  clearCatalogCache,
} from "@/lib/programs/program-api";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { RecoveryView } from "@/lib/recovery-view";
import {
  clearAuthHint,
  clearDeepLink,
  rememberDeepLink,
  restoreBootstrap,
} from "@/lib/session";
import { ShellHeader } from "@/lib/shell-header";

import styles from "./auth-shell.module.css";

const shellBodyVariants = cva("shell-body", {
  variants: {
    scanner: {
      true: "shell-body--scanner",
      false: "",
    },
  },
  defaultVariants: {
    scanner: false,
  },
});

type ShellState =
  | { kind: "loading" }
  | { kind: "ready"; bootstrap: Bootstrap }
  | { kind: "error"; message: string; code?: string };

const LOGOUT_FAILED_KEY = "efcc_logout_failed";
const SESSION_EXPIRED_KEY = "efcc_session_expired";
function clearProgramCaches(): void {
  clearAccessCache();
  clearCatalogCache();
}

const ShellFrame = ({
  bootstrap,
  children,
}: {
  bootstrap: Bootstrap;
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const isScanner = pathname === "/scanner" || pathname.startsWith("/scanner/");

  const handleSignOut = useCallback(async () => {
    clearProgramCaches();
    let rpcFailed = false;
    try {
      await authLogout();
    } catch {
      rpcFailed = true;
    }
    clearAuthHint();
    clearDeepLink();
    announce(rpcFailed ? COPY.logout.failedNotice : COPY.logout.success);
    if (rpcFailed) {
      sessionStorage.setItem(LOGOUT_FAILED_KEY, "1");
    }
    router.replace("/");
  }, [router]);

  return (
    <AppProvider bootstrap={bootstrap} onSignOut={handleSignOut}>
      <div className="shell">
        <OfflineBanner />
        <a className={styles.skipLink} href="#shell-content">
          {COPY.skipToContent}
        </a>
        <ShellHeader attentionData={EMPTY_ATTENTION_DATA} />
        <div className={shellBodyVariants({ scanner: isScanner })}>
          <NavBar />
          <main id="shell-content" className="shell-content">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  );
};

const LoadingShell = () => (
  <main className={styles.state} aria-busy="true">
    <Skeleton
      className="h-8 w-8 rounded-full bg-[var(--skeleton)]"
      aria-hidden="true"
    />
    <p>{COPY.restore.loading}</p>
  </main>
);

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const handleAuthRequired = useCallback(() => {
    clearProgramCaches();
    clearAuthHint();
    rememberDeepLink(
      `${pathname}${window.location.search}${window.location.hash}`
    );
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    } catch {
      // The sign-in surface remains the safe fallback when storage is blocked.
    }
    router.replace("/");
  }, [pathname, router]);

  const { state, run, retry } = useAsyncResource<Bootstrap | null, ShellState>(
    async () => {
      const bootstrap = await restoreBootstrap();
      if (bootstrap === null) {
        rememberDeepLink(
          `${pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
      }
      return bootstrap;
    },
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (bootstrap) =>
        bootstrap ? { kind: "ready", bootstrap } : { kind: "loading" },
      onError: (error) => {
        const code = error instanceof RpcError ? error.problem.code : undefined;
        const message =
          error instanceof RpcError
            ? errorCopyFor(code, error.problem.detail)
            : COPY.error.networkError;
        return { kind: "error", message, code };
      },
      isAuthRequired: (error) =>
        error instanceof RpcError && error.problem.code === "AUTH_REQUIRED",
      onAuthRequired: handleAuthRequired,
      announceLoading: COPY.restore.loading,
      announceReady: (bootstrap) =>
        bootstrap ? COPY.restore.restored : undefined,
    },
    [handleAuthRequired, pathname, router]
  );

  useEffect(() => {
    void run();
  }, [run]);

  if (state.kind === "loading") {
    return <LoadingShell />;
  }
  if (state.kind === "error") {
    if (state.code === "FORBIDDEN") {
      const handleForbiddenSignOut = async () => {
        clearProgramCaches();
        try {
          await authLogout();
        } catch {
          // Best-effort: the boundary already refuses this session.
        }
        clearAuthHint();
        router.replace("/");
      };
      return (
        <ForbiddenView
          safeHref="/profile"
          onSignOut={() => void handleForbiddenSignOut()}
        />
      );
    }
    return (
      <RecoveryView message={state.message} safeHref="/" onRetry={retry} />
    );
  }

  return <ShellFrame bootstrap={state.bootstrap}>{children}</ShellFrame>;
};
