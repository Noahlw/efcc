import { cleanup, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AccountSettings } from "@/app/profile/account-settings";
import { ACCOUNT_UPDATED_KEY } from "@/app/profile/account-settings";
import ProfileSettingsPage from "@/app/profile/settings/page";
import type { Bootstrap, PublicUser } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { ACCOUNT_SETTINGS_COPY } from "@/lib/account-settings-copy";

const mocks = vi.hoisted(() => {
  const replaceMock = vi.fn<(path: string) => void>();
  const mockRouter = {
    replace: replaceMock,
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(path: string) => void>(),
    prefetch: vi.fn<(path: string) => void>(),
  };
  return { replaceMock, mockRouter };
});

const { replaceMock } = mocks;
const { mockRouter } = mocks;

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/profile",
}));

const sessionMocks = vi.hoisted(() => ({
  clearAuthHintMock: vi.fn<() => void>(),
  setAuthHintMock: vi.fn<() => void>(),
  hasAuthHintMock: vi.fn<() => boolean>(),
  restoreBootstrapMock: vi.fn<() => Promise<Bootstrap>>(),
}));

vi.mock(import("@/lib/session"), () => ({
  clearAuthHint: sessionMocks.clearAuthHintMock,
  setAuthHint: sessionMocks.setAuthHintMock,
  hasAuthHint: sessionMocks.hasAuthHintMock,
  restoreBootstrap: sessionMocks.restoreBootstrapMock,
}));

const PROFILE: PublicUser = {
  userId: "U001",
  name: "Alice Chan",
  username: "alice",
  phone: "555",
  role: "Admin",
  status: "Active",
  qrCodeString: "qr-alice",
};

const BOOTSTRAP: Bootstrap = {
  sections: [],
  profile: PROFILE,
};

const server = setupServer();

function renderSettings() {
  return render(
    <AppProvider bootstrap={BOOTSTRAP} onSignOut={vi.fn()}>
      <AccountSettings />
    </AppProvider>
  );
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
  next: string
) {
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel),
    current
  );
  await user.type(
    screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel),
    next
  );
}

describe(AccountSettings, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    replaceMock.mockReset();
    sessionMocks.clearAuthHintMock.mockReset();
    sessionStorage.removeItem(ACCOUNT_UPDATED_KEY);
  });
  afterAll(() => server.close());

  test("renders both forms with labeled inputs and the 8-char hint", () => {
    renderSettings();
    expect(
      screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.usernameLabel)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.currentPasswordLabel)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(ACCOUNT_SETTINGS_COPY.newPasswordLabel)
    ).toBeInTheDocument();
    // ≥8-char hint in zh-Hant; no confirmation field.
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.passwordHint)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("確認新密碼")
    ).not.toBeInTheDocument();
  });

  test("username success: 已更新 state, sessionStorage notice, clear hint, route to /", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-1",
          data: { username: "alice2", sessionRevoked: true },
        })
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillUsername(user, "alice2");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.updated)
    ).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_SETTINGS_COPY.redirecting)).toBeInTheDocument();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(sessionStorage.getItem(ACCOUNT_UPDATED_KEY)).toBe("1");
  });

  test("sessionRevoked: handoff is synchronous (no 900ms delay, no unmount cancel)", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-s16",
          data: { username: "alice2", sessionRevoked: true },
        })
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillUsername(user, "alice2");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    // Success state renders synchronously after the fetch resolves; the
    // handoff must already have happened in the same tick — no timer.
    await screen.findByText(ACCOUNT_SETTINGS_COPY.updated);
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(sessionStorage.getItem(ACCOUNT_UPDATED_KEY)).toBe("1");
    expect(sessionMocks.clearAuthHintMock).toHaveBeenCalled();
  });

  test("username no-op (sessionRevoked false) keeps the session and shows notice", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json({
          requestId: "req-2",
          data: { username: "alice", sessionRevoked: false },
        })
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillUsername(user, "alice");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.usernameUnchanged)
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ACCOUNT_UPDATED_KEY)).toBeNull();
  });

  test("duplicate username 409 renders 此用戶名稱已被使用 inline", async () => {
    server.use(
      http.post("/api/v1/auth/username", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#CONFLICT",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            requestId: "req-3",
            detail: "An account with that username already exists.",
          },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillUsername(user, "carol");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.usernameSubmit })
    );

    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.usernameTaken)
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("wrong current password 422 renders 目前密碼不正確 inline", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#VALIDATION",
            title: "Validation failed",
            status: 422,
            code: "VALIDATION",
            requestId: "req-4",
            detail: "current password is incorrect",
          },
          { status: 422 }
        )
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillPassword(user, "wrong", "alice-new-secret");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.wrongCurrentPassword)
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("password success: 已更新 state then route to / with the notice", async () => {
    server.use(
      http.post("/api/v1/auth/password", () =>
        HttpResponse.json({
          requestId: "req-5",
          data: { sessionRevoked: true },
        })
      )
    );
    const user = userEvent.setup();
    renderSettings();
    await fillPassword(user, "alice-secret", "alice-new-secret");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.updated)
    ).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(sessionStorage.getItem(ACCOUNT_UPDATED_KEY)).toBe("1");
  });
  test("network error renders the S14 recovery block; 重試連接 refocuses and re-submits", async () => {
    let attempts = 0;
    server.use(
      http.post("/api/v1/auth/password", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json({
          requestId: "req-7",
          data: { sessionRevoked: true },
        });
      })
    );
    const user = userEvent.setup();
    renderSettings();
    await fillPassword(user, "alice-secret", "alice-new-secret");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );

    const retry = await screen.findByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.retry,
    });
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.networkError)
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    // Focus handoff: the recovery control receives focus.
    expect(retry).toHaveFocus();

    await user.click(retry);
    expect(
      await screen.findByText(ACCOUNT_SETTINGS_COPY.updated)
    ).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(attempts).toBe(2);
  });

  test("client-side validation: empty fields and short password blocked before fetch", async () => {
    let fetched = false;
    server.use(
      http.post("/api/v1/auth/password", () => {
        fetched = true;
        return HttpResponse.json({
          requestId: "req-6",
          data: { sessionRevoked: true },
        });
      })
    );
    const user = userEvent.setup();
    renderSettings();

    // Empty password form.
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(
      screen.getByText(ACCOUNT_SETTINGS_COPY.missingPasswordFields)
    ).toBeInTheDocument();

    // Short new password.
    await fillPassword(user, "alice-secret", "short7");
    await user.click(
      screen.getByRole("button", { name: ACCOUNT_SETTINGS_COPY.passwordSubmit })
    );
    expect(
      screen.getAllByRole("alert").some(
        (el) => el.textContent === ACCOUNT_SETTINGS_COPY.shortPassword
      )
    ).toBe(true);

    expect(fetched).toBe(false);
  });
});

describe(ProfileSettingsPage, () => {
  afterEach(() => {
    cleanup();
    sessionMocks.restoreBootstrapMock.mockReset();
    replaceMock.mockReset();
  });

  test("renders AccountSettings at /profile/settings", async () => {
    sessionMocks.restoreBootstrapMock.mockResolvedValue(BOOTSTRAP);
    render(<ProfileSettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: ACCOUNT_SETTINGS_COPY.sectionTitle })
      ).toBeInTheDocument();
    });
  });
});