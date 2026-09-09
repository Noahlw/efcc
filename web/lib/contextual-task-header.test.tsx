import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    replace,
    ...props
  }: ComponentProps<"a"> & { replace?: boolean }) => (
    <a data-link-replace={replace ? "true" : "false"} {...props} />
  ),
}));

import { ContextualTaskHeader } from "@/lib/contextual-task-header";
import type { ContextualTaskHeaderProps } from "@/lib/contextual-task-header";

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
        status={<output>已載入</output>}
        action={<button type="button">儲存</button>}
      />
    );

    expect(screen.getByRole("banner")).toHaveAttribute(
      "data-contextual-task-header"
    );
    expect(
      screen.getByRole("heading", { name: DEFAULT_PROPS.title })
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText(DEFAULT_PROPS.lead)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("href", DEFAULT_PROPS.backHref);
    expect(screen.getByRole("status")).toHaveTextContent("已載入");
    expect(screen.getByRole("button", { name: "儲存" })).toBeEnabled();
  });
  test("uses normal push navigation by default", () => {
    render(<ContextualTaskHeader {...DEFAULT_PROPS} />);

    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("data-link-replace", "false");
  });

  test("passes replace navigation to the Back link", () => {
    render(<ContextualTaskHeader {...DEFAULT_PROPS} backReplace />);

    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("data-link-replace", "true");
  });

  test("passes Back interception to the caller without owning navigation", async () => {
    const user = userEvent.setup();
    const seenCurrentTarget = vi.fn();
    const onBack = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => {
      seenCurrentTarget(event.currentTarget);
      event.preventDefault();
    });
    render(<ContextualTaskHeader {...DEFAULT_PROPS} onBack={onBack} />);

    const link = screen.getByRole("link", { name: DEFAULT_PROPS.backLabel });
    await user.click(link);

    expect(onBack).toHaveBeenCalledOnce();
    expect(seenCurrentTarget).toHaveBeenCalledWith(link);
  });

  test("supports keyboard navigation and caller-owned heading focus", async () => {
    const user = userEvent.setup();
    const headingRef = createRef<HTMLHeadingElement>();
    render(<ContextualTaskHeader {...DEFAULT_PROPS} headingRef={headingRef} />);

    await user.tab();
    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("heading", { name: DEFAULT_PROPS.title })
    ).not.toHaveFocus();

    headingRef.current?.focus();
    expect(
      screen.getByRole("heading", { name: DEFAULT_PROPS.title })
    ).toHaveFocus();
  });

  test("keeps busy and disabled action semantics while the compact layout remains composed", () => {
    render(
      <ContextualTaskHeader
        {...DEFAULT_PROPS}
        layout="compact"
        status={<output aria-busy="true">正在載入…</output>}
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
    expect(
      screen.getByRole("heading", { name: DEFAULT_PROPS.title })
    ).toBeInTheDocument();
  });
});
