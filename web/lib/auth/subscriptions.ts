import { findAccountByUserId } from "./accounts";
import type { AccountRow } from "./accounts";
import { ACCESS_COOKIE_NAME } from "./cookies";
import { verifyAccessToken } from "./sessions";

export interface SubscriptionsEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

interface SubscriptionRow {
  topic_key: string;
  is_subscribed: number;
  updated_at: string;
}

interface SubscriptionInput {
  topic_key: string;
  is_subscribed: boolean;
}

const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

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
  env: SubscriptionsEnv,
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

const listSubscriptions = async (env: SubscriptionsEnv, userId: string) => {
  const result = await env.DB.prepare(
    `SELECT topic_key, is_subscribed, updated_at
       FROM account_subscriptions
      WHERE user_id = ?
      ORDER BY topic_key ASC`
  )
    .bind(userId)
    .all<SubscriptionRow>();
  return (result.results ?? []).map((row) => ({
    topic_key: row.topic_key,
    is_subscribed: row.is_subscribed === 1,
    updated_at: row.updated_at,
  }));
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

const parseInputs = (
  body: Record<string, unknown>
): SubscriptionInput[] | null => {
  const raw = Array.isArray(body.subscriptions) ? body.subscriptions : [body];
  if (raw.length === 0 || raw.length > 100) {
    return null;
  }
  const result: SubscriptionInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const value = item as Record<string, unknown>;
    const topic = value.topic_key;
    const subscribed = value.is_subscribed;
    if (
      typeof topic !== "string" ||
      !TOPIC_KEY.test(topic) ||
      typeof subscribed !== "boolean" ||
      seen.has(topic)
    ) {
      return null;
    }
    seen.add(topic);
    result.push({ topic_key: topic, is_subscribed: subscribed });
  }
  return result;
};

/** GET /api/v1/subscriptions. */
export const handleGetSubscriptions = async (
  request: Request,
  env: SubscriptionsEnv
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const auth = await requireAccount(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  return jsonResponse(
    200,
    { subscriptions: await listSubscriptions(env, auth.account.user_id) },
    requestId
  );
};

/** PUT /api/v1/subscriptions. Accepts one input or a subscriptions batch. */
export const handleUpdateSubscription = async (
  request: Request,
  env: SubscriptionsEnv
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const auth = await requireAccount(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson(request);
  const inputs = body === null ? null : parseInputs(body);
  if (!inputs) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "subscriptions must contain unique topic_key and boolean is_subscribed values.",
      requestId
    );
  }
  const updatedAt = new Date().toISOString();
  await env.DB.batch(
    inputs.map(({ topic_key, is_subscribed }) =>
      env.DB.prepare(
        `INSERT INTO account_subscriptions
             (user_id, topic_key, is_subscribed, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, topic_key) DO UPDATE SET
             is_subscribed = excluded.is_subscribed,
             updated_at = excluded.updated_at`
      ).bind(auth.account.user_id, topic_key, is_subscribed ? 1 : 0, updatedAt)
    )
  );
  return jsonResponse(
    200,
    { subscriptions: await listSubscriptions(env, auth.account.user_id) },
    requestId
  );
};
