"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function CarePage() {
  return (
    <AppShell>
      <SectionView sectionKey="care" title={COPY.sections.care} />
    </AppShell>
  );
}