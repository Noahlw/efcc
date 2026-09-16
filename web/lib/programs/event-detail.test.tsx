/* oxlint-disable vitest/max-expects, vitest/require-mock-type-parameters, vitest/require-top-level-describe, vitest/prefer-called-with, vitest/prefer-mock-promise-shorthand, eslint/require-await */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { EventDetail } from "@/lib/programs/event-detail";
import type { EventDetail as EventDetailData } from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => ({
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventAvailability: vi.fn(),
  cancelEvent: vi.fn(),
  getProgramAttendanceArtifact: vi.fn(),
  getOwnAttendance: vi.fn(),
  isUnknownMutationOutcome: vi.fn(() => false),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
  setEventAvailability: mocks.setEventAvailability,
  cancelEvent: mocks.cancelEvent,
  getProgramAttendanceArtifact: mocks.getProgramAttendanceArtifact,
  getOwnAttendance: mocks.getOwnAttendance,
  isUnknownMutationOutcome: mocks.isUnknownMutationOutcome,
}));

const detailFixture = (
  overrides: Partial<EventDetailData> = {}
): EventDetailData => ({
  event: {
    event_id: "event-1",
    program_id: "program-1",
    program_name: "顯恩堂主日學",
    starts_at: "2026-09-12T10:00:00.000Z",
    ends_at: "2026-09-12T11:30:00.000Z",
    status: "Active",
    availability: "Active",
    source: "MANUAL",
    name: "迎新聚會",
    location: "教會禮堂",
    manual_check_in_code: "ABCD1234",
    check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
    check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
    cancel_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    exception: null,
  },
  leaders: [
    {
      program_id: "program-1",
      user_id: "U001",
      role_definition_id: "role-1",
      label: "課程管理身份組",
      scope_kind: "Program",
      scope_id: "program-1",
      granted_by: "U000",
      granted_at: "2026-01-01T00:00:00.000Z",
      revoked_by: null,
      revoked_at: null,
      user_name: "陳大文",
      username: "taiwan",
    },
    {
      program_id: "program-1",
      user_id: "U001",
      role_definition_id: "role-2",
      label: "另一個課程身份組",
      scope_kind: "Program",
      scope_id: "program-1",
      granted_by: "U000",
      granted_at: "2026-01-02T00:00:00.000Z",
      revoked_by: null,
      revoked_at: null,
      user_name: "陳大文",
      username: "taiwan",
    },
  ],
  participant_summary: { active_enrollments: 3, checked_in: 2 },
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function clickMoreAction(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp
) {
  await user.click(
    await screen.findByRole("button", { name: COPY.programs.eventMoreActions })
  );
  await user.click(await screen.findByRole("menuitem", { name }));
}

describe("EVT-01 event detail", () => {
  beforeEach(() => {
    mocks.getOwnAttendance.mockResolvedValue({
      state: "Not Yet",
      attendance: null,
      disposition: null,
    });
  });

  test("loads and projects identity, participant summary, and leaders", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("教會禮堂")).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.programs.eventActiveEnrollments.replace("{count}", "3")
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.eventCheckedIn.replace("{count}", "2"))
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventAttendanceViewRecord,
      })
    ).toHaveAttribute("href", "/events?eventId=event-1");
    expect(
      screen.getByText(COPY.attendance.eventAttendanceLead)
    ).toBeInTheDocument();
    expect(screen.getAllByText("陳大文")).toHaveLength(2);
    expect(screen.getByText("課程管理身份組")).toBeInTheDocument();
    expect(screen.getByText("另一個課程身份組")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("listitem", {
        name: "陳大文，身份組：課程管理身份組",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", {
        name: "陳大文，身份組：另一個課程身份組",
      })
    ).toBeInTheDocument();
    expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-1");
  });

  test("manager primary action follows future, open, past, and cancelled phases", async () => {
    const now = Date.now();
    const future = {
      ...detailFixture().event,
      event_id: "future-event",
      starts_at: new Date(now + 2 * 60 * 60_000).toISOString(),
      ends_at: new Date(now + 3 * 60 * 60_000).toISOString(),
      check_in_window_opens_at: new Date(now + 90 * 60_000).toISOString(),
      check_in_window_closes_at: new Date(now + 3 * 60 * 60_000).toISOString(),
    };
    const open = {
      ...future,
      event_id: "open-event",
      starts_at: new Date(now - 30 * 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      check_in_window_opens_at: new Date(now - 45 * 60_000).toISOString(),
      check_in_window_closes_at: new Date(now + 30 * 60_000).toISOString(),
    };
    const cancelled = {
      ...future,
      event_id: "cancelled-event",
      status: "Cancelled" as const,
    };
    const mount = async (event: EventDetailData["event"]) => {
      cleanup();
      mocks.getEvent.mockResolvedValue(detailFixture({ event }));
      render(
        <EventDetail
          programId="program-1"
          eventId={event.event_id}
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await screen.findByRole("heading", { name: event.name ?? "" });
    };

    await mount(future);
    expect(
      screen.getByRole("button", {
        name: COPY.attendance.eventCheckInSheetOpen,
      })
    ).toBeInTheDocument();

    await mount(open);
    expect(
      screen.getByRole("link", { name: COPY.attendance.eventAttendanceOpen })
    ).toHaveAttribute("href", "/events?eventId=open-event");

    await mount(detailFixture().event);
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventAttendanceViewRecord,
      })
    ).toHaveAttribute("href", "/events?eventId=event-1");

    await mount(cancelled);
    expect(
      screen.queryByRole("button", { name: COPY.programs.eventMoreActions })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.attendance.eventCheckInSheetOpen,
      })
    ).not.toBeInTheDocument();
  });

  test("opens the current Event QR code with Program QR and manual code", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
    await expect(
      screen.findByTestId("event-check-in-sheet")
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByAltText(COPY.attendance.eventCheckInSheetQrLabel)
    ).resolves.toBeVisible();
    expect(screen.getByText("ABCD1234")).toBeVisible();
    expect(mocks.getProgramAttendanceArtifact).toHaveBeenCalledWith(
      "program-1"
    );
  });

  test("future manager Event with no manual code still exposes one unavailable Event QR state with Retry", async () => {
    const now = Date.now();
    const futureEvent = {
      ...detailFixture().event,
      starts_at: new Date(now + 2 * 60 * 60_000).toISOString(),
      ends_at: new Date(now + 3 * 60 * 60_000).toISOString(),
      check_in_window_opens_at: new Date(now + 90 * 60_000).toISOString(),
      check_in_window_closes_at: new Date(now + 3 * 60 * 60_000).toISOString(),
      manual_check_in_code: null,
    } as EventDetailData["event"];
    mocks.getEvent.mockResolvedValue(detailFixture({ event: futureEvent }));
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    const openQr = await screen.findByRole("button", {
      name: COPY.attendance.eventCheckInSheetOpen,
    });
    await user.click(openQr);
    await expect(
      screen.findByText(COPY.attendance.eventCheckInSheetUnavailable)
    ).resolves.toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.error.retry })
    ).toBeVisible();
    expect(
      screen.queryByAltText(COPY.attendance.eventCheckInSheetQrLabel)
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: COPY.error.retry }));
    expect(mocks.getProgramAttendanceArtifact).not.toHaveBeenCalled();
  });

  test("keeps current Event facts in downloaded and printed QR artifacts", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const user = userEvent.setup();
    const downloaded: Blob[] = [];
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob) => {
        downloaded.push(value);
        return "blob:event-qr";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const printDocument = document.implementation.createHTMLDocument();
    const print = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: printDocument,
      focus: vi.fn(),
      print,
    } as unknown as Window);

    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );

      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      const qrImage = await screen.findByAltText(
        COPY.attendance.eventCheckInSheetQrLabel
      );
      fireEvent.load(qrImage);
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetDownload,
        })
      );
      expect(downloaded).toHaveLength(1);
      const downloadedSvg = await downloaded[0]?.text();
      expect(downloadedSvg).toContain("迎新聚會");
      expect(downloadedSvg).toContain("顯恩堂主日學");
      expect(downloadedSvg).toContain("教會禮堂");
      expect(downloadedSvg).toContain("ABCD1234");
      expect(
        screen.getByText(COPY.attendance.eventQrCodeDownloadSuccess)
      ).toBeVisible();

      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetPrint,
        })
      );
      const printImage = printDocument.querySelector("img");
      expect(printImage).not.toBeNull();
      printImage?.dispatchEvent(new Event("load"));
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintSuccess)
      ).resolves.toBeVisible();
      expect(printDocument.body.textContent).toContain("迎新聚會");
      expect(printDocument.body.textContent).toContain("顯恩堂主日學");
      expect(printDocument.body.textContent).toContain("教會禮堂");
      expect(printDocument.body.textContent).toContain("ABCD1234");
      expect(print).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
      anchorClick.mockRestore();
    }
  });

  test("wraps long Chinese Event facts in the downloaded SVG artifact", async () => {
    const longEvent = {
      ...detailFixture().event,
      name: "門徒訓練週會一二三四五六七八九十甲乙丙丁",
      program_name: "顯恩堂主日學課程資料及新朋友迎新聚會",
      location: "九龍長沙灣教會副堂禮堂入口旁集合處",
    } as EventDetailData["event"];
    mocks.getEvent.mockResolvedValue(detailFixture({ event: longEvent }));
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: longEvent.program_name,
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const downloaded: Blob[] = [];
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob) => {
        downloaded.push(value);
        return "blob:long-event-qr";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      const qrImage = await screen.findByAltText(
        COPY.attendance.eventCheckInSheetQrLabel
      );
      fireEvent.load(qrImage);
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetDownload,
        })
      );
      const downloadedSvg = await downloaded[0]?.text();
      expect(downloadedSvg).toContain('<tspan x="450" dy="52">');
      expect(downloadedSvg).toContain(longEvent.location);
      const viewBox = downloadedSvg.match(/viewBox="0 0 900 \d+"/u)?.[0];
      expect(viewBox).toBeDefined();
      const height = Number(viewBox?.slice(viewBox.lastIndexOf(" ") + 1, -1));
      expect(height).toBeGreaterThan(1120);
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
      anchorClick.mockRestore();
    }
  });

  test("Event QR generation exposes a retryable failure", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact
      .mockRejectedValueOnce(new Error("QR unavailable"))
      .mockResolvedValueOnce({
        artifact: {
          program_id: "program-1",
          program_name: "顯恩堂主日學",
          check_in_token: "program-token-1",
          can_rotate: false,
        },
      });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
    await expect(
      screen.findByText(COPY.attendance.eventQrCodeGenerateError)
    ).resolves.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: COPY.error.retry }));
    const qrImage = await screen.findByAltText(
      COPY.attendance.eventCheckInSheetQrLabel
    );
    fireEvent.load(qrImage);
    expect(qrImage).toBeVisible();
    expect(mocks.getProgramAttendanceArtifact).toHaveBeenCalledTimes(2);
  });

  test("Event QR image error exposes Retry before actions become ready", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
    const firstImage = await screen.findByAltText(
      COPY.attendance.eventCheckInSheetQrLabel
    );
    fireEvent.error(firstImage);
    await expect(
      screen.findByText(COPY.attendance.eventQrCodeImageError)
    ).resolves.toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.error.retry })
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: COPY.error.retry }));
    const retryImage = await screen.findByAltText(
      COPY.attendance.eventCheckInSheetQrLabel
    );
    fireEvent.load(retryImage);
    await expect(
      screen.findByTestId("event-qr-image-ready")
    ).resolves.toBeVisible();
    expect(mocks.getProgramAttendanceArtifact).toHaveBeenCalledTimes(2);
  });

  test("blocked Event QR print exposes Retry and recovers after the popup opens", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const printDocument = document.implementation.createHTMLDocument();
    const print = vi.fn();
    const open = vi
      .spyOn(window, "open")
      .mockReturnValueOnce(null)
      .mockReturnValue({
        document: printDocument,
        focus: vi.fn(),
        print,
      } as unknown as Window);
    const user = userEvent.setup();
    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      const qrImage = await screen.findByAltText(
        COPY.attendance.eventCheckInSheetQrLabel
      );
      fireEvent.load(qrImage);
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetPrint,
        })
      );
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintError)
      ).resolves.toBeVisible();
      await user.click(screen.getByRole("button", { name: COPY.error.retry }));
      const printImage = printDocument.querySelector("img");
      expect(printImage).not.toBeNull();
      printImage?.dispatchEvent(new Event("load"));
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintSuccess)
      ).resolves.toBeVisible();
      expect(print).toHaveBeenCalledOnce();
    } finally {
      open.mockRestore();
    }
  });

  test("waits for the print-window Event QR image before reporting print success", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const printDocument = document.implementation.createHTMLDocument();
    const print = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({
      document: printDocument,
      focus: vi.fn(),
      print,
    } as unknown as Window);
    const user = userEvent.setup();

    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      fireEvent.load(
        await screen.findByAltText(COPY.attendance.eventCheckInSheetQrLabel)
      );
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetPrint,
        })
      );

      const printImage = printDocument.querySelector("img");
      expect(printImage).not.toBeNull();
      expect(print).not.toHaveBeenCalled();
      expect(
        screen.queryByText(COPY.attendance.eventQrCodePrintSuccess)
      ).not.toBeInTheDocument();

      printImage?.dispatchEvent(new Event("load"));
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintSuccess)
      ).resolves.toBeVisible();
      expect(print).toHaveBeenCalledOnce();
    } finally {
      open.mockRestore();
    }
  });

  test("exposes Retry when the print-window Event QR image fails, then recovers", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const failedDocument = document.implementation.createHTMLDocument();
    const recoveredDocument = document.implementation.createHTMLDocument();
    const print = vi.fn();
    let openCount = 0;
    const open = vi.spyOn(window, "open").mockImplementation(() => {
      openCount += 1;
      const document = openCount === 1 ? failedDocument : recoveredDocument;
      return {
        document,
        focus: vi.fn(),
        print,
      } as unknown as Window;
    });
    const user = userEvent.setup();

    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      fireEvent.load(
        await screen.findByAltText(COPY.attendance.eventCheckInSheetQrLabel)
      );
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetPrint,
        })
      );

      const failedImage = failedDocument.querySelector("img");
      expect(failedImage).not.toBeNull();
      failedImage?.dispatchEvent(new Event("error"));
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintError)
      ).resolves.toBeVisible();
      expect(print).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: COPY.error.retry }));
      const recoveredImage = recoveredDocument.querySelector("img");
      expect(recoveredImage).not.toBeNull();
      recoveredImage?.dispatchEvent(new Event("load"));
      await expect(
        screen.findByText(COPY.attendance.eventQrCodePrintSuccess)
      ).resolves.toBeVisible();
      expect(print).toHaveBeenCalledOnce();
    } finally {
      open.mockRestore();
    }
  });

  test("cancelled Event QR download request exposes a retryable failure", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: "program-1",
        program_name: "顯恩堂主日學",
        check_in_token: "program-token-1",
        can_rotate: false,
      },
    });
    const user = userEvent.setup();
    let anchorClick: ReturnType<typeof vi.spyOn> | null = null;
    try {
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage
          onBack={() => {}}
          backHref="/programs"
        />
      );
      await clickMoreAction(user, COPY.attendance.eventCheckInSheetOpen);
      const qrImage = await screen.findByAltText(
        COPY.attendance.eventCheckInSheetQrLabel
      );
      fireEvent.load(qrImage);
      anchorClick = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {
          throw new Error("download-failed");
        });
      await user.click(
        screen.getByRole("button", {
          name: COPY.attendance.eventCheckInSheetDownload,
        })
      );
      await expect(
        screen.findByText(COPY.attendance.eventQrCodeDownloadError)
      ).resolves.toBeVisible();
    } finally {
      anchorClick?.mockRestore();
    }
  });

  test("renders the server-projected schedule exception", async () => {
    const exception = {
      exception_id: "exception-1",
      rule_id: "rule-1",
      override_date: "2026-08-11",
      action: "RESCHEDULE" as const,
      new_start_time: "20:30",
      new_end_time: "22:00",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    mocks.getEvent.mockResolvedValue(
      detailFixture({ event: { ...detailFixture().event, exception } })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.getByText(
        COPY.programs.eventRescheduledBadge.replace("{time}", "20:30")
      )
    ).toBeInTheDocument();
  });

  test("back button returns to the list", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    const onBack = vi.fn();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={onBack}
        backHref="/programs"
      />
    );
    const back = await screen.findByRole("link", {
      name: COPY.programs.eventDetailBack,
    });
    expect(back).toHaveAttribute("href", "/programs");
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("edit form saves identity changes without changing the schedule", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    const onAttentionRefresh = vi.fn();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
        onAttentionRefresh={onAttentionRefresh}
      />
    );
    await clickMoreAction(user, COPY.programs.eventEditTitle);
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.type(
      screen.getByLabelText(COPY.programs.eventIdentityChangeReason),
      "更正聚會資料"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(onAttentionRefresh).toHaveBeenCalledOnce();
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      name: "改名聚會",
      location: "教會禮堂",
      event_type: "崇拜",
      reason: "更正聚會資料",
    });
  });

  test("opens the requested management action from an Event deep link", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        eventAction="reschedule"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByTestId("event-edit-form")
    ).resolves.toHaveAttribute("data-edit-intent", "reschedule");
    expect(
      screen.queryByLabelText(COPY.programs.eventName)
    ).not.toBeInTheDocument();
  });

  test("does not reopen a deep-link edit after the saved Event changes type", async () => {
    const initial = detailFixture();
    mocks.getEvent.mockResolvedValueOnce(initial).mockResolvedValueOnce(
      detailFixture({
        event: { ...initial.event, event_type: "小組" },
      })
    );
    mocks.updateEvent.mockResolvedValue({ event: initial.event });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        eventAction="edit"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await user.type(
      await screen.findByLabelText(COPY.programs.eventIdentityChangeReason),
      "更新聚會類型"
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(screen.queryByTestId("event-edit-form")).not.toBeInTheDocument();
  });

  test("reschedule form sends only schedule fields through its distinct intent", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.updateEvent.mockResolvedValue({
      event: {
        ...detailFixture().event,
        starts_at: "2026-09-13T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.programs.eventReschedule);
    expect(screen.getByTestId("event-edit-form")).toHaveAttribute(
      "data-edit-intent",
      "reschedule"
    );
    expect(
      screen.queryByLabelText(COPY.programs.eventName)
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(COPY.programs.eventStart));
    await user.type(
      screen.getByLabelText(COPY.programs.eventStart),
      "2026-09-13T18:00"
    );
    await user.clear(screen.getByLabelText(COPY.programs.eventEnd));
    await user.type(
      screen.getByLabelText(COPY.programs.eventEnd),
      "2026-09-13T19:30"
    );
    await user.clear(
      screen.getByLabelText(COPY.programs.eventCheckInWindowOpensAt)
    );
    await user.type(
      screen.getByLabelText(COPY.programs.eventCheckInWindowOpensAt),
      "2026-09-13T17:30"
    );
    await user.clear(
      screen.getByLabelText(COPY.programs.eventCheckInWindowClosesAt)
    );
    await user.type(
      screen.getByLabelText(COPY.programs.eventCheckInWindowClosesAt),
      "2026-09-13T20:00"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventRescheduleSave })
    );

    await expect(
      screen.findByText(COPY.programs.eventRescheduledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      starts_at: "2026-09-13T10:00:00.000Z",
      ends_at: "2026-09-13T11:30:00.000Z",
      check_in_window_opens_at: "2026-09-13T09:30:00.000Z",
      check_in_window_closes_at: "2026-09-13T12:00:00.000Z",
    });
  });

  test("a window-less event can be edited without inventing a check-in window", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          name: null,
          location: null,
          check_in_window_opens_at: null,
          check_in_window_closes_at: null,
        },
      })
    );
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventEditTitle);
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.type(
      screen.getByLabelText(COPY.programs.eventIdentityChangeReason),
      "補充聚會資料"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    // Edit intent owns identity fields only; it does not mutate schedule data.
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      name: "改名聚會",
      location: null,
      event_type: "崇拜",
      reason: "補充聚會資料",
    });
  });

  test("deactivation requires inline confirmation and offers Undo", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    // Inline confirmation replaces the button and takes focus. The count
    // names THIS event's open operations (active check-ins), not the
    // Program-wide enrollment count (3 in the fixture).
    const confirm = await screen.findByRole("button", {
      name: COPY.programs.eventAvailabilityConfirmProceed,
    });
    expect(document.activeElement).toBe(confirm);
    expect(
      screen.getByText(
        COPY.programs.eventAvailabilityConfirmBody.replace("{count}", "2")
      )
    ).toBeInTheDocument();
    await user.click(confirm);
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      "Inactive",
      true
    );
    const undo = screen.getByRole("button", {
      name: COPY.programs.eventAvailabilityUndo,
    });
    await user.click(undo);
    expect(mocks.setEventAvailability).toHaveBeenLastCalledWith(
      "program-1",
      "event-1",
      "Active"
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityRestoredNotice)
    ).resolves.toBeInTheDocument();
  });

  test("deactivates immediately with Undo when no event operations are affected", async () => {
    // Program-wide enrollments are NOT this event's operations: with zero
    // event check-ins the deactivation is immediate even when the Program
    // has unrelated active enrollments.
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        participant_summary: { active_enrollments: 3, checked_in: 0 },
      })
    );
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    ).not.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      "Inactive",
      false
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).toBeInTheDocument();
  });

  test("keeps a committed mutation successful and retries a failed readback", async () => {
    mocks.getEvent
      .mockResolvedValueOnce(
        detailFixture({
          participant_summary: { active_enrollments: 3, checked_in: 0 },
        })
      )
      .mockRejectedValueOnce(new Error("readback unavailable"));
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.workspaceEventsSavedStale)
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", {
      name: COPY.programs.workspaceRetryRefresh,
    });

    mocks.getEvent.mockResolvedValueOnce(detailFixture());
    await user.click(retry);
    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenCalledOnce();
    expect(mocks.getEvent).toHaveBeenCalledTimes(3);
  });

  test("an unrelated edit retires a stale availability Undo", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).toBeInTheDocument();

    // An unrelated identity edit must not leave the stale Undo clickable —
    // it would silently re-open availability the user never asked for.
    await clickMoreAction(user, COPY.programs.eventEditTitle);
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.type(
      screen.getByLabelText(COPY.programs.eventIdentityChangeReason),
      "更新聚會識別資料"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).not.toBeInTheDocument();
  });

  test("cancel without attendance shows the explicit confirmation and commits", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: false,
        } as EventDetailData["event"],
        participant_summary: { active_enrollments: 0, checked_in: 0 },
      })
    );
    mocks.cancelEvent.mockResolvedValue({
      event: { ...detailFixture().event, status: "Cancelled" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.cancelEvent);
    await expect(
      screen.findByText(COPY.programs.cancelMeetingConfirmTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cancelMeetingConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancel })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      null
    );
  });

  test("a cancelled detail shows the reason and stops offering management controls", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          status: "Cancelled",
          cancel_reason: "場地維修",
        },
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByText(
        COPY.programs.cancelledReason.replace("{reason}", "場地維修")
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("server confirmation refusal surfaces copy and keeps the detail", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockRejectedValue(
      new RpcError({
        code: "CONFIRMATION_REQUIRED",
        status: 409,
        title: "Confirmation required",
      })
    );
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityConfirmRequired)
    ).resolves.toBeInTheDocument();
  });

  test("a server confirmation refusal on a safe-looking summary surfaces the inline confirm", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        participant_summary: { active_enrollments: 0, checked_in: 0 },
      })
    );
    mocks.setEventAvailability
      .mockRejectedValueOnce(
        new RpcError({
          code: "CONFIRMATION_REQUIRED",
          status: 409,
          title: "Confirmation required",
          open_operations: 2,
        } as ProblemDetails)
      )
      .mockResolvedValueOnce({
        event: { ...detailFixture().event, availability: "Inactive" },
      });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    // The loaded summary looked safe, so the first attempt went out
    // without confirmation; the server's fresh count says otherwise.
    expect(mocks.setEventAvailability).toHaveBeenNthCalledWith(
      1,
      "program-1",
      "event-1",
      "Inactive",
      false
    );
    // The refusal must surface the inline confirm with the server's
    // fresh operation count — not a dead-end error.
    await expect(
      screen.findByText(
        COPY.programs.eventAvailabilityConfirmBody.replace("{count}", "2")
      )
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenNthCalledWith(
      2,
      "program-1",
      "event-1",
      "Inactive",
      true
    );
    expect(
      screen.queryByText(COPY.programs.eventAvailabilityConfirmRequired)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.eventAvailabilityUndo })
    ).toBeInTheDocument();
  });

  test("undo is retired when the event is cancelled", async () => {
    let cancelled = false;
    mocks.getEvent.mockImplementation(() =>
      Promise.resolve(
        cancelled
          ? detailFixture({
              event: {
                ...detailFixture().event,
                status: "Cancelled",
                cancel_reason: "場地維修",
              },
            })
          : detailFixture({
              participant_summary: { active_enrollments: 0, checked_in: 0 },
            })
      )
    );
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    mocks.cancelEvent.mockImplementation(async () => {
      cancelled = true;
      return { event: { ...detailFixture().event, status: "Cancelled" } };
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.eventAvailabilityDeactivate);
    await expect(
      screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).resolves.toBeInTheDocument();
    await clickMoreAction(user, COPY.programs.cancelEvent);
    await user.type(
      screen.getByLabelText(COPY.programs.cancelReason),
      "場地維修"
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.confirmCancelEvent,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    // The retired record must not keep offering availability Undo.
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
  });

  test("missing detail shows the load error with retry", async () => {
    mocks.getEvent.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404, title: "Not found" })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="missing"
        canManage={false}
        hash="#overview"
        onBack={() => {}}
        backHref="/programs#overview"
      />
    );
    await expect(
      screen.findByText(COPY.error.notFound)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: COPY.programs.eventDetailRecoveryTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventDetailViewProgram,
      })
    ).toHaveAttribute("href", "/programs?program=program-1#overview");
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventDetailBackToCatalog,
      })
    ).toHaveAttribute("href", "/programs");
    const retryDetail = detailFixture();
    retryDetail.event.event_id = "missing";
    mocks.getEvent.mockResolvedValue(retryDetail);
    await userEvent.click(
      screen.getByRole("button", { name: COPY.error.retry })
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
  });

  test("management recovery preserves the scoped Program return", async () => {
    mocks.getEvent.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404, title: "Not found" })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="missing"
        canManage
        departmentId="dept-1"
        hash="#events"
        onBack={() => {}}
        backHref="/programs?mode=management&department=dept-1&program=program-1&task=events#events"
      />
    );

    await expect(
      screen.findByRole("link", {
        name: COPY.programs.eventDetailViewProgram,
      })
    ).resolves.toHaveAttribute(
      "href",
      "/programs?mode=management&department=dept-1&program=program-1&task=events#events"
    );
  });

  test("non-managers see the read-only projection without action controls", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("a nameless event falls back to the COPY-composed program title", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: { ...detailFixture().event, name: null },
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByRole("heading", { name: "顯恩堂主日學 聚會" })
    ).resolves.toBeInTheDocument();
  });

  // 085-04 (#323) participant projection — Spec 085 US 23-24.
  test("participant projection shows badge + title/program/when/where + instructions + CTA", async () => {
    const now = Date.now();
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: new Date(now - 30 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 90 * 60_000).toISOString(),
        } as EventDetailData["event"],
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    // 可簽到 badge when the check-in window is currently open.
    await expect(
      screen.findByRole("status", {
        name: COPY.programs.checkInAvailable,
      })
    ).resolves.toBeInTheDocument();

    // Title + program name.
    expect(
      screen.getByRole("heading", { name: "迎新聚會" })
    ).toBeInTheDocument();
    expect(screen.getByText("顯恩堂主日學")).toBeInTheDocument();

    // When / where — icon-led card using the shared short HK formatter.
    expect(screen.getByText("9月12日（六）晚上 6:00–7:30")).toBeInTheDocument();
    expect(screen.getByText("教會禮堂")).toBeInTheDocument();
    const infoCard = screen.getByText("教會禮堂").closest("article");
    expect(infoCard).not.toBeNull();
    const icons = infoCard?.querySelectorAll("svg") ?? [];
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
      expect(icon).toHaveAttribute("stroke-width", "1.8");
    }
    expect(
      screen.queryByText(COPY.programs.detailEventTime)
    ).not.toBeInTheDocument();

    // Check-in instructions heading + body.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: COPY.programs.checkInInstructionsHeading,
      })
    ).toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.eventInstructions)
    ).resolves.toBeInTheDocument();

    // 前往掃描 CTA is sticky, full-width, and points at this event.
    const cta = await screen.findByRole("link", {
      name: COPY.programs.goToScan,
    });
    expect(cta).toHaveAttribute("href", "/scanner?event=event-1");
    expect(cta).toHaveAttribute("data-action-state", "available");
    expect(cta.parentElement).toHaveAttribute("data-action-bar");

    // No management controls.
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("participant open Event keeps the scan CTA with a pre-materialization Not Yet projection", async () => {
    const now = Date.now();
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: new Date(now - 60 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 30 * 60_000).toISOString(),
        } as EventDetailData["event"],
      })
    );
    mocks.getOwnAttendance.mockResolvedValueOnce({
      state: "Not Yet",
      attendance: null,
      disposition: null,
    });

    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByRole("link", { name: COPY.programs.goToScan })
    ).resolves.toHaveAttribute("href", "/scanner?event=event-1");
    expect(mocks.getOwnAttendance).toHaveBeenCalledWith("event-1");
  });

  test("participant projection omits the 可簽到 badge when the window is closed", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: "2027-01-01T09:30:00.000Z",
          check_in_window_closes_at: "2027-01-01T12:00:00.000Z",
        } as EventDetailData["event"],
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.queryByRole("status", { name: COPY.programs.checkInAvailable })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: COPY.programs.eventNotStarted })
    ).toBeInTheDocument();
    await expect(
      screen.findByText(/簽到時間尚未開始/u)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.attendance.eventAttendanceOpen })
    ).not.toBeInTheDocument();
  });

  test("participant Present state suppresses the scanner CTA", async () => {
    const now = Date.now();
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: new Date(now - 30 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 30 * 60_000).toISOString(),
        },
      })
    );
    mocks.getOwnAttendance.mockResolvedValue({
      state: "Present",
      attendance: { checked_in_at: new Date(now - 5 * 60_000).toISOString() },
      disposition: null,
    });
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByText(COPY.programs.participantAttendancePresent)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.participantAttendanceRecorded)
    ).toBeInTheDocument();
  });

  test("participant own-Attendance read failure keeps the CTA unconfirmed until Retry succeeds", async () => {
    const now = Date.now();
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: new Date(now - 30 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 30 * 60_000).toISOString(),
        },
      })
    );
    mocks.getOwnAttendance
      .mockRejectedValueOnce(new Error("attendance unavailable"))
      .mockResolvedValueOnce({
        state: "Not Yet",
        attendance: null,
        disposition: null,
      });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByText(COPY.programs.participantAttendanceError)
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: COPY.error.retry }));
    await expect(
      screen.findByRole("link", { name: COPY.programs.goToScan })
    ).resolves.toBeVisible();
    expect(mocks.getOwnAttendance).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["FORBIDDEN", COPY.programs.participantAttendanceForbidden],
    ["NOT_FOUND", COPY.programs.participantAttendanceNotFound],
  ] as const)(
    "participant own-Attendance %s response explains recovery and links to Program Detail",
    async (code, message) => {
      const now = Date.now();
      mocks.getEvent.mockResolvedValue(
        detailFixture({
          event: {
            ...detailFixture().event,
            check_in_window_opens_at: new Date(now - 30 * 60_000).toISOString(),
            check_in_window_closes_at: new Date(
              now + 30 * 60_000
            ).toISOString(),
          },
        })
      );
      mocks.getOwnAttendance.mockRejectedValueOnce(
        new RpcError({ code, status: code === "FORBIDDEN" ? 403 : 404 })
      );
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage={false}
          onBack={() => {}}
          backHref="/programs?program=program-1"
        />
      );

      await expect(screen.findByText(message)).resolves.toBeVisible();
      expect(
        screen.getByRole("link", {
          name: COPY.programs.eventDetailViewProgram,
        })
      ).toHaveAttribute("href", "/programs?program=program-1");
      expect(
        screen.queryByRole("link", { name: COPY.programs.goToScan })
      ).not.toBeInTheDocument();
    }
  );

  test("participant ended state does not show opening instructions", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          starts_at: "2026-09-12T10:00:00.000Z",
          ends_at: "2026-09-12T11:30:00.000Z",
          check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
          check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
        },
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByText(COPY.programs.eventInstructionsEnded)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.eventInstructionsClosed)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
  });

  test.each([
    ["Absent", COPY.programs.participantAttendanceAbsent],
    ["Excused", COPY.programs.participantAttendanceExcused],
  ] as const)(
    "participant ended %s state stays truthful and has no scan CTA",
    async (state, label) => {
      mocks.getEvent.mockResolvedValue(
        detailFixture({
          event: {
            ...detailFixture().event,
            starts_at: "2026-09-12T10:00:00.000Z",
            ends_at: "2026-09-12T11:30:00.000Z",
            check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
            check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
          },
        })
      );
      mocks.getOwnAttendance.mockResolvedValueOnce({
        state,
        attendance: null,
        disposition:
          state === "Excused"
            ? {
                disposition: "Excused",
                reason: "家庭事務",
                recorded_at: "2026-09-12T09:00:00.000Z",
              }
            : null,
      });
      render(
        <EventDetail
          programId="program-1"
          eventId="event-1"
          canManage={false}
          onBack={() => {}}
          backHref="/programs"
        />
      );

      await expect(screen.findByText(label)).resolves.toBeVisible();
      await expect(
        screen.findByText(COPY.programs.participantAttendanceRecorded)
      ).resolves.toBeVisible();
      expect(
        screen.queryByRole("link", { name: COPY.programs.goToScan })
      ).not.toBeInTheDocument();
    }
  );

  test("participant projection keeps cancelled Event history explicit without a scanner CTA", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          status: "Cancelled",
          cancel_reason: "場地維修",
          check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
          check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
        },
      })
    );
    mocks.getOwnAttendance.mockResolvedValue(null);
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByRole("status", {
        name: COPY.attendance.eventCancelled,
      })
    ).resolves.toBeVisible();
    expect(
      screen.getByText(
        COPY.programs.cancelledReason.replace("{reason}", "場地維修")
      )
    ).toBeVisible();
    expect(
      screen.getAllByText(COPY.attendance.eventCancelled).length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(COPY.programs.participantAttendance)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
    expect(mocks.getOwnAttendance).toHaveBeenCalledWith("event-1");
  });

  test("drops late Event A and own-attendance responses after rerendering Event B", async () => {
    const eventA = detailFixture({
      event: {
        ...detailFixture().event,
        event_id: "event-a",
        name: "聚會 A",
      },
    });
    const eventB = detailFixture({
      event: {
        ...detailFixture().event,
        event_id: "event-b",
        name: "聚會 B",
      },
    });
    const eventARequest = Promise.withResolvers<EventDetailData>();
    const eventBRequest = Promise.withResolvers<EventDetailData>();
    const attendanceARequest = Promise.withResolvers<{
      state: "Absent";
      attendance: null;
      disposition: null;
    }>();
    const attendanceBRequest = Promise.withResolvers<{
      state: "Present";
      attendance: { checked_in_at: string };
      disposition: null;
    }>();
    mocks.getEvent
      .mockReset()
      .mockImplementation((_programId, id) =>
        id === "event-a" ? eventARequest.promise : eventBRequest.promise
      );
    mocks.getOwnAttendance
      .mockReset()
      .mockImplementation((id) =>
        id === "event-a"
          ? attendanceARequest.promise
          : attendanceBRequest.promise
      );
    const { rerender } = render(
      <EventDetail
        programId="program-1"
        eventId="event-a"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await act(async () => {
      eventARequest.resolve(eventA);
      await eventARequest.promise;
    });
    await screen.findByRole("heading", { name: "聚會 A" });
    await vi.waitFor(() =>
      expect(mocks.getOwnAttendance).toHaveBeenCalledWith("event-a")
    );

    rerender(
      <EventDetail
        programId="program-1"
        eventId="event-b"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await vi.waitFor(() =>
      expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-b")
    );
    expect(
      screen.getByRole("heading", { name: COPY.programs.eventDetailLoading })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "聚會 A" })
    ).not.toBeInTheDocument();
    await act(async () => {
      eventBRequest.resolve(eventB);
      await eventBRequest.promise;
    });
    await screen.findByRole("heading", { name: "聚會 B" });
    await vi.waitFor(() =>
      expect(mocks.getOwnAttendance).toHaveBeenCalledWith("event-b")
    );
    await act(async () => {
      attendanceBRequest.resolve({
        state: "Present",
        attendance: { checked_in_at: "2026-09-16T10:00:00.000Z" },
        disposition: null,
      });
      await attendanceBRequest.promise;
      attendanceARequest.resolve({
        state: "Absent",
        attendance: null,
        disposition: null,
      });
      await attendanceARequest.promise;
    });

    expect(screen.getByRole("heading", { name: "聚會 B" })).toBeVisible();
    expect(
      screen.getByText(COPY.programs.participantAttendancePresent)
    ).toBeVisible();
    expect(
      screen.queryByText(COPY.programs.participantAttendanceAbsent)
    ).not.toBeInTheDocument();
  });

  test("keeps Event B authoritative and targets B-derived values after a late Event A response", async () => {
    const eventA = detailFixture({
      event: {
        ...detailFixture().event,
        event_id: "event-a",
        name: "聚會 A",
      },
    });
    const eventB = detailFixture({
      event: {
        ...detailFixture().event,
        event_id: "event-b",
        name: "聚會 B",
        location: "B 場地",
      },
      participant_summary: { active_enrollments: 0, checked_in: 0 },
    });
    const eventARequest = Promise.withResolvers<EventDetailData>();
    const eventBRequest = Promise.withResolvers<EventDetailData>();
    mocks.getEvent
      .mockReset()
      .mockImplementation((_programId, id) =>
        id === "event-a" ? eventARequest.promise : eventBRequest.promise
      );
    mocks.updateEvent.mockResolvedValue({ event: eventB.event });
    const user = userEvent.setup();
    const { rerender } = render(
      <EventDetail
        programId="program-1"
        eventId="event-a"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    rerender(
      <EventDetail
        programId="program-1"
        eventId="event-b"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await vi.waitFor(() =>
      expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-b")
    );
    await act(async () => {
      eventBRequest.resolve(eventB);
      await eventBRequest.promise;
    });
    await screen.findByRole("heading", { name: "聚會 B" });
    await act(async () => {
      eventARequest.resolve(eventA);
      await eventARequest.promise;
    });
    expect(
      screen.queryByRole("heading", { name: "聚會 A" })
    ).not.toBeInTheDocument();

    await clickMoreAction(user, COPY.programs.eventEditTitle);
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "聚會 B 更新");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );

    expect(mocks.updateEvent).toHaveBeenCalledWith(
      "program-1",
      "event-b",
      expect.objectContaining({ name: "聚會 B 更新", location: "B 場地" })
    );
  });

  test("participant cancelled Event without a reason keeps unavailable history and no scanner CTA", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          status: "Cancelled",
          cancel_reason: null,
        },
      })
    );
    mocks.getOwnAttendance.mockResolvedValue(null);
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByRole("status", { name: COPY.attendance.eventCancelled })
    ).resolves.toBeVisible();
    expect(screen.queryByText(/^取消原因：/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
  });

  test("participant projection keeps forbidden detail opaque and exposes no scanner CTA", async () => {
    mocks.getEvent.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.programs.backToOrigin })
    ).toHaveAttribute("href", "/programs");
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
  });

  test("loaded management detail uses the shared focused header grammar", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      document.querySelector(
        '[data-screen-foundation="header"][data-screen-level="child"]'
      )
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "迎新聚會" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "迎新聚會" })
    ).not.toBeInTheDocument();
  });

  test("participant projection back uses the supplied onBack callback (history.back wrapper)", async () => {
    const onBack = vi.fn<() => void>();
    mocks.getEvent.mockResolvedValue(detailFixture());
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={onBack}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("link", { name: COPY.programs.backToOrigin })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("086-03 editing a meeting with attendance succeeds and acknowledges the recorded change", async () => {
    const meeting = {
      ...detailFixture().event,
      has_attendance: true,
      name: "已有出席聚會",
    } as EventDetailData["event"];
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: meeting,
        participant_summary: { active_enrollments: 2, checked_in: 1 },
      })
    );
    mocks.updateEvent.mockResolvedValue({
      event: { ...meeting, name: "更正後聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, /編輯聚會/u);
    const nameInput = screen.getByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "更正後聚會");
    await user.type(
      screen.getByLabelText(COPY.programs.eventIdentityChangeReason),
      "記錄出席後更正原因"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.updateEvent).toHaveBeenCalled();
  });

  test("086-03 cancelling a meeting with attendance is refused without calling cancel", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: true,
        } as EventDetailData["event"],
        participant_summary: { active_enrollments: 2, checked_in: 1 },
      })
    );
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.cancelEvent);
    await expect(
      screen.findByText(COPY.programs.cancelBlockedWithAttendance)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).not.toHaveBeenCalled();
  });

  test("086-03 cancelling a meeting without attendance shows explicit confirm and supports keep or commit", async () => {
    let cancelled = false;
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: false,
          status: cancelled ? "Cancelled" : "Active",
        } as EventDetailData["event"],
        participant_summary: {
          active_enrollments: 0,
          checked_in: 0,
        },
      })
    );
    mocks.cancelEvent.mockImplementation(async () => {
      cancelled = true;
      return { event: { ...detailFixture().event, status: "Cancelled" } };
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.cancelEvent);
    await expect(
      screen.findByText(COPY.programs.cancelMeetingConfirmTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cancelMeetingConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.keepMeeting })
    );
    expect(mocks.cancelEvent).not.toHaveBeenCalled();
    rerender(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await clickMoreAction(user, COPY.programs.cancelEvent);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancel })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      null
    );
    expect(cancelled).toBeTruthy();
  });

  test("invokes onAuthRequired when event load returns AUTH_REQUIRED", async () => {
    const onAuthRequired = vi.fn();
    mocks.getEvent.mockRejectedValue(
      new RpcError({
        type: "https://efcc.example/problems/auth-required",
        title: "Auth Required",
        status: 401,
        code: "AUTH_REQUIRED",
        detail: "登入逾時",
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
        onAuthRequired={onAuthRequired}
      />
    );
    await vi.waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
  });
});
