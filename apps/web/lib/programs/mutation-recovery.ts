import type { AttendanceEventSummary } from "@/lib/attendance";

import type {
  ProgramInput,
  ProgramPatch,
  ScheduleRuleInput,
} from "./program-api";

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

export interface ProgramSettingsMutationRecovery {
  surface: "program";
  programId: string;
  idempotencyKey: string;
  mutation: {
    kind: "update";
    patch: ProgramPatch;
    expected: ProgramPatch;
  };
}

export interface ProgramCreateMutationRecovery {
  surface: "program-create";
  departmentId: string;
  idempotencyKey: string;
  input: ProgramInput;
}

interface ScheduleExceptionMutationInput {
  override_date: string;
  action: "CANCEL" | "RESCHEDULE";
  new_date?: string;
  new_start_time?: string;
  new_end_time?: string;
}

type ScheduleMutation =
  | {
      kind: "create-rule";
      input: ScheduleRuleInput;
      expected: ScheduleRuleInput;
    }
  | {
      kind: "update-rule";
      ruleId: string;
      input: ScheduleRuleInput;
      expected: ScheduleRuleInput;
    }
  | {
      kind: "retire-rule";
      ruleId: string;
      expected: { retired: true };
    }
  | {
      kind: "create-exception";
      ruleId: string;
      input: ScheduleExceptionMutationInput;
      expected: ScheduleExceptionMutationInput;
    }
  | {
      kind: "delete-exception";
      ruleId: string;
      exceptionId: string;
      expected: { deleted: true };
    };

export interface ScheduleMutationRecovery {
  surface: "schedule";
  programId: string;
  idempotencyKey: string;
  mutation: ScheduleMutation;
}

type DepartmentMutation =
  | {
      kind: "details";
      patch: { name: string; description: string };
      expected: { name: string; description: string };
    }
  | {
      kind: "module";
      moduleKey: string;
      enabled: boolean;
      expected: { moduleKey: string; enabled: boolean };
    };

export interface DepartmentMutationRecovery {
  surface: "department";
  departmentId: string;
  idempotencyKey: string;
  mutation: DepartmentMutation;
}

export type WorkspaceMutationRecovery =
  | ProgramSettingsMutationRecovery
  | ProgramCreateMutationRecovery
  | ScheduleMutationRecovery
  | DepartmentMutationRecovery
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

function isOptionalNullableString(
  value: unknown
): value is string | null | undefined {
  return value === undefined || isNullableString(value);
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
      case "startsAt": {
        return typeof candidate === "string";
      }
      case "endsAt": {
        return typeof candidate === "string";
      }
      case "name":
      case "location":
      case "opensAt":
      case "closesAt": {
        return isNullableString(candidate);
      }
      case "eventType": {
        return isNullableString(candidate);
      }
      case "availability": {
        return candidate === "Active" || candidate === "Inactive";
      }
      case "status": {
        return candidate === "Active" || candidate === "Cancelled";
      }
      default: {
        return false;
      }
    }
  });
}

function isProgramPatch(value: unknown): value is ProgramPatch {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return false;
  }
  const allowed = new Set([
    "name",
    "description",
    "category",
    "behavior_type",
    "discoverability",
    "lifecycle",
    "enrollment_mode",
    "display_order",
    "check_in_opens_at_minutes_before_start",
    "check_in_closes_at_minutes_after_end",
  ]);
  return Object.entries(value).every(([key, candidate]) => {
    if (!allowed.has(key)) {
      return false;
    }
    if (key === "name" || key === "behavior_type") {
      return typeof candidate === "string";
    }
    if (key === "description" || key === "category") {
      return isNullableString(candidate);
    }
    if (key === "discoverability") {
      return candidate === "Listed" || candidate === "Unlisted";
    }
    if (key === "lifecycle") {
      return (
        candidate === "Draft" ||
        candidate === "Active" ||
        candidate === "Archived"
      );
    }
    if (key === "enrollment_mode") {
      return candidate === "MemberRequest" || candidate === "ManagerOnly";
    }
    return typeof candidate === "number" && Number.isFinite(candidate);
  });
}

function isScheduleRuleInput(value: unknown): value is ScheduleRuleInput {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.recurrence === "WEEKLY" || value.recurrence === "MONTHLY") &&
    typeof value.start_time === "string" &&
    typeof value.end_time === "string" &&
    (value.day_of_week === undefined ||
      typeof value.day_of_week === "number") &&
    (value.month_day === undefined || typeof value.month_day === "number") &&
    isNullableString(value.location) &&
    isOptionalNullableString(value.effective_start_date) &&
    isOptionalNullableString(value.effective_end_date)
  );
}

function isScheduleExceptionInput(
  value: unknown
): value is ScheduleExceptionMutationInput {
  return (
    isRecord(value) &&
    typeof value.override_date === "string" &&
    (value.action === "CANCEL" || value.action === "RESCHEDULE") &&
    isOptionalNullableString(value.new_date) &&
    isOptionalNullableString(value.new_start_time) &&
    isOptionalNullableString(value.new_end_time)
  );
}

function isProgramSettingsMutationRecovery(
  value: unknown
): value is ProgramSettingsMutationRecovery {
  return (
    isRecord(value) &&
    value.surface === "program" &&
    typeof value.programId === "string" &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length > 0 &&
    isRecord(value.mutation) &&
    value.mutation.kind === "update" &&
    isProgramPatch(value.mutation.patch) &&
    isProgramPatch(value.mutation.expected)
  );
}

function isProgramCreateMutationRecovery(
  value: unknown
): value is ProgramCreateMutationRecovery {
  if (
    !isRecord(value) ||
    value.surface !== "program-create" ||
    typeof value.departmentId !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length === 0 ||
    !isRecord(value.input)
  ) {
    return false;
  }
  return (
    typeof value.input.name === "string" &&
    (value.input.description === undefined ||
      typeof value.input.description === "string") &&
    (value.input.behavior_type === "Recurring" ||
      value.input.behavior_type === "OneOff") &&
    (value.input.lifecycle === "Draft" ||
      value.input.lifecycle === "Active" ||
      value.input.lifecycle === "Archived") &&
    (value.input.discoverability === undefined ||
      value.input.discoverability === "Listed" ||
      value.input.discoverability === "Unlisted") &&
    (value.input.enrollment_mode === "MemberRequest" ||
      value.input.enrollment_mode === "ManagerOnly") &&
    (value.input.category === undefined ||
      typeof value.input.category === "string") &&
    (value.input.display_order === undefined ||
      (typeof value.input.display_order === "number" &&
        Number.isFinite(value.input.display_order)))
  );
}

function isScheduleMutation(value: Record<string, unknown>): boolean {
  switch (value.kind) {
    case "create-rule": {
      return (
        isScheduleRuleInput(value.input) && isScheduleRuleInput(value.expected)
      );
    }
    case "update-rule": {
      return (
        typeof value.ruleId === "string" &&
        isScheduleRuleInput(value.input) &&
        isScheduleRuleInput(value.expected)
      );
    }
    case "retire-rule": {
      return (
        typeof value.ruleId === "string" &&
        isRecord(value.expected) &&
        value.expected.retired === true
      );
    }
    case "create-exception": {
      return (
        typeof value.ruleId === "string" &&
        isScheduleExceptionInput(value.input) &&
        isScheduleExceptionInput(value.expected)
      );
    }
    case "delete-exception": {
      return (
        typeof value.ruleId === "string" &&
        typeof value.exceptionId === "string" &&
        isRecord(value.expected) &&
        value.expected.deleted === true
      );
    }
    default: {
      return false;
    }
  }
}

function isScheduleMutationRecovery(
  value: unknown
): value is ScheduleMutationRecovery {
  if (
    !isRecord(value) ||
    value.surface !== "schedule" ||
    typeof value.programId !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length === 0 ||
    !isRecord(value.mutation) ||
    typeof value.mutation.kind !== "string"
  ) {
    return false;
  }
  return isScheduleMutation(value.mutation);
}

function isDepartmentMutationRecovery(
  value: unknown
): value is DepartmentMutationRecovery {
  if (
    !isRecord(value) ||
    value.surface !== "department" ||
    typeof value.departmentId !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length === 0 ||
    !isRecord(value.mutation) ||
    typeof value.mutation.kind !== "string"
  ) {
    return false;
  }
  if (value.mutation.kind === "details") {
    const isDetails = (
      candidate: unknown
    ): candidate is {
      name: string;
      description: string;
    } =>
      isRecord(candidate) &&
      typeof candidate.name === "string" &&
      typeof candidate.description === "string";
    return (
      isDetails(value.mutation.patch) && isDetails(value.mutation.expected)
    );
  }
  return (
    value.mutation.kind === "module" &&
    typeof value.mutation.moduleKey === "string" &&
    typeof value.mutation.enabled === "boolean" &&
    isRecord(value.mutation.expected) &&
    value.mutation.expected.moduleKey === value.mutation.moduleKey &&
    value.mutation.expected.enabled === value.mutation.enabled
  );
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
    case "check-in": {
      return typeof value.memberUserId === "string";
    }
    case "void": {
      return typeof value.attendanceId === "string";
    }
    case "correction": {
      return (
        typeof value.attendanceId === "string" &&
        typeof value.name === "string" &&
        typeof value.phone === "string"
      );
    }
    case "excuse": {
      return typeof value.enrollmentId === "string";
    }
    case "materialize": {
      return true;
    }
    default: {
      return false;
    }
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
  if (value.surface === "program" && isProgramSettingsMutationRecovery(value)) {
    return value;
  }
  if (
    value.surface === "program-create" &&
    isProgramCreateMutationRecovery(value)
  ) {
    return value;
  }
  if (value.surface === "schedule" && isScheduleMutationRecovery(value)) {
    return value;
  }
  if (value.surface === "department" && isDepartmentMutationRecovery(value)) {
    return value;
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

/** Authenticated-session boundary cleanup; guest recovery remains separate. */
export function clearAllWorkspaceMutationRecovery(): void {
  removeItem(WORKSPACE_MUTATION_RECOVERY_KEY);
}

export function clearWorkspaceMutationRecovery(
  surface: WorkspaceMutationRecovery["surface"],
  identity: { programId?: string; eventId?: string; departmentId?: string }
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
      current.eventId !== identity.eventId) ||
    (identity.departmentId !== undefined &&
      "departmentId" in current &&
      current.departmentId !== identity.departmentId)
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
