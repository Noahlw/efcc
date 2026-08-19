"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { authLogout, RpcError } from "@/lib/api";
import type { Bootstrap } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { EMPTY_ATTENTION_DATA } from "@/lib/attention-panel";
import { COPY, errorCopyFor } from "@/lib/copy";
import { ForbiddenView } from "@/lib/forbidden-view";
import { announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { OfflineBanner } from "@/lib/offline-banner";
import { RecoveryView } from "@/lib/recovery-view";
import {
  clearAuthHint,
  clearDeepLink,
  rememberDeepLink,
  restoreBootstrap,
} from "@/lib/session";
import { ShellHeader } from "@/lib/shell-header";

import styles from "./auth-shell.module.css";

const LOGOUT_FAILED_KEY = "efcc_logout_failed";

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
        <div
          className={
            isScanner ? "shell-body shell-body--scanner" : "shell-body"
          }
        >
          <NavBar />
          <main id="shell-content" className="shell-content">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  );
};

const LoadingShell = () => {
  useEffect(() => {
    announce(COPY.restore.loading);
  }, []);

  return (
    <main className={styles.state}>
      <span className={styles.spinner} aria-hidden="true" />
      <p>{COPY.restore.loading}</p>
    </main>
  );
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; bootstrap: Bootstrap }
    | { kind: "error"; message: string; code?: string }
  >({ kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bootstrap = await restoreBootstrap();
        if (cancelled) {
          return;
        }
        if (bootstrap === null) {
          // No stored session — cold boot straight to login, no restore call.
          rememberDeepLink(
            `${pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        announce(COPY.restore.restored);
        setState({ kind: "ready", bootstrap });
      } catch (error) {
        if (cancelled) {
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
          rememberDeepLink(
            `${pathname}${window.location.search}${window.location.hash}`
          );
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable; tick triggers retry
  }, [router, pathname, tick]);

  if (state.kind === "loading") {
    return <LoadingShell />;
  }
  if (state.kind === "error") {
    // AUTH_REQUIRED is handled inline (clears hint + redirects). FORBIDDEN is
    // a hard authorization failure — render the forbidden state (S13), not a
    // retry. Any other error here is transient (network / 5xx), so retry is
    // appropriate. Bumping `tick` re-runs the restore effect.
    if (state.code === "FORBIDDEN") {
      // An authenticated account whose status is no longer Active (403 from
      // the auth boundary) cannot recover through the profile link — every
      // restore re-verifies and fails again. Offer a real exit: clear the
      // presence hint and return to the signed-out surface (review P1).
      const handleForbiddenSignOut = async () => {
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
      <RecoveryView
        message={state.message}
        safeHref="/"
        onRetry={() => setTick((t) => t + 1)}
      />
    );
  }

  return <ShellFrame bootstrap={state.bootstrap}>{children}</ShellFrame>;
};
