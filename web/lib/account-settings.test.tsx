import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import ProfilePage from "@/app/profile/page";
import ProfileSettingsPage from "@/app/profile/settings/page";
import type { Bootstrap, PublicUser } from "@/lib/api";
import { ACCOUNT_SETTINGS_COPY } from "@/lib/account-settings-copy";
import { COPY } from "@/lib/copy";
import { defaultSections, stableNavigationSections } from "@/lib/sections";

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
  return { replaceMock, pathnameMock, mockRouter };
});

const { replaceMock, pathnameMock, mockRouter } = mocks;

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => pathnameMock(),
}));

const sessionMocks = vi.hoisted(() => ({
  clearAuthHintMock: vi.fn<() => void>(),
  setAuthHintMock: vi.fn<() => void>(),
  hasAuthHintMock: vi.fn<() => boolean>(),
  restoreBootstrapMock: vi.fn<() => Promise<Bootstrap>>(),
}));

vi.mock("@/lib/session", () => ({
  clearAuthHint: sessionMocks.clearAuthHintMock,
  setAuthHint: sessionMocks.setAuthHintMock,
  hasAuthHint: sessionMocks.hasAuthHintMock,
  restoreBootstrap: sessionMocks.restoreBootstrapMock,
  clearDeepLink: vi.fn(),
  rememberDeepLink: vi.fn(),
}));

const PROFILE: PublicUser = {
  userId: "U001",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  role: "Member",
  status: "Active",
  qrCodeString: "qr-member-demo",
};

const BOOTSTRAP: Bootstrap = {
  sections: defaultSections(),
  navigation: stableNavigationSections("Member"),
  profile: PROFILE,
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  replaceMock.mockReset();
  sessionMocks.clearAuthHintMock.mockReset();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterAll(() => server.close());

async function renderSettingsPage() {
  pathnameMock.mockReturnValue("/profile/settings");
  sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);
  sessionMocks.hasAuthHintMock.mockReturnValue(true);
  const view = render(<ProfileSettingsPage />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })).toBeInTheDocument();
  });
  return view;
}

async function renderProfilePage() {
  pathnameMock.mockReturnValue("/profile");
  sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);
  sessionMocks.hasAuthHintMock.mockReturnValue(true);
  const view = render(<ProfilePage />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: COPY.profile.title })).toBeInTheDocument();
  });
  return view;
}

async function fillUsername(user: UserEvent, value: string) {
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel),
    value
  );
}

async function fillPassword(
  user: UserEvent,
  current: string,
  next: string,
  confirm: string
) {
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel),
    current
  );
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel),
    next
  );
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel),
    confirm
  );
}

describe(ProfileSettingsPage, () => {
  test("renders both forms with labeled inputs, helper texts, and back link", async () => {
    await renderSettingsPage();

    // Headers & Navigation
    expect(screen.getAllByText(ACCOUNT_SETTINGS_COPY.headerTitle).length).toBeGreaterThan(0);
    const backLinks = screen.getAllByRole("link", { name: new RegExp(ACCOUNT_SETTINGS_COPY.backToProfile) });
    const backLink = backLinks.find((el) => el.getAttribute("href") === "/profile");
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/profile");

    expect(screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.sectionLead)).toBeInTheDocument();

    // Username section
    expect(screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.usernameTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })).toBeInTheDocument();

    // Password section
    expect(screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.passwordTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.passwordHint)).toBeInTheDocument();
    expect(screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.passwordNotice)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })).toBeInTheDocument();
  });

  test("username change: validates non-empty and succeeds with '登入名稱已更新'", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-u1",
          data: { username: "member.new", sessionRevoked: true },
        })
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();

    // 1. Submit empty -> client validation error
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit }));
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.missingUsername)).toBeInTheDocument();

    // 2. Submit valid -> shows success message
    await fillUsername(user, "member.new");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit }));

    expect(await screen.findByText(ACCOUNT_SETTINGS_COPY.usernameSuccess)).toBeInTheDocument();
  });

  test("username change: handles duplicate username 409 conflict", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#CONFLICT",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            requestId: "req-u2",
            detail: "An account with that username already exists.",
          },
          { status: 409 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();

    await fillUsername(user, "taken.user");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit }));

    expect(await screen.findByText(ACCOUNT_SETTINGS_COPY.usernameTaken)).toBeInTheDocument();
  });

  test("password change: validates ≥8 chars and mismatch, succeeds with sign-out", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json({
          requestId: "req-p1",
          data: { sessionRevoked: true },
        })
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();

    // 1. Submit empty -> missing fields error
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.missingPasswordFields)).toBeInTheDocument();

    // 2. Submit short password (<8 chars)
    const currentInput = screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel);
    const newInput = screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel);
    const confirmInput = screen.getByLabelText(ACCOUNT_SETTINGS_COPY.confirmPasswordLabel);

    await user.type(currentInput, "curr-pass-123");
    await user.type(newInput, "short");
    await user.type(confirmInput, "short");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => el.textContent?.includes(ACCOUNT_SETTINGS_COPY.shortPassword))).toBe(true);

    // 3. Submit mismatched password
    await user.clear(newInput);
    await user.clear(confirmInput);
    await user.type(newInput, "new-secret-888");
    await user.type(confirmInput, "mismatch-999");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.passwordMismatch)).toBeInTheDocument();

    // 4. Submit matching password -> signs out (clears auth hint and redirects)
    await user.clear(confirmInput);
    await user.type(confirmInput, "new-secret-888");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));

    await waitFor(() => {
      expect(sessionMocks.clearAuthHintMock).toHaveBeenCalled();
    });
  });

  test("password change: handles wrong current password 422 error", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#VALIDATION",
            title: "Validation failed",
            status: 422,
            code: "VALIDATION",
            requestId: "req-p2",
            detail: "current password is incorrect",
          },
          { status: 422 }
        )
      )
    );

    const user = userEvent.setup();
    await renderSettingsPage();

    await fillPassword(user, "wrong-pass", "new-secret-888", "new-secret-888");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));

    expect(await screen.findByText(ACCOUNT_SETTINGS_COPY.wrongCurrentPassword)).toBeInTheDocument();
  });

  test("offline attempts for username and password show '未能更新。請重新連線後再試。'", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const user = userEvent.setup();
    await renderSettingsPage();

    // Username offline attempt
    await fillUsername(user, "member.offline");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit }));
    const alerts1 = screen.getAllByRole("alert");
    expect(alerts1.some((el) => el.textContent?.includes(ACCOUNT_SETTINGS_COPY.offlineError))).toBe(true);

    // Password offline attempt
    await fillPassword(user, "curr-pass", "new-secret-888", "new-secret-888");
    await user.click(screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit }));
    const alerts2 = screen.getAllByRole("alert");
    expect(alerts2.some((el) => el.textContent?.includes(ACCOUNT_SETTINGS_COPY.offlineError))).toBe(true);
  });
});

describe(ProfilePage, () => {
  test("renders profile info (display name, phone, role, QR code) and settings/logout actions", async () => {
    server.use(
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 }))
    );
    const user = userEvent.setup();
    await renderProfilePage();

    // Title and Subtitle
    expect(screen.getByRole("heading", { name: COPY.profile.title })).toBeInTheDocument();
    expect(screen.getByText(COPY.profile.subtitle)).toBeInTheDocument();

    // QR badge and display name
    expect(screen.getByText(COPY.profile.qrBadge)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: PROFILE.name })).toBeInTheDocument();
    expect(screen.getByText(COPY.profile.statusValid)).toBeInTheDocument();

    // Details summary & fields
    expect(screen.getByText(COPY.profile.accountDetails)).toBeInTheDocument();
    expect(screen.getByText(PROFILE.username)).toBeInTheDocument();
    expect(screen.getByText(PROFILE.phone)).toBeInTheDocument();
    expect(screen.getByText(PROFILE.role)).toBeInTheDocument();

    // Settings actions
    const settingsLink = screen.getByRole("link", { name: new RegExp(COPY.profile.accountSettings) });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute("href", "/profile/settings");

    // Logout action
    const logoutButtons = screen.getAllByRole("button", { name: new RegExp(COPY.profile.logout) });
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(logoutButtons[logoutButtons.length - 1]);
    await waitFor(() => {
      expect(sessionMocks.clearAuthHintMock).toHaveBeenCalled();
    });
  });
});
