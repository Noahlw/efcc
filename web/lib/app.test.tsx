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
import type { Bootstrap, PublicUser } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { AppShell } from "@/lib/app-shell";
import { COPY, errorCopyFor } from "@/lib/copy";
import { EmptyState } from "@/lib/empty-state";
import { ForbiddenView } from "@/lib/forbidden-view";
import { GuardedSection } from "@/lib/guarded-section";
import { announce } from "@/lib/live-region";
import { NavBar } from "@/lib/nav-bar";
import { RecoveryView } from "@/lib/recovery-view";
import { setAuthHint } from "@/lib/session";
import { ShellHeader } from "@/lib/shell-header";

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
    requiresServerAuth: false,
  },
  {
    key: "care",
    label: "關懷",
    capability: "AUTH",
    requiresServerAuth: false,
  },
  {
    key: "permissions",
    label: "權限管理",
    capability: "AUTH",
    requiresServerAuth: false,
  },
];

const PUBLIC_USER: PublicUser = {
  userId: "U-test",
  name: "測試用",
  username: "test",
  phone: "00000000",
  role: "MEMBER",
  status: "Active",
  qrCodeString: "qr-placeholder",
};

const BOOTSTRAP: Bootstrap = {
  sections: MEMBER_SECTIONS,
  profile: PUBLIC_USER,
};

const AUTH_HINT_KEY = "efcc_auth_active";
const LEGACY_STORAGE_KEY = "efcc_session";

// Track which AUTH surface endpoints were hit so tests can assert "no
// restore call" on cold boot without a real network.
const authCalls: string[] = [];

const DEFAULT_HANDLER = [
  http.post("/api/v1/auth/login", async ({ request }) => {
    authCalls.push("/api/v1/auth/login");
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    if (body.username === "test" && body.password === "pw-pass") {
      return HttpResponse.json({
        requestId: "r-login",
        data: {
          userId: "U-test",
          name: "測試用",
          role: "MEMBER",
          status: "Active",
          mustSetNewCredential: false,
        },
      });
    }
    return HttpResponse.json(
      {
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "用戶名稱或密碼不正確。",
        requestId: "r-401",
      },
      { status: 401, headers: { "Content-Type": "application/problem+json" } }
    );
  }),
  http.post("/api/v1/auth/refresh", () => {
    authCalls.push("/api/v1/auth/refresh");
    return HttpResponse.json({ requestId: "r-refresh", data: {} });
  }),
  http.get("/api/v1/auth/me", () => {
    authCalls.push("/api/v1/auth/me");
    return HttpResponse.json({
      requestId: "r-me",
      data: { user: PUBLIC_USER },
    });
  }),
  http.post("/api/v1/auth/logout", () => {
    authCalls.push("/api/v1/auth/logout");
    return new HttpResponse(null, { status: 204 });
  }),
];

const server = setupServer(...DEFAULT_HANDLER);

describe("Shell", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authCalls.length = 0;
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
    test("cold boot with no stored session renders Login and makes no restore call", () => {
      render(<LoginPage />);
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: COPY.login.submit })
      ).toBeInTheDocument();
      // No hint stored => no /refresh or /me restore call on cold boot.
      expect(authCalls).not.toContain("/api/v1/auth/refresh");
      expect(authCalls).not.toContain("/api/v1/auth/me");
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("valid login POSTs credentials, sets presence hint, resolves profile via /me, and redirects without full reload", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(
        screen.getByLabelText(COPY.login.passwordLabel),
        "pw-pass"
      );
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(authCalls).toContain("/api/v1/auth/login");
      expect(authCalls).toContain("/api/v1/auth/me");
      // Presence hint is set (non-secret); no legacy session object is stored.
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
    });

    test("stores no credential/token/session identifier in browser storage", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(
        screen.getByLabelText(COPY.login.passwordLabel),
        "pw-pass"
      );
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      // The legacy efcc_session key (which held a session token) must be gone.
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
      // Only the non-secret presence hint may exist.
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("efcc_")
      );
      expect(keys).toContain(AUTH_HINT_KEY);
      expect(keys).not.toContain(LEGACY_STORAGE_KEY);
    });

    test("invalid credentials render inline Traditional Chinese error, write no session, and permit another attempt", async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "bad");
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "wrong");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.login.error)).toBeInTheDocument();
      });
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
      // Form remains mounted for a retry.
      expect(
        screen.getByLabelText(COPY.login.usernameLabel)
      ).toBeInTheDocument();
    });

    /* oxlint-disable vitest/max-expects -- covers the full gated flow. */
    test("forced-upgrade response requires a new credential before issuing a session", async () => {
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json({
            requestId: "r-upgrade",
            data: {
              userId: "U-legacy",
              name: "舊帳戶",
              role: "MEMBER",
              status: "Active",
              mustSetNewCredential: true,
            },
          })
        ),
        http.get("/api/v1/auth/me", () => {
          authCalls.push("/api/v1/auth/me");
          return HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        }),
        http.post("/api/v1/auth/upgrade", async ({ request }) => {
          authCalls.push("/api/v1/auth/upgrade");
          const body = (await request.json()) as {
            username?: string;
            legacyPin?: string;
            newCredential?: string;
          };
          expect(body).toStrictEqual({
            username: "legacy",
            legacyPin: "pin",
            newCredential: "new-password",
          });
          return HttpResponse.json({
            requestId: "r-upgraded",
            data: { user: PUBLIC_USER },
          });
        })
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(
        screen.getByLabelText(COPY.login.usernameLabel),
        "legacy"
      );
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "pin");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(
          screen.getByText(COPY.login.upgradeRequired)
        ).toBeInTheDocument();
      });
      // No session is issued for a forced-upgrade gate.
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
      expect(authCalls).not.toContain("/api/v1/auth/me");

      expect(
        screen.getByRole("heading", { name: COPY.login.upgradeTitle })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(COPY.login.legacyPasswordLabel)).toHaveValue(
        "pin"
      );
      await user.type(
        screen.getByLabelText(COPY.login.newPasswordLabel),
        "new-password"
      );
      await user.click(
        screen.getByRole("button", { name: COPY.login.upgradeSubmit })
      );
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(authCalls).toContain("/api/v1/auth/upgrade");
      expect(authCalls).toContain("/api/v1/auth/me");
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
    });
    /* oxlint-enable vitest/max-expects */

    /* oxlint-disable vitest/max-expects -- covers the post-upgrade recovery flow. */
    test("post-upgrade /me failure is recoverable without re-submitting the upgrade", async () => {
      let meAttempts = 0;
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json({
            requestId: "r-upgrade",
            data: {
              userId: "U-legacy",
              name: "舊帳戶",
              role: "MEMBER",
              status: "Active",
              mustSetNewCredential: true,
            },
          })
        ),
        http.get("/api/v1/auth/me", () => {
          authCalls.push("/api/v1/auth/me");
          meAttempts += 1;
          if (meAttempts === 1) {
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
          return HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        }),
        http.post("/api/v1/auth/upgrade", async ({ request }) => {
          authCalls.push("/api/v1/auth/upgrade");
          await request.json();
          return HttpResponse.json({
            requestId: "r-upgraded",
            data: { user: PUBLIC_USER },
          });
        })
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(
        screen.getByLabelText(COPY.login.usernameLabel),
        "legacy"
      );
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "pin");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));
      await waitFor(() => {
        expect(
          screen.getByText(COPY.login.upgradeRequired)
        ).toBeInTheDocument();
      });
      await user.type(
        screen.getByLabelText(COPY.login.newPasswordLabel),
        "new-password"
      );
      await user.click(
        screen.getByRole("button", { name: COPY.login.upgradeSubmit })
      );

      // The session was issued, so the failed profile fetch must surface a
      // recoverable error, not re-mount the upgrade gate.
      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      expect(
        screen.queryByText(COPY.login.upgradeTitle)
      ).not.toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
      expect(
        authCalls.filter((c) => c === "/api/v1/auth/upgrade")
      ).toHaveLength(1);

      // Retry resolves the profile from the issued session — the upgrade is
      // never re-submitted (the legacy credential is already consumed).
      await user.click(screen.getByText(COPY.error.retry));
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(
        authCalls.filter((c) => c === "/api/v1/auth/upgrade")
      ).toHaveLength(1);
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
    });
    /* oxlint-enable vitest/max-expects */

    /* oxlint-disable vitest/max-expects -- covers the ambiguous-network upgrade path. */
    test("lost upgrade response still navigates when the session was actually issued", async () => {
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json({
            requestId: "r-upgrade",
            data: {
              userId: "U-legacy",
              name: "舊帳戶",
              role: "MEMBER",
              status: "Active",
              mustSetNewCredential: true,
            },
          })
        ),
        http.get("/api/v1/auth/me", () => {
          authCalls.push("/api/v1/auth/me");
          return HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        }),
        http.post("/api/v1/auth/upgrade", () => {
          authCalls.push("/api/v1/auth/upgrade");
          // Simulate a connection drop after the server committed the upgrade.
          return HttpResponse.error();
        })
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(
        screen.getByLabelText(COPY.login.usernameLabel),
        "legacy"
      );
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "pin");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));
      await waitFor(() => {
        expect(
          screen.getByText(COPY.login.upgradeRequired)
        ).toBeInTheDocument();
      });
      await user.type(
        screen.getByLabelText(COPY.login.newPasswordLabel),
        "new-password"
      );
      await user.click(
        screen.getByRole("button", { name: COPY.login.upgradeSubmit })
      );

      // The probe (authMe) resolves the issued session and navigates instead
      // of re-mounting the gate — no 409 resubmission of a consumed PIN.
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(authCalls).toContain("/api/v1/auth/me");
      expect(
        authCalls.filter((c) => c === "/api/v1/auth/upgrade")
      ).toHaveLength(1);
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
    });
    /* oxlint-enable vitest/max-expects */

    /* oxlint-disable vitest/max-expects -- covers the genuinely-uncommitted upgrade path. */

    test("lost upgrade response re-mounts the gate when no session was issued", async () => {
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json({
            requestId: "r-upgrade",
            data: {
              userId: "U-legacy",
              name: "舊帳戶",
              role: "MEMBER",
              status: "Active",
              mustSetNewCredential: true,
            },
          })
        ),
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json(
            {
              status: 401,
              code: "AUTH_REQUIRED",
              title: "Unauthorized",
              detail: "Access cookie missing.",
            },
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
        ),
        http.post("/api/v1/auth/upgrade", () => {
          authCalls.push("/api/v1/auth/upgrade");
          return HttpResponse.error();
        })
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(
        screen.getByLabelText(COPY.login.usernameLabel),
        "legacy"
      );
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "pin");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));
      await waitFor(() => {
        expect(
          screen.getByText(COPY.login.upgradeRequired)
        ).toBeInTheDocument();
      });
      await user.type(
        screen.getByLabelText(COPY.login.newPasswordLabel),
        "new-password"
      );
      await user.click(
        screen.getByRole("button", { name: COPY.login.upgradeSubmit })
      );

      // No session exists, so the gate re-mounts for a real retry.
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.login.upgradeTitle })
        ).toBeInTheDocument();
      });
      expect(replaceMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    });
    /* oxlint-enable vitest/max-expects */

    /* oxlint-disable vitest/max-expects -- covers the transient-probe recovery path. */

    test("lost upgrade response with a transient probe failure stays recoverable", async () => {
      let meAttempts = 0;
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json({
            requestId: "r-upgrade",
            data: {
              userId: "U-legacy",
              name: "舊帳戶",
              role: "MEMBER",
              status: "Active",
              mustSetNewCredential: true,
            },
          })
        ),
        http.get("/api/v1/auth/me", () => {
          authCalls.push("/api/v1/auth/me");
          meAttempts += 1;
          if (meAttempts <= 2) {
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
          return HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        }),
        http.post("/api/v1/auth/upgrade", () => {
          authCalls.push("/api/v1/auth/upgrade");
          return HttpResponse.error();
        })
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(
        screen.getByLabelText(COPY.login.usernameLabel),
        "legacy"
      );
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "pin");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));
      await waitFor(() => {
        expect(
          screen.getByText(COPY.login.upgradeRequired)
        ).toBeInTheDocument();
      });
      await user.type(
        screen.getByLabelText(COPY.login.newPasswordLabel),
        "new-password"
      );
      await user.click(
        screen.getByRole("button", { name: COPY.login.upgradeSubmit })
      );

      // The probe failed transiently, so the session is treated as possibly
      // issued: a recoverable error (not the gate) is shown; the upgrade is
      // never re-mounted.
      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      expect(
        screen.queryByText(COPY.login.upgradeTitle)
      ).not.toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
      expect(
        authCalls.filter((c) => c === "/api/v1/auth/upgrade")
      ).toHaveLength(1);

      // Retry resolves the profile from the possibly-issued session.
      await user.click(screen.getByText(COPY.error.retry));
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(
        authCalls.filter((c) => c === "/api/v1/auth/upgrade")
      ).toHaveLength(1);
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
    });
    /* oxlint-enable vitest/max-expects */

    test("stored access session silently restores and redirects on reload", async () => {
      setAuthHint();
      render(<LoginPage />);
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      // A live access cookie resolves directly via /me with no re-entry.
      expect(authCalls).toContain("/api/v1/auth/me");
    });

    test("stale access token silently restores via the refresh fallback", async () => {
      setAuthHint();
      let meCalls = 0;
      let refreshCalls = 0;
      server.use(
        http.get("/api/v1/auth/me", () => {
          meCalls += 1;
          if (meCalls === 1) {
            return HttpResponse.json(
              {
                status: 401,
                code: "AUTH_REQUIRED",
                title: "Unauthorized",
                detail: "Access cookie invalid or expired.",
                requestId: "r-401",
              },
              {
                status: 401,
                headers: { "Content-Type": "application/problem+json" },
              }
            );
          }
          return HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        }),
        http.post("/api/v1/auth/refresh", () => {
          refreshCalls += 1;
          return HttpResponse.json({ requestId: "r-refresh", data: {} });
        })
      );
      render(<LoginPage />);
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/profile");
      });
      expect(refreshCalls).toBe(1);
      expect(meCalls).toBe(2);
    });

    test("expired/revoked refresh session returns cleanly to Login with an explanation", async () => {
      setAuthHint();
      server.use(
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json(
            {
              status: 401,
              code: "AUTH_REQUIRED",
              title: "Unauthorized",
              detail: "Access cookie invalid or expired.",
              requestId: "r-401",
            },
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
        ),
        http.post("/api/v1/auth/refresh", () =>
          HttpResponse.json(
            {
              status: 401,
              code: "AUTH_REQUIRED",
              title: "Unauthorized",
              detail: "Refresh cookie missing.",
              requestId: "r-401",
            },
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
        )
      );
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.restore.expired)).toBeInTheDocument();
      });
      // Presence hint cleared - the refresh session is dead.
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("login error response renders Traditional Chinese copy from COPY, never raw detail", async () => {
      server.use(
        http.post("/api/v1/auth/login", () =>
          HttpResponse.json(
            {
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
          )
        )
      );
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "bad");
      await user.type(screen.getByLabelText(COPY.login.passwordLabel), "wrong");
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
    test("redirects to login when no session hint present", async () => {
      render(<ProfilePage />);
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
    });

    test("renders profile after cookie restore and exposes Sign Out button by name", async () => {
      pathnameMock.mockReturnValue("/profile");
      setAuthHint();
      render(<ProfilePage />);

      const signOutButton = await screen.findByRole("button", {
        name: COPY.logout.submit,
      });
      expect(signOutButton).toBeInTheDocument();
      expect(screen.getByText("測試用")).toBeInTheDocument();
    });

    test("clicking Sign Out calls /logout, clears the hint, and replaces to /", async () => {
      pathnameMock.mockReturnValue("/profile");
      setAuthHint();
      const user = userEvent.setup();
      render(<ProfilePage />);

      const signOutButton = await screen.findByRole("button", {
        name: COPY.logout.submit,
      });
      await user.click(signOutButton);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(authCalls).toContain("/api/v1/auth/logout");
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBeNull();
    });

    test("logout RPC failure clears the hint, replaces to /, and surfaces failedNotice on Login", async () => {
      pathnameMock.mockReturnValue("/profile");
      setAuthHint();
      server.use(
        http.post("/api/v1/auth/logout", () =>
          HttpResponse.json(
            {
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
          )
        ),
        // me still succeeds so the shell reaches the profile content.
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          })
        ),
        http.post("/api/v1/auth/refresh", () =>
          HttpResponse.json({ requestId: "r-refresh", data: {} })
        )
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
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBe("1");

      cleanup();
      render(<LoginPage />);
      expect(screen.getByText(COPY.logout.failedNotice)).toBeInTheDocument();
      expect(sessionStorage.getItem("efcc_logout_failed")).toBeNull();
    });
  });

  describe(ProfilePage, () => {
    function renderRestoredProfile() {
      const user = userEvent.setup();
      pathnameMock.mockReturnValue("/profile");
      setAuthHint();
      const view = render(<ProfilePage />);
      return { user, view };
    }

    test("renders the QR identity as an img with a descriptive label and the immutable code", async () => {
      renderRestoredProfile();
      // Await the shell so the profile surface is mounted.
      await screen.findByRole("button", { name: COPY.logout.submit });
      const qr = screen.getByRole("img", { name: COPY.profile.qrCode });
      expect(qr).toBeInTheDocument();
      expect(screen.getByText(PUBLIC_USER.qrCodeString)).toBeInTheDocument();
    });

    test("renders the phone and status info grid with their values", async () => {
      renderRestoredProfile();
      await screen.findByRole("button", { name: COPY.logout.submit });
      expect(screen.getByText(COPY.profile.phone)).toBeInTheDocument();
      expect(screen.getByText(PUBLIC_USER.phone)).toBeInTheDocument();
      expect(screen.getByText(COPY.profile.status)).toBeInTheDocument();
      expect(screen.getByText(PUBLIC_USER.status)).toBeInTheDocument();
    });

    test("renders the empty state when the profile carries no QR data", async () => {
      server.use(
        http.post("/api/v1/auth/refresh", () =>
          HttpResponse.json({ requestId: "r-refresh", data: {} })
        ),
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json({
            requestId: "r-me",
            data: { user: { ...PUBLIC_USER, qrCodeString: "" } },
          })
        )
      );
      renderRestoredProfile();
      await screen.findByRole("button", { name: COPY.logout.submit });
      expect(screen.getByText(COPY.profile.qrEmpty)).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: COPY.profile.qrCode })).toBeNull();
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
    test("renders children for a permitted (present) section", () => {
      render(
        <AppProvider bootstrap={BOOTSTRAP} onSignOut={() => {}}>
          <GuardedSection sectionKey="profile">
            <p>content</p>
          </GuardedSection>
        </AppProvider>
      );
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    test("renders forbidden view for an unpermitted (absent) section with a safe route back", () => {
      render(
        <AppProvider bootstrap={BOOTSTRAP} onSignOut={() => {}}>
          <GuardedSection sectionKey="care">
            <p>care content</p>
          </GuardedSection>
        </AppProvider>
      );
      expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
      expect(screen.queryByText("care content")).not.toBeInTheDocument();
      const link = screen.getByText(COPY.nav.backToProfile).closest("a");
      expect(link).toHaveAttribute("href", "/profile");
    });
  });

  describe("LoginPage restore error families", () => {
    test("restore UNAVAILABLE shows RECOVERABLE_ERROR with retry", async () => {
      setAuthHint();
      server.use(
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json(
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
          )
        )
      );
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      expect(screen.getByText(COPY.error.retry)).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    test("retry click repeats the failed restore and succeeds on second attempt", async () => {
      setAuthHint();
      let attempts = 0;
      server.use(
        http.get("/api/v1/auth/me", () => {
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
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          });
        })
      );
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

  describe(EmptyState, () => {
    test("renders a status region exposing title and message", () => {
      render(<EmptyState title="無資料" message="目前沒有課程資料。" />);
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("無資料")).toBeInTheDocument();
      expect(screen.getByText("目前沒有課程資料。")).toBeInTheDocument();
    });
  });

  describe(ForbiddenView, () => {
    test("renders an alert block with a safe back-to-profile route", () => {
      render(<ForbiddenView safeHref="/programs" />);
      expect(screen.getByRole("alert")).toHaveTextContent(COPY.error.forbidden);
      const link = screen.getByText(COPY.nav.backToProfile).closest("a");
      expect(link).toHaveAttribute("href", "/programs");
    });
  });

  describe(ShellHeader, () => {
    test("renders the full church title and a sign-out control", () => {
      render(
        <AppProvider bootstrap={BOOTSTRAP} onSignOut={() => {}}>
          <ShellHeader />
        </AppProvider>
      );
      expect(screen.getByText(COPY.appFullName)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: COPY.logout.submit })
      ).toBeInTheDocument();
    });

    test("sign-out control invokes the context signOut", async () => {
      const onSignOut = vi.fn();
      const user = userEvent.setup();
      render(
        <AppProvider bootstrap={BOOTSTRAP} onSignOut={onSignOut}>
          <ShellHeader />
        </AppProvider>
      );
      await user.click(
        screen.getByRole("button", { name: COPY.logout.submit })
      );
      expect(onSignOut).toHaveBeenCalledTimes(1);
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
    function withAuthRestore() {
      server.use(
        http.post("/api/v1/auth/refresh", () =>
          HttpResponse.json({ requestId: "r-refresh", data: {} })
        ),
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json({
            requestId: "r-me",
            data: { user: PUBLIC_USER },
          })
        )
      );
    }

    test("programs page renders COPY.sections.programs title", async () => {
      setAuthHint();
      render(<ProgramsPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.programs })
        ).toBeInTheDocument();
      });
    });

    test("events page renders COPY.sections.events title", async () => {
      setAuthHint();
      render(<EventsPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.events })
        ).toBeInTheDocument();
      });
    });

    test("scanner page renders COPY.sections.scanner title", async () => {
      withAuthRestore();
      setAuthHint();
      render(<ScannerPage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.scanner })
        ).toBeInTheDocument();
      });
    });

    test("care page renders COPY.sections.care title", async () => {
      withAuthRestore();
      setAuthHint();
      render(<CarePage />);
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.sections.care })
        ).toBeInTheDocument();
      });
    });

    test("permissions page renders COPY.sections.permissions title", async () => {
      withAuthRestore();
      setAuthHint();
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
      expect(errorCopyFor("UNKNOWN_CODE", "raw detail text")).toBe(
        COPY.error.unknown
      );
      expect(errorCopyFor("SOMETHING_NEW", "sensitive leak")).toBe(
        COPY.error.unknown
      );
      expect(errorCopyFor(undefined, "another leak")).toBe(COPY.error.unknown);
    });
  });

  describe("AppShell restore lifecycle", () => {
    test("shows the loading state with a spinner while the session restores", async () => {
      setAuthHint();
      pathnameMock.mockReturnValue("/profile");
      const { container } = render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );
      // The first frame is the loading shell before the async restore resolves.
      expect(screen.getByText(COPY.restore.loading)).toBeInTheDocument();
      expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
      // The restore resolves to the authenticated shell.
      expect(
        await screen.findByRole("button", { name: COPY.logout.submit })
      ).toBeInTheDocument();
    });

    test("no session hint redirects to / and records the deep link", async () => {
      pathnameMock.mockReturnValue("/programs");
      render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(sessionStorage.getItem("efcc_deep_link")).toBe("/programs");
    });

    test("expired refresh session clears the hint, records the deep link, and redirects to / with an expiry explanation", async () => {
      setAuthHint();
      pathnameMock.mockReturnValue("/profile");
      server.use(
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json(
            {
              status: 401,
              code: "AUTH_REQUIRED",
              title: "Unauthorized",
              detail: "Access cookie invalid or expired.",
              requestId: "r-401",
            },
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
        ),
        http.post("/api/v1/auth/refresh", () =>
          HttpResponse.json(
            {
              status: 401,
              code: "AUTH_REQUIRED",
              title: "Unauthorized",
              detail: "Refresh cookie missing.",
              requestId: "r-401",
            },
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
        )
      );
      render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/");
      });
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
      expect(sessionStorage.getItem("efcc_deep_link")).toBe("/profile");
      expect(sessionStorage.getItem("efcc_session_expired")).toBe("1");
    });

    test("restore 503 keeps the hint and retry re-executes restore", async () => {
      setAuthHint();
      pathnameMock.mockReturnValue("/profile");
      let refreshAttempts = 0;
      server.use(
        http.get("/api/v1/auth/me", () => {
          refreshAttempts += 1;
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
        })
      );
      render(
        <AppShell>
          <div>children</div>
        </AppShell>
      );
      await waitFor(() => {
        expect(screen.getByText(COPY.error.unavailable)).toBeInTheDocument();
      });
      const attemptsAfterFirst = refreshAttempts;
      expect(attemptsAfterFirst).toBeGreaterThanOrEqual(1);
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
      expect(replaceMock).not.toHaveBeenCalled();

      await userEvent.setup().click(screen.getByText(COPY.error.retry));
      await waitFor(() => {
        expect(refreshAttempts).toBeGreaterThan(attemptsAfterFirst);
      });
      expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("1");
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
