"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

export default function EventsPage() {
  return (
    <AppShell>
      <main
        style={{
          maxWidth: 600,
          margin: "2rem auto",
          padding: "0 1rem",
          fontFamily: "sans-serif",
        }}
      >
        <h1 style={{ marginBottom: "1.5rem" }}>{COPY.sections.events}</h1>
        <p>{COPY.sections.placeholder}</p>
      </main>
    </AppShell>
  );
}
