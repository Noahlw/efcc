import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useQrCamera } from "@/lib/use-qr-camera";

interface DetectedCode {
  rawValue: string;
}

let detectorDetection: Promise<DetectedCode[]> = Promise.resolve([]);

function FakeBarcodeDetector() {
  return {
    detect: () => detectorDetection,
  };
}
function installDetector(): void {
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: FakeBarcodeDetector,
  });
}

const CameraProbe = ({
  onDetect,
  onUnavailable,
}: {
  onDetect: (value: string) => void;
  onUnavailable: () => void;
}) => {
  const camera = useQrCamera({ onDetect, onUnavailable });
  const handleStart = () => {
    void camera.startCamera();
  };
  return (
    <>
      <button type="button" onClick={handleStart}>
        start
      </button>
      {camera.cameraOpen && (
        <video data-testid="camera-video" ref={camera.videoRef}>
          <track kind="captions" />
        </video>
      )}
    </>
  );
};

describe("useQrCamera lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    detectorDetection = Promise.resolve([]);
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  test("reports a denied permission without keeping a camera stream", async () => {
    const onUnavailable = vi.fn<() => void>();
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockRejectedValue(new Error("denied"));
    installDetector();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const user = userEvent.setup();
    render(<CameraProbe onDetect={() => {}} onUnavailable={onUnavailable} />);

    await user.click(screen.getByRole("button", { name: "start" }));
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("camera-video")).toBeNull();
  });

  test("stops every track when the camera surface unmounts", async () => {
    const stop = vi.fn<() => void>();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    detectorDetection = Promise.resolve([]);
    installDetector();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn<() => Promise<MediaStream>>()
          .mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const user = userEvent.setup();
    const view = render(
      <CameraProbe onDetect={() => {}} onUnavailable={() => {}} />
    );

    await user.click(screen.getByRole("button", { name: "start" }));
    await expect(
      screen.findByTestId("camera-video")
    ).resolves.toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("decodes one detector value and releases the stream before reporting it", async () => {
    const stop = vi.fn<() => void>();
    const onDetect = vi.fn<(value: string) => void>();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    detectorDetection = Promise.resolve([
      { rawValue: "https://efcc.example/?program_token=QR" },
    ]);
    installDetector();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn<() => Promise<MediaStream>>()
          .mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const user = userEvent.setup();
    render(<CameraProbe onDetect={onDetect} onUnavailable={() => {}} />);

    await user.click(screen.getByRole("button", { name: "start" }));
    await vi.waitFor(() =>
      expect(onDetect).toHaveBeenCalledWith(
        "https://efcc.example/?program_token=QR"
      )
    );
    expect(stop).toHaveBeenCalledOnce();
  });
});
