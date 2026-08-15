import { findAccountByUserId } from "./auth/accounts";
import type { AccountRow } from "./auth/accounts";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { verifyAccessToken } from "./auth/sessions";
import {
  AuthorizationDeniedError,
  D1CapabilityAuthorizer,
} from "./programs/capability-authorizer";
import { D1WorkspaceStore } from "./programs/d1-workspace-store";
import { DepartmentWorkspace } from "./programs/department-workspace";
import type {
  ManagementAttentionItem,
  ManagementNotificationItem,
} from "./programs/department-workspace";

export interface AttentionEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

type AttentionModule = "membership" | "programs" | "attendance" | "home";
type TaskPriority = "high" | "normal" | "low";

interface TaskPriorityRow {
  task_id: string;
  priority: TaskPriority;
}

interface RegistrationTaskRow {
  request_id: string;
  name: string;
  username: string;
  submitted_at: number;
}

interface AttentionNotificationRow {
  notification_id: string;
  topic_key: string;
  title: string;
  body: string;
  href: string | null;
  created_at: string;
  read_at: string | null;
}

interface AttentionTask {
  task_id: string;
  module: AttentionModule;
  title: string;
  submitted_at: string;
  warning: boolean;
  priority: TaskPriority;
  href: string;
}
const programNotificationId = (sourceKey: string, sourceRevision: string) =>
  `program:${encodeURIComponent(sourceKey)}:${encodeURIComponent(sourceRevision)}`;

const parseProgramNotificationId = (value: string) => {
  if (!value.startsWith("program:")) {
    return null;
  }
  const encoded = value.slice("program:".length);
  const separator = encoded.indexOf(":");
  if (separator === -1) {
    return null;
  }
  return {
    source_key: decodeURIComponent(encoded.slice(0, separator)),
    source_revision: decodeURIComponent(encoded.slice(separator + 1)),
  };
};

interface AttentionNotification {
  notification_id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  href: string | null;
}

const MODULE_ORDER: readonly AttentionModule[] = [
  "membership",
  "programs",
  "attendance",
  "home",
];

const PRIORITIES: readonly TaskPriority[] = ["high", "normal", "low"];

const problem = (
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string
) =>
  Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title,
      status,
      code,
      detail,
      requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "X-Request-Id": requestId,
      },
    }
  );

const jsonResponse = (status: number, data: unknown, requestId: string) =>
  Response.json(
    { requestId, data },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    }
  );

const readCookie = (headers: Headers, name: string): string | null => {
  const cookie = headers.get("Cookie");
  if (!cookie) {
    return null;
  }
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
};

const requireAccount = async (
  request: Request,
  env: AttentionEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> => {
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  if (account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  return { account };
};

const parseJson = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const value: unknown = await request.json();
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const taskPriorityById = async (
  env: AttentionEnv,
  taskIds: readonly string[]
): Promise<Record<string, TaskPriority>> => {
  if (taskIds.length === 0) {
    return {};
  }
  const placeholders = taskIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT task_id, priority
       FROM task_priorities
      WHERE task_id IN (${placeholders})`
  )
    .bind(...taskIds)
    .all<TaskPriorityRow>();
  const priorities: Record<string, TaskPriority> = {};
  for (const row of result.results ?? []) {
    priorities[row.task_id] = row.priority;
  }
  return priorities;
};

const listRegistrationTasks = async (
  env: AttentionEnv,
  account: AccountRow
): Promise<AttentionTask[]> => {
  if (account.role !== "Admin" && account.role !== "Staff") {
    return [];
  }
  const result = await env.DB.prepare(
    `SELECT request_id, name, username, submitted_at
       FROM registration_requests
      WHERE account_status = 'Pending'
      ORDER BY submitted_at ASC
      LIMIT 100`
  ).all<RegistrationTaskRow>();
  const rows = result.results ?? [];
  const priorities = await taskPriorityById(
    env,
    rows.map((row) => `registration:${row.request_id}`)
  );
  return rows.map((row) => {
    const taskId = `registration:${row.request_id}`;
    return {
      task_id: taskId,
      module: "membership",
      title: `${row.name} (${row.username})`,
      submitted_at: new Date(row.submitted_at).toISOString(),
      warning: false,
      priority: priorities[taskId] ?? "normal",
      href: "/registrations",
    };
  });
};

const programTaskData = async (
  env: AttentionEnv,
  account: AccountRow
): Promise<{
  tasks: AttentionTask[];
  notifications: AttentionNotification[];
}> => {
  const store = new D1WorkspaceStore(env.DB);
  const workspace = new DepartmentWorkspace(
    store,
    new D1CapabilityAuthorizer(store)
  );
  const context = { actorUserId: account.user_id, actorRole: account.role };
  let attention: {
    items: ManagementAttentionItem[];
  } | null = null;
  let notifications: {
    items: ManagementNotificationItem[];
  } | null = null;
  try {
    attention = await workspace.getManagementAttention(context, 100);
    notifications = await workspace.getManagementNotifications(context, 100);
  } catch (error) {
    if (!(error instanceof AuthorizationDeniedError)) {
      throw error;
    }
  }

  const sourceTasks: AttentionTask[] = [];
  for (const item of attention?.items ?? []) {
    if (item.kind === "event" && !item.actionable) {
      continue;
    }
    const taskId =
      item.kind === "enrollment"
        ? `enrollment:${item.program_id}`
        : `event:${item.event_id}`;
    const isEvent = item.kind === "event";
    sourceTasks.push({
      task_id: taskId,
      module: isEvent ? "attendance" : "programs",
      title: isEvent
        ? (item.name ?? "聚會需要處理")
        : `${item.program_name}：待審批報名 ${item.count} 人`,
      submitted_at: isEvent ? item.starts_at : new Date().toISOString(),
      warning: isEvent ? item.availability === "Inactive" : false,
      priority: "normal",
      href: isEvent
        ? `/programs?mode=management&program=${encodeURIComponent(item.program_id)}&task=events&event=${encodeURIComponent(item.event_id)}`
        : `/programs?mode=management&program=${encodeURIComponent(item.program_id)}&task=participants`,
    });
  }
  const priorities = await taskPriorityById(
    env,
    sourceTasks.map(({ task_id }) => task_id)
  );
  for (const task of sourceTasks) {
    task.priority = priorities[task.task_id] ?? "normal";
  }

  const notificationItems = (notifications?.items ?? []).map((item) => ({
    notification_id: programNotificationId(
      item.source_key,
      item.source_revision
    ),
    title:
      item.kind === "enrollment"
        ? `${item.program_name}：有新的報名申請`
        : `${item.program_name}：聚會狀態已更新`,
    body:
      item.kind === "enrollment"
        ? `待審批報名 ${item.count} 人`
        : (item.name ?? "請檢視聚會工作流程。"),
    created_at:
      item.kind === "enrollment" ? item.latest_submitted_at : item.updated_at,
    read: item.read,
    href:
      item.kind === "enrollment"
        ? `/programs?mode=management&program=${encodeURIComponent(item.program_id)}&task=participants`
        : `/programs?mode=management&program=${encodeURIComponent(item.program_id)}&task=events&event=${encodeURIComponent(item.event_id)}`,
  }));
  return { tasks: sourceTasks, notifications: notificationItems };
};

const listEditorialNotifications = async (
  env: AttentionEnv,
  userId: string
): Promise<AttentionNotification[]> => {
  const result = await env.DB.prepare(
    `SELECT n.notification_id, n.topic_key, n.title, n.body, n.href,
            n.created_at, r.read_at
       FROM attention_notifications AS n
       LEFT JOIN attention_notification_reads AS r
         ON r.notification_id = n.notification_id
        AND r.user_id = ?
      WHERE julianday(n.created_at) >= julianday('now', '-90 days')
        AND julianday(n.expires_at) > julianday('now')
        AND (
          NOT EXISTS (
            SELECT 1 FROM account_subscriptions s
             WHERE s.user_id = ? AND s.topic_key = n.topic_key
          )
          OR EXISTS (
            SELECT 1 FROM account_subscriptions s
             WHERE s.user_id = ?
               AND s.topic_key = n.topic_key
               AND s.is_subscribed = 1
          )
        )
      ORDER BY n.created_at DESC
      LIMIT 100`
  )
    .bind(userId, userId, userId)
    .all<AttentionNotificationRow>();
  return (result.results ?? []).map((row) => ({
    notification_id: `editorial:${row.notification_id}`,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    read: row.read_at !== null,
    href: row.href,
  }));
};

const listAttention = async (
  env: AttentionEnv,
  account: AccountRow
): Promise<{
  tasks: AttentionTask[];
  notifications: AttentionNotification[];
}> => {
  const [registrationTasks, programData, editorialNotifications] =
    await Promise.all([
      listRegistrationTasks(env, account),
      programTaskData(env, account),
      listEditorialNotifications(env, account.user_id),
    ]);
  const tasks = [...registrationTasks, ...programData.tasks].sort(
    (left, right) =>
      MODULE_ORDER.indexOf(left.module) - MODULE_ORDER.indexOf(right.module) ||
      left.submitted_at.localeCompare(right.submitted_at)
  );
  return {
    tasks,
    notifications: [
      ...programData.notifications,
      ...editorialNotifications,
    ].sort((left, right) => right.created_at.localeCompare(left.created_at)),
  };
};

/** GET /api/v1/attention. */
export const handleGetAttention = async (
  request: Request,
  env: AttentionEnv
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const auth = await requireAccount(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const attention = await listAttention(env, auth.account);
  return jsonResponse(
    200,
    {
      actionable_count: attention.tasks.length,
      unread_count: attention.notifications.filter(({ read }) => !read).length,
      tasks: attention.tasks,
      notifications: attention.notifications,
    },
    requestId
  );
};

/** PUT /api/v1/attention/tasks/:taskId/priority. */
export const handleUpdateTaskPriority = async (
  request: Request,
  env: AttentionEnv,
  taskId: string
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const auth = await requireAccount(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  if (auth.account.role !== "Admin") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Only Admin accounts can update task priority.",
      requestId
    );
  }
  const body = await parseJson(request);
  const priority = body?.priority;
  if (
    typeof priority !== "string" ||
    !PRIORITIES.includes(priority as TaskPriority) ||
    taskId.length < 1 ||
    taskId.length > 200
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "priority must be high, normal, or low.",
      requestId
    );
  }
  const attention = await listAttention(env, auth.account);
  const task = attention.tasks.find(({ task_id }) => task_id === taskId);
  if (!task) {
    return problem(
      409,
      "CONFLICT",
      "Task is no longer actionable",
      "Resolve the current workflow before changing its priority.",
      requestId
    );
  }
  const old = task.priority;
  const next = priority as TaskPriority;
  const updatedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO task_priorities (task_id, priority, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           priority = excluded.priority,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`
    ).bind(taskId, next, auth.account.user_id, updatedAt),
    env.DB.prepare(
      `INSERT INTO audit_events (
           audit_id, inserted_at, actor_user_id, action, entity_type,
           entity_id, old_value_json, new_value_json, reason, outcome,
           correlation_id
         ) VALUES (?, ?, ?, 'ATTENTION_TASK_PRIORITY_UPDATED', 'task_priority', ?, ?, ?, NULL, 'SUCCESS', ?)`
    ).bind(
      crypto.randomUUID(),
      updatedAt,
      auth.account.user_id,
      taskId,
      JSON.stringify({ priority: old }),
      JSON.stringify({ priority: next }),
      requestId
    ),
  ]);
  return jsonResponse(200, { task_id: taskId, priority: next }, requestId);
};

/** POST /api/v1/attention/notifications/read. */
export const handleMarkAttentionNotificationsRead = async (
  request: Request,
  env: AttentionEnv
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const auth = await requireAccount(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson(request);
  const raw = body?.notification_ids;
  if (
    !Array.isArray(raw) ||
    raw.length > 100 ||
    raw.some((value) => typeof value !== "string" || value.length > 200)
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "notification_ids must be an array of at most 100 ids.",
      requestId
    );
  }
  const current = await listAttention(env, auth.account);
  const visible = new Map(
    current.notifications.map((item) => [item.notification_id, item])
  );
  const requested = [...new Set(raw as string[])].filter((id) =>
    visible.has(id)
  );
  const editorialIds = requested
    .filter((id) => id.startsWith("editorial:"))
    .map((id) => id.slice("editorial:".length));
  const programItems = requested
    .map((id) => visible.get(id))
    .filter(
      (item): item is AttentionNotification =>
        item !== undefined && item.notification_id.startsWith("program:")
    );
  const statements: D1PreparedStatement[] = [];
  const readAt = new Date().toISOString();
  for (const notificationId of editorialIds) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO attention_notification_reads
             (notification_id, user_id, read_at)
           VALUES (?, ?, ?)`
      ).bind(notificationId, auth.account.user_id, readAt)
    );
  }
  if (programItems.length > 0) {
    const sourceStates = programItems.flatMap(({ notification_id }) => {
      const parsed = parseProgramNotificationId(notification_id);
      return parsed ? [parsed] : [];
    });
    for (const state of sourceStates) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO program_notification_reads
               (user_id, source_key, source_revision, read_at)
             VALUES (?, ?, ?, ?)`
        ).bind(
          auth.account.user_id,
          state.source_key,
          state.source_revision,
          readAt
        )
      );
    }
  }
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return jsonResponse(200, { marked_count: requested.length }, requestId);
};
