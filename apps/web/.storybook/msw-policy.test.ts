import { describe, expect, test, vi } from "vitest";

import { storybookOnUnhandledRequest } from "./preview";

describe("Storybook MSW unhandled-request policy", () => {
  test("fails on an unhandled application request", () => {
    const print = {
      warning: vi.fn<() => void>(),
      error: vi.fn<() => void>(),
    };
    const request = new Request("http://localhost/api/v1/management/hub");

    storybookOnUnhandledRequest(request, print);

    expect(print.error).toHaveBeenCalledOnce();
  });

  test("keeps common Storybook assets outside the application contract", () => {
    const print = {
      warning: vi.fn<() => void>(),
      error: vi.fn<() => void>(),
    };
    const request = new Request("http://localhost/@vite/client");

    storybookOnUnhandledRequest(request, print);

    expect(print.error).not.toHaveBeenCalled();
  });
});
