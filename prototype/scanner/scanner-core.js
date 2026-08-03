/**
 * EFCC QR Scanner - external-origin prototype pure core (issue #100, Seam 4).
 *
 * Browser-agnostic, fully unit-testable logic shared by the external camera
 * page (prototype/scanner/scanner.js). Kept free of any DOM / `navigator` /
 * `window` reference so it can run under Node + vitest.
 *
 * Contract mirrors the shared Attendance authority (#101 / spec #93):
 *   - scannedCode is the stable, non-secret QR_Code_String (GC-XXXX-XXXX).
 *   - The bridge carries an OPAQUE trimmed code only - never a Member DTO or a
 *     client-supplied userId. Identity is resolved server-side.
 *   - postMessage targets the opener's exact origin (scheme+host[:port]),
 *     never the wildcard `*` (MDN / research note 2026-07-31 §Q3).
 *
 * This is a PROTOTYPE: no Attendance writes, no Sheets mutation, no production
 * Apps Script code depends on it.
 */

export const SCAN_MESSAGE_TYPE = "EFCC_QR_SCAN";
export const RESULT_MESSAGE_TYPE = "EFCC_QR_RESULT";
export const HANDSHAKE_TYPE = "EFCC_QR_HANDSHAKE";

// Mirrors the server-side cap in api_qrCheckIn (#101). Anything longer is a
// validation failure on both sides - keep them in lockstep.
export const MAX_CODE_LENGTH = 64;

/**
 * Normalize a raw decoded string into an opaque scannedCode.
 *
 * Trims leading/trailing whitespace and rejects empty / whitespace-only /
 * over-max-length / non-string input. Internal spacing is preserved (the
 * server trims ends only). Returns the trimmed code, or `null` when the input
 * is not a usable code.
 *
 * @param {unknown} raw - the raw decoded string (or any value)
 * @returns {string | null} the trimmed code, or null when the input is invalid
 */
export function normalizeScannedCode(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_CODE_LENGTH) {
    return null;
  }
  return trimmed;
}

/**
 * Build the postMessage payload that crosses the external-origin -> App
 * Document bridge.
 *
 * Shape: `{ type: "EFCC_QR_SCAN", scannedCode }`. No userId, no member DTO -
 * the App Document resolves identity server-side under #51 authority.
 *
 * @param {string} scannedCode - already-normalized code
 * @returns {{ type: string, scannedCode: string }} the bridge payload
 */
export function buildScanPayload(scannedCode) {
  return { type: SCAN_MESSAGE_TYPE, scannedCode };
}

/**
 * Build the handshake payload the App Document sends to the scanner so the
 * scanner learns the opener's exact origin (from `event.origin`) and the
 * Event context for the top-bar label. Carries no sensitive data.
 *
 * @param {{ eventName?: string }} [context] - the Event context (optional)
 * @returns {{ type: string, eventName: string }} the handshake payload
 */
export function buildHandshakePayload(context) {
  return {
    type: HANDSHAKE_TYPE,
    eventName: (context && context.eventName) || "",
  };
}

/**
 * Build the result payload the App Document sends BACK to the scanner after
 * running api_qrCheckIn, so the scanner can show inline ✓/✗ feedback without
 * the operator looking away from the camera. The App Document owns the
 * Traditional-Chinese copy; the scanner only renders `tone` + `message`.
 *
 * @param {{ tone: "success" | "error" | "info", message: string, action?: "auto" | "resume" | "retry" }} result - the result to render
 * @returns {{ type: string, tone: string, message: string, action: string }} the result payload
 */
export function buildResultPayload(result) {
  return {
    type: RESULT_MESSAGE_TYPE,
    tone: result.tone,
    message: result.message,
    action: result.action || "resume",
  };
}

/**
 * Parse a result message received from the App Document. Fail closed (return
 * null) unless the payload is a well-shaped result with a usable tone/message.
 *
 * @param {unknown} data - the `event.data` from a `message` event
 * @returns {{ tone: "success" | "error" | "info", message: string, action: "auto" | "resume" | "retry" } | null} the parsed result, or null if malformed
 */
export function parseResultMessage(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const msg = data;
  if (msg.type !== RESULT_MESSAGE_TYPE) {
    return null;
  }
  if (msg.tone !== "success" && msg.tone !== "error" && msg.tone !== "info") {
    return null;
  }
  if (typeof msg.message !== "string" || msg.message.trim() === "") {
    return null;
  }
  const action = msg.action || "resume";
  if (action !== "auto" && action !== "resume" && action !== "retry") {
    return null;
  }
  return { tone: msg.tone, message: msg.message, action };
}

/**
 * Validate that a string is a secure (https) origin usable as a postMessage
 * targetOrigin: `https://host[:port]` with no path, no query, no wildcard.
 *
 * @param {unknown} origin - the candidate origin string
 * @returns {boolean} true iff the value is a usable https origin
 */
export function isSecureOrigin(origin) {
  if (typeof origin !== "string") {
    return false;
  }
  const value = origin.trim();
  if (value === "" || value === "*") {
    return false;
  }
  if (!value.startsWith("https://")) {
    return false;
  }
  const hostPort = value.slice("https://".length);
  // Origin is scheme+host[:port] only: reject a trailing path / query / space.
  if (
    hostPort === "" ||
    hostPort.includes("/") ||
    hostPort.includes("?") ||
    /\s/u.test(hostPort)
  ) {
    return false;
  }
  return true;
}

/**
 * Post the normalized scannedCode to the opener window with an exact, secure
 * target origin. Fail closed (return false, post nothing) when:
 *   - the opener is missing or already closed,
 *   - the target origin is not a secure origin (never `*`),
 *   - the scannedCode does not normalize to a usable code,
 *   - postMessage itself throws.
 *
 * @param {{ postMessage: Function, closed?: boolean } | null} opener - the opener window
 * @param {string} scannedCode - raw decoded string
 * @param {string} targetOrigin - opener's exact https origin
 * @returns {boolean} true iff exactly one message was dispatched
 */
export function postScannedCodeToOpener(opener, scannedCode, targetOrigin) {
  if (!opener) {
    return false;
  }
  if (opener.closed) {
    return false;
  }
  if (!isSecureOrigin(targetOrigin)) {
    return false;
  }
  const code = normalizeScannedCode(scannedCode);
  if (code === null) {
    return false;
  }
  const payload = buildScanPayload(code);
  try {
    opener.postMessage(payload, targetOrigin);
  } catch {
    // A postMessage failure must never crash the page or leak a half-sent
    // state; treat it as "did not post".
    return false;
  }
  return true;
}

/**
 * Best-effort teardown of every track on a MediaStream. Idempotent and
 * null-safe; a throwing `track.stop()` is swallowed so one bad track cannot
 * keep the rest alive. Returns the number of tracks seen (stopped or not).
 *
 * @param {{ getTracks?: () => unknown[] } | null} stream - the MediaStream to stop
 * @returns {number} the number of tracks seen (stopped or not)
 */
export function stopStreamTracks(stream) {
  if (!stream) {
    return 0;
  }
  const tracks =
    typeof stream.getTracks === "function" ? stream.getTracks() : [];
  let count = 0;
  for (const track of tracks) {
    try {
      if (track && typeof track.stop === "function") {
        track.stop();
      }
    } catch {
      // best-effort: continue tearing down sibling tracks
    }
    count += 1;
  }
  return count;
}
