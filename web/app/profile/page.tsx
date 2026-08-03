"use client";

import { useApp } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

function ProfileContent() {
  const { bootstrap, signOut } = useApp();
  const p = bootstrap.profile;
  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>{COPY.profile.title}</h1>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.75rem 1rem",
        }}
      >
        <dt>{COPY.profile.name}</dt>
        <dd>{p.name}</dd>
        <dt>{COPY.profile.username}</dt>
        <dd>{p.username}</dd>
        <dt>{COPY.profile.phone}</dt>
        <dd>{p.phone}</dd>
        <dt>{COPY.profile.role}</dt>
        <dd>{p.role}</dd>
        <dt>{COPY.profile.status}</dt>
        <dd>{p.status}</dd>
        <dt>{COPY.profile.qrCode}</dt>
        <dd
          style={{
            fontFamily: "monospace",
            fontSize: "0.8rem",
            wordBreak: "break-all",
          }}
        >
          {p.qrCodeString}
        </dd>
      </dl>
      <button
        type="button"
        onClick={signOut}
        style={{
          marginTop: "1.5rem",
          minWidth: 44,
          minHeight: 44,
          padding: "0.5rem 1rem",
        }}
      >
        {COPY.logout.submit}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}
