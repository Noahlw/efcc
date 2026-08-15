"use client";

import { SectionView } from "@/app/_sections/section-view";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

const PermissionsPage = () => (
  <AppShell>
    <SectionView
      sectionKey="permissions"
      title={COPY.sections.permissionsHeading}
    />
  </AppShell>
);

export default PermissionsPage;
