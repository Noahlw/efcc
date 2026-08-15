import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export type AttentionModule = "membership" | "programs" | "attendance" | "home";
export type TaskPriority = "high" | "normal" | "low";

export interface AttentionTask {
  task_id: string;
  module: AttentionModule;
  title: string;
  submitted_at: string;
  warning: boolean;
  priority: TaskPriority;
  href: string;
}

export interface AttentionNotification {
  notification_id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  href: string | null;
}

export interface AttentionView {
  actionable_count: number;
  unread_count: number;
  tasks: AttentionTask[];
  notifications: AttentionNotification[];
}

export interface Subscription {
  topic_key: string;
  is_subscribed: boolean;
  updated_at: string;
}

interface Success<T> {
  requestId: string;
  data: T;
}

const idempotencyHeaders = (
  method: "GET" | "POST" | "PUT"
): Record<string, string> =>
  method === "GET" ? {} : { "Idempotency-Key": crypto.randomUUID() };

const attentionFetch = async <T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown
): Promise<T> => {
  let response: Response;
  try {
    const headers: Record<string, string> = {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...idempotencyHeaders(method),
    };
    response = await fetch(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new RpcError({
      status: 0,
      code: "NETWORK_ERROR",
      title: "Network error",
      detail: "無法連接伺服器，請檢查網路後再試。",
    });
  }
  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = { status: response.status, code: "UNAVAILABLE" };
    }
    throw new RpcError(problem);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RpcError({
      status: response.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success response",
      detail: "伺服器回應格式錯誤。",
    });
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Object.hasOwn(payload, "data")
  ) {
    throw new RpcError({
      status: response.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
    });
  }
  return (payload as Success<T>).data;
};

export const getAttention = (): Promise<AttentionView> =>
  attentionFetch("/api/v1/attention", "GET");

export const markAttentionNotificationsRead = (
  notificationIds: readonly string[]
): Promise<{ marked_count: number }> =>
  attentionFetch("/api/v1/attention/notifications/read", "POST", {
    notification_ids: notificationIds,
  });

export const updateTaskPriority = (
  taskId: string,
  priority: TaskPriority
): Promise<{ task_id: string; priority: TaskPriority }> =>
  attentionFetch(
    `/api/v1/attention/tasks/${encodeURIComponent(taskId)}/priority`,
    "PUT",
    { priority }
  );

export const getSubscriptions = (): Promise<{
  subscriptions: Subscription[];
}> => attentionFetch("/api/v1/subscriptions", "GET");

export const updateSubscription = (
  topicKey: string,
  isSubscribed: boolean
): Promise<{ subscriptions: Subscription[] }> =>
  attentionFetch("/api/v1/subscriptions", "PUT", {
    topic_key: topicKey,
    is_subscribed: isSubscribed,
  });
