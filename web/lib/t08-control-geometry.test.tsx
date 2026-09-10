import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

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

describe("T08 primitive-owned geometry", () => {
  test("keeps every production Button size at the approved target floor", () => {
    render(
      <div>
        <Button>default</Button>
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button size="lg">lg</Button>
        <Button size="row" shape="square">
          row
        </Button>
        <Button size="icon" aria-label="icon" />
        <Button size="icon-xs" aria-label="icon-xs" />
        <Button size="icon-sm" aria-label="icon-sm" />
        <Button size="icon-lg" aria-label="icon-lg" />
      </div>
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/(?:min-h-11|size-11)/u);
    }
    expect(screen.getByRole("button", { name: "default" }).className).toMatch(
      /wrap-anywhere/u
    );
    expect(screen.getByRole("button", { name: "default" }).className).toContain(
      "rounded-[var(--control-radius)]"
    );
  });

  test("keeps Input, Checkbox, Switch and Select roots at the shared floor", () => {
    render(
      <>
        <Input aria-label="name" />
        <Checkbox aria-label="checked" />
        <Switch aria-label="notifications" />
        <Select defaultValue="long">
          <SelectTrigger aria-label="choice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="long">
              一個很長的 Traditional Chinese and Latin selected value
            </SelectItem>
          </SelectContent>
        </Select>
      </>
    );

    expect(screen.getByRole("textbox", { name: "name" }).className).toMatch(
      /min-h-11/u
    );
    expect(screen.getByRole("textbox", { name: "name" }).className).toContain(
      "rounded-[var(--control-radius)]"
    );
    expect(screen.getByRole("checkbox", { name: "checked" }).className).toMatch(
      /size-11/u
    );
    expect(
      screen.getByRole("switch", { name: "notifications" }).className
    ).toMatch(/size-11/u);
    const trigger = screen.getByRole("combobox", { name: "choice" });
    expect(trigger.className.split(" ")).toStrictEqual(
      expect.arrayContaining(["min-h-11", "max-w-full", "overflow-hidden"])
    );
    expect(trigger.className).toContain("rounded-[var(--control-radius)]");
  });

  test("keeps Textarea multiline semantics and useful minimum", () => {
    render(<Textarea aria-label="description" rows={4} />);
    const textarea = screen.getByRole("textbox", { name: "description" });
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea.className).toMatch(/min-h-16/u);
    expect(textarea.className).toContain("rounded-[var(--control-radius)]");
  });
});
