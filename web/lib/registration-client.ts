/**
 * AUTH-05 (#163) — thin client for the cookie-only Worker auth registration
 * surface. Same-origin relative fetches only (no Authorization header, no
 * CORS); the httpOnly access/refresh cookies travel automatically on the
 * same-origin request. Errors are surfaced as RFC 9457 Problem Details codes
 * (ADR-0018 §5) mapped onto the shared `errorCopyFor` vocabulary.
 *
 * Idempotency-Key is generated per action (register/approve/reject) so a
 * retry with a fresh key is safe: duplicate usernames are rejected
 * deterministically by the Worker (409), and repeated approve/reject are
 * idempotent server-side.
 */
export interface RegistrationInput {
  username: string;
  password: string;
  name: string;
  phone: string;
}

export interface PendingRegistration {
  requestId: string;
  username: string;
  name: string;
  phone: string | null;
  submittedAt: number;
  accountStatus: string;
  role: string;
  decision: "Approved" | "Rejected" | null;
  decisionNote: string | null;
}

export type RegistrationQueueStatus = "Pending" | "Processed";

export interface RegistrationBatchApprovalResult {
  accountStatus: "active";
  approvedCount: number;
}

export type Decision = "approve" | "reject";

/**
 * Single-request shape returned by GET /api/v1/auth/registrations/:id
 * (087-02 #319) for the routable Approval Detail. Includes decided requests
 * so a past decision stays viewable read-only at the same URL.
 */
export interface RegistrationDetail {
  requestId: string;
  username: string;
  name: string;
  phone: string | null;
  status: "Pending" | "Active" | "Rejected";
  role: string;
  submittedAt: number;
  decidedAt: number | null;
  decisionNote: string | null;
  decision: "Approved" | "Rejected" | null;
}

/** Row shape returned by GET /api/v1/auth/registrations. */
export interface RegistrationQueueResponse {
  requestId: string;
  data: {
    registrations: PendingRegistration[];
    status: RegistrationQueueStatus;
  };
}

/** Client-side mirror of the Worker's RFC 9457 Problem Details body. */
export class RegistrationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RegistrationApiError";
    this.code = code;
    this.status = status;
  }
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function parseError(res: Response): Promise<RegistrationApiError> {
  let code = "UNKNOWN";
  let detail: string | undefined;
  try {
    const body = (await res.json()) as {
      code?: unknown;
      detail?: unknown;
    };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // Non-JSON body — fall through to statusText.
  }
  return new RegistrationApiError(
    res.status,
    code,
    detail ?? res.statusText
  );
}

/**
 * POST /api/v1/auth/register — submits a Pending registration request.
 * No session is issued; the caller is not authenticated by this call.
 */
export async function submitRegistration(
  input: RegistrationInput
): Promise<void> {
  const res = await fetch("/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
}

/**
 * GET /api/v1/auth/registrations — lists Pending registration requests.
 * Requires an Admin/Staff session (403 otherwise). Returns safe metadata
 * only; never credential material.
 */
export async function fetchRegistrations(
  status: RegistrationQueueStatus = "Pending"
): Promise<PendingRegistration[]> {
  const query = status === "Pending" ? "" : "?status=Processed";
  const res = await fetch(`/api/v1/auth/registrations${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as RegistrationQueueResponse;
  return body.data?.registrations ?? [];
}

export async function fetchPendingRegistrations(): Promise<
  PendingRegistration[]
> {
  return fetchRegistrations("Pending");
}

/** POST /api/v1/auth/registrations/approve-batch — atomic selected approval. */
export async function approveRegistrationsBatch(
  requestIds: readonly string[]
): Promise<RegistrationBatchApprovalResult> {
  const res = await fetch("/api/v1/auth/registrations/approve-batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(),
    },
    body: JSON.stringify({ requestIds }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as {
    data?: RegistrationBatchApprovalResult;
  };
  if (!body.data) {
    throw new RegistrationApiError(500, "INVALID_RESPONSE", "Invalid batch response.");
  }
  return body.data;
}

/**
 * GET /api/v1/auth/registrations/:id (087-02 #319) — single registration
 * request for the routable Approval Detail. Requires an Admin/Staff session
 * (403 otherwise). Pending AND decided requests are returned, so a decided
 * request remains viewable read-only at the same URL. Safe metadata only;
 * never credential material.
 */
export async function fetchRegistrationDetail(
  id: string
): Promise<RegistrationDetail> {
  const res = await fetch(
    `/api/v1/auth/registrations/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    }
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as {
    data?: { registration?: RegistrationDetail };
  };
  const registration = body.data?.registration;
  if (!registration) {
    throw new RegistrationApiError(404, "NOT_FOUND", "Unknown registration.");
  }
  return registration;
}

/**
 * POST /api/v1/auth/registrations/:id/{approve|reject} — Staff/Admin
 * resolves a Pending request. Idempotent server-side against a repeated
 * action; opposite/redundant transitions are deterministic errors. Reject
 * REQUIRES a non-empty `note` (ADR-0006, migration 0012): the server 422s
 * when missing, and the note is stored atomically with the decision.
 */
export async function decideRegistration(
  id: string,
  decision: Decision,
  note?: string
): Promise<void> {
  const res = await fetch(`/api/v1/auth/registrations/${id}/${decision}`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey(),
      ...(decision === "reject"
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(decision === "reject"
      ? { body: JSON.stringify({ decisionNote: note ?? "" }) }
      : {}),
  });
  if (!res.ok) throw await parseError(res);
}
