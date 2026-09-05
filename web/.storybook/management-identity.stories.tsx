import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import ManagementPage from "@/app/management/page";

import { managementIdentityHandlers } from "./management-identity-fixtures";
import { MANAGEMENT_IDENTITY_PRESENTATION as PRESENTATION } from "./management-identity.story-contract";

const withManagerIdentity: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }
  return <Story />;
};

const meta = {
  id: "t07-4-management-identity",
  title: "T07.4/Management Identity",
  component: ManagementPage,
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ManagementPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const assertManagementScreen = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.findByRole("main")).resolves.toBeVisible();
};

const story = (
  screenId: string,
  psn: string,
  query: Record<string, string>
): Story => ({
  decorators: [withManagerIdentity],
  render: () => <ManagementPage />,
  parameters: {
    presentation: { screenId, psn },
    msw: managementIdentityHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/management", query },
    },
  },
  play: ({ canvasElement }) => assertManagementScreen(canvasElement),
});

export const AccountDirectory = story(
  "management-account-directory",
  PRESENTATION.accountDirectory.psn,
  { module: "accounts" }
);
export const AccountAccess = story(
  "management-account-access",
  PRESENTATION.accountAccess.psn,
  { module: "accounts", account: "t07-4-account", view: "access" }
);
export const ApprovalQueue = story(
  "management-approval-queue",
  PRESENTATION.approvalQueue.psn,
  { module: "approvals" }
);
export const ApprovalDetail = story(
  "management-approval-detail",
  PRESENTATION.approvalDetail.psn,
  { module: "approvals", request: "t07-4-registration" }
);
export const MemberDirectory = story(
  "management-member-directory",
  PRESENTATION.memberDirectory.psn,
  { module: "members" }
);
export const HomeCms = story("management-home-cms", PRESENTATION.homeCms.psn, {
  module: "home-content",
});
export const PermissionEditor = story(
  "identity-permission-editor",
  PRESENTATION.permissionEditor.psn,
  { module: "permissions" }
);
export const RoleHierarchy = story(
  "identity-role-hierarchy",
  PRESENTATION.roleHierarchy.psn,
  { module: "roles" }
);
export const SettingsHub = story(
  "management-settings-hub",
  PRESENTATION.settingsHub.psn,
  { module: "settings" }
);
export const CheckinSettings = story(
  "management-checkin-settings",
  PRESENTATION.checkinSettings.psn,
  { module: "checkin-settings" }
);
export const TimezoneSettings = story(
  "management-timezone-settings",
  PRESENTATION.timezoneSettings.psn,
  { module: "timezone-settings" }
);
