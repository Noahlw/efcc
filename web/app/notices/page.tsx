"use client";

import { SectionView } from "@/app/_sections/section-view";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

const NoticesPage = () => (
  <AppShell>
    <SectionView sectionKey="notices" title={COPY.home.noticeSectionTitle} />
  </AppShell>
);

export default NoticesPage;
