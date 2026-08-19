import { describe, expect, test } from "vitest";

import { buildMessagesHref, parseMessagesIntent } from "@/lib/messages-intent";

describe("messages intent", () => {
  test("parses a single content id and builds the list/detail hrefs", () => {
    expect(parseMessagesIntent("")).toStrictEqual({
      contentId: null,
      malformed: false,
    });
    expect(parseMessagesIntent("?content=church-msg-1")).toStrictEqual({
      contentId: "church-msg-1",
      malformed: false,
    });
    expect(parseMessagesIntent("?content=bad id")).toStrictEqual({
      contentId: null,
      malformed: true,
    });
    expect(buildMessagesHref()).toBe("/messages");
    expect(buildMessagesHref("church-msg-1")).toBe(
      "/messages?content=church-msg-1"
    );
  });
});
