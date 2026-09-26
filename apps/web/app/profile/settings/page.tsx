"use client";

import { AccountSettings } from "@/app/profile/account-settings";
import { AppShell } from "@/lib/app-shell";

/** The stable URL adapter for the sole AccountSettings implementation. */
const SettingsPage = () => (
  <AppShell>
    <AccountSettings />
  </AppShell>
);

export default SettingsPage;
