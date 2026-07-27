import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramCatalogView } from "../src/views/ProgramCatalogView";
import { ProgramEnrollmentView } from "../src/views/ProgramEnrollmentView";
import { apiService } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  apiService: {
    getProgramsCatalog: vi.fn(),
    getAvailablePrograms: vi.fn(),
    enrollUser: vi.fn(),
    cancelEnrollment: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiService);

const programs = [
  {
    programId: "PROG-001",
    title: "Sunday Worship",
    type: "Worship",
    description: "Weekly worship gathering.",
  },
  {
    programId: "PROG-002",
    title: "Youth Fellowship",
    type: "Youth",
    description: "Friday evening fellowship.",
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
    const onViewEnrollment = vi.fn();

    render(
      <ProgramCatalogView
        onBack={vi.fn()}
        onViewEnrollment={onViewEnrollment}
      />
    );

    expect(await screen.findByText("Sunday Worship")).toBeInTheDocument();
    expect(screen.getByText("Youth Fellowship")).toBeInTheDocument();
    expect(screen.getByText("Worship")).toBeInTheDocument();
    expect(screen.getByText("Youth")).toBeInTheDocument();

    const youthCard = screen.getByText("Youth Fellowship").closest("article");
    expect(youthCard).not.toBeNull();
    fireEvent.click(
      within(youthCard as HTMLElement).getByRole("button", {
        name: /view details \/ enroll/i,
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
        onBack={vi.fn()}
      />
    );

    expect(await screen.findByText("Not enrolled")).toBeInTheDocument();
    expect(screen.getByText("Enrolled")).toBeInTheDocument();

    const worshipCard = screen.getByText("Sunday Worship").closest("article");
    expect(worshipCard).not.toBeNull();
    fireEvent.click(
      within(worshipCard as HTMLElement).getByRole("button", { name: "Enroll" })
    );
    await waitFor(() =>
      expect(mockedApi.enrollUser).toHaveBeenCalledWith("USER-1", "PROG-001")
    );
    expect(
      await screen.findByText("Enrollment completed.")
    ).toBeInTheDocument();

    const youthCard = screen.getByText("Youth Fellowship").closest("article");
    expect(youthCard).not.toBeNull();
    fireEvent.click(
      within(youthCard as HTMLElement).getByRole("button", {
        name: "Cancel Enrollment",
      })
    );
    await waitFor(() =>
      expect(mockedApi.cancelEnrollment).toHaveBeenCalledWith(
        "USER-1",
        "PROG-002"
      )
    );
    expect(
      await screen.findByText("Enrollment cancelled.")
    ).toBeInTheDocument();
  });

  it("shows the server conflict message and leaves the program unenrolled", async () => {
    mockedApi.getAvailablePrograms.mockResolvedValue([
      { ...programs[0], isEnrolled: false },
    ]);
    mockedApi.enrollUser.mockResolvedValue({
      success: false,
      message: "Youth Worship at 3:00 PM",
    });

    render(<ProgramEnrollmentView currentUserId="USER-1" onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Enroll" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Youth Worship at 3:00 PM"
    );
    expect(mockedApi.getAvailablePrograms).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Not enrolled")).toBeInTheDocument();
  });
});
