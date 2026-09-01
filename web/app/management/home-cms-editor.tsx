/* oxlint-disable eslint/complexity eslint/no-use-before-define eslint/require-unicode-regexp eslint/prefer-named-capture-group react/function-component-definition react-hooks/exhaustive-deps jsx-a11y/prefer-tag-over-role -- single-page CMS editor keeps prototype field wiring together. */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { getHome } from "@/lib/home-api";
import type { HomeData } from "@/lib/home-api";
import {
  getFeaturedEventPreview,
  getHomeContent,
  listHomeAudit,
  publishHomeContent,
  saveHomeDraft,
} from "@/lib/home-cms-api";
import type {
  FeaturedEventPreview,
  HomeAuditItem,
  HomeContent,
  HomeContentStatus,
  HomeDraftInput,
  HomePublishMode,
  HomeTemplateType,
} from "@/lib/home-cms-api";
import { announce } from "@/lib/live-region";
import { rememberDeepLink } from "@/lib/session";
import { cn } from "@/lib/utils";

import {
  ActionSurface,
  ManagementPageHeader,
} from "./management-action-framework";

const copy = COPY.homeEditor;

interface EditorForm {
  contentId?: string;
  version?: number;
  templateType: HomeTemplateType;
  status: HomeContentStatus;
  publishMode: HomePublishMode;
  startAt: string;
  endAt: string;
  featuredEventId: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
  imageAlt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
}

type LoadState = "loading" | "ready" | "error";
type Operation = "idle" | "saving" | "publishing";
type PreviewViewport = "phone" | "desktop";

interface ConflictProblem {
  latest?: HomeContent;
}

const emptyForm: EditorForm = {
  templateType: "A",
  status: "Draft",
  publishMode: "immediate",
  startAt: "",
  endAt: "",
  featuredEventId: "",
  title: "",
  summary: "",
  bodyMarkdown: "",
  ctaLabel: "",
  ctaUrl: "",
  imageUrl: "",
  imageAlt: "",
  updatedBy: null,
  updatedAt: null,
  publishedBy: null,
  publishedAt: null,
};

function editorFormFromContent(content: HomeContent | null): EditorForm {
  if (!content) {
    return { ...emptyForm };
  }
  const wire = content as HomeContent & Record<string, unknown>;
  const templateType = (content.templateType ??
    wire.template_type ??
    "A") as HomeTemplateType;
  const status = (content.status ??
    wire.status ??
    "Draft") as HomeContentStatus;
  const publishMode = (content.publishMode ??
    wire.publish_mode ??
    "immediate") as HomePublishMode;
  const startAt =
    content.startAt ?? (wire.start_at as string | null | undefined) ?? null;
  const endAt =
    content.endAt ?? (wire.end_at as string | null | undefined) ?? null;
  return {
    contentId:
      content.contentId ?? (wire.content_id as string | undefined) ?? undefined,
    version: content.version ?? (wire.version as number | undefined),
    templateType,
    status,
    publishMode,
    startAt: hkInputValue(startAt),
    endAt: hkInputValue(endAt),
    featuredEventId:
      content.featuredEventId ??
      (wire.featured_event_id as string | null | undefined) ??
      "",
    title: content.title ?? (wire.title as string | null | undefined) ?? "",
    summary:
      content.summary ?? (wire.summary as string | null | undefined) ?? "",
    bodyMarkdown:
      content.bodyMarkdown ??
      (wire.body_markdown as string | null | undefined) ??
      "",
    ctaLabel:
      content.ctaLabel ?? (wire.cta_label as string | null | undefined) ?? "",
    ctaUrl: content.ctaUrl ?? (wire.cta_url as string | null | undefined) ?? "",
    imageUrl:
      content.imageUrl ?? (wire.image_url as string | null | undefined) ?? "",
    imageAlt:
      content.imageAlt ?? (wire.image_alt as string | null | undefined) ?? "",
    updatedBy:
      content.updatedBy ??
      (wire.updated_by as string | null | undefined) ??
      null,
    updatedAt:
      content.updatedAt ??
      (wire.updated_at as string | null | undefined) ??
      null,
    publishedBy:
      content.publishedBy ??
      (wire.published_by as string | null | undefined) ??
      null,
    publishedAt:
      content.publishedAt ??
      (wire.published_at as string | null | undefined) ??
      null,
  };
}

function hkInputValue(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  if (
    !values.year ||
    !values.month ||
    !values.day ||
    !values.hour ||
    !values.minute
  ) {
    return "";
  }
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function hkIsoValue(value: string): string | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute)
  );
  return new Date(utc).toISOString();
}

function formatHkDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

function draftInputFromForm(form: EditorForm): HomeDraftInput {
  return {
    ...(form.contentId ? { content_id: form.contentId } : {}),
    ...(form.version === undefined ? {} : { expected_version: form.version }),
    template_type: form.templateType,
    publish_mode: form.publishMode,
    start_at:
      form.publishMode === "scheduled" ? hkIsoValue(form.startAt) : null,
    end_at: form.publishMode === "scheduled" ? hkIsoValue(form.endAt) : null,
    featured_event_id: form.featuredEventId.trim() || null,
    title: form.title || null,
    summary: form.summary || null,
    body_markdown: form.bodyMarkdown || null,
    cta_label: form.ctaLabel || null,
    cta_url: form.ctaUrl || null,
    image_url: form.imageUrl || null,
    image_alt: form.imageAlt || null,
  };
}

function statusLabel(status: HomeContentStatus): string {
  return status === "Published" ? copy.statusPublished : copy.statusDraft;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof RpcError) {
    return error.problem.detail || error.message || fallback;
  }
  return fallback;
}

function isAuthRequired(error: unknown): boolean {
  return error instanceof RpcError && error.problem.code === "AUTH_REQUIRED";
}

function isForbidden(error: unknown): boolean {
  return error instanceof RpcError && error.problem.code === "FORBIDDEN";
}

function isConflict(error: unknown): boolean {
  return error instanceof RpcError && error.problem.code === "CONFLICT";
}

function latestFromConflict(error: unknown): HomeContent | null {
  if (!(error instanceof RpcError)) {
    return null;
  }
  const { latest } = error.problem as ConflictProblem;
  return latest && typeof latest === "object" ? latest : null;
}

function previewEventLabel(home: HomeData | null): string {
  if (!home?.featuredEvent) {
    return copy.fallbackDescription;
  }
  return `${home.featuredEvent.title} · ${formatHkDateTime(home.featuredEvent.startsAt)}`;
}

function previewFeaturedEventLabel(
  event: FeaturedEventPreview | null,
  home: HomeData | null
): string {
  if (event) {
    return `${event.title} · ${formatHkDateTime(event.startsAt)}`;
  }
  return previewEventLabel(home);
}

export function HomeContentEditor() {
  const router = useRouter();
  const stateNode = useRef<HTMLElement | null>(null);
  const stateRef = useCallback((node: HTMLElement | null) => {
    stateNode.current = node;
  }, []);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [operation, setOperation] = useState<Operation>("idle");
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [audit, setAudit] = useState<HomeAuditItem[]>([]);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [conflictLatest, setConflictLatest] = useState<HomeContent | null>(
    null
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewport>("phone");
  const [previewHome, setPreviewHome] = useState<HomeData | null>(null);
  const [previewFeaturedEvent, setPreviewFeaturedEvent] =
    useState<FeaturedEventPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadEditor = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    announce(copy.loading);
    try {
      const [content, auditResult] = await Promise.all([
        getHomeContent(),
        listHomeAudit(),
      ]);
      setForm(editorFormFromContent(content));
      setAudit(auditResult.items);
      setConflictLatest(null);
      setLoadState("ready");
    } catch (error: unknown) {
      if (isAuthRequired(error)) {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
        return;
      }
      const message = isForbidden(error)
        ? copy.forbidden
        : errorMessage(error, copy.loadError);
      setLoadError(message);
      setLoadState("error");
      announce(message);
    }
  }, [router]);

  useEffect(() => {
    void loadEditor();
  }, [loadEditor]);

  useEffect(() => {
    if (loadState === "error" || conflictLatest) {
      stateNode.current?.focus();
    }
  }, [conflictLatest, loadState]);

  useEffect(() => {
    if (!previewOpen) {
      return;
    }
    let active = true;
    setPreviewLoading(true);
    const featuredEventId = form.featuredEventId.trim();
    const loadPreview = async () => {
      try {
        const homePromise = getHome();
        if (form.templateType === "A" && featuredEventId) {
          const [home, featured] = await Promise.all([
            homePromise,
            getFeaturedEventPreview(featuredEventId).catch(() => null),
          ]);
          if (!active) {
            return;
          }
          setPreviewHome(home);
          setPreviewFeaturedEvent(featured);
          return;
        }
        const home = await homePromise;
        if (active) {
          setPreviewHome(home);
          setPreviewFeaturedEvent(null);
        }
      } catch (error: unknown) {
        if (active && isAuthRequired(error)) {
          rememberDeepLink(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          );
          router.replace("/");
          return;
        }
        if (active) {
          setPreviewHome(null);
          setPreviewFeaturedEvent(null);
        }
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      active = false;
    };
  }, [previewOpen, router, form.templateType, form.featuredEventId]);

  const updateField = <K extends keyof EditorForm>(
    field: K,
    value: EditorForm[K]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveFailure = (error: unknown) => {
    if (isAuthRequired(error)) {
      rememberDeepLink(
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
      router.replace("/");
      return;
    }
    if (isConflict(error)) {
      const latest = latestFromConflict(error);
      setConflictLatest(latest);
      const message = errorMessage(error, copy.conflictTitle);
      setNotice(message);
      announce(message);
      return;
    }
    const message = isForbidden(error)
      ? copy.forbidden
      : errorMessage(error, copy.loadError);
    setNotice(message);
    announce(message);
  };

  const persistDraft = useCallback(
    async (showSuccess: boolean): Promise<HomeContent | null> => {
      setOperation("saving");
      try {
        const saved = await saveHomeDraft(draftInputFromForm(form));
        setForm(editorFormFromContent(saved));
        setConflictLatest(null);
        if (showSuccess) {
          setNotice(copy.saveSuccess);
          announce(copy.saveSuccess);
        }
        return saved;
      } catch (error: unknown) {
        handleSaveFailure(error);
        return null;
      } finally {
        setOperation("idle");
      }
    },
    [form, router]
  );

  const handleSaveDraft = () => {
    if (operation !== "idle") {
      return;
    }
    setNotice("");
    void persistDraft(true);
  };

  const handlePublish = async () => {
    if (operation !== "idle") {
      return;
    }
    setNotice("");
    const saved = await persistDraft(false);
    if (!saved) {
      return;
    }
    const savedForm = editorFormFromContent(saved);
    setOperation("publishing");
    try {
      const published = await publishHomeContent({
        content_id: savedForm.contentId ?? saved.contentId,
        version: savedForm.version ?? saved.version,
        publish_mode: savedForm.publishMode,
        start_at: hkIsoValue(savedForm.startAt),
        end_at: hkIsoValue(savedForm.endAt),
      });
      setForm(editorFormFromContent(published));
      setConflictLatest(null);
      setNotice(copy.publishSuccess);
      announce(copy.publishSuccess);
      const auditResult = await listHomeAudit();
      setAudit(auditResult.items);
    } catch (error: unknown) {
      handleSaveFailure(error);
    } finally {
      setOperation("idle");
    }
  };

  const handleReloadLatest = () => {
    if (conflictLatest) {
      setForm(editorFormFromContent(conflictLatest));
      setConflictLatest(null);
      setNotice(copy.conflictReload);
      announce(copy.conflictReload);
      return;
    }
    void loadEditor();
  };

  const busy = operation !== "idle" || loadState === "loading";

  return (
    <section
      className="mx-auto grid max-w-[960px] gap-6 p-4 sm:p-6"
      aria-labelledby="home-cms-editor-title"
      aria-busy={busy || previewLoading}
    >
      <ManagementPageHeader
        backHref="/management"
        backLabel={COPY.management.backHome}
        lead={copy.previewLead}
        title={copy.editorTitle}
        titleId="home-cms-editor-title"
        action={
          loadState === "ready" ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-bold text-[var(--ink-muted)]"
              data-slot="home-cms-status-badge"
            >
              <span>{statusLabel(form.status)}</span>
              {form.version ? <span> · v{form.version}</span> : null}
            </span>
          ) : undefined
        }
      />

      {loadState === "loading" && (
        <output
          ref={stateRef}
          id="home-cms-state"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center text-sm text-[var(--ink-muted)]"
          tabIndex={-1}
          aria-busy="true"
          aria-live="polite"
        >
          {copy.loading}
        </output>
      )}

      {loadState === "error" && (
        <section
          ref={stateRef}
          id="home-cms-state"
          className="grid gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-6 text-[var(--ink)]"
          tabIndex={-1}
          role="alert"
        >
          <h2 className="text-base font-bold text-[var(--error)]">
            {loadError}
          </h2>
          <Button
            className="w-fit"
            type="button"
            variant="secondary"
            onClick={() => void loadEditor()}
          >
            {copy.retry}
          </Button>
        </section>
      )}

      {loadState === "ready" && (
        <>
          {conflictLatest && (
            <section
              ref={stateRef}
              className="grid gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-6 text-[var(--ink)]"
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
            >
              <h2 className="text-base font-bold text-[var(--error)]">
                {copy.conflictTitle}
              </h2>
              <p className="text-sm text-[var(--ink-muted)]">{notice || ""}</p>
              <Button
                id="home-cms-conflict-reload"
                className="w-fit"
                type="button"
                variant="secondary"
                onClick={handleReloadLatest}
              >
                {copy.conflictReload}
              </Button>
            </section>
          )}

          <div
            className="flex flex-wrap gap-2 my-1"
            role="group"
            aria-label={copy.switchTemplate}
          >
            <button
              id="home-cms-template-a"
              className={cn(
                "min-h-[44px] rounded-md px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!",
                form.templateType === "A"
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
              )}
              type="button"
              aria-pressed={form.templateType === "A"}
              onClick={() => updateField("templateType", "A")}
              disabled={busy}
            >
              {copy.templateA}
            </button>
            <button
              id="home-cms-template-b"
              className={cn(
                "min-h-[44px] rounded-md px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!",
                form.templateType === "B"
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
              )}
              type="button"
              aria-pressed={form.templateType === "B"}
              onClick={() => updateField("templateType", "B")}
              disabled={busy}
            >
              {copy.templateB}
            </button>
          </div>

          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void handlePublish();
            }}
          >
            {form.templateType === "A" ? (
              <article
                className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-6 shadow-xs"
                aria-labelledby="home-cms-template-a-heading"
              >
                <div>
                  <h2
                    id="home-cms-template-a-heading"
                    className="text-base font-bold text-[var(--ink)]"
                  >
                    {copy.templateA}
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {copy.templateADescription}
                  </p>
                </div>
                <label
                  className="grid gap-1.5"
                  htmlFor="home-cms-featured-event"
                >
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {copy.featuredEvent}
                  </span>
                  <input
                    id="home-cms-featured-event"
                    className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                    value={form.featuredEventId}
                    onChange={(event) =>
                      updateField("featuredEventId", event.target.value)
                    }
                    placeholder="event-id"
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
                <p
                  className="text-xs text-[var(--ink-muted)]"
                  id="home-cms-fallback"
                >
                  {copy.fallbackNote}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--ink-muted)]">
                  <span>{copy.fallbackDescription}</span>
                  <strong className="font-bold text-[var(--ink)]">
                    {previewEventLabel(previewHome)}
                  </strong>
                </div>
              </article>
            ) : (
              <article
                className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-6 shadow-xs"
                aria-labelledby="home-cms-template-b-heading"
              >
                <div>
                  <h2
                    id="home-cms-template-b-heading"
                    className="text-base font-bold text-[var(--ink)]"
                  >
                    {copy.templateB}
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {copy.previewLead}
                  </p>
                </div>
                <label className="grid gap-1.5" htmlFor="home-cms-title">
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {copy.title}
                  </span>
                  <input
                    id="home-cms-title"
                    className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                    value={form.title}
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-1.5" htmlFor="home-cms-summary">
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {copy.summary}
                  </span>
                  <textarea
                    id="home-cms-summary"
                    className="min-h-[88px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                    value={form.summary}
                    onChange={(event) =>
                      updateField("summary", event.target.value)
                    }
                    rows={3}
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-1.5" htmlFor="home-cms-body">
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {copy.body}
                  </span>
                  <textarea
                    id="home-cms-body"
                    className="min-h-[160px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                    value={form.bodyMarkdown}
                    onChange={(event) =>
                      updateField("bodyMarkdown", event.target.value)
                    }
                    rows={7}
                    disabled={busy}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="home-cms-cta-label">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.ctaLabel}
                    </span>
                    <input
                      id="home-cms-cta-label"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      value={form.ctaLabel}
                      onChange={(event) =>
                        updateField("ctaLabel", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                  <label className="grid gap-1.5" htmlFor="home-cms-cta-url">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.ctaUrl}
                    </span>
                    <input
                      id="home-cms-cta-url"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      type="url"
                      value={form.ctaUrl}
                      onChange={(event) =>
                        updateField("ctaUrl", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="home-cms-image-url">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.imageUrl}
                    </span>
                    <input
                      id="home-cms-image-url"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      type="url"
                      value={form.imageUrl}
                      onChange={(event) =>
                        updateField("imageUrl", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                  <label className="grid gap-1.5" htmlFor="home-cms-image-alt">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.imageAlt}
                    </span>
                    <input
                      id="home-cms-image-alt"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      value={form.imageAlt}
                      onChange={(event) =>
                        updateField("imageAlt", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                </div>
              </article>
            )}

            <fieldset className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-6 shadow-xs">
              <legend className="px-1 text-base font-bold text-[var(--ink)]">
                {copy.publish}
              </legend>
              <div className="flex flex-wrap gap-4">
                <label
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ink)]"
                  htmlFor="home-cms-publish-immediate"
                >
                  <input
                    id="home-cms-publish-immediate"
                    className="size-4 text-[var(--accent)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!"
                    type="radio"
                    name="home-cms-publish-mode"
                    checked={form.publishMode === "immediate"}
                    onChange={() => updateField("publishMode", "immediate")}
                    disabled={busy}
                  />
                  <span>{copy.publishImmediate}</span>
                </label>
                <label
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ink)]"
                  htmlFor="home-cms-publish-scheduled"
                >
                  <input
                    id="home-cms-publish-scheduled"
                    className="size-4 text-[var(--accent)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!"
                    type="radio"
                    name="home-cms-publish-mode"
                    checked={form.publishMode === "scheduled"}
                    onChange={() => updateField("publishMode", "scheduled")}
                    disabled={busy}
                  />
                  <span>{copy.publishScheduled}</span>
                </label>
              </div>
              {form.publishMode === "scheduled" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    className="grid gap-1.5"
                    htmlFor="home-cms-schedule-start"
                  >
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.scheduleStart}（香港時間）
                    </span>
                    <input
                      id="home-cms-schedule-start"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      type="datetime-local"
                      value={form.startAt}
                      onChange={(event) =>
                        updateField("startAt", event.target.value)
                      }
                      required
                      disabled={busy}
                    />
                  </label>
                  <label
                    className="grid gap-1.5"
                    htmlFor="home-cms-schedule-end"
                  >
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {copy.scheduleEnd}（香港時間）
                    </span>
                    <input
                      id="home-cms-schedule-end"
                      className="min-h-[44px] w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--ink)] focus-visible:border-[var(--focus)] focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]! disabled:opacity-50"
                      type="datetime-local"
                      value={form.endAt}
                      onChange={(event) =>
                        updateField("endAt", event.target.value)
                      }
                      disabled={busy}
                    />
                  </label>
                </div>
              )}
            </fieldset>

            <ActionSurface
              busy={busy}
              className="flex flex-wrap items-center justify-end gap-3 mt-4"
              label={copy.editorTitle}
              state={
                operation === "saving"
                  ? "save"
                  : operation === "publishing"
                    ? "busy"
                    : "selection"
              }
            >
              <Button
                id="home-cms-preview-toggle"
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen((open) => !open)}
                aria-expanded={previewOpen}
                disabled={busy}
              >
                {copy.preview}
              </Button>
              <Button
                id="home-cms-save-draft"
                type="button"
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={busy}
              >
                {operation === "saving" ? copy.loading : copy.saveDraft}
              </Button>
              <Button id="home-cms-publish" type="submit" disabled={busy}>
                {operation === "publishing" ? copy.loading : copy.savePublished}
              </Button>
            </ActionSurface>
          </form>

          {notice && !conflictLatest && (
            <output
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--ink)] shadow-xs"
              aria-live="polite"
            >
              {notice}
            </output>
          )}

          {previewOpen && (
            <section
              className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-6 shadow-xs"
              aria-labelledby="home-cms-preview-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="home-cms-preview-title"
                    className="text-base font-bold text-[var(--ink)]"
                  >
                    {copy.preview}
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {copy.previewLead}
                  </p>
                </div>
                {previewLoading && (
                  <span className="text-xs text-[var(--ink-muted)]">
                    {copy.loading}
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={copy.preview}
              >
                <button
                  id="home-cms-preview-phone"
                  className={cn(
                    "min-h-[44px] rounded-md px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!",
                    previewViewport === "phone"
                      ? "bg-[var(--accent)] text-white shadow-xs"
                      : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
                  )}
                  type="button"
                  aria-pressed={previewViewport === "phone"}
                  onClick={() => setPreviewViewport("phone")}
                >
                  {copy.previewPhone}
                </button>
                <button
                  id="home-cms-preview-desktop"
                  className={cn(
                    "min-h-[44px] rounded-md px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-[3px]! focus-visible:outline-[var(--focus)]! focus-visible:outline-offset-[3px]!",
                    previewViewport === "desktop"
                      ? "bg-[var(--accent)] text-white shadow-xs"
                      : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
                  )}
                  type="button"
                  aria-pressed={previewViewport === "desktop"}
                  onClick={() => setPreviewViewport("desktop")}
                >
                  {copy.previewDesktop}
                </button>
              </div>
              <div className="flex justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                <article
                  className={cn(
                    "grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-[var(--ink)] shadow-xs wrap-anywhere",
                    previewViewport === "phone"
                      ? "w-full max-w-[390px]"
                      : "w-full max-w-[760px]"
                  )}
                >
                  <span className="text-xs font-bold tracking-wider text-[var(--accent)] uppercase">
                    {copy.editorTitle}
                  </span>
                  {form.templateType === "A" ? (
                    <>
                      <h3 className="text-lg font-bold">
                        {previewFeaturedEvent?.title || copy.templateA}
                      </h3>
                      <p className="text-sm text-[var(--ink-muted)]">
                        {previewFeaturedEventLabel(
                          previewFeaturedEvent,
                          previewHome
                        )}
                      </p>
                      <span className="text-xs text-[var(--ink-muted)]">
                        {form.featuredEventId || copy.fallbackDescription}
                      </span>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold">
                        {form.title || copy.title}
                      </h3>
                      <p className="text-sm text-[var(--ink-muted)]">
                        {form.summary || copy.summary}
                      </p>
                      <div className="text-sm whitespace-pre-wrap">
                        {form.bodyMarkdown || copy.body}
                      </div>
                      {form.imageUrl && (
                        <img
                          className="max-h-[300px] w-full rounded-md object-cover"
                          src={form.imageUrl}
                          alt={form.imageAlt ?? ""}
                        />
                      )}
                      {form.ctaLabel && (
                        <span className="inline-flex w-fit items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white">
                          {form.ctaLabel}
                        </span>
                      )}
                    </>
                  )}
                </article>
              </div>
            </section>
          )}

          <section
            className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-6 shadow-xs"
            aria-labelledby="home-cms-audit-title"
          >
            <div className="flex items-center justify-between">
              <h2
                id="home-cms-audit-title"
                className="text-base font-bold text-[var(--ink)]"
              >
                {copy.auditTrail}
              </h2>
            </div>
            {audit.length === 0 ? (
              <p className="m-0 text-sm text-[var(--ink-muted)]">
                {copy.noAudit}
              </p>
            ) : (
              <ol className="m-0 grid list-none gap-2 p-0">
                {audit.map((item) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0 text-sm"
                    key={item.auditId}
                  >
                    <div className="grid gap-0.5">
                      <strong className="font-bold text-[var(--ink)]">
                        {copy.auditPublishedBy}:{" "}
                        {item.actorName || item.actorUserId}
                      </strong>
                      <span className="text-xs text-[var(--ink-muted)]">
                        {item.templateType === "A"
                          ? copy.templateA
                          : copy.templateB}{" "}
                        · v{item.version}
                      </span>
                    </div>
                    <time
                      className="text-xs text-[var(--ink-muted)] whitespace-nowrap"
                      dateTime={item.insertedAt}
                    >
                      {copy.auditAt}: {formatHkDateTime(item.insertedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="text-xs text-[var(--ink-muted)] mt-3">
            {copy.updatedAt}: {formatHkDateTime(form.updatedAt)}
            {form.publishMode === "scheduled" && form.startAt
              ? ` · ${copy.scheduledAt}: ${form.startAt}`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
