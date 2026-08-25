import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
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
  onDenied,
  onUnsupported,
  reportUnavailableOnMount,
}: {
  onDetect: (value: string) => void;
  onUnavailable: () => void;
  onDenied?: () => void;
  onUnsupported?: () => void;
  reportUnavailableOnMount?: boolean;
}) => {
  const camera = useQrCamera({
    onDetect,
    onUnavailable,
    onDenied,
    onUnsupported,
    reportUnavailableOnMount,
  });
  const handleStart = () => {
    void camera.startCamera();
  };
  const handleStop = () => {
    camera.stopCamera();
  };
  return (
    <>
      <button type="button" onClick={handleStart}>
        start
      </button>
      <button type="button" onClick={handleStop}>
        stop
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

  test("reports denied permission separately without keeping a camera stream", async () => {
    const onUnavailable = vi.fn<() => void>();
    const onDenied = vi.fn<() => void>();
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    installDetector();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const user = userEvent.setup();
    render(
      <CameraProbe
        onDetect={() => {}}
        onUnavailable={onUnavailable}
        onDenied={onDenied}
      />
    );

    await user.click(screen.getByRole("button", { name: "start" }));
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
    expect(onDenied).toHaveBeenCalledOnce();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(screen.queryByTestId("camera-video")).toBeNull();
  });

  test("falls back when the OS ends the video track mid-session", async () => {
    let fireEnded: (() => void) | null = null;
    const stop = vi.fn<() => void>();
    const track = {
      stop,
      addEventListener: vi.fn((type: string, handler: () => void) => {
        if (type === "ended") {
          fireEnded = handler;
        }
      }),
    } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
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
    const onUnavailable = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<CameraProbe onDetect={() => {}} onUnavailable={onUnavailable} />);

    await user.click(screen.getByRole("button", { name: "start" }));
    await expect(
      screen.findByTestId("camera-video")
    ).resolves.toBeInTheDocument();

    // F-04: OS reclaims the camera mid-session — the ended event must tear
    // down the frozen live view and surface the unavailable fallback.
    await act(async () => {
      fireEnded?.();
    });
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("camera-video")).toBeNull();
  });

  test("settles unavailable capability without an indefinite probe", async () => {
    const onUnsupported = vi.fn<() => void>();
    render(
      <CameraProbe
        onDetect={() => {}}
        onUnavailable={() => {}}
        onUnsupported={onUnsupported}
        reportUnavailableOnMount
      />
    );

    await vi.waitFor(() => expect(onUnsupported).toHaveBeenCalledOnce());
  });

  test("stops every track when the camera surface unmounts", async () => {
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
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

  test("stops a stream that resolves after explicit camera cleanup", async () => {
    const pending = Promise.withResolvers<MediaStream>();
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    installDetector();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn<() => Promise<MediaStream>>(() => pending.promise),
      },
    });
    const user = userEvent.setup();
    render(<CameraProbe onDetect={() => {}} onUnavailable={() => {}} />);

    await user.click(screen.getByRole("button", { name: "start" }));
    await user.click(screen.getByRole("button", { name: "stop" }));
    pending.resolve(stream);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("camera-video")).toBeNull();
  });

  test("opens after StrictMode effect replay", async () => {
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    const pendingDetection = Promise.withResolvers<DetectedCode[]>();
    detectorDetection = pendingDetection.promise;
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
      <StrictMode>
        <CameraProbe onDetect={() => {}} onUnavailable={() => {}} />
      </StrictMode>
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
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
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

  test("ignores a detector result that resolves after camera cleanup", async () => {
    const stop = vi.fn<() => void>();
    const onDetect = vi.fn<(value: string) => void>();
    const pending = Promise.withResolvers<DetectedCode[]>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    detectorDetection = pending.promise;
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
      <CameraProbe onDetect={onDetect} onUnavailable={() => {}} />
    );
    await user.click(screen.getByRole("button", { name: "start" }));
    await expect(
      screen.findByTestId("camera-video")
    ).resolves.toBeInTheDocument();

    view.unmount();
    pending.resolve([{ rawValue: "stale" }]);
    await Promise.resolve();
    expect(onDetect).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("ignores a detector result that resolves after explicit camera stop", async () => {
    const stop = vi.fn<() => void>();
    const onDetect = vi.fn<(value: string) => void>();
    const pending = Promise.withResolvers<DetectedCode[]>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    detectorDetection = pending.promise;
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
    await expect(
      screen.findByTestId("camera-video")
    ).resolves.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "stop" }));
    pending.resolve([{ rawValue: "stale-after-stop" }]);
    await Promise.resolve();
    expect(onDetect).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });
});
