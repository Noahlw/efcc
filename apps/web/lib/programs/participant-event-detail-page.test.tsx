import { cleanup, render, screen } from "@testing-library/react";
import type { MouseEventHandler } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";

interface EventDetailProbeProps {
  backHref: string;
  backReplace?: boolean;
  onBack?: MouseEventHandler<HTMLAnchorElement>;
}

const mocks = vi.hoisted(() => ({
  eventDetailProps: null as EventDetailProbeProps | null,
  pathname: "/programs",
  historyBack: vi.fn<() => void>(),
  router: {
    replace: vi.fn<(href: string) => void>(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));

vi.mock("./event-detail", () => ({
  EventDetail: (props: EventDetailProbeProps) => {
    mocks.eventDetailProps = props;
    return (
      <a
        href={props.backHref}
        data-testid="event-detail-back"
        onClick={props.onBack}
      >
        {COPY.programs.backToEntry}
      </a>
    );
  },
}));

import { ParticipantEventDetailPage } from "./participant-event-detail-page";

beforeEach(() => {
  mocks.eventDetailProps = null;
  mocks.pathname = "/programs";
  mocks.historyBack.mockReset();
  mocks.router.replace.mockReset();
  window.history.replaceState(null, "", "/programs");
  vi.spyOn(window.history, "back").mockImplementation(mocks.historyBack);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PUI-05 participant Event Detail origin and Back contract", () => {
  test.each([
    ["home", "/home"],
    ["notices", "/notices"],
    ["messages", "/messages"],
    ["programs", "/programs?program=program-1&from=programs"],
  ] as const)("uses the %s origin fallback", (origin, backHref) => {
    render(
      <ParticipantEventDetailPage
        programId="program-1"
        eventId="event-1"
        origin={origin}
      />
    );

    expect(mocks.eventDetailProps).toMatchObject({
      backHref,
      backReplace: true,
    });
    expect(screen.getByTestId("event-detail-back")).toHaveAttribute(
      "href",
      backHref
    );
  });
  test("preserves the Program hash for a direct participant Event Detail Back", () => {
    render(
      <ParticipantEventDetailPage
        programId="program-1"
        eventId="event-1"
        origin="programs"
        hash="#overview"
      />
    );

    expect(mocks.eventDetailProps).toMatchObject({
      backHref: "/programs?program=program-1&from=programs#overview",
    });
  });

  test("intercepts Back only for the program-detail history marker", () => {
    window.history.replaceState(
      { efccParent: "program-detail" },
      "",
      "/programs?program=program-1&event=event-1"
    );
    render(
      <ParticipantEventDetailPage
        programId="program-1"
        eventId="event-1"
        origin="programs"
      />
    );

    const internalClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByTestId("event-detail-back").dispatchEvent(internalClick);
    expect(internalClick.defaultPrevented).toBe(true);
    expect(mocks.historyBack).toHaveBeenCalledOnce();
    const modifiedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    screen.getByTestId("event-detail-back").dispatchEvent(modifiedClick);
    expect(modifiedClick.defaultPrevented).toBe(false);
    expect(mocks.historyBack).toHaveBeenCalledOnce();

    const middleClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    screen.getByTestId("event-detail-back").dispatchEvent(middleClick);
    expect(middleClick.defaultPrevented).toBe(false);
    expect(mocks.historyBack).toHaveBeenCalledOnce();

    cleanup();
    window.history.replaceState(null, "", "/programs");
    render(
      <ParticipantEventDetailPage
        programId="program-1"
        eventId="event-1"
        origin="programs"
      />
    );
    const fallbackClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByTestId("event-detail-back").dispatchEvent(fallbackClick);
    expect(fallbackClick.defaultPrevented).toBe(true);
    expect(mocks.historyBack).toHaveBeenCalledOnce();
  });

  test("keeps a server FORBIDDEN event load on the safe recovery surface", async () => {
    vi.resetModules();
    vi.doUnmock("./event-detail");
    vi.doMock("@/lib/programs/program-api", () => ({
      cancelEvent: vi.fn(),
      getEvent: vi
        .fn()
        .mockRejectedValue(new RpcError({ code: "FORBIDDEN", status: 403 })),
      setEventAvailability: vi.fn(),
      updateEvent: vi.fn(),
    }));

    const { ParticipantEventDetailPage: RealParticipantEventDetailPage } =
      await import("./participant-event-detail-page");
    render(
      <RealParticipantEventDetailPage
        programId="program-1"
        eventId="event-1"
        origin="programs"
      />
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.eventDetailRecoveryTitle,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.programs.backToOrigin })
    ).toHaveAttribute("href", "/programs?program=program-1&from=programs");
    expect(
      screen.queryByRole("link", { name: COPY.programs.goToScan })
    ).not.toBeInTheDocument();
  });
});
