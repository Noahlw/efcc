import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import ManagementPage from "@/app/management/page";
import RegistrationsPage from "@/app/registrations/page";

import { managementIdentityHandlers } from "./management-identity-fixtures";
import type { PresentationMetadata } from "./presentation-meta";

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

const assertManagementScreen = async (
  canvasElement: HTMLElement,
  marker: string
) => {
  const heading = await waitFor(async () => {
    const headings = await within(canvasElement).findAllByRole("heading");
    const match = headings.find((candidate) => candidate.matches(marker));
    if (!match) {
      throw new Error(`Expected management heading ${marker} was not rendered`);
    }
    return match;
  });
  await expect(heading).toHaveAttribute("id", marker.slice(1));
};

const story = (
  presentation: PresentationMetadata,
  query: Record<string, string>,
  marker: string
): Story => ({
  decorators: [withManagerIdentity],
  render: () => <ManagementPage />,
  parameters: {
    presentation,
    msw: managementIdentityHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/management", query },
    },
  },
  play: ({ canvasElement }) => assertManagementScreen(canvasElement, marker),
});

export const AccountDirectory = story(
  {
    screenId: "management-account-directory",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-ACCOUNT-DIRECTORY",
    route: "/management",
    intent: "module=accounts",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "accounts" },
  "#account-directory-title"
);

export const AccountAccess = story(
  {
    screenId: "management-account-access",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-ACCOUNT-ACCESS",
    route: "/management",
    intent: "module=accounts&account=t07-4-account&view=access",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "accounts", account: "t07-4-account", view: "access" },
  "#account-access-title"
);

export const ApprovalQueue = story(
  {
    screenId: "management-approval-queue",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-APPROVAL-QUEUE",
    route: "/management",
    intent: "module=approvals",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "approvals" },
  "#approval-queue-title"
);

export const ApprovalDetail = story(
  {
    screenId: "management-approval-detail",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-APPROVAL-DETAIL",
    route: "/management",
    intent: "module=approvals&request=t07-4-registration",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "approvals", request: "t07-4-registration" },
  "#approval-detail-title"
);

export const MemberDirectory = story(
  {
    screenId: "management-member-directory",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-MEMBER-DIRECTORY",
    route: "/management",
    intent: "module=members",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "members" },
  "#member-directory-title"
);

export const HomeCms = story(
  {
    screenId: "management-home-cms",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-HOME-CMS",
    route: "/management",
    intent: "module=home-content",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "home-content" },
  "#home-cms-editor-title"
);

export const PermissionEditor = story(
  {
    screenId: "identity-permission-editor",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-IDENTITY-PERMISSION-EDITOR",
    route: "/management",
    intent: "module=permissions",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "permissions" },
  "#permission-editor-title"
);

export const RoleHierarchy = story(
  {
    screenId: "identity-role-hierarchy",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-IDENTITY-ROLE-HIERARCHY",
    route: "/management",
    intent: "module=roles",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "roles" },
  "#role-hierarchy-title"
);

export const SettingsHub = story(
  {
    screenId: "management-settings-hub",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-SETTINGS-HUB",
    route: "/management",
    intent: "module=settings",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "settings" },
  "#settings-title"
);

export const CheckinSettings = story(
  {
    screenId: "management-checkin-settings",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-CHECKIN-SETTINGS",
    route: "/management",
    intent: "module=checkin-settings",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "checkin-settings" },
  "#checkin-settings-title"
);

export const TimezoneSettings = story(
  {
    screenId: "management-timezone-settings",
    productFamily: "management-identity",
    lifecycle: "active",
    baseline: "primary",
    psn: "PSN-MGMT-TIMEZONE-SETTINGS",
    route: "/management",
    intent: "module=timezone-settings",
    state: "default",
    gap: null,
    supersedes: [],
  },
  { module: "timezone-settings" },
  "#timezone-settings-title"
);

export const RegistrationsFallback: Story = {
  decorators: [withManagerIdentity],
  render: () => <RegistrationsPage />,
  parameters: {
    presentation: {
      screenId: "management-registrations-fallback",
      productFamily: "management-identity",
      lifecycle: "active",
      baseline: "primary",
      psn: "PSN-MGMT-REGISTRATIONS-FALLBACK",
      route: "/registrations",
      intent: null,
      state: "redirect-fallback",
      gap: null,
      supersedes: [],
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/registrations", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { name: "正在前往註冊審批…" })
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole("link", { name: "前往註冊審批" })
    ).resolves.toHaveAttribute("href", "/management?module=approvals");
  },
};
