"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
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
          <h1 style={{ marginBottom: "1.5rem" }}>{COPY.sections.scanner}</h1>
          <p>{COPY.sections.placeholder}</p>
        </main>
      </GuardedSection>
    </AppShell>
  );
}
