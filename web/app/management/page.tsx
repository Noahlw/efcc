"use client";

import { SectionView } from "@/app/_sections/section-view";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

const ManagementPage = () => (
  <AppShell>
    <SectionView sectionKey="management" title={COPY.sections.management} />
  </AppShell>
);

export default ManagementPage;
