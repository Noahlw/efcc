"use client";

import { AppShell } from "@/lib/app-shell";
import { GuardedSection } from "@/lib/guarded-section";

export default function ScannerPage() {
  return (
    <AppShell>
      <GuardedSection sectionKey="scanner">
        <main
          style={{
            maxWidth: 600,
            margin: "2rem auto",
            padding: "0 1rem",
            fontFamily: "sans-serif",
          }}
        >
          <p>掃描 (placeholder)</p>
        </main>
      </GuardedSection>
    </AppShell>
  );
}
