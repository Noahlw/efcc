import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

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
    await expect(
      canvas.findByRole("heading", { name: COPY.attendance.operatorTitle })
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole("textbox", { name: COPY.attendance.memberSearch })
    ).resolves.toBeVisible();
    // Synthetic Storybook evidence: 30 Chinese expected names at the live
    // roster boundary, with explicit expected-member and addition actions.
    await expect(
      canvas.findAllByRole("button", {
        name: COPY.attendance.checkInMember,
      })
    ).resolves.toHaveLength(29);
    await userEvent.type(
      canvas.getByRole("textbox", { name: COPY.attendance.memberSearch }),
      "Storybook"
    );
    await userEvent.click(
      canvas.getByRole("button", { name: COPY.attendance.search })
    );
    await expect(
      canvas.findByRole("button", {
        name: /Storybook Member.*替成員簽到/u,
      })
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole("button", {
        name: /Storybook Addition.*新增並簽到/u,
      })
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: /全部/u }));
    await expect(
      canvasElement.querySelectorAll("[data-attendance-expected-row]")
    ).toHaveLength(30);
    await expect(
      canvas.findByRole("heading", {
        name: COPY.attendance.rosterAdditionalTitle,
      })
    ).resolves.toBeVisible();
    await expect(canvas.findAllByText("訪客 林寶怡")).resolves.toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "訪客 林寶怡" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.findByRole("dialog", {
        name: COPY.attendance.participantDetailTitle,
      })
    ).resolves.toBeVisible();
    await userEvent.click(
      body.getByRole("button", { name: COPY.attendance.correctGuest })
    );
    await userEvent.clear(
      body.getByRole("textbox", { name: COPY.attendance.correctionReason })
    );
    await userEvent.type(
      body.getByRole("textbox", { name: COPY.attendance.correctionReason }),
      "Storybook correction"
    );
    await userEvent.click(
      body.getByRole("button", { name: COPY.attendance.saveCorrection })
    );
    await expect(
      body.findByText(COPY.attendance.correctionSaved)
    ).resolves.toBeVisible();
  },
};

export const AttendanceOperatorPostEvent: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <EventsPage />,
  parameters: {
    presentation: {
      screenId: "attendance-operator-roster",
      psn: "PSN-ATTENDANCE-OPERATOR-POST-EVENT",
      productFamily: "attendance-scanner-guest",
      lifecycle: "active",
      baseline: "supporting",
      route: "/events",
      intent: "event=t07-5-post-event",
      state: "post-event-synthetic",
      gap: null,
      supersedes: [],
    },
    msw: attendanceScannerGuestHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/events",
        query: { event: "t07-5-post-event" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Synthetic Storybook evidence: a settled 30-person post-event roster
    // keeps Absent, Excused, Present, and Guest as separate views.
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText(COPY.attendance.rosterPostEventFilterHint)
    ).resolves.toBeVisible();
    const absentTab = await canvas.findByRole("tab", { name: /缺席 \(12\)/u });
    await expect(absentTab).toHaveAttribute("aria-selected", "true");
    await expect(
      canvasElement.querySelectorAll("[data-attendance-expected-row]")
    ).toHaveLength(12);
    await expect(
      canvas.queryByRole("button", {
        name: COPY.attendance.eventCheckInSheetOpen,
      })
    ).toBeNull();

    await userEvent.click(canvas.getByRole("tab", { name: /全部 \(31\)/u }));
    await expect(
      canvasElement.querySelectorAll("[data-attendance-expected-row]")
    ).toHaveLength(30);
    await expect(
      canvas.getByRole("tab", { name: /已出席 \(10\)/u })
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: /請假 \(8\)/u })
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: /訪客 \(1\)/u })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: /已出席 \(10\)/u }));
    await expect(
      canvasElement.querySelectorAll("[data-attendance-expected-row]")
    ).toHaveLength(10);
    await userEvent.click(canvas.getByRole("tab", { name: /請假 \(8\)/u }));
    await expect(
      canvasElement.querySelectorAll("[data-attendance-expected-row]")
    ).toHaveLength(8);
    await userEvent.click(canvas.getByRole("tab", { name: /訪客 \(1\)/u }));
    await expect(
      canvasElement.querySelectorAll("[data-attendance-additional-row]")
    ).toHaveLength(1);
  },
};
