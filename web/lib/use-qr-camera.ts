import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

/**
 * Back-camera QR scanner shared by the member/guest and operator panels.
 * Owns the camera lifecycle (stream acquisition, per-frame BarcodeDetector
 * loop, cleanup) and reports decoded values through `onDetect`; both panels
 * then route the value through their own resolve/check-in flows.
 */
export function useQrCamera(input: {
  onDetect: (value: string) => void;
  onUnavailable: () => void;
  /**
   * Self check-in can show a useful fallback before a user clicks. This only
   * checks API availability; permission is still requested by startCamera.
   */
  reportUnavailableOnMount?: boolean;
}): {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOpen: boolean;
  cameraAvailable: boolean;
  startCamera: () => void;
  stopCamera: () => void;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const cameraAvailable = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(
        (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor })
          .BarcodeDetector &&
          navigator.mediaDevices?.getUserMedia
      )
  )[0];
  const [cameraOpen, setCameraOpen] = useState(false);
  // The scan loop lives in one effect while the callbacks are re-created
  // every render; keep the latest versions behind refs so a scan never
  // acts on a stale closure (e.g. the operator's selected event).
  const onDetectRef = useRef(input.onDetect);
  onDetectRef.current = input.onDetect;
  const onUnavailableRef = useRef(input.onUnavailable);
  onUnavailableRef.current = input.onUnavailable;
  const reportUnavailableOnMountRef = useRef(input.reportUnavailableOnMount);
  reportUnavailableOnMountRef.current = input.reportUnavailableOnMount;

  useEffect(() => {
    if (reportUnavailableOnMountRef.current && !cameraAvailable) {
      onUnavailableRef.current();
    }
  }, [cameraAvailable]);

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
    }
  }

  async function startCamera() {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const detector = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!detector || !navigator.mediaDevices?.getUserMedia) {
      onUnavailableRef.current();
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
    } catch {
      if (!mountedRef.current || generationRef.current !== generation) {
        return;
      }
      stopCamera();
      onUnavailableRef.current();
    }
  }

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) {
      return;
    }
    const detector = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!detector) {
      onUnavailableRef.current();
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    const generation = generationRef.current;
    let cancelled = false;
    const scanner = new detector({ formats: ["qr_code"] });
    const scan = async () => {
      if (cancelled || generationRef.current !== generation) {
        return;
      }
      try {
        const codes = await scanner.detect(video);
        if (cancelled || generationRef.current !== generation) {
          return;
        }
        const value = codes[0]?.rawValue;
        if (value) {
          stopCamera();
          onDetectRef.current(value);
          return;
        }
        requestAnimationFrame(() => void scan());
      } catch {
        if (!cancelled && generationRef.current === generation) {
          stopCamera();
          onUnavailableRef.current();
        }
      }
    };
    video.srcObject = stream;
    const startScan = async () => {
      try {
        await video.play();
        await scan();
      } catch {
        if (!cancelled && generationRef.current === generation) {
          stopCamera();
          onUnavailableRef.current();
        }
      }
    };
    void startScan();
    return () => {
      cancelled = true;
    };
  }, [cameraOpen]);

  return { videoRef, cameraOpen, cameraAvailable, startCamera, stopCamera };
}
