"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function NoticesPage() {
  return (
    <AppShell>
      <SectionView sectionKey="notices" title={COPY.sections.notices} />
    </AppShell>
  );
}
