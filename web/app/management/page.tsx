"use client";

import { AppShell } from "@/lib/app-shell";
import { GuardedSection } from "@/lib/guarded-section";
import { ManagementHub } from "./management-hub";

export default function ManagementPage() {
  return (
    <AppShell>
      <GuardedSection sectionKey="management">
        <ManagementHub />
      </GuardedSection>
    </AppShell>
  );
}
