import type { AttendanceEventSummary } from "@/lib/attendance";

const WORKSPACE_MUTATION_RECOVERY_KEY = "efcc_workspace_mutation_recovery";
const GUEST_MUTATION_RECOVERY_KEY = "efcc_guest_mutation_recovery";

export interface EventMutationExpected {
  startsAt?: string;
  endsAt?: string;
  name?: string | null;
  eventType?: string | null;
  location?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  availability?: "Active" | "Inactive";
  status?: "Active" | "Cancelled";
}

export type EventMutationRecovery =
  | {
      kind: "update";
      programId: string;
      eventId: string;
      expected: EventMutationExpected;
    }
  | {
      kind: "availability";
      programId: string;
      eventId: string;
      expected: Pick<EventMutationExpected, "availability">;
    }
  | {
      kind: "cancel";
      programId: string;
      eventId: string;
      expected: Pick<EventMutationExpected, "status">;
    };

export type EventListMutationRecovery =
  | {
      kind: "cancel";
      eventId: string;
    }
  | {
      kind: "create";
      programId: string;
      beforeEventIds: readonly string[];
      name: string;
      eventType: string;
      startsAt: string;
      endsAt: string;
      location: string | null;
      opensAt: string | null;
      closesAt: string | null;
    };

export type AttendanceMutationRecovery =
  | { kind: "check-in"; memberUserId: string }
  | { kind: "void"; attendanceId: string }
  | { kind: "correction"; attendanceId: string; name: string; phone: string }
  | { kind: "excuse"; enrollmentId: string }
  | { kind: "materialize" };

export type WorkspaceMutationRecovery =
  | {
      surface: "event";
      programId: string;
      eventId: string;
      mutation: EventMutationRecovery;
    }
  | {
      surface: "events";
      programId: string;
      mutation: EventListMutationRecovery;
    }
  | {
      surface: "attendance";
      eventId: string;
      mutation: AttendanceMutationRecovery;
    };

export interface GuestMutationAttempt {
  event: AttendanceEventSummary;
  credentialValue: string;
  fromQr: boolean;
  name: string;
  phone: string;
}

export interface GuestMutationRecovery {
  key: string;
  attempt: GuestMutationAttempt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSessionStorageAvailable(): Storage | null {
  try {
    return (
      (globalThis as typeof globalThis & { sessionStorage?: Storage })
        .sessionStorage ?? null
    );
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const storage = isSessionStorageAvailable();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function removeItem(key: string): void {
  try {
    isSessionStorageAvailable()?.removeItem(key);
  } catch {
    // Storage is optional; the in-memory guard remains authoritative.
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    isSessionStorageAvailable()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional; the in-memory guard remains authoritative.
  }
}

function isEventExpected(value: unknown): value is EventMutationExpected {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return false;
  }
  return Object.entries(value).every(([key, candidate]) => {
    switch (key) {
      case "startsAt":
      case "endsAt":
        return typeof candidate === "string";
      case "name":
      case "location":
      case "opensAt":
      case "closesAt":
        return isNullableString(candidate);
      case "eventType":
        return isNullableString(candidate);
      case "availability":
        return candidate === "Active" || candidate === "Inactive";
      case "status":
        return candidate === "Active" || candidate === "Cancelled";
      default:
        return false;
    }
  });
}

function isEventMutationRecovery(
  value: unknown
): value is EventMutationRecovery {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.programId !== "string" ||
    typeof value.eventId !== "string" ||
    !isEventExpected(value.expected)
  ) {
    return false;
  }
  return (
    value.kind === "update" ||
    (value.kind === "availability" &&
      Object.keys(value.expected).length === 1 &&
      "availability" in value.expected) ||
    (value.kind === "cancel" &&
      Object.keys(value.expected).length === 1 &&
      "status" in value.expected)
  );
}

function isEventListMutationRecovery(
  value: unknown
): value is EventListMutationRecovery {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "cancel") {
    return typeof value.eventId === "string";
  }
  return (
    value.kind === "create" &&
    typeof value.programId === "string" &&
    Array.isArray(value.beforeEventIds) &&
    value.beforeEventIds.every((id) => typeof id === "string") &&
    typeof value.name === "string" &&
    typeof value.eventType === "string" &&
    typeof value.startsAt === "string" &&
    typeof value.endsAt === "string" &&
    isNullableString(value.location) &&
    isNullableString(value.opensAt) &&
    isNullableString(value.closesAt)
  );
}

function isAttendanceMutationRecovery(
  value: unknown
): value is AttendanceMutationRecovery {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "check-in":
      return typeof value.memberUserId === "string";
    case "void":
      return typeof value.attendanceId === "string";
    case "correction":
      return (
        typeof value.attendanceId === "string" &&
        typeof value.name === "string" &&
        typeof value.phone === "string"
      );
    case "excuse":
      return typeof value.enrollmentId === "string";
    case "materialize":
      return true;
    default:
      return false;
  }
}

export function readWorkspaceMutationRecovery(): WorkspaceMutationRecovery | null {
  const value = readJson(WORKSPACE_MUTATION_RECOVERY_KEY);
  if (!isRecord(value) || typeof value.surface !== "string") {
    if (value !== null) {
      removeItem(WORKSPACE_MUTATION_RECOVERY_KEY);
    }
    return null;
  }
  if (
    value.surface === "event" &&
    typeof value.programId === "string" &&
    typeof value.eventId === "string" &&
    isEventMutationRecovery(value.mutation)
  ) {
    return value as WorkspaceMutationRecovery;
  }
  if (
    value.surface === "events" &&
    typeof value.programId === "string" &&
    isEventListMutationRecovery(value.mutation)
  ) {
    return value as WorkspaceMutationRecovery;
  }
  if (
    value.surface === "attendance" &&
    typeof value.eventId === "string" &&
    isAttendanceMutationRecovery(value.mutation)
  ) {
    return value as WorkspaceMutationRecovery;
  }
  removeItem(WORKSPACE_MUTATION_RECOVERY_KEY);
  return null;
}

export function writeWorkspaceMutationRecovery(
  value: WorkspaceMutationRecovery
): void {
  writeJson(WORKSPACE_MUTATION_RECOVERY_KEY, value);
}

export function clearWorkspaceMutationRecovery(
  surface: WorkspaceMutationRecovery["surface"],
  identity: { programId?: string; eventId?: string }
): void {
  const current = readWorkspaceMutationRecovery();
  if (!current || current.surface !== surface) {
    return;
  }
  if (
    ("programId" in current &&
      identity.programId !== undefined &&
      current.programId !== identity.programId) ||
    (identity.eventId !== undefined &&
      "eventId" in current &&
      current.eventId !== identity.eventId)
  ) {
    return;
  }
  removeItem(WORKSPACE_MUTATION_RECOVERY_KEY);
}

function isAttendanceEventSummary(
  value: unknown
): value is AttendanceEventSummary {
  return (
    isRecord(value) &&
    typeof value.event_id === "string" &&
    typeof value.program_id === "string" &&
    typeof value.program_name === "string" &&
    isNullableString(value.name) &&
    isNullableString(value.location) &&
    typeof value.starts_at === "string" &&
    typeof value.ends_at === "string" &&
    typeof value.check_in_window_opens_at === "string" &&
    typeof value.check_in_window_closes_at === "string" &&
    (value.status === "Active" || value.status === "Cancelled") &&
    (value.availability === "Active" || value.availability === "Inactive")
  );
}

function isGuestMutationAttempt(value: unknown): value is GuestMutationAttempt {
  return (
    isRecord(value) &&
    isAttendanceEventSummary(value.event) &&
    typeof value.credentialValue === "string" &&
    value.credentialValue.length > 0 &&
    typeof value.fromQr === "boolean" &&
    typeof value.name === "string" &&
    typeof value.phone === "string"
  );
}

export function readGuestMutationRecovery(): GuestMutationRecovery | null {
  const value = readJson(GUEST_MUTATION_RECOVERY_KEY);
  if (
    isRecord(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    isGuestMutationAttempt(value.attempt)
  ) {
    return value as unknown as GuestMutationRecovery;
  }
  if (value !== null) {
    removeItem(GUEST_MUTATION_RECOVERY_KEY);
  }
  return null;
}

export function writeGuestMutationRecovery(
  key: string,
  attempt: GuestMutationAttempt
): void {
  const {
    event: {
      event_id,
      program_id,
      program_name,
      name,
      location,
      starts_at,
      ends_at,
      check_in_window_opens_at,
      check_in_window_closes_at,
      status,
      availability,
    },
  } = attempt;
  writeJson(GUEST_MUTATION_RECOVERY_KEY, {
    key,
    attempt: {
      ...attempt,
      event: {
        event_id,
        program_id,
        program_name,
        name,
        location,
        starts_at,
        ends_at,
        check_in_window_opens_at,
        check_in_window_closes_at,
        status,
        availability,
      },
    },
  });
}

export function clearGuestMutationRecovery(): void {
  removeItem(GUEST_MUTATION_RECOVERY_KEY);
}
