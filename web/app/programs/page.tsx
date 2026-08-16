import { Suspense } from "react";

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
export default function ProgramsPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <Suspense
          fallback={
            <div
              className={styles.boundaryState}
              role="status"
              aria-busy="true"
            >
              {COPY.programs.accessLoading}
            </div>
          }
        >
          <ProgramsBoundary />
        </Suspense>
      </div>
    </AppShell>
  );
}
