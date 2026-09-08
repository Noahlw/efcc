import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  test("Card owns shared surface chrome without clipping content", () => {
    const { rerender } = render(
      <Card data-testid="surface-card">
        <p>Long content remains visible outside an arbitrary clipping box.</p>
      </Card>
    );

    const card = screen.getByTestId("surface-card");
    expect(card).toHaveAttribute("data-size", "default");
    expect(card.className).toContain("p-(--card-spacing)");
    expect(card.className).toContain("border-[var(--line)]");
    expect(card.className).toContain("rounded-[var(--radius-md)]");
    expect(card.className).toContain("bg-[var(--surface-raised)]");
    expect(card.className).not.toContain("overflow-hidden");

    rerender(<Card data-testid="surface-card" size="sm" />);
    expect(screen.getByTestId("surface-card")).toHaveAttribute(
      "data-size",
      "sm"
    );
  });

  test("CardFooter reaches the Card edge without a negative bottom escape", () => {
    render(
      <Card data-testid="footer-card">
        <CardContent>content</CardContent>
        <CardFooter data-testid="footer">actions</CardFooter>
      </Card>
    );

    const card = screen.getByTestId("footer-card");
    const footer = screen.getByTestId("footer");
    expect(card.className).toContain("has-data-[slot=card-footer]:pb-0");
    expect(card.className).toContain("overflow-visible");
    expect(footer.className).toContain("-mx-(--card-spacing)");
    expect(footer.className).not.toContain("-mb-(--card-spacing)");
  });

  test("Alert separates visual tone from announcement ownership", () => {
    render(
      <div>
        <Alert data-testid="alert-info" tone="info" announcement="none" />
        <Alert data-testid="alert-implicit-success" tone="success" />
        <Alert
          data-testid="alert-success"
          tone="success"
          announcement="polite"
        />
        <Alert
          data-testid="alert-error"
          variant="destructive"
          announcement="assertive"
        />
      </div>
    );

    expect(screen.getByTestId("alert-info")).not.toHaveAttribute("role");
    expect(screen.getByTestId("alert-info")).toHaveAttribute(
      "data-tone",
      "info"
    );
    expect(screen.getByTestId("alert-implicit-success")).toHaveAttribute(
      "data-announcement",
      "none"
    );
    expect(screen.getByTestId("alert-implicit-success")).not.toHaveAttribute(
      "role"
    );
    expect(screen.getByTestId("alert-implicit-success")).not.toHaveAttribute(
      "aria-live"
    );
    expect(screen.getByTestId("alert-success")).toHaveAttribute(
      "role",
      "status"
    );
    expect(screen.getByTestId("alert-success")).toHaveAttribute(
      "aria-live",
      "polite"
    );
    expect(screen.getByTestId("alert-error")).toHaveAttribute(
      "data-tone",
      "error"
    );
    expect(screen.getByTestId("alert-error")).toHaveAttribute("role", "alert");
  });

  test("AlertDescription inherits the Alert tone instead of resetting to muted text", () => {
    render(
      <Alert tone="success" announcement="none">
        <AlertDescription data-testid="alert-description">
          已完成
        </AlertDescription>
      </Alert>
    );

    expect(screen.getByTestId("alert-description")).toHaveClass("text-current");
    expect(screen.getByTestId("alert-description")).not.toHaveClass(
      "text-muted-foreground"
    );
  });

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

  test("AlertDialog Escape dismisses and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>開啟 Escape 測試</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>確認操作</AlertDialogTitle>
          <AlertDialogDescription>請確認後再繼續。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    const trigger = screen.getByRole("button", { name: "開啟 Escape 測試" });
    await user.click(trigger);
    expect(screen.getByRole("alertdialog")).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
  });
});
