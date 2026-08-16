"use client";

import { useSearchParams } from "next/navigation";

import { AppShell } from "@/lib/app-shell";
import { GuardedSection } from "@/lib/guarded-section";

import { CheckinSettings } from "./checkin-settings";
import { ManagementHub } from "./management-hub";
import { SettingsHub } from "./settings-hub";
import { TimezoneSettings } from "./timezone-settings";

function ManagementModule() {
  const module = useSearchParams().get("module");

  switch (module) {
    case "settings":
      return <SettingsHub />;
    case "checkin-settings":
      return <CheckinSettings />;
    case "timezone-settings":
      return <TimezoneSettings />;
    default:
      return <ManagementHub />;
  }
}

export default function ManagementPage() {
  return (
    <AppShell>
      <GuardedSection sectionKey="management">
        <ManagementModule />
      </GuardedSection>
    </AppShell>
  );
}
