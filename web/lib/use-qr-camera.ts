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
}): {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraOpen: boolean;
  startCamera: () => void;
  stopCamera: () => void;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // The scan loop lives in one effect while the callbacks are re-created
  // every render; keep the latest versions behind refs so a scan never
  // acts on a stale closure (e.g. the operator's selected event).
  const onDetectRef = useRef(input.onDetect);
  onDetectRef.current = input.onDetect;
  const onUnavailableRef = useRef(input.onUnavailable);
  onUnavailableRef.current = input.onUnavailable;

  useEffect(
    () => () => {
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    },
    []
  );

  function stopCamera() {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
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
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
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
    let cancelled = false;
    const scanner = new detector({ formats: ["qr_code"] });
    const scan = async () => {
      if (cancelled) {
        return;
      }
      try {
        const codes = await scanner.detect(video);
        const value = codes[0]?.rawValue;
        if (value) {
          stopCamera();
          onDetectRef.current(value);
          return;
        }
        requestAnimationFrame(() => void scan());
      } catch {
        if (!cancelled) {
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
        if (!cancelled) {
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

  return { videoRef, cameraOpen, startCamera, stopCamera };
}
