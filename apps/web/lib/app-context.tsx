"use client";

import { createContext, useContext, useCallback, useMemo } from "react";

import type { Bootstrap } from "@/lib/api";
import { clearAuthHint } from "@/lib/session";

interface AppContextValue {
  bootstrap: Bootstrap;
  signOut: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  bootstrap,
  onSignOut,
  children,
}: {
  bootstrap: Bootstrap;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const signOut = useCallback(() => {
    clearAuthHint();
    onSignOut();
  }, [onSignOut]);

  return (
    <AppContext.Provider
      value={useMemo(() => ({ bootstrap, signOut }), [bootstrap, signOut])}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
