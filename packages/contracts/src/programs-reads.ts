/**
 * Programs discovery/management-read/feed wire contracts (spec #646,
 * ticket #656).
 *
 * Source-derived from `apps/web/lib/programs/program-handlers.ts`,
 * `department-workspace.ts`, `workspace-store.ts`, `hub-types.ts`, and
 * the worker dispatch. Validators never transform; accepted extras
 * flow exactly as today. Capability vocabularies stay server-side.
 */
import * as z from "zod";

import { nonEmptyString, nullableString } from "./primitives";

export const ProgramBehaviorTypeSchema = z.enum(["Recurring", "OneOff"]);
export const ProgramLifecycleSchema = z.enum(["Draft", "Active", "Archived"]);
export const ProgramDiscoverabilitySchema = z.enum(["Listed", "Unlisted"]);
export const ProgramEnrollmentModeSchema = z.enum([
  "MemberRequest",
  "ManagerOnly",
]);
export const DepartmentLifecycleSchema = z.enum([
  "Draft",
  "PendingDevelopment",
  "Active",
  "Archived",
]);
export const ParticipantNoticeKindSchema = z.enum([
  "event",
  "program",
  "account",
]);
export const ModuleKeySchema = z.enum([
  "program_catalog",
  "enrollment",
  "events",
  "attendance",
  "custom_forms",
]);
export const ViewerStateSchema = z.enum([
  "active",
  "pending",
  "eligible",
  "managerOnly",
  "withdrawn",
  "cancelled",
  "rejected",
  "archived",
]);
export const EnrollmentAccessSchema = z.enum([
  "Eligible",
  "Ineligible",
  "Unavailable",
]);
export const ActiveCancelledSchema = z.enum(["Active", "Cancelled"]);
export const ActiveInactiveSchema = z.enum(["Active", "Inactive"]);
export const ScheduleManualSchema = z.enum(["SCHEDULE", "MANUAL"]);

const ProgramCapabilitiesSchema = z.object({
  manage: z.boolean(),
  publish: z.boolean(),
  enroll: z.boolean(),
  leader_assign: z.boolean(),
  role_read: z.boolean().optional(),
  role_assign: z.boolean().optional(),
  role_revoke: z.boolean().optional(),
});

const DepartmentCapabilitiesSchema = z.object({
  manage: z.boolean(),
  publish: z.boolean(),
  module_configure: z.boolean(),
  manager_assign: z.boolean().optional(),
  role_read: z.boolean().optional(),
  role_assign: z.boolean().optional(),
  role_revoke: z.boolean().optional(),
});

export const DepartmentSummarySchema = z.object({
  department_id: nonEmptyString,
  code: nonEmptyString,
  name: z.string(),
  description: nullableString,
  lifecycle: DepartmentLifecycleSchema,
  display_order: z.number(),
});

export const ManagementDepartmentViewSchema = z.object({
  department_id: nonEmptyString,
  code: nonEmptyString,
  name: z.string(),
  description: nullableString,
  lifecycle: DepartmentLifecycleSchema,
  display_order: z.number(),
  created_at: nonEmptyString,
  updated_at: nonEmptyString,
  capabilities: DepartmentCapabilitiesSchema,
});

export const ProgramSummarySchema = z.object({
  program_id: nonEmptyString,
  department_id: nonEmptyString,
  name: z.string(),
  description: nullableString,
  category: nullableString,
  behavior_type: ProgramBehaviorTypeSchema,
  lifecycle: ProgramLifecycleSchema,
  discoverability: ProgramDiscoverabilitySchema,
  enrollment_mode: ProgramEnrollmentModeSchema,
  display_order: z.number(),
  created_at: nonEmptyString,
  updated_at: nonEmptyString,
});

export const ManagementProgramViewSchema = ProgramSummarySchema.extend({
  capabilities: ProgramCapabilitiesSchema,
});

export const ManagementDirectoryViewSchema = z.object({
  departments: z.array(ManagementDepartmentViewSchema),
  programs: z.array(ManagementProgramViewSchema),
});

export const ManagementAccessViewSchema = z.object({
  hasManagementCapability: z.boolean(),
  departmentScopes: z.number(),
  programScopes: z.number(),
});

const ManagementHubRowSchema = z.object({
  key: nonEmptyString,
  label: z.string(),
  description: z.string(),
  href: nonEmptyString,
});

export const ManagementHubViewSchema = z.object({
  groups: z.array(
    z.object({
      key: nonEmptyString,
      label: z.string(),
      rows: z.array(ManagementHubRowSchema),
    })
  ),
  entryCard: ManagementHubRowSchema.nullable(),
});

const ManagementMemberIdentitySchema = z.object({
  id: nonEmptyString,
  label: z.string(),
  stableKey: nonEmptyString,
  scopeKind: z.enum(["Global", "Department", "Program"]),
  scopeId: nullableString,
});

export const ManagementMemberViewSchema = z.object({
  userId: nonEmptyString,
  name: z.string(),
  phone: nullableString,
  identities: z.array(ManagementMemberIdentitySchema),
  status: z.string(),
  departments: z.array(z.object({ id: nonEmptyString, name: z.string() })),
});

export const MembersSearchResultSchema = z.object({
  members: z.array(ManagementMemberViewSchema),
});

export const AccountDirectoryMemberSchema = ManagementMemberViewSchema.extend({
  username: nullableString,
  canOpenAccess: z.boolean(),
});

export const AccountDirectoryViewSchema = z.object({
  accounts: z.array(AccountDirectoryMemberSchema),
  nextCursor: nullableString,
  summary: z.object({
    total: z.number(),
    active: z.number(),
    elevated: z.number(),
    pending: z.number(),
  }),
});

const ManagementAttentionProgramSchema = z.object({
  program_id: nonEmptyString,
  department_id: nonEmptyString,
  pending_enrollment_count: z.number(),
  inactive_event_count: z.number(),
  cancelled_event_count: z.number(),
  actionable_count: z.number(),
});

const AttentionItemBaseSchema = z.object({
  program_id: nonEmptyString,
  program_name: z.string(),
  department_id: nonEmptyString,
  department_name: z.string(),
});

const ManagementAttentionItemSchema = z.union([
  AttentionItemBaseSchema.extend({
    kind: z.literal("enrollment"),
    actionable: z.literal(true),
    count: z.number(),
  }),
  AttentionItemBaseSchema.extend({
    kind: z.literal("event"),
    actionable: z.boolean(),
    event_id: nonEmptyString,
    starts_at: nonEmptyString,
    status: ActiveCancelledSchema,
    availability: ActiveInactiveSchema,
    name: nullableString,
  }),
]);

export const ManagementAttentionViewSchema = z.object({
  programs: z.array(ManagementAttentionProgramSchema),
  items: z.array(ManagementAttentionItemSchema),
  total_actionable_count: z.number(),
  has_more: z.boolean(),
});

const NotificationItemBaseSchema = z.object({
  source_key: nonEmptyString,
  source_revision: nonEmptyString,
  read: z.boolean(),
  program_id: nonEmptyString,
  program_name: z.string(),
  department_id: nonEmptyString,
  department_name: z.string(),
});

const ManagementNotificationItemSchema = z.union([
  NotificationItemBaseSchema.extend({
    kind: z.literal("enrollment"),
    actionable: z.literal(true),
    count: z.number(),
    latest_submitted_at: nonEmptyString,
  }),
  NotificationItemBaseSchema.extend({
    kind: z.literal("event"),
    actionable: z.boolean(),
    event_id: nonEmptyString,
    starts_at: nonEmptyString,
    status: ActiveCancelledSchema,
    availability: ActiveInactiveSchema,
    name: nullableString,
    updated_at: nonEmptyString,
  }),
]);

export const ManagementNotificationsViewSchema = z.object({
  items: z.array(ManagementNotificationItemSchema),
  unread_count: z.number(),
  has_more: z.boolean(),
});

export const MarkedCountSchema = z.object({ marked_count: z.number() });

/**
 * notifications/read item: bounded key strings; every other key on the
 * item is ignored exactly as today.
 */
export const NotificationReadItemSchema = z.object({
  source_key: z.string().min(1).max(256),
  source_revision: z.string().min(1).max(512),
});

export const NotificationsReadBodySchema = z.object({
  items: z.array(z.unknown()).max(100),
});

export const ParticipantNoticeViewSchema = z.object({
  notice_id: nonEmptyString,
  kind: ParticipantNoticeKindSchema,
  title: z.string(),
  body: z.string(),
  program_id: nullableString,
  event_id: nullableString,
  read_at: z.number().nullable(),
  created_at: z.number(),
});

export const ParticipantNoticesViewSchema = z.object({
  notices: z.array(ParticipantNoticeViewSchema),
  unread_count: z.number(),
});

export const NoticeCreateResponseSchema = z.object({
  notice: ParticipantNoticeViewSchema,
});

export const ParticipantCatalogProgramSchema = ProgramSummarySchema.extend({
  viewerState: ViewerStateSchema,
  nextEventStartsAt: nullableString,
  upcomingEventCount: z.number(),
});

export const ParticipantCatalogSchema = z.object({
  catalog: z.array(
    z.object({
      department: DepartmentSummarySchema,
      programs: z.array(ParticipantCatalogProgramSchema),
    })
  ),
});

const ParticipantScheduleRuleSchema = z.object({
  rule_id: nonEmptyString,
  recurrence: z.enum(["WEEKLY", "MONTHLY"]),
  day_of_week: z.number().nullable(),
  month_day: z.number().nullable(),
  start_time: nonEmptyString,
  end_time: nonEmptyString,
});

const ParticipantEventSummarySchema = z.object({
  event_id: nonEmptyString,
  program_id: nonEmptyString,
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  status: ActiveCancelledSchema,
  source: ScheduleManualSchema,
  name: nullableString,
  location: nullableString,
  cancel_reason: nullableString,
  self_check_in_available: z.boolean(),
});

export const ParticipantProgramDetailSchema = z.object({
  detail: z.object({
    program: ProgramSummarySchema,
    department: DepartmentSummarySchema,
    schedule_rules: z.array(ParticipantScheduleRuleSchema),
    events: z.array(ParticipantEventSummarySchema),
    enrollment: z
      .object({
        requests: z.array(
          z.object({
            request_id: nonEmptyString,
            status: z.string(),
            submitted_at: nonEmptyString,
            decided_at: nullableString,
          })
        ),
        enrollments: z.array(
          z.object({
            enrollment_id: nonEmptyString,
            status: z.string(),
            enrolled_at: nonEmptyString,
            cancelled_at: nullableString,
          })
        ),
      })
      .nullable(),
    enrollment_access: EnrollmentAccessSchema,
  }),
});

export const ProgramAttendanceArtifactSchema = z.object({
  artifact: z.object({
    program_id: nonEmptyString,
    program_name: z.string(),
    check_in_token: nonEmptyString,
    can_rotate: z.boolean(),
  }),
});

export const ProgramTokenRotationSchema = z.object({
  rotation: z.object({
    program_id: nonEmptyString,
    check_in_token: nonEmptyString,
    idempotent: z.boolean(),
  }),
});

const CockpitEventSchema = z.object({
  event_id: nonEmptyString,
  program_id: nonEmptyString,
  title: nullableString,
  name: nullableString,
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  location: nullableString,
  source: ScheduleManualSchema,
  is_recurring: z.boolean(),
  checked_in_count: z.number(),
  roster_count: z.number(),
});

const ManagementCockpitInnerSchema = z.object({
  program_id: nonEmptyString,
  updated_at: nonEmptyString,
  next_event: CockpitEventSchema.nullable(),
  open_events: z.array(CockpitEventSchema),
  active_event_count: z.number(),
  pending_enrollment_count: z.number(),
});

export const ManagementCockpitViewSchema = z.object({
  cockpit: ManagementCockpitInnerSchema,
});

export const ManagementProgramWorkspaceViewSchema = z.object({
  program: ProgramSummarySchema.extend({
    capabilities: ProgramCapabilitiesSchema,
    check_in_opens_at_minutes_before_start: z.number().optional(),
    check_in_closes_at_minutes_after_end: z.number().optional(),
  }),
  department: ManagementDepartmentViewSchema,
  modules: z.array(
    z.object({
      department_id: nonEmptyString,
      module_key: ModuleKeySchema,
      enabled: z.number(),
      enabled_at: nonEmptyString,
    })
  ),
  cockpit: ManagementCockpitInnerSchema,
});

// ---------------------------------------------------------------------------
// Request predicates with exact handler semantics.
// ---------------------------------------------------------------------------

/**
 * Floor-clamp list limit with the exact programs-read policy: absent →
 * fallback; non-finite → fallback; otherwise floor then clamp to
 * [min, max]. Never a 422 (unlike the identity search).
 */
export function floorClampLimit(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === null) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/** Members/accounts search term with the exact trim policy. */
export function parseSearchTerm(raw: string | null): string {
  return raw?.trim() ?? "";
}

export function isValidAccountCursor(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export const AccountDirectoryStatusSchema = z.enum([
  "Pending",
  "Active",
  "Suspended",
  "Deactivated",
]);

/**
 * Optional rotate Idempotency-Key: absent → undefined (proceeds);
 * present trims; overlong is invalid. Mirrors the handler exactly.
 */
export function parseOptionalIdempotencyKey(
  value: unknown
): { key: string | undefined } | null {
  if (value === null || value === undefined) {
    return { key: undefined };
  }
  if (typeof value !== "string") {
    return { key: undefined };
  }
  const key = value.trim();
  return key.length > 200 ? null : { key };
}

/** notices/create field predicates with exact trim/non-empty semantics. */
export function trimmedField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function optionalIdField(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

export type NotificationReadItem = z.infer<typeof NotificationReadItemSchema>;

export const DepartmentsListSchema = z.object({
  departments: z.array(ManagementDepartmentViewSchema),
});

export const DepartmentGetSchema = z.object({
  department: ManagementDepartmentViewSchema,
});

export const DepartmentDetailSchema = z.object({
  department: ManagementDepartmentViewSchema,
  modules: z.array(
    z.object({
      department_id: nonEmptyString,
      module_key: ModuleKeySchema,
      enabled: z.number(),
      enabled_at: nonEmptyString,
    })
  ),
});

export const ProgramsListSchema = z.object({
  programs: z.array(ManagementProgramViewSchema),
});

export const ProgramGetSchema = z.object({
  program: ManagementProgramViewSchema,
});

export const MemberOptionsSchema = z.object({
  members: z.array(
    z.object({
      user_id: nonEmptyString,
      name: z.string(),
      username: z.string(),
    })
  ),
});
