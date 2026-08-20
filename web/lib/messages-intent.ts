export type MessagesOrigin = "home" | "messages";

const SAFE_CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const MESSAGE_ORIGINS: readonly MessagesOrigin[] = ["home", "messages"];

function isMessagesOrigin(value: string): value is MessagesOrigin {
  return MESSAGE_ORIGINS.includes(value as MessagesOrigin);
}

export function parseMessagesIntent(search: string): {
  contentId: string | null;
  origin?: MessagesOrigin;
  malformed: boolean;
} {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const contentValues = params.getAll("content");
  const originValues = params.getAll("from");
  if (contentValues.length > 1 || originValues.length > 1) {
    return { contentId: null, malformed: true };
  }
  const supplied = contentValues[0] ?? null;
  const rawOrigin = originValues[0] ?? null;
  if (supplied === null || supplied === "") {
    return {
      contentId: null,
      malformed: rawOrigin !== null,
    };
  }
  const contentId = SAFE_CONTENT_ID.test(supplied) ? supplied : null;
  const origin =
    rawOrigin !== null && isMessagesOrigin(rawOrigin) ? rawOrigin : undefined;
  return {
    contentId,
    ...(origin === undefined ? {} : { origin }),
    malformed:
      contentId === null || (rawOrigin !== null && origin === undefined),
  };
}

export function buildMessagesHref(
  contentId?: string | null,
  origin?: MessagesOrigin
): string {
  if (!contentId) {
    return "/messages";
  }
  const query = new URLSearchParams({ content: contentId });
  if (origin && isMessagesOrigin(origin)) {
    query.set("from", origin);
  }
  return `/messages?${query.toString()}`;
}
