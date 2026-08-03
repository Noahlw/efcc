"use client";

import { AppShell } from "@/lib/app-shell";
import { GuardedSection } from "@/lib/guarded-section";

export default function PermissionsPage() {
  return (
    <AppShell>
      <GuardedSection sectionKey="permissions">
        <main
          style={{
            maxWidth: 600,
            margin: "2rem auto",
            padding: "0 1rem",
            fontFamily: "sans-serif",
          }}
        >
          <p>權限管理 (placeholder)</p>
        </main>
      </GuardedSection>
    </AppShell>
  );
}
