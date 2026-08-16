"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { Icon } from "@/lib/icons";
import { hkWallInputToIso, hkWallInputValue } from "@/lib/programs/event-detail";

import {
  getHome,
  getHomeEditor,
  getHomeHistory,
  publishHome,
  saveHomeDraft,
} from "./home-api";
import type {
  HomeContent,
  HomeDraftInput,
  HomeEditorResponse,
  HomeEvent,
  HomeHistoryEntry,
  HomeHistorySnapshot,
  HomePublishInput,
  HomePublishMode,
  HomeTemplateType,
} from "./home-api";
import styles from "./home-content.module.css";

interface HomeSurfaceProps {
  title?: string;
  fetcher?: typeof getHome;
  mode?: HomeDisplayMode;
}
type HomeDisplayMode = "teaser" | "detail";
type PreviewViewport = "phone" | "desktop";

type DraftFields = {
  template: HomeTemplateType;
  featuredEventId: string;
  title: string;
  summary: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
  imageAlt: string;
  publishMode: HomePublishMode;
  startAt: string;
  endAt: string;
};

type DraftMeta = {
  contentId: string;
  baseVersion: number;
};

type EditorState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type HistoryState =
  | { kind: "loading" }
  | { kind: "ready"; entries: HomeHistoryEntry[] }
  | { kind: "error" };

const EMPTY_EVENT: HomeEvent = {};
const BODY_TAGS: Record<string, true> = {
  h2: true,
  h3: true,
  p: true,
  ul: true,
  ol: true,
  li: true,
  strong: true,
  em: true,
};

function emptyDraft(template: HomeTemplateType): DraftFields {
  return {
    template,
    featuredEventId: "",
    title: "",
    summary: "",
    body: "",
    ctaLabel: "",
    ctaUrl: "",
    imageUrl: "",
    imageAlt: "",
    publishMode: "immediate",
    startAt: "",
    endAt: "",
  };
}

function emptyMeta(): DraftMeta {
  return { contentId: "", baseVersion: 0 };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function templateFrom(content: HomeContent | null | undefined): HomeTemplateType {
  const template =
    content?.template_type ?? content?.template ?? content?.templateType;
  return template === "B" ? "B" : "A";
}

function eventFrom(content: HomeContent): HomeEvent {
  return (
    content.featured_event ??
    content.featuredEvent ??
    content.fallback_event ??
    content.fallbackEvent ??
    content.event ??
    EMPTY_EVENT
  );
}

function contentBody(content: HomeContent): string {
  return stringValue(
    content.body_markdown ??
      content.bodyMarkdown ??
      content.body ??
      content.sanitized_body_html ??
      content.sanitizedBodyHtml ??
      content.body_html ??
      content.bodyHtml
  );
}

function draftFromContent(
  content: HomeContent | null | undefined,
  template: HomeTemplateType
): DraftFields {
  return {
    template,
    featuredEventId: nullableString(
      content?.featured_event_id ?? content?.featuredEventId
    ),
    title: nullableString(content?.title),
    summary: nullableString(content?.summary),
    body: content ? contentBody(content) : "",
    ctaLabel: nullableString(content?.cta_label ?? content?.ctaLabel),
    ctaUrl: nullableString(content?.cta_url ?? content?.ctaUrl),
    imageUrl: nullableString(content?.image_url ?? content?.imageUrl),
    imageAlt: nullableString(content?.image_alt ?? content?.imageAlt),
    publishMode:
      content?.publish_mode === "scheduled" ||
      content?.publishMode === "scheduled"
        ? "scheduled"
        : "immediate",
    startAt: content?.start_at
      ? hkWallInputValue(content.start_at)
      : content?.startAt
        ? hkWallInputValue(content.startAt)
        : "",
    endAt: content?.end_at
      ? hkWallInputValue(content.end_at)
      : content?.endAt
        ? hkWallInputValue(content.endAt)
        : "",
  };
}

function metaFromContent(content: HomeContent | null | undefined): DraftMeta {
  return {
    contentId: stringValue(content?.content_id ?? content?.contentId),
    baseVersion:
      typeof content?.version === "number" && Number.isFinite(content.version)
        ? content.version
        : 0,
  };
}

function responseRow(
  response: HomeEditorResponse,
  template: HomeTemplateType
): HomeContent | null {
  const row =
    template === "A"
      ? response.drafts?.template_a
      : response.drafts?.template_b;
  return row ?? response.draft ?? response.content ?? null;
}

function normalizeContent(content: HomeContent | null | undefined): HomeContent {
  return content ?? { template_type: "A", featured_event: null, fallback: true };
}

function formatEventTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("zh-Hant", {
      timeZone: "Asia/Hong_Kong",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatNoticeDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("zh-Hant", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function announcementExcerpt(content: HomeContent): string {
  const summary = nullableString(content.summary).trim();
  if (summary) {
    return summary;
  }
  const text = contentBody(content)
    .replace(/<[^>]*>/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*#>`_-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function eventStart(event: HomeEvent): string {
  return stringValue(event.starts_at ?? event.startsAt);
}

function eventName(event: HomeEvent): string {
  return nullableString(event.name) || COPY.home.eventFallbackTitle;
}

function safeLink(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

function isExternalLink(value: string): boolean {
  const origin =
    typeof window === "undefined" ? "https://efcc.invalid" : window.location.origin;
  try {
    const parsed = new URL(value, origin);
    return parsed.protocol === "https:" && parsed.origin !== origin;
  } catch {
    return false;
  }
}

function safeImage(value: string): string | null {
  const candidate = safeLink(value);
  if (!candidate || !candidate.startsWith("https://")) {
    return null;
  }
  return candidate;
}

function renderBodyNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object") {
    return null;
  }
  const children = Array.from(element.childNodes).map((child, index) =>
    renderBodyNode(child, `${key}-${index}`)
  );
  if (tag === "a") {
    const href = safeLink(element.getAttribute("href") ?? "");
    if (!href) {
      return createElement("span", { key }, children);
    }
    const external = isExternalLink(href);
    return createElement(
      "a",
      {
        key,
        href,
        ...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {}),
      },
      children
    );
  }
  if (!BODY_TAGS[tag]) {
    return createElement("span", { key }, children);
  }
  return createElement(tag, { key }, children);
}

function renderInlineMarkdown(value: string, key: string): ReactNode[] {
  const tokenPattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > cursor) {
      nodes.push(value.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        createElement("strong", { key: `${key}-${index}` }, token.slice(2, -2))
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        createElement("em", { key: `${key}-${index}` }, token.slice(1, -1))
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
      const href = linkMatch ? safeLink(linkMatch[2]) : null;
      if (!linkMatch || !href) {
        nodes.push(token);
      } else {
        const external = isExternalLink(href);
        nodes.push(
          createElement(
            "a",
            {
              key: `${key}-${index}`,
              href,
              ...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {}),
            },
            linkMatch[1]
          )
        );
      }
    }
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return nodes;
}

function renderMarkdownBody(value: string): ReactNode {
  const lines = value.split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/u.exec(line);
    if (heading) {
      const tag = heading[1].length === 2 ? "h2" : "h3";
      blocks.push(
        createElement(
          tag,
          { key: `markdown-${index}` },
          renderInlineMarkdown(heading[2], `markdown-${index}`)
        )
      );
      index += 1;
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/u.exec(line);
    const ordered = /^\d+\.\s+(.+)$/u.exec(line);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: ReactNode[] = [];
      const listStart = index;
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const item = (ordered
          ? /^\d+\.\s+(.+)$/u
          : /^[-*]\s+(.+)$/u
        ).exec(itemLine);
        if (!item) {
          break;
        }
        items.push(
          createElement(
            "li",
            { key: `markdown-${index}` },
            renderInlineMarkdown(item[1], `markdown-${index}`)
          )
        );
        index += 1;
      }
      blocks.push(
        createElement(
          orderedList ? "ol" : "ul",
          { key: `markdown-list-${listStart}` },
          items
        )
      );
      continue;
    }
    const paragraphStart = index;
    const paragraph: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index].trim();
      if (
        !paragraphLine ||
        /^(#{2,3})\s+.+$/u.test(paragraphLine) ||
        /^[-*]\s+.+$/u.test(paragraphLine) ||
        /^\d+\.\s+.+$/u.test(paragraphLine)
      ) {
        break;
      }
      paragraph.push(paragraphLine);
      index += 1;
    }
    blocks.push(
      createElement(
        "p",
        { key: `markdown-paragraph-${paragraphStart}` },
        renderInlineMarkdown(paragraph.join(" "), `markdown-${paragraphStart}`)
      )
    );
  }
  return blocks;
}

function renderSanitizedBody(value: string): ReactNode {
  if (!value.trim()) {
    return <p className={styles.bodyEmpty}>{COPY.home.bodyEmpty}</p>;
  }
  if (!/<\/?[a-z][^>]*>/iu.test(value)) {
    return renderMarkdownBody(value);
  }
  if (typeof DOMParser === "undefined") {
    return <p>{value}</p>;
  }
  const document = new DOMParser().parseFromString(value, "text/html");
  return Array.from(document.body.childNodes).map((node, index) =>
    renderBodyNode(node, `body-${index}`)
  );
}

function ExternalLinkMark() {
  return <span className={styles.externalMark}>{COPY.home.externalLink}</span>;
}

function HomeProjection({
  content,
  mode = "detail",
}: {
  content: HomeContent;
  mode?: HomeDisplayMode;
}) {
  const template = templateFrom(content);
  if (template === "B") {
    return <TemplateB content={content} mode={mode} />;
  }
  return <TemplateA content={content} />;
}

function TemplateA({ content }: { content: HomeContent }) {
  const event = eventFrom(content);
  const start = eventStart(event);
  const hasConfiguredEvent = Boolean(
    content.featured_event_id ?? content.featuredEventId
  );
  const hasEvent = Boolean(
    start || event.name || event.event_id || event.eventId || hasConfiguredEvent
  );
  if (!hasEvent) {
    return (
      <div className={styles.emptyState} role="status">
        <p className={styles.eyebrow}>{COPY.home.templateALabel}</p>
        <h2>{COPY.home.emptyTitle}</h2>
        <p>{COPY.home.emptyHint}</p>
        <a className={styles.secondaryAction} href="/programs">
          {COPY.home.explorePrograms}
        </a>
      </div>
    );
  }
  const location = nullableString(event.location);
  const eventTime = formatEventTime(start);
  return (
    <article className={styles.eventHero}>
      <p className={styles.eyebrow}>{COPY.home.templateALabel}</p>
      {content.fallback ? (
        <p className={styles.fallbackNotice}>{COPY.home.fallbackNotice}</p>
      ) : null}
      {hasConfiguredEvent && !eventTime ? (
        <p className={styles.fallbackNotice}>{COPY.home.previewEventHint}</p>
      ) : null}
      <h2>{eventName(event)}</h2>
      <dl className={styles.eventFacts}>
        {eventTime ? (
          <div>
            <dt>{COPY.home.eventTime}</dt>
            <dd>{eventTime}</dd>
          </div>
        ) : null}
        {location ? (
          <div>
            <dt>{COPY.home.eventLocation}</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
      </dl>
      <a className={styles.primaryAction} href="/programs">
        {COPY.home.explorePrograms}
      </a>
    </article>
  );
}

function TemplateB({
  content,
  mode = "detail",
}: {
  content: HomeContent;
  mode?: HomeDisplayMode;
}) {
  const detail = mode === "detail";
  const image = safeImage(nullableString(content.image_url ?? content.imageUrl));
  const cta = safeLink(nullableString(content.cta_url ?? content.ctaUrl));
  const ctaLabel = nullableString(content.cta_label ?? content.ctaLabel);
  const imageAlt =
    nullableString(content.image_alt ?? content.imageAlt) || COPY.home.imageAlt;
  const excerpt = announcementExcerpt(content) || COPY.home.bodyEmpty;
  const title = nullableString(content.title) || COPY.home.emptyTitle;
  const dateValue = content.published_at ?? content.updated_at;
  const dateLabel = formatNoticeDate(dateValue);
  const externalCta = cta ? isExternalLink(cta) : false;

  if (!detail) {
    return (
      <section className={styles.announcementTeaserSection}>
        <p className={styles.eyebrow}>{COPY.home.noticeSectionTitle}</p>
        <a className={styles.announcementRow} href="/notices">
          <span className={styles.announcementRowText}>
            <span className={styles.announcementRowTitle}>{title}</span>
            <span className={styles.announcementRowMeta}>
              {dateLabel ? `${excerpt} · ${dateLabel}` : excerpt}
            </span>
          </span>
          <span className="sr-only"> — {COPY.home.viewDetails}</span>
          <Icon name="chevron-right" size={20} />
        </a>
      </section>
    );
  }

  return (
    <article className={styles.announcement}>
      <p className={styles.eyebrow}>{COPY.home.noticeSectionTitle}</p>
      {dateLabel ? (
        <time className={styles.announcementDate} dateTime={dateValue ?? undefined}>
          {dateLabel}
        </time>
      ) : null}
      {image ? (
        <img
          className={styles.announcementImage}
          src={image}
          alt={imageAlt}
          loading="lazy"
        />
      ) : null}
      <h2>{title}</h2>
      {content.summary ? <p className={styles.summary}>{content.summary}</p> : null}
      <div className={styles.body}>{renderSanitizedBody(contentBody(content))}</div>
      {cta && ctaLabel ? (
        <a
          className={styles.primaryAction}
          href={cta}
          {...(externalCta
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {ctaLabel}
          {externalCta ? <ExternalLinkMark /> : null}
        </a>
      ) : null}
    </article>
  );
}

export function HomeSurface({
  title = COPY.sections.home,
  fetcher = getHome,
  mode = "teaser",
}: HomeSurfaceProps) {
  const detail = mode === "detail";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; content: HomeContent }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetcher()
      .then((response) => {
        if (!cancelled) {
          setState({ kind: "ready", content: normalizeContent(response.content) });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: errorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, fetcher]);

  return (
    <section className={styles.homeSection} aria-labelledby="home-content-title">
      <header className={styles.homeHeader}>
        {detail ? (
          <a className={styles.noticeBack} href="/">
            ← {COPY.home.noticeBack}
          </a>
        ) : null}
        <p className={styles.eyebrow}>
          {detail ? COPY.home.noticeSectionTitle : COPY.home.kicker}
        </p>
        <h1 id="home-content-title">{title}</h1>
      </header>
      {state.kind === "loading" ? (
        <div className={styles.state} role="status" aria-live="polite">
          {detail ? COPY.home.noticeDetailLoading : COPY.home.loading}
        </div>
      ) : state.kind === "error" ? (
        <div className={styles.stateError} role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {detail ? COPY.home.noticeDetailRetry : COPY.home.retry}
          </button>
        </div>
      ) : (
        <HomeProjection content={state.content} mode={mode} />
      )}
    </section>
  );
}

function draftInput(
  draft: DraftFields,
  meta: DraftMeta
): HomeDraftInput {
  return {
    content_id: meta.contentId || crypto.randomUUID(),
    ...(meta.baseVersion > 0 ? { base_version: meta.baseVersion } : {}),
    template_type: draft.template,
    ...(draft.template === "A"
      ? { featured_event_id: draft.featuredEventId.trim() || null }
      : {
          title: draft.title.trim() || null,
          summary: draft.summary.trim() || null,
          body_markdown: draft.body,
          cta_label: draft.ctaLabel.trim() || null,
          cta_url: draft.ctaUrl.trim() || null,
          image_url: draft.imageUrl.trim() || null,
          image_alt: draft.imageAlt.trim() || null,
        }),
  };
}

function publishInput(
  draft: DraftFields,
  meta: DraftMeta
): HomePublishInput {
  const input: HomePublishInput = {
    content_id: meta.contentId,
    base_version: meta.baseVersion,
    publish_mode: draft.publishMode,
  };
  if (draft.publishMode === "scheduled") {
    const start = hkWallInputToIso(draft.startAt);
    const end = hkWallInputToIso(draft.endAt);
    if (start) {
      input.start_at = start;
    }
    if (end) {
      input.end_at = end;
    }
  }
  return input;
}

function editorRows(response: HomeEditorResponse) {
  return {
    A: responseRow(response, "A"),
    B: responseRow(response, "B"),
  };
}
function historyBodyExcerpt(value: string | null): string {
  const text = (value ?? "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*#>`_-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function historySnapshotFields(
  snapshot: HomeHistorySnapshot
): Array<[string, string]> {
  const fields: Array<[string, string | null]> =
    snapshot.template_type === "A"
      ? [[COPY.home.featuredEventId, snapshot.featured_event_id]]
      : [
          [COPY.home.titleLabel, snapshot.title],
          [COPY.home.summaryLabel, snapshot.summary],
          [COPY.home.bodyLabel, historyBodyExcerpt(snapshot.body_markdown)],
          [COPY.home.ctaLabel, snapshot.cta_label],
        ];
  return fields.flatMap(
    ([label, value]): Array<[string, string]> => {
      const normalized = value?.trim();
      return normalized ? [[label, normalized]] : [];
    }
  );
}

function HistorySnapshotPanel({
  label,
  snapshot,
}: {
  label: string;
  snapshot: HomeHistorySnapshot | null | undefined;
}) {
  const fields = snapshot ? historySnapshotFields(snapshot) : [];
  return (
    <section className={styles.historyDiffColumn}>
      <h3>
        {label}
        {snapshot ? ` · ${COPY.home.historyVersion} ${snapshot.version}` : ""}
      </h3>
      {!snapshot ? (
        <p className={styles.historyDiffEmpty}>{COPY.home.historyNoPrevious}</p>
      ) : fields.length === 0 ? (
        <p className={styles.historyDiffEmpty}>{COPY.home.historyNoContent}</p>
      ) : (
        <dl className={styles.historyDiffFields}>
          {fields.map(([fieldLabel, value]) => (
            <div key={fieldLabel}>
              <dt>{fieldLabel}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}


export function HomeContentEditor() {
  const [state, setState] = useState<EditorState>({ kind: "loading" });
  const [selected, setSelected] = useState<HomeTemplateType>("A");
  const [drafts, setDrafts] = useState<Record<HomeTemplateType, DraftFields>>({
    A: emptyDraft("A"),
    B: emptyDraft("B"),
  });
  const [meta, setMeta] = useState<Record<HomeTemplateType, DraftMeta>>({
    A: emptyMeta(),
    B: emptyMeta(),
  });
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [history, setHistory] = useState<HistoryState>({ kind: "loading" });
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewport>("phone");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await getHomeEditor();
      const rows = editorRows(response);
      setDrafts({
        A: draftFromContent(rows.A, "A"),
        B: draftFromContent(rows.B, "B"),
      });
      setMeta({
        A: metaFromContent(rows.A),
        B: metaFromContent(rows.B),
      });
      setConflict(false);
      setNotice(null);
      setState({ kind: "ready" });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  // History is a compact read-only panel; a failed fetch must never take
  // down the editor, so it is fetched separately and degrades to a muted
  // notice instead of an alert.
  useEffect(() => {
    let cancelled = false;
    getHomeHistory()
      .then((response) => {
        if (!cancelled) {
          setHistory({ kind: "ready", entries: response.history ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const draft = drafts[selected];
  const draftMeta = meta[selected];
  const previewContent = useMemo<HomeContent>(
    () => ({
      template_type: draft.template,
      featured_event_id: draft.featuredEventId || null,
      featured_event: null,
      title: draft.title,
      summary: draft.summary,
      body_markdown: draft.body,
      cta_label: draft.ctaLabel,
      cta_url: draft.ctaUrl,
      image_url: draft.imageUrl,
      image_alt: draft.imageAlt,
    }),
    [draft]
  );

  function updateDraft(patch: Partial<DraftFields>) {
    setDrafts((current) => ({
      ...current,
      [selected]: { ...current[selected], ...patch },
    }));
    setNotice(null);
  }

  async function saveDraft() {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await saveHomeDraft(draftInput(draft, draftMeta));
      const row = saved.draft ?? responseRow(saved, selected);
      if (row) {
        setMeta((current) => ({ ...current, [selected]: metaFromContent(row) }));
      }
      setNotice(COPY.home.draftSaved);
    } catch (error) {
      if (error instanceof RpcError && error.problem.code === "HOME_CONTENT_CONFLICT") {
        setConflict(true);
      }
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await saveHomeDraft(draftInput(draft, draftMeta));
      const row = saved.draft ?? responseRow(saved, selected);
      const savedMeta = row ? metaFromContent(row) : draftMeta;
      if (row) {
        setMeta((current) => ({ ...current, [selected]: savedMeta }));
      }
      if (!savedMeta.contentId) {
        throw new RpcError({ code: "MALFORMED_RESPONSE", detail: COPY.error.malformed });
      }
      await publishHome(publishInput(draft, savedMeta));
      setNotice(COPY.home.published);
      setConflict(false);
    } catch (error) {
      if (error instanceof RpcError && error.problem.code === "HOME_CONTENT_CONFLICT") {
        setConflict(true);
      }
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <section className={styles.editorSection} aria-labelledby="home-editor-title">
        <h1 id="home-editor-title">{COPY.home.editorTitle}</h1>
        <div className={styles.state} role="status" aria-live="polite">
          {COPY.home.editorLoading}
        </div>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className={styles.editorSection} aria-labelledby="home-editor-title">
        <h1 id="home-editor-title">{COPY.home.editorTitle}</h1>
        <div className={styles.stateError} role="alert">
          <p>{state.message}</p>
          <button type="button" className={styles.secondaryAction} onClick={() => setReloadToken((value) => value + 1)}>
            {COPY.home.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.editorSection} aria-labelledby="home-editor-title">
      <header className={styles.editorHeader}>
        <p className={styles.eyebrow}>{COPY.home.kicker}</p>
        <h1 id="home-editor-title">{COPY.home.editorTitle}</h1>
        <p>{COPY.home.editorLead}</p>
      </header>
      {conflict ? (
        <div className={styles.conflictBanner} role="alert">
          <strong>{COPY.home.conflictTitle}</strong>
          <p>{COPY.home.conflictHint}</p>
          <button type="button" className={styles.secondaryAction} onClick={() => setReloadToken((value) => value + 1)}>
            {COPY.home.reloadLatest}
          </button>
        </div>
      ) : null}
      <div
        className={`${styles.editorGrid} ${
          previewViewport === "desktop" ? styles.editorGridWide : ""
        }`}
      >
        <form className={styles.editorForm} onSubmit={publish}>
          <fieldset className={styles.templateChooser}>
            <legend>{COPY.home.templateChoice}</legend>
            <label>
              <input
                type="radio"
                name="home-template"
                value="A"
                checked={selected === "A"}
                onChange={() => setSelected("A")}
              />
              {COPY.home.templateALabel}
            </label>
            <label>
              <input
                type="radio"
                name="home-template"
                value="B"
                checked={selected === "B"}
                onChange={() => setSelected("B")}
              />
              {COPY.home.templateBLabel}
            </label>
          </fieldset>

          {selected === "A" ? (
            <label className={styles.field}>
              <span>{COPY.home.featuredEventId}</span>
              <input
                value={draft.featuredEventId}
                onChange={(event) => updateDraft({ featuredEventId: event.target.value })}
                placeholder={COPY.home.featuredEventPlaceholder}
              />
              <small>{COPY.home.featuredEventHint}</small>
            </label>
          ) : (
            <>
              <label className={styles.field}>
                <span>{COPY.home.titleLabel}</span>
                <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
              </label>
              <label className={styles.field}>
                <span>{COPY.home.summaryLabel}</span>
                <textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} rows={3} />
              </label>
              <label className={styles.field}>
                <span>{COPY.home.bodyLabel}</span>
                <textarea value={draft.body} onChange={(event) => updateDraft({ body: event.target.value })} rows={8} />
                <small>{COPY.home.bodyHint}</small>
              </label>
              <label className={styles.field}>
                <span>{COPY.home.ctaLabel}</span>
                <input value={draft.ctaLabel} onChange={(event) => updateDraft({ ctaLabel: event.target.value })} />
              </label>
              <label className={styles.field}>
                <span>{COPY.home.ctaUrl}</span>
                <input value={draft.ctaUrl} onChange={(event) => updateDraft({ ctaUrl: event.target.value })} inputMode="url" />
              </label>
              <label className={styles.field}>
                <span>{COPY.home.imageUrl}</span>
                <input value={draft.imageUrl} onChange={(event) => updateDraft({ imageUrl: event.target.value })} inputMode="url" />
                <small>{COPY.home.imageHint}</small>
              </label>
              <label className={styles.field}>
                <span>{COPY.home.imageAltLabel}</span>
                <input value={draft.imageAlt} onChange={(event) => updateDraft({ imageAlt: event.target.value })} />
              </label>
            </>
          )}

          <fieldset className={styles.scheduleChooser}>
            <legend>{COPY.home.publishMode}</legend>
            <label>
              <input
                type="radio"
                name="home-publish-mode"
                value="immediate"
                checked={draft.publishMode === "immediate"}
                onChange={() => updateDraft({ publishMode: "immediate" })}
              />
              {COPY.home.publishImmediate}
            </label>
            <label>
              <input
                type="radio"
                name="home-publish-mode"
                value="scheduled"
                checked={draft.publishMode === "scheduled"}
                onChange={() => updateDraft({ publishMode: "scheduled" })}
              />
              {COPY.home.publishScheduled}
            </label>
          </fieldset>
          {draft.publishMode === "scheduled" ? (
            <div className={styles.scheduleFields}>
              <p>{COPY.home.hkTimeHint}</p>
              <label className={styles.field}>
                <span>{COPY.home.startAt}</span>
                <input type="datetime-local" value={draft.startAt} onChange={(event) => updateDraft({ startAt: event.target.value })} required />
              </label>
              <label className={styles.field}>
                <span>{COPY.home.endAt}</span>
                <input type="datetime-local" value={draft.endAt} onChange={(event) => updateDraft({ endAt: event.target.value })} />
              </label>
            </div>
          ) : null}
          <div className={styles.editorActions}>
            <button type="button" className={styles.secondaryAction} disabled={busy} onClick={() => void saveDraft()}>
              {busy ? COPY.home.saving : COPY.home.saveDraft}
            </button>
            <button type="submit" className={styles.primaryAction} disabled={busy} aria-busy={busy}>
              {busy ? COPY.home.publishing : COPY.home.publish}
            </button>
          </div>
          {notice ? <p className={styles.formNotice} role="status">{notice}</p> : null}
        </form>
        <aside className={styles.previewPanel} aria-label={COPY.home.previewTitle}>
          <h2>{COPY.home.previewTitle}</h2>
          <p className={styles.previewHint}>{COPY.home.previewHint}</p>
          <div
            className={styles.previewControls}
            role="group"
            aria-label={COPY.home.previewViewportLabel}
          >
            <span className={styles.previewControlsLabel}>
              {COPY.home.previewViewportLabel}
            </span>
            <div className={styles.previewToggle}>
              <button
                type="button"
                className={styles.previewToggleButton}
                aria-pressed={previewViewport === "phone"}
                onClick={() => setPreviewViewport("phone")}
              >
                {COPY.home.previewMobile}
              </button>
              <button
                type="button"
                className={styles.previewToggleButton}
                aria-pressed={previewViewport === "desktop"}
                onClick={() => setPreviewViewport("desktop")}
              >
                {COPY.home.previewDesktop}
              </button>
            </div>
          </div>
          <div
            className={`${styles.phoneFrame} ${
              previewViewport === "desktop" ? styles.phoneFrameDesktop : ""
            }`}
          >
            <div className={styles.phoneViewport}>
              <HomeProjection content={previewContent} />
            </div>
          </div>
        </aside>
      </div>
      <section className={styles.historyPanel} aria-labelledby="home-history-title">
        <h2 id="home-history-title">{COPY.home.historyTitle}</h2>
        {history.kind === "loading" ? (
          <p className={styles.historyMuted}>{COPY.home.historyLoading}</p>
        ) : history.kind === "error" ? (
          <p className={styles.historyMuted}>{COPY.home.historyUnavailable}</p>
        ) : history.entries.length === 0 ? (
          <p className={styles.historyMuted}>{COPY.home.historyEmpty}</p>
        ) : (
          <ul className={styles.historyList}>
            {history.entries.map((entry) => (
              <li
                key={`${entry.content_id ?? "home"}-${entry.version ?? 0}`}
                className={styles.historyItem}
              >
                <details className={styles.historyDetails}>
                  <summary className={styles.historySummary}>
                    <span className={styles.historyTemplate}>
                      {entry.template_type === "B"
                        ? COPY.home.templateBLabel
                        : COPY.home.templateALabel}
                    </span>
                    <span>
                      {COPY.home.historyVersion} {entry.version ?? ""}
                    </span>
                    {entry.published_by_name ? (
                      <span>
                        {COPY.home.historyBy} {entry.published_by_name}
                      </span>
                    ) : null}
                    <time dateTime={entry.published_at ?? undefined}>
                      {formatEventTime(entry.published_at)}
                    </time>
                    <span className={styles.historyDisclosure}>
                      {COPY.home.historyViewDiff}
                    </span>
                  </summary>
                  <div
                    className={styles.historyDiff}
                    aria-label={COPY.home.historyViewDiff}
                  >
                    <HistorySnapshotPanel
                      label={COPY.home.historyBefore}
                      snapshot={entry.before}
                    />
                    <HistorySnapshotPanel
                      label={COPY.home.historyAfter}
                      snapshot={entry.after}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
