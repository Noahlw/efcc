"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
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
          <h1 style={{ marginBottom: "1.5rem" }}>
            {COPY.sections.permissions}
          </h1>
          <p>內容建置中。</p>
        </main>
      </GuardedSection>
    </AppShell>
  );
}
