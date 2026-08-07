"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { SectionView } from "@/app/_sections/section-view";

export default function PermissionsPage() {
  return (
    <AppShell>
      <SectionView sectionKey="permissions" title={COPY.sections.permissions} />
    </AppShell>
  );
}