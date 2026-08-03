import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";

import App from "@/app/page";
import { COPY } from "@/lib/copy";

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

const server = setupServer(
  http.post("/api/v1/rpc", async ({ request }) => {
    const body = (await request.json()) as {
      action?: string;
      params?: Record<string, unknown>;
    };
    if (body.action === "loginUser") {
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
    return HttpResponse.json(
      { status: 400, code: "MALFORMED_REQUEST", title: "Bad request" },
      { status: 400, headers: { "Content-Type": "application/problem+json" } }
    );
  })
);

describe("Shell", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

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
});
