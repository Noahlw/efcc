/**
 * Home domain wire contracts (spec #646, ticket #654).
 *
 * Source-derived from `apps/web/lib/home-handlers.ts`,
 * `apps/web/lib/home-cms-handlers.ts`, and the worker dispatch:
 * every shape below mirrors an observed wire value, including the
 * `startsAt`/`endAt` compatibility aliases, nullable fields, the CMS
 * snake_case/camelCase request aliases, and the nullable audit
 * version/templateType (malformed historical audit stays visible —
 * mismatch #1 in the acceptance trace).
 *
 * Validators never transform: accept/reject only. Unknown extra
 * fields remain accepted-and-ignored exactly as today.
 */
import * as z from "zod";

import { firstPresent, nonEmptyString, nullableString } from "./primitives";

export const HomeTemplateTypeSchema = z.enum(["A", "B"]);
export type HomeTemplateType = z.infer<typeof HomeTemplateTypeSchema>;

export const HomeContentStatusSchema = z.enum([
  "Draft",
  "Published",
  "Archived",
]);
export type HomeContentStatus = z.infer<typeof HomeContentStatusSchema>;

export const HomePublishModeSchema = z.enum(["immediate", "scheduled"]);
export type HomePublishMode = z.infer<typeof HomePublishModeSchema>;

export const HomeFeaturedEventSchema = z.object({
  eventId: nonEmptyString,
  programId: nonEmptyString,
  programTitle: nonEmptyString,
  title: nonEmptyString,
  startsAt: nonEmptyString,
  endsAt: nonEmptyString,
  startAt: z.string().nullish(),
  endAt: z.string().nullish(),
  location: z.string(),
  status: nonEmptyString,
  isEnrolled: z.boolean(),
});
export type HomeFeaturedEvent = z.infer<typeof HomeFeaturedEventSchema>;

export const HomeAnnouncementSchema = z.object({
  contentId: nonEmptyString,
  version: z.number().int(),
  title: z.string(),
  summary: z.string(),
  bodyMarkdown: nullableString,
  ctaLabel: nullableString,
  ctaUrl: nullableString,
  imageUrl: nullableString,
  imageAlt: nullableString,
  publishedAt: nullableString,
});
export type HomeAnnouncement = z.infer<typeof HomeAnnouncementSchema>;

export const HomeExploreProgramSchema = z.object({
  programId: nonEmptyString,
  title: nonEmptyString,
  summary: nullableString,
  category: nullableString,
  enrollmentType: nonEmptyString,
  nextEventStartAt: nullableString,
});
export type HomeExploreProgram = z.infer<typeof HomeExploreProgramSchema>;

export const HomeProjectionSchema = z.object({
  featuredEvent: HomeFeaturedEventSchema.nullable(),
  announcement: HomeAnnouncementSchema.nullable(),
  exploreProgram: HomeExploreProgramSchema.nullable(),
});
export type HomeProjection = z.infer<typeof HomeProjectionSchema>;

export const HomeAnnouncementsSchema = z.object({
  announcements: z.array(HomeAnnouncementSchema),
});
export type HomeAnnouncements = z.infer<typeof HomeAnnouncementsSchema>;

export const HomeContentSchema = z.object({
  contentId: nonEmptyString,
  version: z.number().int(),
  templateType: HomeTemplateTypeSchema,
  status: HomeContentStatusSchema,
  publishMode: HomePublishModeSchema,
  startAt: nullableString,
  endAt: nullableString,
  title: nullableString,
  summary: nullableString,
  bodyMarkdown: nullableString,
  ctaLabel: nullableString,
  ctaUrl: nullableString,
  imageUrl: nullableString,
  imageAlt: nullableString,
  featuredEventId: nullableString,
  updatedBy: nullableString,
  updatedAt: nonEmptyString,
  publishedBy: nullableString,
  publishedAt: nullableString,
});
export type HomeContent = z.infer<typeof HomeContentSchema>;

export const HomeAuditItemSchema = z.object({
  auditId: nonEmptyString,
  insertedAt: nonEmptyString,
  actorUserId: z.string(),
  actorName: nullableString,
  action: nonEmptyString,
  entityId: nonEmptyString,
  contentId: nonEmptyString,
  version: z.number().int().nullable(),
  templateType: HomeTemplateTypeSchema.nullable(),
});
export type HomeAuditItem = z.infer<typeof HomeAuditItemSchema>;

export const HomeAuditListSchema = z.object({
  items: z.array(HomeAuditItemSchema),
});
export type HomeAuditList = z.infer<typeof HomeAuditListSchema>;

export const FeaturedEventPreviewSchema = z.object({
  eventId: nonEmptyString,
  programId: nonEmptyString,
  programTitle: nonEmptyString,
  title: nonEmptyString,
  startsAt: nonEmptyString,
  endsAt: nonEmptyString,
  location: z.string(),
  status: nonEmptyString,
});
export type FeaturedEventPreview = z.infer<typeof FeaturedEventPreviewSchema>;

/**
 * Effective CMS field set after alias coalescing and existing-row
 * fallback (the handler keeps that orchestration unchanged). Validates
 * the same predicates the handlers enforce today: A|B template,
 * immediate|scheduled mode, ISO start/end with end-after-start.
 */
export const HomeCmsEffectiveSchema = z
  .object({
    templateType: HomeTemplateTypeSchema,
    publishMode: HomePublishModeSchema,
    startAt: nullableString,
    endAt: nullableString,
  })
  .refine(
    (value) =>
      value.startAt === null ||
      value.endAt === null ||
      value.endAt > value.startAt,
    { message: "end_at must be after start_at." }
  );
export type HomeCmsEffective = z.infer<typeof HomeCmsEffectiveSchema>;

/** Raw draft/publish body aliases observed on the wire (all optional). */
export interface CmsCoalescedBody {
  contentId: string | null | undefined;
  expectedVersion: unknown;
  version: unknown;
  templateType: unknown;
  publishMode: unknown;
  startAt: unknown;
  endAt: unknown;
}

/**
 * Coalesce a raw CMS JSON body across snake_case/camelCase aliases in
 * the exact handler order (snake first). Unknown keys are ignored by
 * the caller, exactly as today.
 */
export function coalesceCmsBody(
  body: Record<string, unknown>
): CmsCoalescedBody {
  return {
    contentId: firstPresent(body, ["content_id", "contentId"]) as
      | string
      | null
      | undefined,
    expectedVersion: firstPresent(body, [
      "expected_version",
      "expectedVersion",
    ]),
    version: firstPresent(body, ["version"]),
    templateType: firstPresent(body, ["template_type", "templateType"]),
    publishMode: firstPresent(body, ["publish_mode", "publishMode"]),
    startAt: firstPresent(body, ["start_at", "startAt"]),
    endAt: firstPresent(body, ["end_at", "endAt"]),
  };
}

/**
 * `expected_version` predicate with the exact current semantics:
 * absent is fine; present must be a positive safe integer.
 */
export function isValidExpectedVersion(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 1)
  );
}
