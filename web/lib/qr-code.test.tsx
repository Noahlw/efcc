import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { QrCode } from "./qr-code";

describe(QrCode, () => {
  afterEach(() => {
    cleanup();
  });

  test("renders a labelled img role with an injected SVG path", async () => {
    render(<QrCode value="qr:u1" label="QR Code" />);
    const img = screen.getByRole("img", { name: "QR Code" });
    expect(img).toBeInTheDocument();
    await waitFor(() => {
      expect(img.querySelector("path")).not.toBeNull();
    });
  });

  test("falls back to the raw string while the SVG is unavailable", () => {
    render(<QrCode value="qr:u1" label="QR Code" />);
    const img = screen.getByRole("img", { name: "QR Code" });
    expect(img.textContent).toContain("qr:u1");
  });
});