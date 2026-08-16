"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function ManagementPage() {
  return (
    <AppShell>
      <SectionView sectionKey="management" title={COPY.sections.management} />
    </AppShell>
  );
}
