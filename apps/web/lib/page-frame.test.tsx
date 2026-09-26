import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PageFrame } from "@/lib/page-frame";

describe("canonical page frame", () => {
  test("renders its route content inside the requested shared frame", () => {
    render(
      <PageFrame aria-label="路由內容" width="compact">
        <p>長內容仍由 route owner 提供。</p>
      </PageFrame>
    );

    const frame = screen.getByLabelText("路由內容");
    expect(frame).toHaveAttribute("data-page-frame");
    expect(frame).toHaveAttribute("data-page-frame-width", "compact");
    expect(frame).toHaveTextContent("長內容仍由 route owner 提供。");
  });
});
