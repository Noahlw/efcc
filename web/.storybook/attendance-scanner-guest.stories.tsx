import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import EventsPage from "@/app/events/page";
import GuestCheckInPage from "@/app/guest-check-in/page";
import ScannerPage from "@/app/scanner/page";
import { COPY } from "@/lib/copy";

import { attendanceScannerGuestHandlers } from "./attendance-scanner-guest-fixtures";
import { ATTENDANCE_SCANNER_GUEST_PRESENTATION as PRESENTATION } from "./attendance-scanner-guest.story-contract";

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
      psn: PRESENTATION.guestCheckIn.psn,
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
      psn: PRESENTATION.scannerBoundary.psn,
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
      psn: PRESENTATION.assistedCheckIn.psn,
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
      psn: PRESENTATION.operator.psn,
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
      psn: PRESENTATION.operatorRoster.psn,
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
