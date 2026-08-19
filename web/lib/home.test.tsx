/* oxlint-disable vitest/max-expects, vitest/require-mock-type-parameters, vitest/require-top-level-describe, import/consistent-type-specifier-style, eslint/require-unicode-regexp */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import HomePage, {
  AnnouncementDetail,
  HomeView,
  type AnnouncementData,
  type HomeEvent,
  type HomeProgram,
} from "@/app/home/page";
import type { Bootstrap, PublicUser } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { defaultSections, stableNavigationSections } from "@/lib/sections";

const mocks = vi.hoisted(() => {
  const pushMock = vi.fn();
  const replaceMock = vi.fn();
  const pathnameMock = vi.fn(() => "/home");
  const searchParamsMock = vi.fn(() => new URLSearchParams());
  return {
    pushMock,
    replaceMock,
    pathnameMock,
    searchParamsMock,
    mockRouter: {
      push: pushMock,
      replace: replaceMock,
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    },
  };
});

const { pushMock, replaceMock, pathnameMock, mockRouter } = mocks;

vi.mock(import('next/navigation'), () => ({
  useRouter: () => mockRouter,
  usePathname: () => pathnameMock(),
  useSearchParams: () => mocks.searchParamsMock(),
}));

const sessionMocks = vi.hoisted(() => ({
  clearAuthHintMock: vi.fn<() => void>(),
  setAuthHintMock: vi.fn<() => void>(),
  hasAuthHintMock: vi.fn<() => boolean>(),
  restoreBootstrapMock: vi.fn<() => Promise<Bootstrap>>(),
}));

vi.mock(import('@/lib/session'), () => ({
  clearAuthHint: sessionMocks.clearAuthHintMock,
  setAuthHint: sessionMocks.setAuthHintMock,
  hasAuthHint: sessionMocks.hasAuthHintMock,
  restoreBootstrap: sessionMocks.restoreBootstrapMock,
  clearDeepLink: vi.fn(),
  rememberDeepLink: vi.fn(),
}));

const MEMBER_PROFILE: PublicUser = {
  userId: "u-member-101",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  role: "Member",
  status: "Active",
  qrCodeString: "qr:u-member-101",
};

const BOOTSTRAP: Bootstrap = {
  profile: MEMBER_PROFILE,
  sections: defaultSections(),
  navigation: stableNavigationSections("Member"),
};

const SAMPLE_EVENT: HomeEvent = {
  eventId: "e-101",
  programId: "p-disc",
  programTitle: "門徒訓練基礎課",
  eventTitle: "第三課聚會",
  startsAt: "2026-08-20T11:30:00.000Z",
  endsAt: "2026-08-20T13:00:00.000Z",
  location: "二樓禮堂",
};

const SAMPLE_ANNOUNCEMENT: AnnouncementData = {
  title: "本週崇拜及聚會安排",
  date: "8月15日",
  summary: "請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。",
  externalUrl: "https://example.com/venue-details",
};

const SAMPLE_PROGRAM: HomeProgram = {
  programId: "p-intro",
  name: "慕道入門課程",
  description: "現正接受報名 · 9月7日開始",
};

const server = setupServer(
  http.get("/api/v1/home", () => 
    HttpResponse.json({
      requestId: "r-home-test",
      data: {
        featuredEvent: {
          eventId: "e-101",
          programId: "p-disc",
          programTitle: "門徒訓練基礎課",
          title: "第三課聚會",
          startsAt: "2026-08-20T11:30:00.000Z",
          endsAt: "2026-08-20T13:00:00.000Z",
          location: "二樓禮堂",
          status: "Active",
          isEnrolled: true,
        },
        announcement: {
          contentId: "c-001",
          version: 1,
          title: "本週崇拜及聚會安排",
          summary: "請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。",
          bodyMarkdown: null,
          ctaLabel: "聚會場地資料",
          ctaUrl: "https://example.com/venue-details",
          imageUrl: null,
          imageAlt: null,
          publishedAt: "8月15日",
        },
        exploreProgram: {
          programId: "p-intro",
          title: "慕道入門課程",
          summary: "現正接受報名 · 9月7日開始",
          category: "Faith",
          enrollmentType: "Open",
          nextEventStartAt: "2026-09-07T02:00:00.000Z",
        },
      },
    })
  ),
  http.get("/api/v1/programs/catalog", () => 
    HttpResponse.json({
      requestId: "r-catalog",
      data: { catalog: [] },
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  pushMock.mockClear();
  replaceMock.mockClear();
  sessionMocks.hasAuthHintMock.mockReset();
  sessionMocks.restoreBootstrapMock.mockReset();
});

afterAll(() => server.close());

function renderWithApp(ui: React.ReactNode, bootstrap = BOOTSTRAP) {
  return render(
    <AppProvider bootstrap={bootstrap} onSignOut={() => {}}>
      {ui}
    </AppProvider>
  );
}

describe("HomeView Component", () => {
  test("renders greeting with member name and subtitle", () => {
    renderWithApp(
      <HomeView
        featuredEvent={null}
        featuredProgram={null}
        announcement={null}
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: `${COPY.home.greeting}，${MEMBER_PROFILE.name}`,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.home.subtitle)).toBeInTheDocument();
  });

  test("renders empty state when not enrolled in any upcoming event", () => {
    renderWithApp(
      <HomeView
        featuredEvent={null}
        featuredProgram={null}
        announcement={null}
      />
    );

    const emptySection = screen.getByTestId("home-empty-state");
    expect(emptySection).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: COPY.home.emptyTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.home.emptySubtitle)).toBeInTheDocument();

    const exploreButton = screen.getByRole("link", {
      name: COPY.home.explorePrograms,
    });
    expect(exploreButton).toBeInTheDocument();
    expect(exploreButton).toHaveAttribute("href", "/programs");
  });

  test("renders next event card with enrolled badge, program/event title, and viewEvent link", () => {
    renderWithApp(
      <HomeView
        featuredEvent={SAMPLE_EVENT}
        featuredProgram={null}
        announcement={null}
      />
    );

    const eventCard = screen.getByTestId("next-event-card");
    expect(eventCard).toBeInTheDocument();
    expect(screen.getByText(COPY.home.enrolledBadge)).toBeInTheDocument();
    expect(screen.getByText("門徒訓練基礎課")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "第三課聚會" })
    ).toBeInTheDocument();
    expect(screen.getByText("二樓禮堂")).toBeInTheDocument();
    expect(screen.getByText("8月20日（四）")).toBeInTheDocument();
    expect(screen.getByText("晚上 7:30–9:00")).toBeInTheDocument();

    const viewEventLink = screen.getByRole("link", {
      name: COPY.home.viewEvent,
    });
    expect(viewEventLink).toBeInTheDocument();
    expect(viewEventLink).toHaveAttribute(
      "href",
      "/programs?program=p-disc&event=e-101"
    );
  });

  test("renders church news section and opens announcement detail upon clicking card", async () => {
    const user = userEvent.setup();
    renderWithApp(
      <HomeView
        featuredEvent={null}
        featuredProgram={null}
        announcement={SAMPLE_ANNOUNCEMENT}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: COPY.home.churchNews })
    ).toBeInTheDocument();
    const announcementCard = screen.getByTestId("announcement-card");
    expect(announcementCard).toBeInTheDocument();
    expect(screen.getByText("本週崇拜及聚會安排")).toBeInTheDocument();

    await user.click(announcementCard);

    const detailView = screen.getByTestId("announcement-detail");
    expect(detailView).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "本週崇拜及聚會安排" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: COPY.home.venueTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.home.venueInstructions)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.worshipLocation)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.familyRoom)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.visitorReception)).toBeInTheDocument();

    const externalLink = screen.getByRole("link", {
      name: new RegExp(COPY.home.externalLink),
    });
    expect(externalLink).toHaveAttribute(
      "href",
      "https://example.com/venue-details"
    );
    expect(externalLink).toHaveAttribute("target", "_blank");
    expect(externalLink).toHaveAttribute("rel", "noopener");

    const backButton = screen.getByRole("button", {
      name: new RegExp(COPY.home.backHome),
    });
    await user.click(backButton);

    expect(screen.queryByTestId("announcement-detail")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  test("renders explore section with featured program and link to /programs", () => {
    renderWithApp(
      <HomeView
        featuredEvent={null}
        featuredProgram={SAMPLE_PROGRAM}
        announcement={null}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: COPY.home.explore })
    ).toBeInTheDocument();
    const allProgramsLink = screen.getByRole("link", {
      name: COPY.home.allPrograms,
    });
    expect(allProgramsLink).toHaveAttribute("href", "/programs");

    const exploreCard = screen.getByTestId("explore-card");
    expect(exploreCard).toHaveAttribute("href", "/programs");
    expect(screen.getByText("慕道入門課程")).toBeInTheDocument();
    expect(screen.getByText("現正接受報名 · 9月7日開始")).toBeInTheDocument();
  });

  test("loads projection data from /api/v1/home when props are not provided", async () => {
    renderWithApp(<HomeView />);

    await waitFor(() => {
      expect(screen.getByTestId("next-event-card")).toBeInTheDocument();
    });
    expect(screen.getByText("門徒訓練基礎課")).toBeInTheDocument();
    expect(screen.getByTestId("announcement-card")).toBeInTheDocument();
    expect(screen.getByTestId("explore-card")).toBeInTheDocument();
  });
});

describe("AnnouncementDetail Component", () => {
  test("renders all announcement guidance rows and secure external link", () => {
    const onBack = vi.fn();
    render(
      <AnnouncementDetail announcement={SAMPLE_ANNOUNCEMENT} onBack={onBack} />
    );

    expect(screen.getByText(COPY.home.churchNews)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: SAMPLE_ANNOUNCEMENT.title })
    ).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_ANNOUNCEMENT.summary)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_ANNOUNCEMENT.date)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: COPY.home.venueTitle })
    ).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: new RegExp(COPY.home.externalLink),
    });
    expect(link).toHaveAttribute("href", "https://example.com/venue-details");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  test("does not render external link row when externalUrl is null", () => {
    render(
      <AnnouncementDetail
        announcement={{
          title: "消息標題",
          date: "8月15日",
          summary: "消息內容",
          externalUrl: null,
        }}
        onBack={() => {}}
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("HomePage Page Export", () => {
  test("renders inside AppShell without crashing", async () => {
    pathnameMock.mockReturnValue("/home");
    sessionMocks.hasAuthHintMock.mockReturnValue(true);
    sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("home-page")).toBeInTheDocument();
    });
  });
});
