/**
 * EFCC Programs domain — error taxonomy.
 *
 * Every domain error the DepartmentWorkspace can throw, moved out of
 * department-workspace.ts so the domain class changes only for domain logic
 * and this file changes only for error taxonomy.
 */

import type { ProgramLifecycle } from "./workspace-store";

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateDepartmentCodeError extends Error {
  constructor(code: string) {
    super(`A department with code '${code}' already exists.`);
    this.name = "DuplicateDepartmentCodeError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateProgramNameError extends Error {
  constructor(name: string) {
    super(`A program with name '${name}' already exists in this department.`);
    this.name = "DuplicateProgramNameError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class InvalidProgramLifecycleError extends Error {
  constructor(
    from: ProgramLifecycle,
    to: ProgramLifecycle,
    message = `Invalid program lifecycle transition: ${from} -> ${to}.`
  ) {
    super(message);
    this.name = "InvalidProgramLifecycleError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class ProgramArchiveBlockedError extends Error {
  readonly reasons: readonly string[];
  constructor(programId: string, reasons: readonly string[]) {
    super(`Program ${programId} cannot be archived: ${reasons.join(", ")}.`);
    this.name = "ProgramArchiveBlockedError";
    this.reasons = reasons;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class InvalidModuleKeyError extends Error {
  constructor(key: string) {
    super(`Unknown module key: ${key}`);
    this.name = "InvalidModuleKeyError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class ScheduleRuleNotApplicableError extends Error {
  constructor(programId: string) {
    super(`Schedule rules apply only to Recurring programs: ${programId}`);
    this.name = "ScheduleRuleNotApplicableError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class NoScheduleRulesError extends Error {
  constructor() {
    // Stable, non-identifying message: this surfaces verbatim as the
    // VALIDATION problem detail to the client (mapWorkspaceError), so no
    // program UUID or raw entity reference may leak into it. Matches the
    // sibling EmptyPreviewPlanError convention (no identifiers).
    super("This program has no schedule rules to generate events from.");
    this.name = "NoScheduleRulesError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class PreviewPlanNotFoundError extends Error {
  constructor(planId: string) {
    super(`Preview plan ${planId} does not exist or is not usable here.`);
    this.name = "PreviewPlanNotFoundError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class StalePreviewPlanError extends Error {
  constructor(planId: string, programId: string) {
    super(
      `Preview plan ${planId} is stale: the schedule changed after it was created, or it was superseded by a newer preview. Preview again before generating.`
    );
    this.name = "StalePreviewPlanError";
    this.planId = planId;
    this.programId = programId;
  }
  readonly planId: string;
  readonly programId: string;
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class EmptyPreviewPlanError extends Error {
  constructor() {
    super(
      "This preview plan contains no occurrences; adjust the schedule rules or the preview horizon before generating."
    );
    this.name = "EmptyPreviewPlanError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateEventError extends Error {
  constructor(startsAt: string) {
    super(`An event already exists for this start time: ${startsAt}`);
    this.name = "DuplicateEventError";
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class EventRescheduleBlockedError extends Error {
  readonly eventId: string;
  constructor(eventId: string) {
    super(
      `Event ${eventId} cannot be rescheduled: Attendance already exists.`
    );
    this.name = "EventRescheduleBlockedError";
    this.eventId = eventId;
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class EventCancellationBlockedError extends Error {
  readonly activeAttendanceCount: number;
  constructor(
    activeAttendanceCount: number,
    message = "此聚會已有出席記錄，不能取消；如需更正請使用出席名單的作廢功能。"
  ) {
    super(message);
    this.name = "EventCancellationBlockedError";
    this.activeAttendanceCount = activeAttendanceCount;
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class EventAvailabilityConfirmationRequiredError extends Error {
  readonly affectedOperations: number;

  constructor(affectedOperations: number) {
    super(
      `Deactivating this event affects ${affectedOperations} open participant operations and requires confirmation.`
    );
    this.name = "EventAvailabilityConfirmationRequiredError";
    this.affectedOperations = affectedOperations;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateScheduleExceptionError extends Error {
  constructor(ruleId: string, overrideDate: string) {
    super(
      `Schedule exception already exists for rule ${ruleId} on ${overrideDate}`
    );
    this.name = "DuplicateScheduleExceptionError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class EnrollmentNotAllowedError extends Error {
  constructor(programId: string, expected: string) {
    super(`Program ${programId} does not accept enrollment mode ${expected}.`);
    this.name = "EnrollmentNotAllowedError";
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class EnrollmentAccountInactiveError extends Error {
  constructor(userId: string) {
    super(`Cannot enroll ${userId}: account is not Active.`);
    this.name = "EnrollmentAccountInactiveError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class StaleEnrollmentRequestError extends Error {
  constructor(requestId: string) {
    super(`Enrollment request ${requestId} is stale; reload before deciding.`);
    this.name = "StaleEnrollmentRequestError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class EnrollmentDecisionConflictError extends Error {
  constructor(requestId: string, status: string) {
    super(
      `Enrollment request ${requestId} cannot be decided from status ${status}.`
    );
    this.name = "EnrollmentDecisionConflictError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateEnrollmentError extends Error {
  constructor(programId: string, memberUserId: string) {
    super(
      `Member ${memberUserId} already has an open request or active enrollment for program ${programId}.`
    );
    this.name = "DuplicateEnrollmentError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class RequestNotDecidableError extends Error {
  constructor(requestId: string) {
    super(`Enrollment request ${requestId} is not in a decidable state.`);
    this.name = "RequestNotDecidableError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class SelfDelegationError extends Error {
  constructor(userId: string) {
    super(`A user cannot grant Program Leader to themselves: ${userId}`);
    this.name = "SelfDelegationError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class LeaderNotAssignedError extends Error {
  constructor(programId: string, userId: string) {
    super(`User ${userId} is not an active Program Leader of ${programId}.`);
    this.name = "LeaderNotAssignedError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class LeaderAccountInactiveError extends Error {
  constructor(userId: string, entity = "Program Leader") {
    super(`Cannot assign ${userId} as ${entity}: account is not Active.`);
    this.name = "LeaderAccountInactiveError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DepartmentManagerNotAssignedError extends Error {
  constructor(departmentId: string, userId: string) {
    super(
      `User ${userId} is not an active Department Manager of ${departmentId}.`
    );
    this.name = "DepartmentManagerNotAssignedError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DepartmentManagerConflictError extends Error {
  constructor(departmentId: string, userId: string) {
    super(
      `Department Manager change conflicted for ${departmentId}:${userId}.`
    );
    this.name = "DepartmentManagerConflictError";
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class ProgramLeaderConflictError extends Error {
  constructor(programId: string, userId: string) {
    super(`Program Leader change conflicted for ${programId}:${userId}.`);
    this.name = "ProgramLeaderConflictError";
  }
}
// oxlint-disable-next-line eslint/max-classes-per-file
export class SelfDepartmentManagerError extends Error {
  constructor(userId: string) {
    super(`A user cannot grant Department Manager to themselves: ${userId}`);
    this.name = "SelfDepartmentManagerError";
  }
}
