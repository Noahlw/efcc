import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import PermissionsPage from "@/app/permissions/page";
import RegistrationsPage from "@/app/registrations/page";

const mocks = vi.hoisted(() => ({
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

describe("S4 canonical management redirects", () => {
  beforeEach(() => mocks.router.replace.mockReset());

  test("redirects legacy registrations to canonical Approvals", async () => {
    render(<RegistrationsPage />);
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/management?module=approvals"
      )
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
