"use client";

import { useSearchParams } from "next/navigation";

import { AppShell } from "@/lib/app-shell";
import { ApprovalDetail } from "@/lib/approval-detail";
import { ApprovalQueue } from "@/lib/approval-queue";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";
import { GuardedSection } from "@/lib/guarded-section";

import { AccountAccessPanel } from "./account-access-panel";
import { AccountDirectoryPanel } from "./account-directory-panel";
import { CheckinSettings } from "./checkin-settings";
import { HomeContentEditor } from "./home-cms-editor";
import { ManagementHub } from "./management-hub";
import { MemberDirectoryPanel } from "./member-directory-panel";
import { PermissionEditorPanel } from "./permission-editor-panel";
import { RoleHierarchyPanel } from "./role-hierarchy-panel";
import { SettingsHub } from "./settings-hub";
import { TimezoneSettings } from "./timezone-settings";

const ManagementModule = () => {
  const searchParams = useSearchParams();
  const module = searchParams.get("module");

  switch (module) {
    case "accounts": {
      const scopedAccess =
        searchParams.get("scopeId") !== null &&
        (searchParams.get("scopeKind") === "Department" ||
          searchParams.get("scopeKind") === "Program");
      return searchParams.get("view") === "access" &&
        (searchParams.get("account") ||
          searchParams.get("roleDefinition") ||
          scopedAccess) ? (
        <AccountAccessPanel />
      ) : (
        <AccountDirectoryPanel />
      );
    }
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
    case "home-content": {
      return <HomeContentEditor />;
    }
    case "permissions": {
      return <PermissionEditorPanel />;
    }
    case "roles": {
      return <RoleHierarchyPanel />;
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
