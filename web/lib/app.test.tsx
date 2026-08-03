import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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

import NotFound from "@/app/not-found";
import LoginPage from "@/app/page";
import ProfilePage from "@/app/profile/page";
import type { Bootstrap, Session } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY, errorCopyFor } from "@/lib/copy";
import { GuardedSection } from "@/lib/guarded-section";
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

const {replaceMock} = mocks;
const {pathnameMock} = mocks;
const {mockRouter} = mocks;

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
        expect(
          screen.getByText("用戶名稱或 PIN 碼不正確。")
        ).toBeInTheDocument();
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
        expect(screen.getByText(COPY.nav.unauthorized)).toBeInTheDocument();
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

    test("unknown code falls back to detail then unknown", () => {
      expect(errorCopyFor("UNKNOWN_CODE", "custom detail")).toBe(
        "custom detail"
      );
      expect(errorCopyFor("UNKNOWN_CODE")).toBe(COPY.error.unknown);
    });

    test("undefined code falls back to unknown", () => {
      expect(errorCopyFor()).toBe(COPY.error.unknown);
    });
  });
});
