import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { ProgramsBoundary } from "@/lib/programs/programs-boundary";

import styles from "./programs.module.css";

/**
 * Participant-default Programs boundary (PUI-01 / Issue #245). The browser
 * consumes only server-shaped scoped capability fields to offer the optional
 * management mode; directory, detail, enrollment, and workspace surfaces stay
 * outside this entry slice.
 */
const ProgramsPage = () => 
  (
    <AppShell>
      <div className={styles.page}>
        <Suspense
          fallback={
            <output className={styles.boundaryState} aria-busy="true">
              {COPY.programs.accessLoading}
              <Skeleton className="mt-3 h-8 w-full" aria-hidden="true" />
            </output>
          }
        >
          <ProgramsBoundary />
        </Suspense>
      </div>
    </AppShell>
  )
;

export default ProgramsPage;
