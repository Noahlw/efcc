import { AppShell } from "@/lib/app-shell";
import { ProgramsRouteSurface } from "@/lib/programs/programs-route-surface";

/**
 * AppShell owns the shared chrome; ProgramsRouteSurface owns the route frame,
 * Suspense fallback, and Programs boundary.
 */
const ProgramsPage = () => (
  <AppShell>
    <ProgramsRouteSurface />
  </AppShell>
);

export default ProgramsPage;
