import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

afterEach(() => {
  cleanup();
});

describe("T08 control public contracts", () => {
  test("Button preserves click, disabled, busy, submit, and asChild semantics", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick}>
          儲存
        </Button>
        <Button disabled>停用</Button>
        <Button aria-busy="true">處理中…</Button>
        <Button asChild variant="link">
          <a href="/home">返回首頁</a>
        </Button>
      </form>
    );

    await user.click(screen.getByRole("button", { name: "儲存" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "處理中…" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("link", { name: "返回首頁" })).toHaveAttribute(
      "href",
      "/home"
    );
  });

  test("Input and Textarea preserve native field attributes and values", () => {
    const { container } = render(
      <form>
        <label htmlFor="account-name">帳戶名稱</label>
        <Input
          id="account-name"
          name="account_name"
          type="search"
          value="Noah"
          readOnly
          required
          autoComplete="username"
          aria-invalid="true"
        />
        <label htmlFor="description">描述</label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue="內容"
        />
      </form>
    );

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(new FormData(form as HTMLFormElement).get("account_name")).toBe(
      "Noah"
    );
    expect(new FormData(form as HTMLFormElement).get("description")).toBe(
      "內容"
    );
    expect(screen.getByRole("searchbox", { name: "帳戶名稱" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByRole("textbox", { name: "描述" })).toHaveAttribute(
      "rows",
      "4"
    );
  });

  test("Checkbox preserves mixed state, label activation, and disabled state", async () => {
    const user = userEvent.setup();

    render(
      <fieldset>
        <label htmlFor="select-all">全選</label>
        <Checkbox id="select-all" checked="indeterminate" />
        <label htmlFor="select-one">單項</label>
        <Checkbox id="select-one" />
        <Checkbox aria-label="停用" disabled />
      </fieldset>
    );

    expect(screen.getByRole("checkbox", { name: "全選" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    );
    const checkbox = screen.getByRole("checkbox", { name: "單項" });
    await user.click(screen.getByText("單項"));
    expect(checkbox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "停用" })).toBeDisabled();
  });

  test("Switch preserves controlled state, keyboard activation, label, and busy", async () => {
    const user = userEvent.setup();

    render(
      <label htmlFor="notifications">
        通知
        <Switch id="notifications" aria-busy="true" />
      </label>
    );

    const toggle = screen.getByRole("switch", { name: "通知" });
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("通知"));
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("Select preserves selected value and keyboard option semantics", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select defaultValue="weekly" onValueChange={onValueChange}>
        <SelectTrigger aria-label="重複週期">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="weekly">每週</SelectItem>
          <SelectItem value="monthly">每月</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole("combobox", { name: "重複週期" });
    expect(trigger).toHaveTextContent("每週");
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "每月" }));
    expect(onValueChange).toHaveBeenCalledWith("monthly");
    expect(trigger).toHaveTextContent("每月");
  });
});
