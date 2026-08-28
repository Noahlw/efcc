import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { createRef } from "react";
import {
  ContextualTaskHeader,
  type ContextualTaskHeaderProps,
} from "@/lib/contextual-task-header";

afterEach(() => cleanup());

const DEFAULT_PROPS: ContextualTaskHeaderProps = {
  backHref: "/management",
  backLabel: "返回管理工作",
  title: "帳戶設定",
  lead: "更新你的登入資料。",
};

describe(ContextualTaskHeader, () => {
  test("renders one task heading, lead, contextual Back, and optional slots", () => {
    render(
      <ContextualTaskHeader
        {...DEFAULT_PROPS}
        status={<output role="status">已載入</output>}
        action={<button type="button">儲存</button>}
      />
    );

    expect(screen.getByRole("banner")).toHaveAttribute(
      "data-contextual-task-header"
    );
    expect(screen.getByRole("heading", { name: DEFAULT_PROPS.title })).toHaveAttribute(
      "tabindex",
      "-1"
    );
    expect(screen.getByText(DEFAULT_PROPS.lead)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })).toHaveAttribute(
      "href",
      DEFAULT_PROPS.backHref
    );
    expect(screen.getByRole("status")).toHaveTextContent("已載入");
    expect(screen.getByRole("button", { name: "儲存" })).toBeEnabled();
  });
  test("supports keyboard navigation and caller-owned heading focus", async () => {
    const user = userEvent.setup();
    const headingRef = createRef<HTMLHeadingElement>();
    render(<ContextualTaskHeader {...DEFAULT_PROPS} headingRef={headingRef} />);

    await user.tab();
    expect(screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("heading", { name: DEFAULT_PROPS.title })).not.toHaveFocus();

    headingRef.current?.focus();
    expect(screen.getByRole("heading", { name: DEFAULT_PROPS.title })).toHaveFocus();
  });

  test("keeps busy and disabled action semantics while the compact layout remains composed", () => {
    render(
      <ContextualTaskHeader
        {...DEFAULT_PROPS}
        layout="compact"
        status={<output role="status" aria-busy="true">正在載入…</output>}
        action={
          <button type="button" disabled aria-busy="true">
            儲存中…
          </button>
        }
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "儲存中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "儲存中…" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("heading", { name: DEFAULT_PROPS.title })).toBeInTheDocument();
  });
});
