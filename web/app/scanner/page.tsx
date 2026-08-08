"use client";

import { AppShell } from "@/lib/app-shell";
import { AttendancePanel } from "@/lib/attendance-panel";
import { COPY } from "@/lib/copy";

const ScannerPage = () => (
  <AppShell>
    <AttendancePanel title={COPY.sections.scanner} />
  </AppShell>
);

export default ScannerPage;
