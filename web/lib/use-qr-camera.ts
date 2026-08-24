import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface BarcodeDetectorInstance {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorInstance;

type WindowWithDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

interface PonyfillModule {
  BarcodeDetector: BarcodeDetectorConstructor;
  setZXingModuleOverrides: (options: {
    locateFile: (path: string, prefix: string) => string;
  }) => void;
}

const PROBE_TIMEOUT_MS = 3500;

function getNativeDetector(): BarcodeDetectorConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const candidate = (window as WindowWithDetector).BarcodeDetector;
  return candidate;
}
function hasGetUserMedia(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const devices = navigator.mediaDevices;
  return devices !== undefined && "getUserMedia" in devices;
}
function matchesMediaQuery(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

/**
 * Back-camera QR scanner shared by the member/guest and operator panels.
 * Owns the camera lifecycle (stream acquisition, per-frame BarcodeDetector
 * loop, cleanup) and reports decoded values through `onDetect`; both panels
 * then route the value through their own resolve/check-in flows.
 *
 * Capability resolution is tri-state: `cameraAvailable` is `null` while the
 * decoder probe is pending, `true` when a usable detector exists (native or
 * ponyfill), and `false` on definitive failure (import/wasm/timeout or no
 * mediaDevices). Permission denial is tracked separately via `onDenied` so
 * the UI can show a retry vs a no-retry unsupported state (F-19).
 */
export function useQrCamera(input: {
  onDetect: (value: string) => void;
  onUnavailable: () => void;
  onDenied?: () => void;
  onUnsupported?: () => void;
  enabled?: boolean;
  phoneOnly?: boolean;
  /**
   * Self check-in can show a useful fallback before a user clicks. This only
   * checks API availability; permission is still requested by startCamera.
   * Fires only on a definitive `false`, never while probing (`null`).
   */
  reportUnavailableOnMount?: boolean;
}): {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOpen: boolean;
  cameraReady: boolean;
  cameraAvailable: boolean | null;
  startCamera: () => void;
  stopCamera: () => void;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorConstructor | null>(null);
  const probeRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(() => {
    if (input.enabled === false) {
      return false;
    }
    if (typeof window === "undefined") {
      return null;
    }
    if (input.phoneOnly && matchesMediaQuery("(min-width: 800px)")) {
      return false;
    }
    const native = getNativeDetector();
    if (native && hasGetUserMedia()) {
      detectorRef.current = native;
      return true;
    }
    return null;
  });

  const onDetectRef = useRef(input.onDetect);
  onDetectRef.current = input.onDetect;
  const onUnavailableRef = useRef(input.onUnavailable);
  onUnavailableRef.current = input.onUnavailable;
  const onDeniedRef = useRef(input.onDenied);
  onDeniedRef.current = input.onDenied;
  const onUnsupportedRef = useRef(input.onUnsupported);
  onUnsupportedRef.current = input.onUnsupported;
  const reportUnavailableOnMountRef = useRef(input.reportUnavailableOnMount);
  reportUnavailableOnMountRef.current = input.reportUnavailableOnMount;
  function reportUnavailable() {
    onUnavailableRef.current();
  }

  function reportUnsupported() {
    if (onUnsupportedRef.current) {
      onUnsupportedRef.current();
      return;
    }
    reportUnavailable();
  }

  function reportDenied() {
    if (onDeniedRef.current) {
      onDeniedRef.current();
      return;
    }
    reportUnavailable();
  }

  useEffect(() => {
    if (cameraAvailable !== null) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    if (input.phoneOnly && matchesMediaQuery("(min-width: 800px)")) {
      setCameraAvailable(false);
      return;
    }
    if (!hasGetUserMedia()) {
      setCameraAvailable(false);
      return;
    }

    let cancelled = false;
    let settled = false;
    let timeout = 0;
    let resolveProbe!: (available: boolean) => void;
    const probe = new Promise<boolean>((resolve) => {
      resolveProbe = resolve;
    });
    probeRef.current = probe;
    const settle = (available: boolean) => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      setCameraAvailable(available);
      resolveProbe(available);
    };
    timeout = window.setTimeout(() => settle(false), PROBE_TIMEOUT_MS);

    (async () => {
      try {
        // ponytail: dynamic import keeps ponyfill+wasm off native-detector
        // browsers; a static import would make Chrome download the fallback.
        const loaded =
          (await import("barcode-detector/ponyfill")) as unknown as PonyfillModule;
        loaded.setZXingModuleOverrides({
          locateFile: (path, prefix) =>
            path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : prefix + path,
        });
        if (cancelled || settled) {
          return;
        }
        detectorRef.current = loaded.BarcodeDetector;
        settle(true);
      } catch {
        settle(false);
      }
    })();

    return () => {
      cancelled = true;
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        resolveProbe(false);
      }
      window.clearTimeout(timeout);
    };
  }, [cameraAvailable, input.phoneOnly]);

  useEffect(() => {
    if (
      input.enabled !== false &&
      reportUnavailableOnMountRef.current &&
      cameraAvailable === false
    ) {
      reportUnsupported();
    }
  }, [cameraAvailable, input.enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      streamRef.current = null;
    };
  }, []);

  function stopCamera() {
    generationRef.current += 1;
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    if (mountedRef.current) {
      setCameraOpen(false);
      setCameraReady(false);
    }
  }

  async function startCamera() {
    if (input.enabled === false) {
      return;
    }
    const generation = generationRef.current + 1;
    setCameraReady(false);
    generationRef.current = generation;
    let detector = detectorRef.current ?? getNativeDetector();
    if (!detector && cameraAvailable === null) {
      const available = await (probeRef.current ?? Promise.resolve(false));
      if (!available) {
        reportUnsupported();
        return;
      }
      detector = detectorRef.current ?? getNativeDetector();
    }
    if (!detector || !hasGetUserMedia()) {
      reportUnsupported();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!mountedRef.current || generationRef.current !== generation) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (error: unknown) {
      if (!mountedRef.current || generationRef.current !== generation) {
        return;
      }
      const isDenied =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        typeof error.name === "string" &&
        (error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError" ||
          error.name === "SecurityError");
      stopCamera();
      if (isDenied) {
        reportDenied();
      } else {
        reportUnsupported();
      }
    }
  }

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) {
      return;
    }
    const detector = detectorRef.current ?? getNativeDetector();
    if (!detector) {
      reportUnsupported();
      return;
    }

    const video = videoRef.current;
    const stream = streamRef.current;
    const generation = generationRef.current;
    let cancelled = false;

    let decoderReady = false;
    const readinessTimeout = window.setTimeout(() => {
      if (!cancelled && generationRef.current === generation && !decoderReady) {
        stopCamera();
        reportUnsupported();
      }
    }, PROBE_TIMEOUT_MS);

    const scan = async (scanner: BarcodeDetectorInstance) => {
      if (cancelled || generationRef.current !== generation) {
        return;
      }
      try {
        const codes = await scanner.detect(video);
        if (cancelled || generationRef.current !== generation) {
          return;
        }
        if (!decoderReady) {
          decoderReady = true;
          window.clearTimeout(readinessTimeout);
          setCameraReady(true);
        }
        const value = codes[0]?.rawValue;
        if (value) {
          stopCamera();
          onDetectRef.current(value);
          return;
        }
        requestAnimationFrame(() => void scan(scanner));
      } catch {
        if (!cancelled && generationRef.current === generation) {
          stopCamera();
          reportUnsupported();
        }
      }
    };

    video.srcObject = stream;
    const startScan = async () => {
      try {
        const scanner = new detector({ formats: ["qr_code"] });
        await video.play();
        if (cancelled || generationRef.current !== generation) {
          return;
        }
        await scan(scanner);
      } catch {
        if (!cancelled && generationRef.current === generation) {
          stopCamera();
          reportUnsupported();
        }
      }
    };
    void startScan();
    return () => {
      cancelled = true;
      window.clearTimeout(readinessTimeout);
    };
  }, [cameraOpen]);

  return {
    videoRef,
    cameraOpen,
    cameraReady,
    cameraAvailable,
    startCamera,
    stopCamera,
  };
}
