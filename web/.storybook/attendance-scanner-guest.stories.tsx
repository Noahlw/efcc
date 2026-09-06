import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import EventsPage from "@/app/events/page";
import GuestCheckInPage from "@/app/guest-check-in/page";
import ScannerPage from "@/app/scanner/page";
import { COPY } from "@/lib/copy";

import { attendanceScannerGuestHandlers } from "./attendance-scanner-guest-fixtures";

const withAuthenticatedPresentation: Decorator = (Story, context) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");

    const navigation = context.parameters.nextjs?.navigation as
      | { pathname?: string; query?: Record<string, string> }
      | undefined;
    if (navigation?.pathname) {
      const query = new URLSearchParams(navigation.query ?? {}).toString();
      window.history.replaceState(
        null,
        "",
        `${navigation.pathname}${query ? `?${query}` : ""}`
      );
    }
  }
  return <Story />;
};

const meta = {
  id: "t07-5-attendance-scanner-guest",
  title: "T07.5/Attendance Scanner Guest",
  component: ScannerPage,
  parameters: {
    a11y: { test: "error" },
  },
} satisfies Meta<typeof ScannerPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GuestCheckIn: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <GuestCheckInPage />,
  parameters: {
    presentation: {
      screenId: "attendance-guest-check-in",
      psn: "PSN-ATTENDANCE-GUEST-CHECK-IN",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "primary",
      route: "/guest-check-in",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/guest-check-in", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
  },
};

export const ScannerBoundary: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <ScannerPage />,
  parameters: {
    presentation: {
      screenId: "attendance-scanner-boundary",
      psn: "PSN-ATTENDANCE-SCANNER-BOUNDARY",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "primary",
      route: "/scanner",
      intent: "mode=self",
      state: "boundary-self",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/scanner", query: { mode: "self" } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole("tablist")).resolves.toBeVisible();
    await expect(
      canvas.findByRole("tab", { name: COPY.attendance.selfMode })
    ).resolves.toBeVisible();
  },
};

export const AssistedCheckIn: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <ScannerPage />,
  parameters: {
    presentation: {
      screenId: "attendance-assisted-check-in",
      psn: "PSN-ATTENDANCE-ASSISTED-CHECK-IN",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "primary",
      route: "/scanner",
      intent: "mode=assisted&event=t07-5-event",
      state: "assisted",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/scanner",
        query: { mode: "assisted", event: "t07-5-event" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("textbox", { name: COPY.attendance.memberSearch })
    ).resolves.toBeVisible();
  },
};

export const AttendanceOperator: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <EventsPage />,
  parameters: {
    presentation: {
      screenId: "attendance-operator",
      psn: "PSN-ATTENDANCE-OPERATOR",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "primary",
      route: "/events",
      intent: null,
      state: "chooser",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/events", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { name: COPY.attendance.chooserTitle })
    ).resolves.toBeVisible();
  },
};

export const AttendanceOperatorRoster: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <EventsPage />,
  parameters: {
    presentation: {
      screenId: "attendance-operator-roster",
      psn: "PSN-ATTENDANCE-OPERATOR-ROSTER",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "primary",
      route: "/events",
      intent: "event=t07-5-event",
      state: "roster",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/events", query: { event: "t07-5-event" } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
  },
};
