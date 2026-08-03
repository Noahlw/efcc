"use client";

import { AppShell } from "@/lib/app-shell";
import { GuardedSection } from "@/lib/guarded-section";

export default function CarePage() {
  return (
    <AppShell>
      <GuardedSection sectionKey="care">
        <main
          style={{
            maxWidth: 600,
            margin: "2rem auto",
            padding: "0 1rem",
            fontFamily: "sans-serif",
          }}
        >
          <p>關懷 (placeholder)</p>
        </main>
      </GuardedSection>
    </AppShell>
  );
}
