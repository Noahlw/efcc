"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function EventsPage() {
  return (
    <AppShell>
      <SectionView sectionKey="events" title={COPY.sections.events} />
    </AppShell>
  );
}