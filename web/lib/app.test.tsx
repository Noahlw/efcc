import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { act } from "react";
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

import CarePage from "@/app/care/page";
import EventsPage from "@/app/events/page";
import RootLayout from "@/app/layout";
import NotFound from "@/app/not-found";
import LoginPage from "@/app/page";
import PermissionsPage from "@/app/permissions/page";
import ProfilePage from "@/app/profile/page";
import ProgramsPage from "@/app/programs/page";
import ScannerPage from "@/app/scanner/page";
import type { Bootstrap, Session } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY, errorCopyFor } from "@/lib/copy";
import { GuardedSection } from "@/lib/guarded-section";
import { announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { RecoveryView } from "@/lib/recovery-view";
import { saveSession } from "@/lib/session";

const mocks = vi.hoisted(() => {
  const replaceMock = vi.fn<(path: string) => void>();
  const pathnameMock = vi.fn<() => string>();
  const mockRouter = {
    replace: replaceMock,
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(path: string) => void>(),
    prefetch: vi.fn<(path: string) => void>(),
  };
  return { replaceMock, pathnameMock, mockRouter };
});

const { replaceMock } = mocks;
const { pathnameMock } = mocks;
const { mockRouter } = mocks;

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mockRouter,
  usePathname: () => pathnameMock(),
}));

const MEMBER_SECTIONS = [
  {
    key: "profile",
    label: "個人資料",
    capability: "READ",
    requiresServerAuth: false,
  },
  {
    key: "programs",
    label: "課程",
    capability: "READ",
    requiresServerAuth: false,
  },
  {
    key: "events",
    label: "聚會",
    capability: "READ",
    requiresServerAuth: false,
  },
];

const STAFF_SECTIONS = [
  ...MEMBER_SECTIONS,
  {
    key: "scanner",
    label: "掃描",
    capability: "AUTH",
    requiresServerAuth: true,
  },
  { key: "care", label: "關懷", capability: "AUTH", requiresServerAuth: true },
  {
    key: "permissions",
    label: "權限管理",
    capability: "AUTH",
    requiresServerAuth: true,
  },
];

const BOOTSTRAP: Bootstrap = {
  session: {
    userId: "U-test",
    name: "測試用",
    role: "MEMBER",
    qrCodeString: "qr-placeholder",
    sessionId: "sess-id",
    sessionToken: "token-placeholder",
  },
  sections: MEMBER_SECTIONS,
  profile: {
    userId: "U-test",
    name: "測試用",
    username: "test",
    phone: "00000000",
    role: "MEMBER",
    status: "Active",
    qrCodeString: "qr-placeholder",
  },
};

const VALID_SESSION: Session = {
  userId: "U-test",
  sessionId: "sess-id",
  sessionToken: "token-placeholder",
};

const DEFAULT_HANDLER = http.post("/api/v1/rpc", async ({ request }) => {
  const body = (await request.json()) as {
    action?: string;
    params?: Record<string, unknown>;
  };
  const action = body.action ?? "";

  if (action === "loginUser") {
    if (body.params?.username === "test" && body.params?.pin === "0000") {
      return HttpResponse.json({
        success: true,
        requestId: "r-1",
        data: BOOTSTRAP,
      });
    }
    return HttpResponse.json(
      {
        type: "tag:efcc.app,2026:error:AUTH_REQUIRED",
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Authentication failed",
        detail: "用戶名稱或 PIN 碼不正確。",
        requestId: "r-401",
      },
      { status: 401, headers: { "Content-Type": "application/problem+json" } }
    );
  }

  if (action === "restoreApp") {
    return HttpResponse.json({
      success: true,
      requestId: "r-restore",
      data: BOOTSTRAP,
    });
  }

  if (action === "logoutUser") {
    return HttpResponse.json({
      success: true,
      requestId: "r-logout",
      data: null,
    });
  }

  if (action === "authorizedNavigate") {
    return HttpResponse.json({
      success: true,
      requestId: "r-auth",
      data: { authorized: false },
    });
  }

  return HttpResponse.json(
    { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
    { status: 400, headers: { "Content-Type": "application/problem+json" } }
  );
});

const server = setupServer(DEFAULT_HANDLER);

describe("Shell", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    replaceMock.mockClear();
    pathnameMock.mockClear();
  });

  afterEach(() => {
    server.resetHandlers();
    localStorage.clear();
    cleanup();
  });

  afterAll(() => server.close());

  describe(RootLayout, () => {
    test("renders polite screen reader live region with explicit role", () => {
      const { container } = render(
        <RootLayout>
          <div>test</div>
        </RootLayout>
      );
      const liveRegion = container.querySelector(
        'output[role="status"][aria-live="polite"].sr-only'
      );
      expect(liveRegion).not.toBeNull();
    });

    test("announces async status text into the polite live region", () => {
      const { container } = render(
        <RootLayout>
          <div>test</div>
        </RootLayout>
      );
      act(() => {
        announce("測試通知");
      });
      const liveRegion = container.querySelector(
        'output[role="status"][aria-live="polite"].sr-only'
      );
      expect(liveRegion?.textContent).toBe("測試通知");
    });
  });

  describe(LoginPage, () => {
    test("renders Login view, makes no restore RPC", () => {
      render(<LoginPage />);
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(COPY.login.usernameLabel)
      ).toBeInTheDocument();
      expect(screen.getByLabelText(COPY.login.pinLabel)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: COPY.login.submit })
      ).toBeInTheDocument();
    });

    test("redirects to first section on valid login", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
    });

    test("persists session to localStorage after login", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });

      const stored = JSON.parse(localStorage.getItem("efcc_session") ?? "null");
      expect(stored).not.toBeNull();
      expect(stored.userId).toBe("U-test");
    });

    test("shows error on invalid login, keeps form", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "bad");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.restore.expired)).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText(COPY.login.usernameLabel)
      ).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("valid stored session restores and redirects", async () => {
      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
    });

    test("missing session shows login form, no redirect", () => {
      render(<LoginPage />);
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("restore AUTH_REQUIRED clears session, shows expiry notice, stays on login", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json(
              {
                type: "tag:efcc.app,2026:error:AUTH_REQUIRED",
                status: 401,
                code: "AUTH_REQUIRED",
                title: "Session expired",
                detail: "工作階段已過期。",
                requestId: "r-401",
              },
              {
                status: 401,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.restore.expired)).toBeInTheDocument();
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("login error response renders Traditional Chinese copy from COPY, never raw detail", async () => {
      // The server returns an unknown problem code with a raw detail string.
      // The login view must map the error through errorCopyFor so the user
      // sees COPY.error.unknown, not the wire detail.
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "loginUser") {
            return HttpResponse.json(
              {
                type: "tag:efcc.app,2026:error:WEIRD_THING",
                status: 418,
                code: "WEIRD_THING",
                title: "Weird",
                detail: "sensitive detail from server",
                requestId: "r-418",
              },
              {
                status: 418,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "bad");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.error.unknown)).toBeInTheDocument();
      });
      expect(
        screen.queryByText("sensitive detail from server")
      ).not.toBeInTheDocument();
    });
  });

  describe(ProfilePage, () => {
    test("renders loading state when no session", () => {
      render(<ProfilePage />);
      expect(screen.getByText(COPY.restore.loading)).toBeInTheDocument();
    });

    test("redirects to login when no session", async () => {
      render(<ProfilePage />);
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
    });

    test("renders Sign Out button accessible by name", async () => {
      pathnameMock.mockReturnValue("/profile");
      saveSession(VALID_SESSION);
      render(<ProfilePage />);

      const signOutButton = await screen.findByRole("button", {
        name: COPY.logout.submit,
      });
      expect(signOutButton).toBeInTheDocument();
    });

    test("clicking Sign Out calls logoutUser RPC and replaces to /", async () => {
      pathnameMock.mockReturnValue("/profile");
      saveSession(VALID_SESSION);
      const user = userEvent.setup();
      render(<ProfilePage />);

      const signOutButton = await screen.findByRole("button", {
        name: COPY.logout.submit,
      });
      await user.click(signOutButton);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBeNull();
    });

    test("logoutUser RPC failure clears session, replaces to /, and surfaces failedNotice on Login", async () => {
      pathnameMock.mockReturnValue("/profile");
      saveSession(VALID_SESSION);
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "logoutUser") {
            return HttpResponse.json(
              {
                type: "tag:efcc.app,2026:error:INTERNAL_ERROR",
                status: 500,
                code: "INTERNAL_ERROR",
                title: "Server error",
                detail: "boom",
                requestId: "r-logout-fail",
              },
              {
                status: 500,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          if (body.action === "restoreApp") {
            return HttpResponse.json({
              success: true,
              requestId: "r-restore",
              data: BOOTSTRAP,
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const user = userEvent.setup();
      render(<ProfilePage />);

      const signOutButton = await screen.findByRole("button", {
        name: COPY.logout.submit,
      });
      await user.click(signOutButton);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBe("1");

      cleanup();
      render(<LoginPage />);
      expect(screen.getByText(COPY.logout.failedNotice)).toBeInTheDocument();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBeNull();
    });
  });

  describe(NavBar, () => {
    function renderWithProvider(
      sections: Bootstrap["sections"],
      pathname: string
    ) {
      pathnameMock.mockReturnValue(pathname);
      return render(
        <AppProvider
          bootstrap={{ ...BOOTSTRAP, sections } as Bootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <NavBar />
        </AppProvider>
      );
    }

    test("renders all MEMBER sections", () => {
      renderWithProvider(MEMBER_SECTIONS, "/profile");
      expect(screen.getAllByText("個人資料").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("課程").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("聚會").length).toBeGreaterThanOrEqual(1);
    });

    test("renders all STAFF sections", () => {
      renderWithProvider(STAFF_SECTIONS, "/profile");
      expect(screen.getAllByText("掃描").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("關懷").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("權限管理").length).toBeGreaterThanOrEqual(1);
    });

    test("marks active section with aria-current", () => {
      renderWithProvider(MEMBER_SECTIONS, "/programs");
      const [active] = screen.getAllByText("課程");
      expect(active).toHaveAttribute("aria-current", "page");
    });

    test("does not mark inactive sections with aria-current", () => {
      renderWithProvider(MEMBER_SECTIONS, "/programs");
      const [inactive] = screen.getAllByText("個人資料");
      expect(inactive).not.toHaveAttribute("aria-current");
    });
  });

  describe(GuardedSection, () => {
    test("skips auth for non-auth section", async () => {
      render(
        <AppProvider
          bootstrap={BOOTSTRAP}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="profile">
            <p>content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("content")).toBeInTheDocument();
      });
    });

    test("renders ready when authorizedNavigate succeeds", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json({
              success: true,
              requestId: "r-auth",
              data: { authorized: true },
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care ready</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("care ready")).toBeInTheDocument();
      });
    });

    test("renders forbidden when authorizedNavigate denies", async () => {
      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
      });
      expect(screen.queryByText("care content")).not.toBeInTheDocument();
    });

    test("authorizedNavigate UNAVAILABLE shows error with retry", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json(
              {
                status: 503,
                code: "UNAVAILABLE",
                title: "Unavailable",
                detail: "系統暫時無法使用",
              },
              {
                status: 503,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
      expect(screen.queryByText("care content")).not.toBeInTheDocument();
    });

    test("authorizedNavigate AUTH_REQUIRED triggers signOut", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json(
              {
                status: 401,
                code: "AUTH_REQUIRED",
                title: "Auth required",
                detail: "請重新登入",
              },
              {
                status: 401,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const signOutMock = vi.fn<() => void>();
      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={signOutMock}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(signOutMock).toHaveBeenCalledWith();
      });
    });

    test("authorizedNavigate FORBIDDEN shows error, no retry button", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json(
              {
                status: 403,
                code: "FORBIDDEN",
                title: "Forbidden",
                detail: "禁止存取",
              },
              {
                status: 403,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
      });
      // FORBIDDEN has no retry - safe route back only
      expect(screen.queryByText(COPY.error.retry)).not.toBeInTheDocument();
      expect(screen.getByText(COPY.nav.backToHome)).toBeInTheDocument();
    });

    test("authorizedNavigate INTERNAL_ERROR shows server error with retry", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json(
              {
                status: 500,
                code: "INTERNAL_ERROR",
                title: "Server error",
                detail: "伺服器錯誤",
              },
              {
                status: 500,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.serverError)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
    });

    test("retry click on INTERNAL_ERROR repeats the authorize RPC and succeeds", async () => {
      let attempts = 0;
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            attempts += 1;
            if (attempts === 1) {
              return HttpResponse.json(
                {
                  status: 500,
                  code: "INTERNAL_ERROR",
                  title: "Server error",
                  detail: "伺服器錯誤",
                },
                {
                  status: 500,
                  headers: { "Content-Type": "application/problem+json" },
                }
              );
            }
            return HttpResponse.json({
              success: true,
              requestId: "r-auth",
              data: { authorized: true },
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.serverError)).toBeInTheDocument();
      });

      const retryButton = screen.getByText(COPY.error.retry);
      await userEvent.setup().click(retryButton);

      await waitFor(() => {
        expect(screen.getByText("care content")).toBeInTheDocument();
      });
      expect(attempts).toBe(2);
    });
  });

  describe("LoginPage error families", () => {
    test("restore UNAVAILABLE shows RECOVERABLE_ERROR with retry", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json(
              {
                status: 503,
                code: "UNAVAILABLE",
                title: "Unavailable",
                detail: "暫時無法使用",
              },
              {
                status: 503,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("restore FORBIDDEN shows RECOVERABLE_ERROR with retry", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json(
              {
                status: 403,
                code: "FORBIDDEN",
                title: "Forbidden",
                detail: "禁止存取",
              },
              {
                status: 403,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
    });

    test("restore INTERNAL_ERROR shows RECOVERABLE_ERROR with retry", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json(
              {
                status: 500,
                code: "INTERNAL_ERROR",
                title: "Server error",
                detail: "伺服器錯誤",
              },
              {
                status: 500,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.error.serverError)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
    });

    test("retry clicks repeat the failed restore RPC and succeed on second attempt", async () => {
      let attempts = 0;
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            attempts += 1;
            if (attempts === 1) {
              return HttpResponse.json(
                {
                  status: 500,
                  code: "INTERNAL_ERROR",
                  title: "Server error",
                  detail: "伺服器錯誤",
                },
                {
                  status: 500,
                  headers: { "Content-Type": "application/problem+json" },
                }
              );
            }
            return HttpResponse.json({
              success: true,
              requestId: "r-restore",
              data: BOOTSTRAP,
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.error.serverError)).toBeInTheDocument();
      });

      const retryButton = screen.getByText(COPY.error.retry);
      await userEvent.setup().click(retryButton);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(attempts).toBe(2);
    });
  });

  describe(RecoveryView, () => {
    test("renders message and link", () => {
      render(<RecoveryView message="test error" safeHref="/profile" />);
      expect(screen.getByText("test error")).toBeInTheDocument();
      expect(screen.getByText(COPY.nav.backToHome)).toBeInTheDocument();
    });

    test("renders retry button when onRetry provided", () => {
      render(
        <RecoveryView
          message="test error"
          safeHref="/profile"
          onRetry={() => {}}
        />
      );
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
    });

    test("does not render retry button when onRetry omitted", () => {
      render(<RecoveryView message="test error" safeHref="/profile" />);
      expect(screen.queryByText(COPY.error.retry)).not.toBeInTheDocument();
    });
  });

  describe(NotFound, () => {
    test("renders unknown route message and link to home", () => {
      render(<NotFound />);
      expect(screen.getByText(COPY.nav.unknownRoute)).toBeInTheDocument();
      expect(screen.getByText(COPY.nav.backToHome)).toBeInTheDocument();
    });
  });

  describe("Section page titles from COPY.sections", () => {
    function withStaffBootstrap() {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json({
              success: true,
              requestId: "r-restore",
              data: { ...BOOTSTRAP, sections: STAFF_SECTIONS },
            });
          }
          if (body.action === "authorizedNavigate") {
            return HttpResponse.json({
              success: true,
              requestId: "r-auth",
              data: { authorized: true },
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );
    }

    test("programs page renders COPY.sections.programs title", async () => {
      saveSession(VALID_SESSION);
      render(<ProgramsPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.programs })
        ).toBeInTheDocument();
      });
    });

    test("events page renders COPY.sections.events title", async () => {
      saveSession(VALID_SESSION);
      render(<EventsPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.events })
        ).toBeInTheDocument();
      });
    });

    test("scanner page renders COPY.sections.scanner title", async () => {
      withStaffBootstrap();
      saveSession(VALID_SESSION);
      render(<ScannerPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.scanner })
        ).toBeInTheDocument();
      });
    });

    test("care page renders COPY.sections.care title", async () => {
      withStaffBootstrap();
      saveSession(VALID_SESSION);
      render(<CarePage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.care })
        ).toBeInTheDocument();
      });
    });

    test("permissions page renders COPY.sections.permissions title", async () => {
      withStaffBootstrap();
      saveSession(VALID_SESSION);
      render(<PermissionsPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.permissions })
        ).toBeInTheDocument();
      });
    });
  });

  describe(errorCopyFor, () => {
    test("NETWORK_ERROR maps to networkError", () => {
      expect(errorCopyFor("NETWORK_ERROR")).toBe(COPY.error.networkError);
    });

    test("AUTH_REQUIRED maps to expired", () => {
      expect(errorCopyFor("AUTH_REQUIRED")).toBe(COPY.restore.expired);
    });

    test("FORBIDDEN maps to forbidden", () => {
      expect(errorCopyFor("FORBIDDEN")).toBe(COPY.error.forbidden);
    });

    test("VALIDATION maps to validation", () => {
      expect(errorCopyFor("VALIDATION")).toBe(COPY.error.validation);
    });

    test("NOT_FOUND maps to notFound", () => {
      expect(errorCopyFor("NOT_FOUND")).toBe(COPY.error.notFound);
    });

    test("suffixed _NOT_FOUND codes map to notFound", () => {
      expect(errorCopyFor("MEMBER_NOT_FOUND")).toBe(COPY.error.notFound);
      expect(errorCopyFor("EVENT_NOT_FOUND")).toBe(COPY.error.notFound);
    });

    test("CONFLICT maps to conflict", () => {
      expect(errorCopyFor("CONFLICT")).toBe(COPY.error.conflict);
    });

    test("UNAVAILABLE maps to unavailable", () => {
      expect(errorCopyFor("UNAVAILABLE")).toBe(COPY.error.unavailable);
    });

    test("INTERNAL_ERROR maps to serverError", () => {
      expect(errorCopyFor("INTERNAL_ERROR")).toBe(COPY.error.serverError);
    });

    test("MALFORMED_RESPONSE and MALFORMED_REQUEST map to malformed", () => {
      expect(errorCopyFor("MALFORMED_RESPONSE")).toBe(COPY.error.malformed);
      expect(errorCopyFor("MALFORMED_REQUEST")).toBe(COPY.error.malformed);
    });

    test("unknown code falls back to unknown (never raw detail)", () => {
      expect(errorCopyFor("UNKNOWN_CODE", "custom detail")).toBe(
        COPY.error.unknown
      );
      expect(errorCopyFor("UNKNOWN_CODE")).toBe(COPY.error.unknown);
    });

    test("undefined code falls back to unknown", () => {
      expect(errorCopyFor()).toBe(COPY.error.unknown);
    });

    test("unknown code never returns raw detail fallback", () => {
      // Spec 074: centralized copy is the single source of user-facing text.
      // errorCopyFor must NOT return arbitrary detail strings from the wire.
      expect(errorCopyFor("UNKNOWN_CODE", "raw detail text")).toBe(
        COPY.error.unknown
      );
      expect(errorCopyFor("SOMETHING_NEW", "sensitive leak")).toBe(
        COPY.error.unknown
      );
      expect(errorCopyFor(undefined, "another leak")).toBe(COPY.error.unknown);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 5: Restore failure lifecycle, route authorization & expiry handling.
  // ---------------------------------------------------------------------------
  describe("AppShell restore failure lifecycle", () => {
    test("restoreApp 503 keeps stored session and retry re-executes restoreApp", async () => {
      let restoreAttempts = 0;
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            restoreAttempts += 1;
            return HttpResponse.json(
              {
                status: 503,
                code: "UNAVAILABLE",
                title: "Unavailable",
                detail: "系統暫時無法使用",
              },
              {
                status: 503,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      pathnameMock.mockReturnValue("/profile");
      render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      const retryButton = screen.getByText(COPY.error.retry);
      expect(localStorage.getItem("efcc_session")).not.toBeNull();

      // restoreApp retries internally (MAX_RETRIES) on 503, so the first
      // logical call produces multiple fetch attempts. Capture that
      // baseline so we can prove a subsequent retry triggers more fetches.
      const attemptsAfterFirst = restoreAttempts;
      expect(attemptsAfterFirst).toBeGreaterThanOrEqual(1);
      expect(replaceMock).not.toHaveBeenCalled();

      await userEvent.setup().click(retryButton);

      await waitFor(() => {
        expect(restoreAttempts).toBeGreaterThan(attemptsAfterFirst);
      });
      expect(localStorage.getItem("efcc_session")).not.toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("restoreApp AUTH_REQUIRED clears session and calls router.replace('/')", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "restoreApp") {
            return HttpResponse.json(
              {
                type: "tag:efcc.app,2026:error:AUTH_REQUIRED",
                status: 401,
                code: "AUTH_REQUIRED",
                title: "Session expired",
                detail: "工作階段已過期。",
                requestId: "r-401",
              },
              {
                status: 401,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      saveSession(VALID_SESSION);
      pathnameMock.mockReturnValue("/profile");
      render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      expect(sessionStorage.getItem("efcc_deep_link")).toBe("/profile");
    });
  });

  describe("GuardedSection unpermitted deep link", () => {
    test("sectionKey missing from bootstrap.sections renders RecoveryView with first permitted section", async () => {
      const memberBootstrap = { ...BOOTSTRAP, sections: MEMBER_SECTIONS };
      render(
        <AppProvider
          bootstrap={memberBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
      });
      expect(screen.queryByText("care content")).not.toBeInTheDocument();
      const link = screen.getByText(COPY.nav.backToHome).closest("a");
      expect(link).toHaveAttribute("href", "/profile");
    });
  });

  describe("CF0-06: stale-response discard and coalescing", () => {
    test("stale authorizedNavigate response is discarded (generation mismatch)", async () => {
      const deferred1 = Promise.withResolvers<{ authorized: boolean }>();
      const deferred2 = Promise.withResolvers<{ authorized: boolean }>();
      let callCount = 0;
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            callCount += 1;
            if (callCount === 1)
              {return deferred1.promise.then((d) =>
                HttpResponse.json({ success: true, requestId: "r-1", data: d })
              );}
            return deferred2.promise.then((d) =>
              HttpResponse.json({ success: true, requestId: "r-2", data: d })
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      const { rerender } = render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      expect(screen.getByText(COPY.nav.loading)).toBeInTheDocument();

      rerender(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="scanner">
            <p>scanner content</p>
          </GuardedSection>
        </AppProvider>
      );

      deferred1.resolve({ authorized: true });
      await vi.waitFor(() => {
        expect(screen.queryByText("care content")).not.toBeInTheDocument();
      });

      deferred2.resolve({ authorized: true });
      await vi.waitFor(() => {
        expect(screen.getByText("scanner content")).toBeInTheDocument();
      });
    });

    test("duplicate rapid authorizations for same section coalesce to one RPC", async () => {
      let callCount = 0;
      const deferred = Promise.withResolvers<{ authorized: boolean }>();
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as { action?: string };
          if (body.action === "authorizedNavigate") {
            callCount += 1;
            return deferred.promise.then((d) =>
              HttpResponse.json({ success: true, requestId: "r-1", data: d })
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }
          );
        })
      );

      const staffBootstrap = { ...BOOTSTRAP, sections: STAFF_SECTIONS };
      const { rerender } = render(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      rerender(
        <AppProvider
          bootstrap={staffBootstrap}
          session={VALID_SESSION}
          onSignOut={() => {}}
        >
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );

      deferred.resolve({ authorized: true });
      await vi.waitFor(() => {
        expect(screen.getByText("care content")).toBeInTheDocument();
      });
      expect(callCount).toBe(1);
    });
  });
});
