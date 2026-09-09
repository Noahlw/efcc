import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { ProgramsBoundary } from "@/lib/programs/programs-boundary";

/**
 * Participant-default Programs boundary (PUI-01 / Issue #245). The browser
 * consumes only server-shaped scoped capability fields to offer the optional
 * management mode; directory, detail, enrollment, and workspace surfaces stay
 * outside this entry slice.
 */
const ProgramsPage = () => (
  <AppShell>
    <div className="flex min-w-0 justify-center px-5 py-[clamp(1.5rem,4vh,2.5rem)] max-[799px]:px-4">
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
    </div>
  </AppShell>
);

export default ProgramsPage;
