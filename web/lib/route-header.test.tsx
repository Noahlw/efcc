import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type NextLink from "next/link";
import { createRef } from "react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RouteHeader } from "@/lib/route-header";
import type { RouteHeaderProps } from "@/lib/route-header";

vi.mock(import("next/link"), () => ({
  default: (({
    children,
    replace,
    ...props
  }: ComponentProps<"a"> & { replace?: boolean }) => (
    <a data-link-replace={replace ? "true" : "false"} {...props}>
      {children}
    </a>
  )) as unknown as typeof NextLink,
}));

const DEFAULT_PROPS: RouteHeaderProps = {
  backHref: "/management",
  backLabel: "返回管理工作",
  title: "帳戶設定",
  lead: "更新你的登入資料。",
};

describe(RouteHeader, () => {
  afterEach(() => cleanup());

  test("renders one route heading, lead, Back, status, and action", () => {
    render(
      <RouteHeader
        {...DEFAULT_PROPS}
        status={<output>已載入</output>}
        action={<button type="button">儲存</button>}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: DEFAULT_PROPS.title })
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("更新你的登入資料。")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("href", DEFAULT_PROPS.backHref);
    expect(screen.getByRole("status")).toHaveTextContent("已載入");
    expect(screen.getByRole("button", { name: "儲存" })).toBeEnabled();
  });

  test("supports a route without a Back affordance", () => {
    render(<RouteHeader title="公開頁面" lead="公開內容。" />);

    expect(screen.getByRole("heading", { name: "公開頁面" })).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("passes replace navigation to the Back link", () => {
    render(<RouteHeader {...DEFAULT_PROPS} backReplace />);

    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("data-link-replace", "true");
  });

  test("uses push navigation by default", () => {
    render(<RouteHeader {...DEFAULT_PROPS} />);

    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveAttribute("data-link-replace", "false");
  });

  test("passes Back interception to the caller", async () => {
    const user = userEvent.setup();
    const seenCurrentTarget = vi.fn<(target: HTMLAnchorElement) => void>();
    const onBack = vi.fn<(event: React.MouseEvent<HTMLAnchorElement>) => void>(
      (event) => {
        seenCurrentTarget(event.currentTarget);
        event.preventDefault();
      }
    );
    render(<RouteHeader {...DEFAULT_PROPS} onBack={onBack} />);

    const link = screen.getByRole("link", { name: DEFAULT_PROPS.backLabel });
    await user.click(link);

    expect(onBack).toHaveBeenCalledOnce();
    expect(seenCurrentTarget).toHaveBeenCalledWith(link);
  });

  test("preserves busy status and disabled action semantics", () => {
    render(
      <RouteHeader
        {...DEFAULT_PROPS}
        status={<output aria-busy="true">正在載入…</output>}
        action={
          <button aria-busy="true" disabled type="button">
            儲存
          </button>
        }
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
  });

  test("supports caller-owned heading focus", async () => {
    const user = userEvent.setup();
    const headingRef = createRef<HTMLHeadingElement>();
    render(<RouteHeader {...DEFAULT_PROPS} headingRef={headingRef} />);

    await user.tab();
    expect(
      screen.getByRole("link", { name: DEFAULT_PROPS.backLabel })
    ).toHaveFocus();

    headingRef.current?.focus();
    expect(
      screen.getByRole("heading", { name: DEFAULT_PROPS.title })
    ).toHaveFocus();
  });
});
