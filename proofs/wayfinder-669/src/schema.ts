import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Throwaway EFCC #669 slice. accounts/events are minimal FK targets; Home and
// audit mirror the relevant columns and constraints from 0010/0003 migrations.
export const accounts = sqliteTable("accounts", {
  userId: text("user_id").primaryKey(),
  accountStatus: text("account_status").notNull().default("Active"),
});

export const sessions = sqliteTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => accounts.userId),
  revokedAt: integer("revoked_at"),
  expiresAt: integer("expires_at").notNull(),
});

export const events = sqliteTable("events", {
  eventId: text("event_id").primaryKey(),
});

export const homeContent = sqliteTable(
  "home_content",
  {
    contentId: text("content_id").notNull(),
    version: integer("version").notNull(),
    templateType: text("template_type").notNull(),
    status: text("status").notNull(),
    publishMode: text("publish_mode").notNull().default("immediate"),
    startAt: text("start_at"),
    endAt: text("end_at"),
    title: text("title"),
    summary: text("summary"),
    bodyMarkdown: text("body_markdown"),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt"),
    featuredEventId: text("featured_event_id").references(
      () => events.eventId,
      {
        onDelete: "set null",
      }
    ),
    createdBy: text("created_by")
      .notNull()
      .references(() => accounts.userId, {
        onDelete: "restrict",
      }),
    createdAt: text("created_at").notNull(),
    updatedBy: text("updated_by").references(() => accounts.userId, {
      onDelete: "restrict",
    }),
    updatedAt: text("updated_at").notNull(),
    publishedBy: text("published_by").references(() => accounts.userId, {
      onDelete: "restrict",
    }),
    publishedAt: text("published_at"),
    archivedBy: text("archived_by").references(() => accounts.userId, {
      onDelete: "restrict",
    }),
    archivedAt: text("archived_at"),
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.version] }),
    check("home_version_positive", sql`${table.version} >= 1`),
    check("home_template_type", sql`${table.templateType} in ('A', 'B')`),
    check(
      "home_status",
      sql`${table.status} in ('Draft', 'Published', 'Archived')`
    ),
    check(
      "home_publish_mode",
      sql`${table.publishMode} in ('immediate', 'scheduled')`
    ),
    index("home_content_status_idx").on(
      table.status,
      table.publishMode,
      table.startAt,
      table.endAt
    ),
    uniqueIndex("home_content_version_idx").on(table.version),
    // SQLite descending index order is kept as reviewed raw SQL in the
    // companion migration; Drizzle's column `.desc()` is PostgreSQL-only.
  ]
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    auditId: text("audit_id").primaryKey(),
    insertedAt: text("inserted_at").notNull(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    oldValueJson: text("old_value_json"),
    newValueJson: text("new_value_json"),
    reason: text("reason"),
    outcome: text("outcome").notNull(),
    correlationId: text("correlation_id"),
  },
  (table) => [
    check(
      "audit_outcome",
      sql`${table.outcome} in ('SUCCESS', 'DUPLICATE', 'CONFLICT', 'DENIED', 'FAILED')`
    ),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_actor_idx").on(table.actorUserId),
    index("audit_events_corr_idx").on(table.correlationId),
  ]
);
