"use client";

import { AppShell } from "@/lib/app-shell";

import { AccountSettings } from "../account-settings";

export default function ProfileSettingsPage() {
  return (
    <AppShell>
      <AccountSettings />
    </AppShell>
  );
}