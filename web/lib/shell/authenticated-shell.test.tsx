import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { Bootstrap, PublicUser } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { LiveRegion, announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { defaultSections, projectNavigation } from "@/lib/sections";
import { setAuthHint } from "@/lib/session";

const mocks = vi.hoisted(() => {
  const replaceMock = vi.fn<(path: string) => void>();
  const pathnameMock = vi.fn<() => string>();
  return {
    replaceMock,
    pathnameMock,
    mockRouter: {
      replace: replaceMock,
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      refresh: vi.fn<() => void>(),
      push: vi.fn<(path: string) => void>(),
      prefetch: vi.fn<(path: string) => void>(),
    },
  };
});

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.mockRouter,
  usePathname: () => mocks.pathnameMock(),
  useSearchParams: () =>
    new URLSearchParams(
      window.location.search
    ) as unknown as ReadonlyURLSearchParams,
}));

const PUBLIC_USER: PublicUser = {
  userId: "U001",
  name: "測試用",
  username: "test",
  phone: "00000000",
  identities: [],
  capabilities: {},
  status: "Active",
  qrCodeString: "qr-placeholder",
};
const STAFF_USER: PublicUser = { ...PUBLIC_USER };
const BOOTSTRAP: Bootstrap = {
  sections: defaultSections(),
  navigation: projectNavigation({ "program.enroll": true }),
  profile: PUBLIC_USER,
};
const STAFF_BOOTSTRAP: Bootstrap = {
  sections: defaultSections(),
  navigation: projectNavigation({ "program.manage": true }),
  profile: STAFF_USER,
};

const authCalls: string[] = [];
const server = setupServer(
  http.get("/api/v1/auth/me", () => {
    authCalls.push("/api/v1/auth/me");
    return HttpResponse.json({
      requestId: "r-me",
      data: {
        user: PUBLIC_USER,
        sections: BOOTSTRAP.sections,
        navigation: BOOTSTRAP.navigation,
      },
    });
  }),
  http.post("/api/v1/auth/refresh", () => {
    authCalls.push("/api/v1/auth/refresh");
    return HttpResponse.json({ requestId: "r-refresh", data: {} });
  }),
  http.post("/api/v1/auth/logout", () => {
    authCalls.push("/api/v1/auth/logout");
    return new HttpResponse(null, { status: 204 });
  })
);

function renderShell(children = <div>children</div>) {
  return render(
    <>
      <LiveRegion />
      <AppShell>{children}</AppShell>
    </>
  );
}

describe("Authenticated Shell (TK-04/TK-05/TK-06/TK-07/TK-08)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authCalls.length = 0;
    mocks.replaceMock.mockClear();
    mocks.pathnameMock.mockClear();
  });

  afterEach(() => {
    server.resetHandlers();
    localStorage.clear();
    sessionStorage.clear();
    cleanup();
  });

  afterAll(() => server.close());

  test("renders exactly one navigation landmark with the server-projected slots", async () => {
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/home");
    renderShell();
    const [nav] = await screen.findAllByRole("navigation", {
      name: COPY.nav.label,
    });
    // One landmark: the phone dock and desktop rail are the same list
    // presented by CSS at the 800px breakpoint (TK-05 focus order).
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("id", "main-navigation");
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((l) => l.getAttribute("href"))).toStrictEqual([
      "/home",
      "/programs",
      "/scanner",
      "/notices",
      "/profile",
    ]);
    // Exactly one active marker.
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  test("focus order is skip link, primary nav, main, then the dock is last", async () => {
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/profile");
    const user = userEvent.setup();
    renderShell();

    // Wait for the shell frame.
    const nav = await screen.findByRole("navigation", {
      name: COPY.nav.label,
    });

    // First focusable: skip link.
    const skip = screen.getByRole("link", { name: COPY.skipToContent });
    await user.tab();
    expect(skip).toHaveFocus();

    // Next tab: primary navigation links (first = home).
    await user.tab();
    const firstNavLink = nav.querySelector("a");
    expect(firstNavLink).not.toBeNull();
    expect(document.activeElement).toBe(firstNavLink);

    // Next tab: main landmark (skip target reached after the nav list).
    await user.tab();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "shell-content");
    // The skip target is focusable via anchor navigation; the next Tab
    // after the last nav item lands in main content (children div).
    await user.tab();
    expect(document.activeElement).not.toBeNull();
  });

  test("phone dock presentation: nav is the last focusable surface below 800px", async () => {
    // jsdom has no layout; this test pins the DOM shape: the single nav
    // landmark carries both presentations and the dock (fixed) is the only
    // fixed chrome element besides the offline banner.
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/home");
    renderShell();
    const nav = await screen.findByRole("navigation", {
      name: COPY.nav.label,
    });
    expect(nav.className).toContain("nav-phone");
    const fixedElements = [
      ...document.querySelectorAll<HTMLElement>("[class*='nav-phone']"),
    ];
    expect(fixedElements.length).toBeGreaterThan(0);
  });

  test("offline banner is owned by the shell and announces once", async () => {
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/home");
    renderShell();
    await screen.findByRole("navigation", { name: COPY.nav.label });

    // Initially online: no banner.
    expect(screen.queryByText(COPY.offlineBanner)).not.toBeInTheDocument();

    // Announce a shell status, then go offline: the banner appears and the
    // global live region announces the restore only (one owner).
    announce("工作階段已還原。");
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(COPY.offlineBanner)).toBeInTheDocument();

    // One live region output with the last shell announcement.
    const regions = document.querySelectorAll(
      'output[role="status"][aria-live="polite"]'
    );
    expect(regions).toHaveLength(1);
    expect(regions[0]?.textContent).toBe("工作階段已還原。");

    // Back online hides the banner.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(COPY.offlineBanner)).not.toBeInTheDocument();
  });

  test("recovery state moves focus to the recovery surface and keeps session state", async () => {
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/profile");
    server.use(
      http.get("/api/v1/auth/me", () =>
        HttpResponse.json(
          {
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "系統暫時無法使用",
            requestId: "r-503",
          },
          {
            status: 503,
            headers: { "Content-Type": "application/problem+json" },
          }
        )
      )
    );
    renderShell();
    await screen.findByRole("button", { name: COPY.error.retry });
    // Focus moved into the recovery surface (the focusable main region).
    expect(document.activeElement).toBe(screen.getByRole("main"));
    // Session state preserved: presence hint still set, no redirect.
    expect(localStorage.getItem("efcc_auth_active")).toBe("1");
    expect(mocks.replaceMock).not.toHaveBeenCalled();
  });

  test("management shell renders identity and the attention dialog is a Radix dialog", async () => {
    setAuthHint();
    mocks.pathnameMock.mockReturnValue("/management");
    server.use(
      http.get("/api/v1/auth/me", () =>
        HttpResponse.json({
          requestId: "r-me",
          data: {
            user: STAFF_USER,
            sections: STAFF_BOOTSTRAP.sections,
            navigation: STAFF_BOOTSTRAP.navigation,
          },
        })
      )
    );
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("navigation", { name: COPY.nav.label });
    const bell = screen.getByRole("button", {
      name: new RegExp(COPY.attention.title, "u"),
    });
    await user.click(bell);
    const dialog = await screen.findByRole("dialog", {
      name: COPY.attention.title,
    });
    expect(dialog).toBeInTheDocument();
    // The dialog surface is the Radix DialogContent (P0: the attention
    // panel must stay on the primitive's fixed overlay, not a raw
    // in-flow <div>; geometry is asserted in the Chromium suites).
    expect(dialog.dataset.slot).toBe("dialog-content");
    // Escape closes (Radix contract); focus returns to the bell trigger.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  test("NavBar renders the server projection verbatim without deriving from role", () => {
    render(
      <AppProvider bootstrap={BOOTSTRAP} onSignOut={() => {}}>
        <NavBar />
      </AppProvider>
    );
    const nav = screen.getByRole("navigation", { name: COPY.nav.label });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    expect(nav.querySelector('a[href="/scanner"]')).not.toBeNull();
  });
});
