// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";

import {
  clearDeepLink,
  consumeDeepLink,
  rememberDeepLink,
} from "@/lib/session";

afterEach(() => {
  sessionStorage.clear();
});

describe("Programs deep-link handoff", () => {
  test("preserves a same-origin Programs query and hash through login", () => {
    rememberDeepLink("/programs?mode=management&program=program-1#overview");

    expect(consumeDeepLink()).toBe(
      "/programs?mode=management&program=program-1#overview"
    );
    expect(consumeDeepLink()).toBeNull();
  });

  test("rejects unsafe or malformed stored destinations", () => {
    rememberDeepLink("https://evil.example/");
    expect(consumeDeepLink()).toBeNull();

    sessionStorage.setItem("efcc_deep_link", "//evil.example/programs");
    expect(consumeDeepLink()).toBeNull();

    sessionStorage.setItem("efcc_deep_link", "/programs?mode=sideways");
    expect(consumeDeepLink()).toBe("/programs?mode=sideways");
    clearDeepLink();
  });
});
