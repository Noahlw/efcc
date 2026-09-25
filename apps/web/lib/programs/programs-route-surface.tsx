import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { COPY } from "@/lib/copy";
import { ScreenPageFrame } from "@/lib/screen-foundations";

import { ProgramsBoundary } from "./programs-boundary";

/**
 * The production Programs presentation surface. The Next route and
 * Storybook both consume this composition so a Story cannot silently omit
 * the route frame, Suspense boundary, or Programs intent state machine.
 */
export const ProgramsRouteSurface = () => (
  <ScreenPageFrame data-screen-route="programs" width="compact">
    <Suspense
      fallback={
        <output
          className="block w-full max-w-[60ch] min-w-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)] [overflow-wrap:anywhere]"
          aria-busy="true"
        >
          {COPY.programs.accessLoading}
          <Skeleton className="mt-3 h-8 w-full" aria-hidden="true" />
        </output>
      }
    >
      <ProgramsBoundary />
    </Suspense>
  </ScreenPageFrame>
);
