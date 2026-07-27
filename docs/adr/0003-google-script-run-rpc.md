# ADR-0003: Client-Server RPC via google.script.run

**Status**: Accepted  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

## Decision

Communicate between the browser-side web app and the Apps Script server using `google.script.run` — GAS's built-in asynchronous RPC mechanism. Server functions are called directly from client-side JavaScript with `.withSuccessHandler()` and `.withFailureHandler()` callbacks.

## Rationale

- **No HTTP API to build** — Google Apps Script provides `google.script.run` automatically; no REST endpoints, no request/response serialization, no CORS configuration.
- **Type-coerced automatically** — Server-side JavaScript values (objects, arrays, primitives) cross the boundary as JSON without manual serialization.
- **Same deployment unit** — The server functions and the HTML are pushed together via `clasp push`. No separate API deployment.
- **Sufficient for the SPI (Single-Page Interface)** — The web app is a single HTML page with sections shown/hidden. All data interactions are simple request-response; no streaming, no WebSockets, no server push.

## Constraints

- **Asynchronous only** — `google.script.run` is inherently async. The pattern is function call + callback. No synchronous return.
- **No HTTP headers or status codes** — Error handling is binary: either `withSuccessHandler` or `withFailureHandler`. All server errors (business logic failures included) must be communicated via the return value envelope.
- **No authentication built-in** — The function runs as the script deployer, not the browser user. Auth is handled at the application layer (see ADR-0002).
- **5 KB function parameter limit** — Parameters passed from client to server are serialized; large payloads may be truncated. Not a constraint at current scale.

## Client-Server Pattern

```javascript
// Client-side pattern
google.script.run
  .withSuccessHandler(function(result) {
    if (result.success) {
      // handle success
    } else {
      showError(result.message);  // business logic error
    }
  })
  .withFailureHandler(function(error) {
    showError("Server error: " + error.message);  // unexpected failure
  })
  .enrollUser(userId, programId);
```

- Business logic failures return `{ success: false, message: "..." }` via the success handler.
- Unexpected exceptions (sheet missing, parse errors) trigger the failure handler.
- The client never calls functions the user isn't authenticated for — the server validates auth internally via the userId parameter.

## Consequences

- Every server function accessible to the client uses a `{ success, ... }` or `{ success, message, ... }` envelope.
- `withFailureHandler` is reserved for infrastructure errors (missing sheets, permission errors). Business errors ("PIN incorrect", "Time conflict") are delivered through the success path.
- The deployment boundary is the entire project — any code change requires a `clasp push` to update both server and client.
- Adding a new feature means: add the server function → add the client call in the HTML script → push.

## Alternatives Considered

- **REST API via `UrlFetchApp`** — Rejected. Would require a separate HTTP endpoint, CORS handling, and token management. Overkill for this scale.
- **Fetch via `ContentService`** — Rejected. `ContentService` is designed for external API access; for the built-in web app, `google.script.run` is the canonical pattern.
