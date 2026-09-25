"use client";

import { AppShell } from "@/lib/app-shell";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";
import { GuardedSection } from "@/lib/guarded-section";

const EventsPage = () => (
  <AppShell>
    <GuardedSection sectionKey="events">
      <AttendanceOperatorPanel />
    </GuardedSection>
  </AppShell>
);

export default EventsPage;
