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
import { COPY } from "@/lib/copy";
import { GuardedSection } from "@/lib/guarded-section";
import { NavBar } from "@/lib/nav-bar";
import { RecoveryView } from "@/lib/recovery-view";
import { saveSession } from "@/lib/session";

const replaceMock = vi.fn<(_path: string) => void>();
const pathnameMock = vi.fn<() => string>();

vi.mock(import('next/navigation'), () => ({
  useRouter: () => ({ replace: replaceMock }),
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

const server = setupServer(
  http.post("/api/v1/rpc", async ({ request }) => {
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
  })
);

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
        expect(replaceMock).toHaveBeenCalledWith();
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
  });

  describe(RecoveryView, () => {
    test("renders message and link", () => {
      render(<RecoveryView message="test error" safeHref="/profile" />);
      expect(screen.getByText("test error")).toBeInTheDocument();
      expect(screen.getByText(COPY.nav.backToHome)).toBeInTheDocument();
    });
  });

  describe(NotFound, () => {
    test("renders unknown route message and link to home", () => {
      render(<NotFound />);
      expect(screen.getByText(COPY.nav.unknownRoute)).toBeInTheDocument();
      expect(screen.getByText(COPY.nav.backToHome)).toBeInTheDocument();
    });
  });
});
