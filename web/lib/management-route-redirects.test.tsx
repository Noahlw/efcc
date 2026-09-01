import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PermissionsPage from "@/app/permissions/page";
import RegistrationsPage from "@/app/registrations/page";
afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  searchParams: {
    get: vi.fn<(key: string) => string | null>(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () =>
    mocks.searchParams as unknown as ReadonlyURLSearchParams,
}));

describe("S4 canonical management redirects", () => {
  beforeEach(() => {
    mocks.router.replace.mockReset();
    mocks.searchParams.get.mockReset();
    mocks.searchParams.get.mockReturnValue(null);
  });

  test("redirects legacy registrations to canonical Approvals", async () => {
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=approvals"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/management?module=approvals"
    );
    expect(
      screen.getByRole("heading", { name: "正在前往註冊審批…" })
    ).toBeVisible();
  });

  test("rejects external returns while keeping a visible safe fallback", async () => {
    mocks.searchParams.get.mockReturnValue("https://attacker.example");
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=approvals"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/management?module=approvals"
    );
  });
  test("rejects protocol-relative returns", async () => {
    mocks.searchParams.get.mockReturnValue("//attacker.example");
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=approvals"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/management?module=approvals"
    );
  });

  test("rejects returns outside management and Programs", async () => {
    mocks.searchParams.get.mockReturnValue("/home");
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=approvals"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/management?module=approvals"
    );
  });

  test("preserves approved Programs returns", async () => {
    mocks.searchParams.get.mockReturnValue("/programs?program=demo");
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/programs?program=demo"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/programs?program=demo"
    );
  });
  test("preserves approved management returns", async () => {
    mocks.searchParams.get.mockReturnValue("/management?module=accounts");
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=accounts"
      )
    );
    expect(screen.getByRole("link", { name: "前往註冊審批" })).toHaveAttribute(
      "href",
      "/management?module=accounts"
    );
  });

  test("redirects legacy permissions to canonical Role Policy", async () => {
    render(<PermissionsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=permissions"
      )
    );
  });
});
