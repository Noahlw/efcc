import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";

import { ParticipantEventDetail } from "./participant-event-detail";

const event = {
  event_id: "event-1",
  program_id: "program-1",
  starts_at: "2099-03-04T11:30:00.000Z",
  ends_at: "2099-03-04T13:00:00.000Z",
  status: "Active" as const,
  source: "SCHEDULE" as const,
  name: "第三課聚會",
  location: "二樓禮堂",
  check_in_window_opens_at: "2099-03-04T10:30:00.000Z",
  check_in_window_closes_at: "2099-03-04T14:00:00.000Z",
};

describe(ParticipantEventDetail, () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("renders event context and a prebound self-scanner CTA", () => {
    render(
      <ParticipantEventDetail
        event={event}
        programName="門徒訓練基礎課"
        onBack={vi.fn<() => void>()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "第三課聚會" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("門徒訓練基礎課", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText("二樓禮堂")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.eventDetailStatusUpcoming)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.programs.eventDetailScan })
    ).toHaveAttribute("href", "/scanner?mode=self&event=event-1");
  });
});
