"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function HomePage() {
  return (
    <AppShell>
      <SectionView sectionKey="home" title={COPY.sections.home} />
    </AppShell>
  );
}
