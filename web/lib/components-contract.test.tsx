import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

describe("shared component contracts", () => {
  test("keeps the reset in the base layer so utilities can win", () => {
    const globals = readFileSync(
      path.resolve(process.cwd(), "app/globals.css"),
      "utf-8"
    );
    const baseLayer = globals.indexOf("@layer base");
    const reset = globals.indexOf("box-sizing: border-box;");

    expect(baseLayer).toBeGreaterThanOrEqual(0);
    expect(reset).toBeGreaterThan(baseLayer);
    expect(globals).not.toMatch(/\n\*\s*\{\s*box-sizing: border-box;/u);
  });

  test("exposes the shared default target and field spacing", () => {
    render(
      <>
        <Button>Save</Button>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Switch aria-label="Enabled" />
      </>
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "h-11",
      "px-2.5"
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveClass(
      "h-11",
      "px-2.5",
      "py-1"
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveClass(
      "min-h-16",
      "px-2.5",
      "py-2"
    );
    expect(screen.getByRole("switch", { name: "Enabled" })).toHaveClass(
      "data-[size=default]:h-6",
      "data-[size=default]:w-11"
    );
  });

  test("uses semantic card and navigation sizing contracts", () => {
    render(
      <>
        <Card size="empty">No records</Card>
        <Tabs defaultValue="one">
          <TabsList aria-label="Sections">
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
        </Tabs>
        <Accordion type="single" collapsible>
          <AccordionItem value="one">
            <AccordionTrigger>More</AccordionTrigger>
          </AccordionItem>
        </Accordion>
      </>
    );

    expect(
      screen.getByText("No records").closest("[data-slot=card]")
    ).toHaveAttribute("data-size", "empty");
    expect(screen.getByRole("tablist")).toHaveClass("min-h-11", "h-auto");
    expect(screen.getByRole("tab", { name: "One" })).toHaveClass(
      "min-h-11",
      "px-3",
      "py-2"
    );
    expect(screen.getByRole("button", { name: "More" })).toHaveClass(
      "min-h-11",
      "px-3",
      "py-2"
    );
  });

  test("lets management directory cards grow around multiline content", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "app/programs/programs.module.css"),
      "utf-8"
    );
    const directoryCardRule = css.match(
      /\.directoryCard\s*\{(?<body>[\s\S]*?)\}/u
    )?.groups?.body;

    expect(directoryCardRule).toContain("align-items: stretch;");
    expect(directoryCardRule).toContain("justify-content: flex-start;");
    expect(directoryCardRule).toContain("height: auto;");
    expect(directoryCardRule).toContain("padding: 0.875rem 1rem;");
  });

  test("gives overlays an overflow and close-target contract", () => {
    const { rerender } = render(
      <Dialog open>
        <DialogContent showCloseButton>Long dialog content</DialogContent>
      </Dialog>
    );
    expect(
      screen
        .getByText("Long dialog content")
        .closest('[data-slot="dialog-content"]')
    ).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto", "pr-14");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "size-11"
    );

    rerender(
      <Sheet open>
        <SheetContent side="right">Long sheet content</SheetContent>
      </Sheet>
    );
    expect(
      screen
        .getByText("Long sheet content")
        .closest('[data-slot="sheet-content"]')
    ).toHaveClass("max-h-dvh", "overflow-y-auto");
  });

  test("renders alert actions in a layout slot instead of overlaying content", () => {
    render(<Alert>Alert content</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("px-3", "py-2.5");
  });
});
