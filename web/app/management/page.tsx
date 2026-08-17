"use client";

import { useSearchParams } from "next/navigation";

import { AppShell } from "@/lib/app-shell";
import { ApprovalDetail } from "@/lib/approval-detail";
import { ApprovalQueue } from "@/lib/approval-queue";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";
import { GuardedSection } from "@/lib/guarded-section";

import { CheckinSettings } from "./checkin-settings";
import { ManagementHub } from "./management-hub";
import { MemberDirectoryPanel } from "./member-directory-panel";
import { PermissionsPanel } from "./permissions-panel";
import { SettingsHub } from "./settings-hub";
import { TimezoneSettings } from "./timezone-settings";

const ManagementModule = () => {
  const searchParams = useSearchParams();
  const module = searchParams.get("module");

  switch (module) {
    case "approvals": {
      const requestId = searchParams.get("request");
      return requestId ? (
        <ApprovalDetail requestId={requestId} />
      ) : (
        <ApprovalQueue />
      );
    }
    case "members": {
      return <MemberDirectoryPanel />;
    }
    case "permissions": {
      return <PermissionsPanel />;
    }
    case "attendance": {
      return <AttendanceOperatorPanel />;
    }
    case "settings": {
      return <SettingsHub />;
    }
    case "checkin-settings": {
      return <CheckinSettings />;
    }
    case "timezone-settings": {
      return <TimezoneSettings />;
    }
    default: {
      return <ManagementHub />;
    }
  }
};

const ManagementPage = () => {
  return (
    <AppShell>
      <GuardedSection sectionKey="management">
        <ManagementModule />
      </GuardedSection>
    </AppShell>
  );
};

export default ManagementPage;
