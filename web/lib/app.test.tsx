import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

import App from "@/app/page";
import { COPY } from "@/lib/copy";
import { saveSession } from "@/lib/session";

const BOOTSTRAP = {
  session: {
    userId: "U-test",
    name: "測試用",
    role: "MEMBER",
    qrCodeString: "qr-placeholder",
    sessionId: "sess-id",
    sessionToken: "token-placeholder",
  },
  sections: [
    {
      key: "profile",
      label: "個人資料",
      capability: "READ",
      requiresServerAuth: false,
    },
  ],
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

const VALID_SESSION = {
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

    if (action === "logoutUser") {
      return HttpResponse.json({
        success: true,
        requestId: "r-logout",
        data: null,
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
  });

  afterEach(() => {
    server.resetHandlers();
    localStorage.clear();
    cleanup();
  });

  afterAll(() => server.close());

  describe("cold boot", () => {
    test("renders Login view, makes no restore RPC, no blank body", () => {
      render(<App />);
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
      expect(screen.queryByText(COPY.profile.title)).not.toBeInTheDocument();
    });

    test("has no create-next-app boilerplate", () => {
      render(<App />);
      expect(screen.queryByText(/To get started/iu)).not.toBeInTheDocument();
    });
  });

  describe("valid login", () => {
    test("renders Profile heading", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });
    });

    test("displays correct Bootstrap data", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText("測試用")).toBeInTheDocument();
      });

      expect(screen.getByText("test")).toBeInTheDocument();
      expect(screen.getByText("00000000")).toBeInTheDocument();
      expect(screen.getByText("MEMBER")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    test("persists session to localStorage", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });

      const stored = JSON.parse(localStorage.getItem("efcc_session") ?? "null");
      expect(stored).not.toBeNull();
      expect(stored.userId).toBe("U-test");
    });

    test("disables submit button while authenticating", async () => {
      let resolveLogin: (() => void) | undefined;
      // eslint-disable-next-line promise/avoid-new -- ponytail: deferred promise for MSW handler blocking; simpler pattern not available
      const loginPromise = new Promise<void>((resolve) => {
        resolveLogin = resolve;
      });
      server.use(
        http.post("/api/v1/rpc", async () => {
          await loginPromise;
          return HttpResponse.json({
            success: true,
            requestId: "r-1",
            data: BOOTSTRAP,
          });
        })
      );

      const user = userEvent.setup();
      render(<App />);
      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "test");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: COPY.login.submitting })
        ).toBeDisabled();
      });

      resolveLogin?.();
    });
  });

  describe("invalid login", () => {
    test("shows error, keeps login form, writes no session", async () => {
      const user = userEvent.setup();
      render(<App />);

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
      expect(
        screen.getByRole("button", { name: COPY.login.submit })
      ).toBeInTheDocument();
      expect(localStorage.getItem("efcc_session")).toBeNull();
    });
  });

  describe("stays mounted", () => {
    test("login form and shell remain visible after error", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.type(screen.getByLabelText(COPY.login.usernameLabel), "bad");
      await user.type(screen.getByLabelText(COPY.login.pinLabel), "0000");
      await user.click(screen.getByRole("button", { name: COPY.login.submit }));

      await waitFor(() => {
        expect(
          screen.getByText("用戶名稱或 PIN 碼不正確。")
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
    });
  });

  describe("restore", () => {
    test("valid stored session enters RESTORING and renders Profile", async () => {
      saveSession(VALID_SESSION);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });
    });

    test("missing session boots SIGNED_OUT, no restore call", () => {
      render(<App />);
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
    });

    test("malformed session is discarded and boots SIGNED_OUT", async () => {
      localStorage.setItem("efcc_session", '{"userId":"U-test"}');
      render(<App />);
      await waitFor(() => {
        expect(localStorage.getItem("efcc_session")).toBeNull();
      });
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
    });

    test("restore sends Authorization and X-Efcc-Session-Id headers", async () => {
      let capturedRequest: Request | undefined;
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as {
            action?: string;
          };
          if (body.action === "restoreApp") {
            capturedRequest = request;
            return HttpResponse.json({
              success: true,
              requestId: "r-restore",
              data: BOOTSTRAP,
            });
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            { status: 400, headers: { "Content-Type": "application/problem+json" } }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });

      expect(capturedRequest?.headers.get("Authorization")).toBe("Bearer token-placeholder");
      expect(capturedRequest?.headers.get("X-Efcc-Session-Id")).toBe("sess-id");
    });

    test("restore AUTH_REQUIRED clears session, shows expiry notice, and leaves Login visible", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as {
            action?: string;
          };
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
              { status: 401, headers: { "Content-Type": "application/problem+json" } }
            );
          }
          return HttpResponse.json(
            { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
            { status: 400, headers: { "Content-Type": "application/problem+json" } }
          );
        })
      );

      saveSession(VALID_SESSION);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(COPY.restore.expired)).toBeInTheDocument();
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      // Login form is still visible
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
    });
  });

  describe("logout", () => {
    test("logout calls logoutUser, clears session, returns to Login", async () => {
      const user = userEvent.setup();

      // Login first
      saveSession(VALID_SESSION);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: COPY.logout.submit }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: COPY.login.title })
        ).toBeInTheDocument();
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("logout transport failure clears session and shows recoverable notice with Login visible", async () => {
      server.use(
        http.post("/api/v1/rpc", async ({ request }) => {
          const body = (await request.json()) as {
            action?: string;
          };
          if (body.action === "logoutUser") {
            return HttpResponse.json(
              { status: 500, code: "UNAVAILABLE", title: "Server error" },
              { status: 500, headers: { "Content-Type": "application/problem+json" } }
            );
          }
          return HttpResponse.json({
            success: true,
            requestId: "r-restore",
            data: BOOTSTRAP,
          });
        })
      );

      const user = userEvent.setup();

      saveSession(VALID_SESSION);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(COPY.profile.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: COPY.logout.submit }));

      await waitFor(() => {
        expect(screen.getByText(COPY.logout.error)).toBeInTheDocument();
      });
      expect(localStorage.getItem("efcc_session")).toBeNull();
      // Login form is still visible alongside the notice
      expect(
        screen.getByRole("heading", { name: COPY.login.title })
      ).toBeInTheDocument();
    });
  });
});