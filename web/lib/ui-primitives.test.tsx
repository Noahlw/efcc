import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});

describe("local primitive contracts", () => {
  test("Checkbox exposes checked, unchecked, mixed, disabled, keyboard, and names", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const onAliceCheckedChange = vi.fn();
    render(
      <div>
        <Checkbox
          aria-label="全選目前結果"
          checked="indeterminate"
          onCheckedChange={onCheckedChange}
        />
        <Checkbox
          aria-label="選取 Alice"
          defaultChecked={false}
          onCheckedChange={onAliceCheckedChange}
        />
        <Checkbox aria-label="選取 Bob" disabled />
      </div>
    );

    const selectAll = screen.getByRole("checkbox", { name: "全選目前結果" });
    expect(selectAll).toHaveAttribute("aria-checked", "mixed");
    expect(selectAll).toHaveAttribute("data-state", "indeterminate");
    expect(
      screen.getByRole("checkbox", { name: "選取 Alice" })
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "選取 Bob" })).toBeDisabled();

    const alice = screen.getByRole("checkbox", { name: "選取 Alice" });
    await user.tab();
    await user.tab();
    expect(alice).toHaveFocus();
    await user.keyboard(" ");
    expect(alice).toHaveAttribute("aria-checked", "true");
    expect(onAliceCheckedChange).toHaveBeenCalledWith(true);
  });

  test("Select preserves the chosen value through the local menu", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="all" onValueChange={onValueChange}>
        <SelectTrigger aria-label="篩選角色">
          <SelectValue placeholder="全部角色" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部角色</SelectItem>
          <SelectItem value="staff">同工</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole("combobox", { name: "篩選角色" });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "同工" }));
    expect(trigger).toHaveTextContent("同工");
    expect(onValueChange).toHaveBeenCalledWith("staff");
  });

  test("AlertDialog cancel restores focus to its trigger and confirm commits once", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>開啟確認</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>確認操作</AlertDialogTitle>
          <AlertDialogDescription>此操作會更新資料。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    const trigger = screen.getByRole("button", { name: "開啟確認" });
    await user.click(trigger);
    expect(
      screen.getByRole("alertdialog", { name: "確認操作" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
