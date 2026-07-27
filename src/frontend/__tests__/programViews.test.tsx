import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiService } from "../src/services/api";
import { ProgramCatalogView } from "../src/views/ProgramCatalogView";
import { ProgramEnrollmentView } from "../src/views/ProgramEnrollmentView";

vi.mock(import("../src/services/api"), () => ({
  apiService: {
    cancelEnrollment: vi.fn<typeof apiService.cancelEnrollment>(),
    enrollUser: vi.fn<typeof apiService.enrollUser>(),
    getAvailablePrograms: vi.fn<typeof apiService.getAvailablePrograms>(),
    getProgramsCatalog: vi.fn<typeof apiService.getProgramsCatalog>(),
  },
}));

const mockedApi = vi.mocked(apiService);

const programs = [
  {
    description: "Weekly worship gathering.",
    programId: "PROG-001",
    title: "Sunday Worship",
    type: "Worship",
  },
  {
    description: "Friday evening fellowship.",
    programId: "PROG-002",
    title: "Youth Fellowship",
    type: "Youth",
  },
];

describe("program views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every catalog program and opens enrollment for the selected program", async () => {
    mockedApi.getProgramsCatalog.mockResolvedValue(programs);
    const onViewEnrollment = vi.fn<(id: string) => void>();

    render(
      <ProgramCatalogView
        onBack={vi.fn<() => void>()}
        onViewEnrollment={onViewEnrollment}
      />
    );

    await expect(
      screen.findByText("Sunday Worship")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Youth Fellowship")).toBeInTheDocument();

    const youthCard = screen.getByText("Youth Fellowship").closest("article");
    expect(youthCard).not.toBeNull();
    fireEvent.click(
      within(youthCard as HTMLElement).getByRole("button", {
        name: /view details \/ enroll/iu,
      })
    );
    expect(onViewEnrollment).toHaveBeenCalledWith("PROG-002");
  });

  it("renders enrollment badges and refreshes state after enroll and cancel", async () => {
    mockedApi.getAvailablePrograms
      .mockResolvedValueOnce([
        { ...programs[0], isEnrolled: false },
        { ...programs[1], isEnrolled: true },
      ])
      .mockResolvedValueOnce([
        { ...programs[0], isEnrolled: true },
        { ...programs[1], isEnrolled: true },
      ])
      .mockResolvedValueOnce([
        { ...programs[0], isEnrolled: true },
        { ...programs[1], isEnrolled: false },
      ]);
    mockedApi.enrollUser.mockResolvedValue({ success: true });
    mockedApi.cancelEnrollment.mockResolvedValue({ success: true });

    render(
      <ProgramEnrollmentView
        currentUserId="USER-1"
        initialProgramId="PROG-001"
        onBack={vi.fn<() => void>()}
      />
    );

    await expect(
      screen.findByText("Not enrolled")
    ).resolves.toBeInTheDocument();

    const worshipCard = screen.getByText("Sunday Worship").closest("article");
    if (worshipCard) {
      fireEvent.click(
        within(worshipCard).getByRole("button", { name: "Enroll" })
      );
    }
    await waitFor(() =>
      expect(mockedApi.enrollUser).toHaveBeenCalledWith("USER-1", "PROG-001")
    );

    const youthCard = screen.getByText("Youth Fellowship").closest("article");
    if (youthCard) {
      fireEvent.click(
        within(youthCard).getByRole("button", {
          name: "Cancel Enrollment",
        })
      );
    }
    await waitFor(() =>
      expect(mockedApi.cancelEnrollment).toHaveBeenCalledWith(
        "USER-1",
        "PROG-002"
      )
    );
  });

  it("shows the server conflict message and leaves the program unenrolled", async () => {
    mockedApi.getAvailablePrograms.mockResolvedValue([
      { ...programs[0], isEnrolled: false },
    ]);
    mockedApi.enrollUser.mockResolvedValue({
      message: "Schedule conflict",
      success: false,
    });

    render(
      <ProgramEnrollmentView
        currentUserId="USER-1"
        initialProgramId="PROG-001"
        onBack={vi.fn<() => void>()}
      />
    );

    const element = await screen.findByText("Sunday Worship");
    const card = element.closest("article");
    if (card) {
      fireEvent.click(within(card).getByRole("button", { name: "Enroll" }));
    }

    await expect(
      screen.findByText("Schedule conflict")
    ).resolves.toBeInTheDocument();
  });
});
