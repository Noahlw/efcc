import type { Decorator } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/lib/app-shell";
import { clearAllEventCreateDrafts } from "@/lib/programs/event-create-draft";
import { clearAllGenerationRecoveries } from "@/lib/programs/generation-recovery";
import { clearAllWorkspaceMutationRecovery } from "@/lib/programs/mutation-recovery";
import {
  clearAccessCache,
  clearCatalogCache,
} from "@/lib/programs/program-api";
import { ProgramsRouteSurface } from "@/lib/programs/programs-route-surface";

/**
 * Storybook's only Programs route adapter. It supplies shared chrome while
 * the route surface remains production-owned and prop-free.
 */
export type ProgramsStoryQuery = Record<string, string>;

/** Shared route-fixture isolation for every Programs Storybook surface. */
export const withProgramsFixtureIsolation: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }
  clearAccessCache();
  clearCatalogCache();
  clearAllEventCreateDrafts();
  clearAllGenerationRecoveries();
  clearAllWorkspaceMutationRecovery();

  useEffect(
    () => () => {
      clearAccessCache();
      clearCatalogCache();
      clearAllEventCreateDrafts();
      clearAllGenerationRecoveries();
      clearAllWorkspaceMutationRecovery();
    },
    []
  );

  return <Story />;
};

export const ProgramsStoryHarness = ({
  query = {},
}: {
  query?: ProgramsStoryQuery;
}) => {
  const router = useRouter();
  const searchParams = new URLSearchParams(query);
  const routeKey = searchParams.toString();

  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/programs">
        <SearchParamsContext.Provider value={searchParams}>
          <AppShell>
            <ProgramsRouteSurface key={routeKey} />
          </AppShell>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
};
