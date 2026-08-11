"use client";

import { AppShell } from "@/lib/app-shell";
import { AttendancePanel } from "@/lib/attendance-panel";
import { COPY } from "@/lib/copy";

/**
 * Self Check-In is available to every authenticated account. The Worker
 * enforces enrollment and event-window authorization on the mutation; this
 * page is not the privileged assisted-check-in surface.
 */
const ScannerPage = () => (
  <AppShell>
    <AttendancePanel title={COPY.sections.scanner} />
  </AppShell>
);

export default ScannerPage;
