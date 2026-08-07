"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function ScannerPage() {
  return (
    <AppShell>
      <SectionView sectionKey="scanner" title={COPY.sections.scanner} />
    </AppShell>
  );
}