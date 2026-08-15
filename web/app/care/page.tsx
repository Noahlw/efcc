"use client";

import { SectionView } from "@/app/_sections/section-view";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

const CarePage = () => (
  <AppShell>
    <SectionView sectionKey="care" title={COPY.sections.care} />
  </AppShell>
);

export default CarePage;
