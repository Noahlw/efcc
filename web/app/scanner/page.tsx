"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SelfCheckInPanel } from "@/lib/self-check-in-panel";

/**
 * Self Check-In is available to every authenticated account. The Worker
 * enforces enrollment and event-window authorization on the mutation; this
 * page is not the privileged assisted-check-in surface.
 */
const ScannerPage = () => (
  <AppShell>
    <SelfCheckInPanel title={COPY.sections.scanner} />
  </AppShell>
);

export default ScannerPage;
