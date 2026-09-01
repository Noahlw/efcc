import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
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

import ProfilePage from "@/app/profile/page";
import ProfileSettingsPage from "@/app/profile/settings/page";
import { ACCOUNT_SETTINGS_COPY } from "@/lib/account-settings-copy";
import type { Bootstrap, PublicUser } from "@/lib/api";
import { COPY } from "@/lib/copy";
import {
  defaultSections,
  projectSections,
  projectNavigation,
} from "@/lib/sections";

const mocks = vi.hoisted(() => {
  const replaceMock = vi.fn<(path: string) => void>();
  const pathnameMock = vi.fn<() => string>(() => "/profile/settings");
  const mockRouter = {
    replace: replaceMock,
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(path: string) => void>(),
    prefetch: vi.fn<(path: string) => void>(),
  };
  const announceMock = vi.fn<(message: string) => void>();
  return { replaceMock, pathnameMock, mockRouter, announceMock };
});

const { replaceMock, pathnameMock, mockRouter, announceMock } = mocks;

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mockRouter,
  usePathname: () => pathnameMock(),
}));

vi.mock(import("@/lib/live-region"), () => ({
  announce: mocks.announceMock,
}));
const sessionMocks = vi.hoisted(() => ({
  clearAuthHintMock: vi.fn<() => void>(),
  setAuthHintMock: vi.fn<() => void>(),
  hasAuthHintMock: vi.fn<() => boolean>(),
  restoreBootstrapMock: vi.fn<() => Promise<Bootstrap>>(),
  rememberDeepLinkMock: vi.fn<(value: string) => void>(),
}));

vi.mock(import("@/lib/session"), () => ({
  clearAuthHint: sessionMocks.clearAuthHintMock,
  setAuthHint: sessionMocks.setAuthHintMock,
  hasAuthHint: sessionMocks.hasAuthHintMock,
  restoreBootstrap: sessionMocks.restoreBootstrapMock,
  clearDeepLink: vi.fn(),
  rememberDeepLink: sessionMocks.rememberDeepLinkMock,
}));

const PROFILE: PublicUser = {
  userId: "U001",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  role: "Member",
  status: "Active",
  qrCodeString: "qr-member-demo",
  identities: [
    { label: "青年部門協調員", scopeKind: "Department", scopeLabel: "青年部" },
  ],
  capabilities: { "program.enroll": true, "role.manage": false },
};

const BOOTSTRAP: Bootstrap = {
  sections: projectSections({ "program.enroll": true }),
  navigation: projectNavigation({ "program.enroll": true }),
  profile: PROFILE,
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  replaceMock.mockReset();
  mockRouter.back.mockReset();
  sessionMocks.clearAuthHintMock.mockReset();
  sessionMocks.rememberDeepLinkMock.mockReset();
  announceMock.mockReset();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterAll(() => server.close());

async function renderSettingsPage() {
  pathnameMock.mockReturnValue("/profile/settings");
  sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);
  sessionMocks.hasAuthHintMock.mockReturnValue(true);
  const view = render(<ProfileSettingsPage />);
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })
    ).toBeInTheDocument();
  });
  return view;
}

async function renderProfilePage() {
  pathnameMock.mockReturnValue("/profile");
  sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);
  sessionMocks.hasAuthHintMock.mockReturnValue(true);
  const view = render(<ProfilePage />);
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: COPY.profile.title })
    ).toBeInTheDocument();
  });
  return view;
}

async function fillUsername(user: UserEvent, value: string) {
  const input = screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel);
  await user.clear(input);
  await user.type(input, value);
}

async function fillPassword(
  user: UserEvent,
  current: string,
  next: string,
  confirm: string
) {
  const currentInput = screen.getByLabelText(
    ACCOUNT_SETTINGS_COPY.currentPasswordLabel
  );
  const newInput = screen.getByLabelText(
    ACCOUNT_SETTINGS_COPY.newPasswordLabel
  );
  const confirmInput = screen.getByLabelText(
    ACCOUNT_SETTINGS_COPY.confirmPasswordLabel
  );
  await user.clear(currentInput);
  await user.clear(newInput);
  await user.clear(confirmInput);
  await user.type(currentInput, current);
  await user.type(newInput, next);
  await user.type(confirmInput, confirm);
}

describe(ProfileSettingsPage, () => {
  test("renders one canonical surface with labels, hints, back, and current username", async () => {
    await renderSettingsPage();

    expect(screen.getAllByText(ACCOUNT_SETTINGS_COPY.headerTitle)).toHaveLength(
      1
    );
    const backLink = document.querySelector(
      "[data-contextual-task-header] a[href='/profile']"
    );
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/profile");
    expect(
      screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })
    ).toBeInTheDocument();
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.sectionLead)
    ).toBeInTheDocument();

    const usernameInput = screen.getByLabelText(
      ACCOUNT_SETTINGS_COPY.usernameLabel
    );
    expect(usernameInput).toHaveValue(PROFILE.username);
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.usernameHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.passwordTitle })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel)
    ).toBeInTheDocument();
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.passwordHint)
    ).toBeInTheDocument();
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.passwordNotice)
    ).toBeInTheDocument();
  });

  test("username change validates, preserves the draft on conflict, and completes with one flash", async () => {
    server.use(
      http.post("/api/v1/auth/username", async ({ request }) => {
        const body = (await request.json()) as { username: string };
        if (body.username === "taken.user") {
          return HttpResponse.json(
            {
              type: "tag:apps-script/efcc/errors#CONFLICT",
              title: "Conflict",
              status: 409,
              code: "CONFLICT",
              requestId: "req-u2",
              detail: "An account with that username already exists.",
            },
            { status: 409 }
          );
        }
        return HttpResponse.json({
          requestId: "req-u1",
          data: { username: body.username, sessionRevoked: true },
        });
      })
    );

    const user = userEvent.setup();
    await renderSettingsPage();

    await user.clear(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    );
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.missingUsername)
    ).toBeInTheDocument();

    await fillUsername(user, "taken.user");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    await expect(
      screen.findByText(ACCOUNT_SETTINGS_COPY.usernameTaken)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    ).toHaveValue("taken.user");

    await fillUsername(user, "member.new");
    announceMock.mockClear();
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    await expect(
      screen.findByRole("heading", {
        name: ACCOUNT_SETTINGS_COPY.updated,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.usernameSuccess)
    ).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(sessionMocks.clearAuthHintMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("efcc_account_updated")).toBe("1");
    expect(announceMock).toHaveBeenCalledOnce();
    expect(announceMock).toHaveBeenCalledWith(ACCOUNT_SETTINGS_COPY.updated);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("unchanged username shows a live notice and keeps the session live", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-u3",
          data: { username: PROFILE.username, sessionRevoked: false },
        })
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    announceMock.mockClear();
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      ACCOUNT_SETTINGS_COPY.usernameUnchanged
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(sessionMocks.clearAuthHintMock).not.toHaveBeenCalled();
    expect(announceMock).not.toHaveBeenCalledWith(
      ACCOUNT_SETTINGS_COPY.usernameUnchanged
    );
  });

  test("password change validates length and confirmation without sending invalid drafts", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/password", () => {
        calls += 1;
        return HttpResponse.json({
          requestId: "req-p1",
          data: { sessionRevoked: true },
        });
      })
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.missingPasswordFields)
    ).toBeInTheDocument();

    await fillPassword(user, "curr-pass-123", "short", "short");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      ACCOUNT_SETTINGS_COPY.shortPassword
    );

    await fillPassword(user, "curr-pass-123", "new-secret-888", "mismatch-999");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.passwordMismatch)
    ).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  test("password success revokes the session and routes through sign-in", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json({
          requestId: "req-p2",
          data: { sessionRevoked: true },
        })
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillPassword(
      user,
      "curr-pass-123",
      "new-secret-888",
      "new-secret-888"
    );
    announceMock.mockClear();
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    await expect(
      screen.findByRole("heading", {
        name: ACCOUNT_SETTINGS_COPY.updated,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.passwordSuccess)
    ).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(sessionMocks.clearAuthHintMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("efcc_account_updated")).toBe("1");
    expect(announceMock).toHaveBeenCalledWith(ACCOUNT_SETTINGS_COPY.updated);
  });

  test("wrong current password preserves all draft fields and is not retryable", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#VALIDATION",
            title: "Validation failed",
            status: 422,
            code: "VALIDATION",
            requestId: "req-p3",
            detail: "current password is incorrect",
          },
          { status: 422 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillPassword(user, "wrong-pass", "new-secret-888", "new-secret-888");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    await expect(
      screen.findByText(ACCOUNT_SETTINGS_COPY.wrongCurrentPassword)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel)
    ).toHaveValue("wrong-pass");
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)
    ).toHaveValue("new-secret-888");
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel)
    ).toHaveValue("new-secret-888");
    expect(
      screen.queryByRole("button", { name: ACCOUNT_SETTINGS_COPY.retry })
    ).not.toBeInTheDocument();
  });

  test("offline and unavailable submissions expose retry controls with preserved drafts", async () => {
    const user = userEvent.setup();
    await renderSettingsPage();

    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    await fillUsername(user, "member.offline");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.offlineError)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.retry })
    ).toHaveFocus();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    ).toHaveValue("member.offline");

    await fillPassword(user, "curr-pass", "new-secret-888", "new-secret-888");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(
      screen.getAllByText(ACCOUNT_SETTINGS_COPY.offlineError).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)
    ).toHaveValue("new-secret-888");
  });

  test("network retry resubmits the same username form", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/auth/username", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json({
          requestId: "req-u4",
          data: { username: "member.retry", sessionRevoked: false },
        });
      })
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillUsername(user, "member.retry");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    const retry = await screen.findByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.retry,
    });
    expect(retry).toHaveFocus();
    await user.click(retry);

    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      ACCOUNT_SETTINGS_COPY.usernameUnchanged
    );
    expect(calls).toBe(2);
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    ).toHaveValue("member.retry");
  });

  test("UNAVAILABLE keeps the password draft and offers a retry action", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#UNAVAILABLE",
            title: "Unavailable",
            status: 503,
            code: "UNAVAILABLE",
            requestId: "req-p5",
            detail: "Service unavailable.",
          },
          { status: 503 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillPassword(
      user,
      "current-pass",
      "new-secret-888",
      "new-secret-888"
    );
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    await expect(
      screen.findByText(ACCOUNT_SETTINGS_COPY.unavailable)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.retry })
    ).toHaveFocus();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel)
    ).toHaveValue("current-pass");
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)
    ).toHaveValue("new-secret-888");
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel)
    ).toHaveValue("new-secret-888");
  });

  test("forbidden response removes both forms and leaves a safe profile exit", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#FORBIDDEN",
            title: "Forbidden",
            status: 403,
            code: "FORBIDDEN",
            requestId: "req-u5",
            detail: "Account is inactive.",
          },
          { status: 403 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillUsername(user, "member.forbidden");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: ACCOUNT_SETTINGS_COPY.usernameSubmit,
      })
    ).not.toBeInTheDocument();
    const safeExit = screen
      .getAllByRole("link", { name: COPY.nav.backToProfile })
      .find((element) => element.dataset.slot === "button");
    expect(safeExit).toHaveAttribute("href", "/profile");
  });

  test("AUTH_REQUIRED remembers the safe deep link and redirects to canonical sign-in", async () => {
    window.history.replaceState(
      {},
      "",
      "/profile/settings?tab=password#current"
    );
    pathnameMock.mockReturnValue("/profile/settings");
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#AUTH_REQUIRED",
            title: "Authentication required",
            status: 401,
            code: "AUTH_REQUIRED",
            requestId: "req-p4",
            detail: "Session expired.",
          },
          { status: 401 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();
    await fillPassword(
      user,
      "current-pass",
      "new-secret-888",
      "new-secret-888"
    );
    announceMock.mockClear();
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(sessionMocks.rememberDeepLinkMock).toHaveBeenCalledWith(
      "/profile/settings?tab=password#current"
    );
    expect(sessionMocks.clearAuthHintMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("efcc_session_expired")).toBeNull();
    expect(
      screen.queryByText(ACCOUNT_SETTINGS_COPY.sessionExpired)
    ).not.toBeInTheDocument();
    expect(announceMock).toHaveBeenCalledWith(
      ACCOUNT_SETTINGS_COPY.sessionExpired
    );
  });

  test("state errors and completion move focus to an intentional target", async () => {
    const user = userEvent.setup();
    await renderSettingsPage();
    const usernameInput = screen.getByLabelText(
      ACCOUNT_SETTINGS_COPY.usernameLabel
    );
    await user.clear(usernameInput);
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    await waitFor(() => {
      expect(usernameInput).toHaveFocus();
      expect(usernameInput).toHaveAttribute("aria-invalid", "true");
      expect(usernameInput).toHaveAttribute(
        "aria-describedby",
        "new-username-hint new-username-error"
      );
    });
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-u6",
          data: { username: "member.focus", sessionRevoked: true },
        })
      )
    );
    await fillUsername(user, "member.focus");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: ACCOUNT_SETTINGS_COPY.sectionTitle,
        })
      ).toHaveFocus();
    });
  });
});

describe(ProfilePage, () => {
  test("renders profile info and account settings/logout actions", async () => {
    server.use(
      http.post(
        "/api/v1/auth/logout",
        () => new HttpResponse(null, { status: 204 })
      )
    );
    const user = userEvent.setup();
    await renderProfilePage();

    expect(
      screen.getByRole("heading", { name: COPY.profile.title })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.profile.subtitle)).toBeInTheDocument();
    expect(screen.getByText(COPY.profile.qrBadge)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: PROFILE.name })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.profile.statusValid)).toHaveAttribute(
      "data-profile-status",
      "active"
    );
    expect(screen.getByText(COPY.profile.accountDetails)).toBeInTheDocument();
    expect(screen.getByText(PROFILE.username)).toBeInTheDocument();
    expect(screen.getByText("青年部門協調員")).toBeInTheDocument();
    expect(screen.queryByText("program.enroll")).not.toBeInTheDocument();
    expect(screen.queryByText("role.manage")).not.toBeInTheDocument();
    expect(screen.getByText("部門（Department） · 青年部")).toBeInTheDocument();
    expect(screen.queryByText(PROFILE.phone)).not.toBeInTheDocument();
    expect(screen.queryByText("Member")).not.toBeInTheDocument();

    const settingsLink = screen.getByRole("link", {
      name: new RegExp(COPY.profile.accountSettings, "u"),
    });
    expect(settingsLink).toHaveAttribute("href", "/profile/settings");
    expect(
      screen.queryByRole("link", {
        name: new RegExp(`^${COPY.profile.settingsEntry}`, "u"),
      })
    ).not.toBeInTheDocument();

    const logoutButtons = screen.getAllByRole("button", {
      name: new RegExp(COPY.profile.logout, "u"),
    });
    const logoutButton = logoutButtons.at(-1);
    if (!logoutButton) {
      throw new Error("Expected a logout button");
    }
    await user.click(logoutButton);
    await waitFor(() =>
      expect(sessionMocks.clearAuthHintMock).toHaveBeenCalledWith()
    );
  });

  test("renders management settings link for management-capable accounts", async () => {
    server.use(
      http.post(
        "/api/v1/auth/logout",
        () => new HttpResponse(null, { status: 204 })
      )
    );
    const managementSections = defaultSections();
    sessionMocks.restoreBootstrapMock.mockResolvedValue({
      sections: managementSections,
      navigation: projectNavigation({ "home.publish": true }),
      profile: { ...PROFILE, role: "Admin" },
    });
    pathnameMock.mockReturnValue("/profile");
    sessionMocks.hasAuthHintMock.mockReturnValue(true);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: COPY.profile.title })
      ).toBeInTheDocument();
    });
    const settingsHubEntry = screen.getByRole("link", {
      name: new RegExp(`^${COPY.profile.settingsEntry}`, "u"),
    });
    expect(settingsHubEntry).toHaveAttribute(
      "href",
      "/management?module=settings"
    );
    expect(
      screen.getByText(COPY.profile.settingsEntryHint)
    ).toBeInTheDocument();
  });
});
