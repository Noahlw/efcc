"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import { restoreApp, logoutUser, RpcError } from "@/lib/api";
import type { Bootstrap, Session } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { NavBar } from "@/lib/nav-bar";
import { loadSession, clearSession } from "@/lib/session";

const DEEP_LINK_KEY = "efcc_deep_link";

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
    try {
      await logoutUser(session);
    } catch {
      // Best-effort server-side revocation.
    }
    clearSession();
    sessionStorage.removeItem(DEEP_LINK_KEY);
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

function ErrorShell({ message }: { message: string }) {
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
      <p role="alert" style={{ color: "#b00020", marginBottom: "1rem" }}>
        {message}
      </p>
      <a href="/" style={{ color: "#1565c0", textDecoration: "underline" }}>
        {COPY.login.title}
      </a>
    </main>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; bootstrap: Bootstrap; session: Session }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) {return;}
        setState({ kind: "ready", bootstrap, session: stored });
      } catch (error) {
        if (cancelled) {return;}
        clearSession();
        sessionStorage.setItem(DEEP_LINK_KEY, pathname);
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          setState({ kind: "error", message: COPY.restore.expired });
        } else {
          router.replace("/");
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, pathname]);

  if (state.kind === "loading") {return <LoadingShell />;}
  if (state.kind === "error") {return <ErrorShell message={state.message} />;}

  return (
    <ShellFrame bootstrap={state.bootstrap} session={state.session}>
      {children}
    </ShellFrame>
  );
}
