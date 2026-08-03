"use client";

import { useEffect, useState, useRef } from "react";

import { authorizedNavigate } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { RecoveryView } from "@/lib/recovery-view";
import { getSection, recoverySection } from "@/lib/sections";

type GuardState =
  | { kind: "loading" }
  | { kind: "authorizing" }
  | { kind: "ready" }
  | { kind: "forbidden" };

export function GuardedSection({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: React.ReactNode;
}) {
  const { bootstrap, session } = useApp();
  const [state, setState] = useState<GuardState>({ kind: "loading" });
  const mountedRef = useRef(true);

  useEffect(() => 
    () => {
      mountedRef.current = false;
    }
  , []);

  useEffect(() => {
    const section = getSection(bootstrap.sections, sectionKey);
    if (!section) {
      setState({ kind: "forbidden" });
      return;
    }

    if (section.requiresServerAuth) {
      setState({ kind: "authorizing" });
      (async () => {
        try {
          const result = await authorizedNavigate(session, sectionKey);
          if (!mountedRef.current) {return;}
          setState({ kind: result.authorized ? "ready" : "forbidden" });
        } catch {
          if (mountedRef.current) {setState({ kind: "forbidden" });}
        }
      })();
    } else {
      setState({ kind: "ready" });
    }
  }, [sectionKey, bootstrap, session]);

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
        message={COPY.nav.unauthorized}
        safeHref={`/${recoverySection(bootstrap.sections)}`}
      />
    );
  }

  return children;
}
