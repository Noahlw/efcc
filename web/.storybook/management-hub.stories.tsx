import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { ManagementHub } from "@/app/management/management-hub";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { GuardedSection } from "@/lib/guarded-section";

import {
  authMeHandler,
  MANAGEMENT_HUB_DEFAULT,
  MANAGEMENT_HUB_EMPTY,
  managementHubHandler,
  managementHubLoadingHandler,
  managementHubRecoverableErrorHandler,
} from "./management-hub-fixtures";

const withManagementPresentation: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
  }

  return (
    <AppShell>
      <GuardedSection sectionKey="management">
        <Story />
      </GuardedSection>
    </AppShell>
  );
};

const meta = {
  id: "t07-1-management-hub",
  title: "T07.1/Management Hub",
  component: ManagementHub,
  decorators: [withManagementPresentation],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/management",
        query: {},
      },
    },
    a11y: {
      test: "error",
    },
  },
} satisfies Meta<typeof ManagementHub>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultPresentation = {
  screenId: "management-hub",
  psn: "PSN-MGMT-HUB-DEFAULT",
  productFamily: "management",
  lifecycle: "active",
  baseline: "primary",
  route: "/management",
  intent: null,
  state: "default",
  gap: null,
  supersedes: [],
};

export const Default: Story = {
  parameters: {
    presentation: defaultPresentation,
    msw: [authMeHandler, managementHubHandler(MANAGEMENT_HUB_DEFAULT)],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole("heading", {
      level: 1,
      name: COPY.management.managementTitle,
    });
    await expect(heading).toBeVisible();
    const approvals = await canvas.findByRole("link", {
      name: new RegExp(COPY.management.approvalsRow, "u"),
    });
    await expect(approvals).toHaveAttribute(
      "href",
      "/management?module=approvals"
    );
    await userEvent.click(approvals);
    await expect(approvals).toBeVisible();
  },
};

export const Loading: Story = {
  parameters: {
    presentation: {
      screenId: "management-hub",
      psn: "PSN-MGMT-HUB-LOADING",
      productFamily: "management",
      lifecycle: "active",
      baseline: "supporting",
      route: "/management",
      intent: null,
      state: "loading",
      gap: null,
      supersedes: [],
    },
    msw: [authMeHandler, managementHubLoadingHandler],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const loading = await canvas.findByText(COPY.management.loading);
    await expect(loading).toBeVisible();
  },
};

export const Empty: Story = {
  parameters: {
    presentation: {
      screenId: "management-hub",
      psn: "PSN-MGMT-HUB-EMPTY",
      productFamily: "management",
      lifecycle: "active",
      baseline: "supporting",
      route: "/management",
      intent: null,
      state: "empty",
      gap: null,
      supersedes: [],
    },
    msw: [authMeHandler, managementHubHandler(MANAGEMENT_HUB_EMPTY)],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const empty = await canvas.findByRole("heading", {
      level: 2,
      name: COPY.management.emptyTitle,
    });
    await expect(empty).toBeVisible();
  },
};

export const RecoverableError: Story = {
  parameters: {
    presentation: {
      screenId: "management-hub",
      psn: "PSN-MGMT-HUB-RECOVERABLE-ERROR",
      productFamily: "management",
      lifecycle: "active",
      baseline: "supporting",
      route: "/management",
      intent: null,
      state: "recoverable-error",
      gap: null,
      supersedes: [],
    },
    msw: [authMeHandler, managementHubRecoverableErrorHandler],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const retry = await canvas.findByRole("button", {
      name: COPY.management.retry,
    });
    await expect(retry).toBeVisible();
    await userEvent.click(retry);
    const retryAfterReload = await canvas.findByRole("button", {
      name: COPY.management.retry,
    });
    await expect(retryAfterReload).toBeVisible();
  },
};
