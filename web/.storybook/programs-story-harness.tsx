import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

import { AppShell } from "@/lib/app-shell";
import { ProgramsRouteSurface } from "@/lib/programs/programs-route-surface";

/**
 * Storybook's only Programs route adapter. It supplies shared chrome while
 * the route surface remains production-owned and prop-free.
 */
export type ProgramsStoryQuery = Record<string, string>;

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
