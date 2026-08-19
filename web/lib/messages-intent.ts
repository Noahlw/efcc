const SAFE_CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;

export function parseMessagesIntent(search: string): {
  contentId: string | null;
  malformed: boolean;
} {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const values = params.getAll("content");
  if (values.length > 1) {
    return { contentId: null, malformed: true };
  }
  const supplied = values[0] ?? null;
  if (supplied === null || supplied === "") {
    return { contentId: null, malformed: false };
  }
  const ok = SAFE_CONTENT_ID.test(supplied);
  return { contentId: ok ? supplied : null, malformed: !ok };
}

export function buildMessagesHref(contentId?: string | null): string {
  if (!contentId) {
    return "/messages";
  }
  return `/messages?content=${encodeURIComponent(contentId)}`;
}
