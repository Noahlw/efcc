/* EFCC QR Scanner - external-origin camera page (F5, ADR-0015 Option A).
 *
 * Opened via window.open from the App Document (or the opener.html harness).
 * Learns the opener's exact origin from the handshake `event.origin`, starts
 * the rear camera, decodes QR codes, and posts an OPAQUE trimmed
 * scannedCode back to the opener. The opener runs api_qrCheckIn and posts the
 * result back; this page shows it inline (✓/✗) so the operator never looks
 * away from the camera. On close/unload it tears the stream down.
 *
 * Two decoders (ADR-0015), selected by ?decoder=jsqr (escape hatch):
 *   - html5-qrcode@2.3.8 (default, primary) - fast, validated on phone. Its
 *     own UI is hidden via CSS; a custom reticle overlays the video.
 *   - jsQR@1.4.0 (escape hatch) - getUserMedia + canvas, full lifecycle control.
 *
 * The App Document owns the check-in authority (#101); this page only decodes
 * and displays the result the App Document sends back.
 */
/* global Html5Qrcode, jsQR */

import {
  normalizeScannedCode,
  postScannedCodeToOpener,
  stopStreamTracks,
  parseResultMessage,
} from "./scanner-core.js";

const HANDSHAKE_TYPE = "EFCC_QR_HANDSHAKE";
const SUPPRESS_MS = 2500;
const HANDSHAKE_TIMEOUT_MS = 5000;

const SCANNER_STATE = Object.freeze({
  BOOTING: "BOOTING",
  CONNECTING: "CONNECTING",
  CAMERA_STARTING: "CAMERA_STARTING",
  READY: "READY",
  CHECKING_IN: "CHECKING_IN",
  RESULT: "RESULT",
  RECOVERY: "RECOVERY",
});

const video = document.querySelector("#video");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const resultEl = document.querySelector("#result");
const resultText = document.querySelector("#result-text");
const retryBtn = document.querySelector("#retry");
const resumeBtn = document.querySelector("#resume");
const closeBtn = document.querySelector("#close");
const eventEl = document.querySelector("#event");
const qrReaderEl = document.querySelector("#qr-reader");

const decoder = new URLSearchParams(location.search).get("decoder") || "html5";
const usingJsqr = decoder === "jsqr";

let openerOrigin = null;
let activeStream = null;
let html5Scanner = null;
let scanLoopRunning = false;
let lastPostedCode = null;
let lastPostedAt = 0;
// suppress further decodes while a check-in is in flight
let awaitingResult = false;
let tornDown = false;
let cameraStarted = false;
let handshakeTimer = null;
let retryAction = "camera";

// html5-qrcode Html5QrcodeScannerState: NOT_STARTED === 1, SCANNING === 2
// (verified against the pinned 2.3.8 bundle; avoid pulling the enum out of
// the minified file by name).
const H5Q_NOT_STARTED = 1;

// ---------------------------------------------------------------------------
// Result / status UI
// ---------------------------------------------------------------------------

function setScannerState(state, tone, message, loading = false) {
  document.body.dataset.scannerState = state;
  resultEl.dataset.tone = tone;
  resultEl.dataset.loading = loading ? "true" : "false";
  resultEl.setAttribute("aria-busy", loading ? "true" : "false");
  resultText.textContent = message;
  // re-trigger the flash animation
  resultEl.classList.remove("result--flash");
  // reflow so the class re-add restarts the animation
  void resultEl.offsetWidth;
  resultEl.classList.add("result--flash");
}

function showResult(tone, message) {
  setScannerState(SCANNER_STATE.RESULT, tone, message, false);
}

function showLoading(state, message) {
  setScannerState(state, "info", message, true);
  showRetry(false);
  showResume(false);
}

function showReady() {
  setScannerState(SCANNER_STATE.READY, "info", "對準 QR Code", false);
  showRetry(false);
  showResume(false);
}

function showRetry(show, label, action) {
  retryBtn.hidden = !show;
  if (action) {
    retryAction = action;
  }
  if (!show) {
    retryAction = "camera";
  }
  if (label) {
    retryBtn.textContent = label;
  }
}

function showResume(show) {
  resumeBtn.hidden = !show;
}

// ---------------------------------------------------------------------------
// Opener origin learning (secure handshake) + ?opener= fallback
// ---------------------------------------------------------------------------

function openerOriginFromParam() {
  const value = new URLSearchParams(location.search).get("opener");
  return value && value.startsWith("https://") ? value : null;
}

function resolveOpenerOrigin() {
  return openerOrigin || openerOriginFromParam();
}

window.addEventListener("message", (event) => {
  // Only accept messages from the window that opened us.
  if (event.source !== window.opener) {
    return;
  }
  const { data } = event;
  if (data && data.type === HANDSHAKE_TYPE) {
    if (handshakeTimer) {
      window.clearTimeout(handshakeTimer);
      handshakeTimer = null;
    }
    openerOrigin = event.origin;
    const eventName =
      typeof data.eventName === "string" && data.eventName.trim()
        ? data.eventName.trim()
        : "";
    eventEl.textContent = eventName || "EFCC 掃描";
    if (!cameraStarted) {
      showLoading(SCANNER_STATE.CAMERA_STARTING, "正在開啟相機…");
      void startCamera();
    }
    return;
  }
  // Result messages must come from the learned opener origin (defense in depth
  // on top of the event.source check).
  if (openerOrigin && event.origin !== openerOrigin) {
    return;
  }
  const result = parseResultMessage(data);
  if (result) {
    awaitingResult = false;
    showResult(result.tone, result.message);
    if (result.action === "retry") {
      showRetry(true, "重試簽到", "checkin");
    } else if (result.action === "resume") {
      showResume(true);
    } else {
      window.setTimeout(() => {
        if (!tornDown && !awaitingResult) {
          showReady();
        }
      }, 1200);
    }
  }
});

// ---------------------------------------------------------------------------
// Decode handling: opaque trimmed code -> postMessage (waiting + cooldown)
// ---------------------------------------------------------------------------

function handleDecode(raw) {
  if (tornDown || awaitingResult) {
    return;
  }
  const code = normalizeScannedCode(raw);
  if (code === null) {
    return;
  }
  const now = Date.now();
  // Same-code cooldown: a continuous camera decode fires many frames per
  // second; suppress repeats of the last code briefly while letting a
  // different code through at once.
  if (code === lastPostedCode && now - lastPostedAt < SUPPRESS_MS) {
    return;
  }
  const origin = resolveOpenerOrigin();
  const ok = postScannedCodeToOpener(window.opener, code, origin);
  if (ok) {
    lastPostedCode = code;
    lastPostedAt = now;
    awaitingResult = true;
    showLoading(SCANNER_STATE.CHECKING_IN, "簽到處理中…");
  } else if (origin === null) {
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "warn",
      "尚未連線至開啟者，請重新連線。",
      false
    );
    showRetry(true, "重新連線", "connection");
  } else {
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "warn",
      "傳送失敗，請重試。",
      false
    );
    showRetry(true, "重新連線", "connection");
  }
}

function retryLastCheckin() {
  if (!lastPostedCode) {
    showReady();
    return;
  }
  const origin = resolveOpenerOrigin();
  const ok = postScannedCodeToOpener(window.opener, lastPostedCode, origin);
  if (!ok) {
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "error",
      "傳送失敗，請重新連線。",
      false
    );
    showRetry(true, "重新連線");
    return;
  }
  awaitingResult = true;
  lastPostedAt = Date.now();
  showLoading(SCANNER_STATE.CHECKING_IN, "簽到處理中…");
}

// ---------------------------------------------------------------------------
// html5-qrcode decoder (primary)
// ---------------------------------------------------------------------------

async function startHtml5Qrcode() {
  html5Scanner = new Html5Qrcode(qrReaderEl.id);
  try {
    await html5Scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        // Scan the central region; the custom reticle visually marks it.
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.3333,
      },
      (decodedText) => handleDecode(decodedText),
      () => {
        // Per-frame "no code found" - intentionally ignored.
      }
    );
    showReady();
  } catch (error) {
    onCameraStartError(error);
  }
}

async function stopHtml5Qrcode() {
  if (!html5Scanner) {
    return;
  }
  try {
    if (html5Scanner.getState() !== H5Q_NOT_STARTED) {
      await html5Scanner.stop();
    }
  } catch {
    // best-effort
  }
  try {
    html5Scanner.clear();
  } catch {
    // best-effort
  }
  html5Scanner = null;
}

// ---------------------------------------------------------------------------
// jsQR decoder (escape hatch) - getUserMedia + canvas
// ---------------------------------------------------------------------------

async function startJsqr() {
  video.classList.remove("scan__video--hidden");
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = activeStream;
    await video.play();
    scanLoopRunning = true;
    showReady();
    requestAnimationFrame(tick);
  } catch (error) {
    onCameraStartError(error);
  }
}

function tick() {
  if (!scanLoopRunning || tornDown) {
    return;
  }
  if (video.readyState >= 2 && video.videoWidth > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result && result.data) {
      handleDecode(result.data);
    }
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Permission-denied / start-failure recovery
// ---------------------------------------------------------------------------

function onCameraStartError(error) {
  cameraStarted = false;
  const name = (error && error.name) || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "error",
      "相機權限被拒絕。請在瀏覽器設定允許相機權限後重試。",
      false
    );
  } else if (name === "NotFoundError" || name === "OverconstrainedError") {
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "error",
      "找不到可用的相機。",
      false
    );
  } else {
    // Named branches above cover the common recoverable cases in Traditional
    // Chinese; the catch-all stays generic so no English DOMException name
    // leaks into operator copy (AGENTS.md language rule).
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "error",
      "無法開啟相機，請稍後再試。",
      false
    );
  }
  showRetry(true, "重試開啟相機", "camera");
}

async function retry() {
  if (retryAction === "checkin") {
    retryLastCheckin();
    return;
  }
  if (retryAction === "connection") {
    window.location.reload();
    return;
  }
  showRetry(false);
  showLoading(SCANNER_STATE.CAMERA_STARTING, "重新開啟相機中…");
  await teardown();
  await startCamera();
}

// ---------------------------------------------------------------------------
// Teardown: stop tracks + decoder, idempotent. Called on close/unload.
// Backgrounding (visibilitychange hidden) must NOT call this - only real
// unload does (pagehide with !persisted).
// ---------------------------------------------------------------------------

async function teardown() {
  if (tornDown) {
    return;
  }
  tornDown = true;
  scanLoopRunning = false;
  cameraStarted = false;
  awaitingResult = false;
  stopStreamTracks(activeStream);
  activeStream = null;
  await stopHtml5Qrcode();
}

// A synchronous best-effort variant for unload events where async work may not
// settle. stopStreamTracks is synchronous; html5-qrcode's async stop() won't
// finish during unload, so the browser's own camera release on navigation is
// relied upon for that path.
function teardownSync() {
  if (tornDown) {
    return;
  }
  tornDown = true;
  scanLoopRunning = false;
  stopStreamTracks(activeStream);
  activeStream = null;
}

// ---------------------------------------------------------------------------
// Start + lifecycle
// ---------------------------------------------------------------------------

async function startCamera() {
  if (cameraStarted && !tornDown) {
    return;
  }
  tornDown = false;
  cameraStarted = true;
  await (usingJsqr ? startJsqr() : startHtml5Qrcode());
}

function onVisibilityChange() {
  if (document.hidden) {
    // Backgrounded: do NOT stop the stream. The browser pauses the video; rAF
    // is throttled. Returning must resume the SAME stream (no re-acquire, no
    // duplicate).
    return;
  }
  // Returned to foreground: if the jsQR loop stalled, kick it again. Never
  // call getUserMedia here.
  if (usingJsqr && !scanLoopRunning && activeStream && !tornDown) {
    scanLoopRunning = true;
    requestAnimationFrame(tick);
  }
}

// pagehide is the only unload hook: it fires on real close (!persisted) AND on
// iOS bfcache backgrounding (persisted). We tear down only on a real unload.
function onPageHide(event) {
  if (event.persisted) {
    // entering bfcache (background) - keep the stream alive
    return;
  }
  teardownSync();
}

retryBtn.addEventListener("click", retry);
resumeBtn.addEventListener("click", () => {
  showResume(false);
  showReady();
});
closeBtn.addEventListener("click", async () => {
  await teardown();
  showResult("info", "相機已關閉。");
  // Best-effort close; some browsers block window.close() for tabs the user
  // can close manually. The teardown above already released the camera.
  window.close();
});

document.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("pagehide", onPageHide);

function startConnection() {
  showLoading(SCANNER_STATE.BOOTING, "開啟掃描器…");
  const fallbackOrigin = openerOriginFromParam();
  const eventName = new URLSearchParams(location.search).get("eventName");
  if (eventName && eventName.trim()) {
    eventEl.textContent = eventName.trim();
  }
  window.setTimeout(() => {
    if (!cameraStarted) {
      showLoading(SCANNER_STATE.CONNECTING, "連線中…");
    }
  }, 120);
  if (fallbackOrigin) {
    openerOrigin = fallbackOrigin;
    showLoading(SCANNER_STATE.CAMERA_STARTING, "正在開啟相機…");
    void startCamera();
  }
  handshakeTimer = window.setTimeout(() => {
    if (resolveOpenerOrigin()) {
      return;
    }
    setScannerState(
      SCANNER_STATE.RECOVERY,
      "error",
      "無法連線至開啟者，請重新連線。",
      false
    );
    showRetry(true, "重新連線", "connection");
  }, HANDSHAKE_TIMEOUT_MS);
}

// Auto-start after the user-gesture popup establishes its bridge. Waiting for
// the handshake gives the loading UI a truthful CONNECTING state and prevents
// a standalone page from opening a camera without an authorized opener.
startConnection();
