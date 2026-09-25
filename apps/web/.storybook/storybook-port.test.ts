import { describe, expect, test } from "vitest";

import { parseStorybookPort } from "../scripts/storybook-port.mjs";

describe("Storybook port parsing", () => {
  test.each([
    ["1", 1],
    ["6006", 6006],
    ["65535", 65_535],
  ])("accepts %s", (value, expected) => {
    expect(parseStorybookPort(value)).toBe(expected);
  });

  test.each(["", "0", "-1", "65536", "6006.5", "6e3", "abc"])(
    "rejects %s",
    (value) => {
      expect(() => parseStorybookPort(value)).toThrow(
        "must be an integer between 1 and 65535"
      );
    }
  );
});
