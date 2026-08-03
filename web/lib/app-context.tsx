"use client";

import { createContext, useContext, useCallback, useMemo } from "react";

import type { Bootstrap, Session } from "@/lib/api";
import { clearSession } from "@/lib/session";

interface AppContextValue {
  bootstrap: Bootstrap;
  session: Session;
  signOut: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  bootstrap,
  session,
  onSignOut,
  children,
}: {
  bootstrap: Bootstrap;
  session: Session;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const signOut = useCallback(() => {
    clearSession();
    onSignOut();
  }, [onSignOut]);

  return (
    <AppContext.Provider
      value={useMemo(
        () => ({ bootstrap, session, signOut }),
        [bootstrap, session, signOut]
      )}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {throw new Error("useApp must be used within AppProvider");}
  return ctx;
}
