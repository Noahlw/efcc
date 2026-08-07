"use client";

import { AppShell } from "@/lib/app-shell";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";

const EventsPage = () => (
  <AppShell>
    <AttendanceOperatorPanel />
  </AppShell>
);

export default EventsPage;
