import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const suspendedProgramsBoundary = vi.hoisted(() => {
  let pending: Promise<never> | null = null;
  return {
    getPromise: () => {
      pending ??= new Promise<never>(() => undefined);
      return pending;
    },
  };
});

vi.mock("@/lib/programs/programs-boundary", () => ({
  ProgramsBoundary: () => {
    throw suspendedProgramsBoundary.getPromise();
  },
}));

import { ProgramsRouteSurface } from "./programs-route-surface";

describe("ProgramsRouteSurface", () => {
  afterEach(() => {
    cleanup();
  });

  test("owns the compact route frame and boundary fallback", () => {
    render(<ProgramsRouteSurface />);

    const frame = document.querySelector(
      '[data-screen-foundation="page-frame"]'
    );
    expect(frame).toHaveAttribute("data-screen-route", "programs");
    expect(frame).toHaveAttribute("data-screen-width", "compact");
    expect(
      screen.getByText("正在確認管理權限…", { exact: false })
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
