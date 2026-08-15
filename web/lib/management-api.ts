"use client";

export interface ManagementMemberDepartment {
  department_id: string;
  code: string;
  name: string;
}

export interface ManagementMember {
  user_id: string;
  name: string;
  username: string;
  phone: string | null;
  role: string;
  departments: ManagementMemberDepartment[];
}

export interface ManagementMembersResponse {
  requestId?: string;
  data?: { members?: ManagementMember[] };
}

export class ManagementMembersError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.name = "ManagementMembersError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<ManagementMembersError> {
  let code = "UNKNOWN";
  let detail = response.statusText || "Request failed";
  try {
    const body = (await response.json()) as {
      code?: unknown;
      detail?: unknown;
    };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.detail === "string" && body.detail.trim()) {
      detail = body.detail;
    }
  } catch {
    // Keep the status text when the Worker returns a non-JSON failure body.
  }
  return new ManagementMembersError(response.status, code, detail);
}

/** Search members within the caller's server-authorized management scope. */
export async function searchManagementMembers(
  query: string
): Promise<ManagementMember[]> {
  const response = await fetch(
    `/api/v1/management/members?q=${encodeURIComponent(query.trim())}`,
    { method: "GET", headers: { Accept: "application/json" } }
  );
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as ManagementMembersResponse;
  return body.data?.members ?? [];
}
