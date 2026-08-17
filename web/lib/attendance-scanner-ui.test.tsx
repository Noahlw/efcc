import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScannerCamera } from "@/lib/attendance-scanner-ui";
import { COPY } from "@/lib/copy";

describe("attendance scanner UI", () => {
  test("keeps the unavailable camera frame focused on the manual fallback", () => {
    render(
      <ScannerCamera
        cameraOpen={false}
        cameraAvailable={false}
        videoRef={{ current: null }}
        onStart={vi.fn<() => void>()}
        onClose={vi.fn<() => void>()}
      />
    );

    expect(screen.getByLabelText(COPY.attendance.camera)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.attendance.startScan })
    ).toBeNull();
  });

  test("hides the start action after permission denial", () => {
    render(
      <ScannerCamera
        cameraOpen={false}
        cameraAvailable
        cameraUnavailable
        videoRef={{ current: null }}
        onStart={vi.fn<() => void>()}
        onClose={vi.fn<() => void>()}
      />
    );

    expect(
      screen.queryByRole("button", { name: COPY.attendance.startScan })
    ).toBeNull();
  });
});
