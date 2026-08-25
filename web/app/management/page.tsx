"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/lib/app-shell";
import { ApprovalDetail } from "@/lib/approval-detail";
import { ApprovalQueue } from "@/lib/approval-queue";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";
import { GuardedSection } from "@/lib/guarded-section";

import { CheckinSettings } from "./checkin-settings";
import { HomeContentEditor } from "./home-cms-editor";
import { ManagementHub } from "./management-hub";
import { MemberDirectoryPanel } from "./member-directory-panel";
import { PermissionsPanel } from "./permissions-panel";
import { S4Prototype } from "./s4-prototype";
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
    case "home-content": {
      return <HomeContentEditor />;
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

const ProductionManagementPage = () => (
  <AppShell>
    <GuardedSection sectionKey="management">
      <ManagementModule />
    </GuardedSection>
  </AppShell>
);

const DevelopmentManagementPage = () => {
  const searchParams = useSearchParams();

  if (searchParams.get("prototype") === "s4") {
    return <S4Prototype />;
  }

  return <ProductionManagementPage />;
};

const ManagementPage = () => {
  if (process.env.NODE_ENV === "production") {
    return <ProductionManagementPage />;
  }

  return (
    <Suspense fallback={<ProductionManagementPage />}>
      <DevelopmentManagementPage />
    </Suspense>
  );
};

export default ManagementPage;
