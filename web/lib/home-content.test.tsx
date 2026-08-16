import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { HomeContentEditor, HomeSurface } from "@/lib/home-content-ui";

const HOME_A = {
  requestId: "home-a",
  data: {
    content: {
      template_type: "A" as const,
      content_id: "content-a",
      version: 4,
      featured_event: {
        event_id: "event-a",
        name: "週六崇拜",
        starts_at: "2026-09-12T02:00:00.000Z",
        location: "主堂",
      },
      fallback: false,
    },
  },
};

const HOME_B = {
  requestId: "home-b",
  data: {
    content: {
      template_type: "B" as const,
      content_id: "content-b",
      version: 5,
      published_at: "2026-08-15T00:00:00.000Z",
      title: "牧養消息",
      summary: "本週消息摘要。",
      body_markdown: '<p>安全正文 <a href="https://example.com/news" rel="noopener noreferrer">閱讀詳情</a><script>alert(1)</script></p>',
      cta_label: "查看詳情",
      cta_url: "https://example.com/news",
      image_url: "https://example.com/news.jpg",
      image_alt: "消息圖片",
    },
  },
};

const EDITOR_RESPONSE = {
  drafts: {
    template_a: {
      content_id: "draft-a",
      version: 4,
      template_type: "A" as const,
      publish_mode: "immediate" as const,
      featured_event_id: null,
      title: null,
      summary: null,
      body_markdown: null,
      cta_label: null,
      cta_url: null,
      image_url: null,
      image_alt: null,
      start_at: null,
      end_at: null,
    },
    template_b: {
      content_id: "draft-b",
      version: 7,
      template_type: "B" as const,
      publish_mode: "immediate" as const,
      featured_event_id: null,
      title: "原有標題",
      summary: "原有摘要",
      body_markdown: "<p>原有正文</p>",
      cta_label: "詳情",
      cta_url: "/programs",
      image_url: null,
      image_alt: null,
      start_at: null,
      end_at: null,
    },
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HomeSurface", () => {
  test("renders Template A featured event data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ content: HOME_A.data.content });
    render(<HomeSurface fetcher={fetcher} />);

    expect(screen.getByRole("status")).toHaveTextContent(COPY.home.loading);
    expect(await screen.findByRole("heading", { name: "週六崇拜" })).toBeInTheDocument();
    expect(screen.getByText("主堂")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: COPY.home.explorePrograms })).toHaveAttribute(
      "href",
      "/programs"
    );
  });
  test("renders a Template B teaser and the full detail view separately", async () => {
    const fetcher = vi.fn().mockResolvedValue({ content: HOME_B.data.content });
    render(<HomeSurface fetcher={fetcher} />);

    const teaserRow = await screen.findByRole("link", {
      name: new RegExp(`^牧養消息.*${COPY.home.viewDetails}`),
    });
    expect(teaserRow).toHaveAttribute("href", "/notices");
    expect(screen.getByText(/本週消息摘要。/)).toBeInTheDocument();
    expect(screen.queryByText("安全正文")).not.toBeInTheDocument();

    cleanup();
    render(<HomeSurface fetcher={fetcher} mode="detail" title={COPY.home.noticeSectionTitle} />);
    expect(await screen.findByText("安全正文")).toBeInTheDocument();
    expect(screen.queryByText("alert(1)")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /閱讀詳情/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /閱讀詳情/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
    expect(screen.getByRole("link", { name: /查看詳情/ })).toHaveAttribute("target", "_blank");
  });

  test("shows a recoverable error state and retries", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new RpcError({ code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({ content: HOME_A.data.content });
    const user = userEvent.setup();
    render(<HomeSurface fetcher={fetcher} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: COPY.home.retry }));
    expect(await screen.findByRole("heading", { name: "週六崇拜" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("HomeContentEditor", () => {
  test("keeps independent Template A and B draft fields while switching", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/api/v1/home/editor")) {
        return Response.json({ requestId: "editor", data: EDITOR_RESPONSE });
      }
      if (path.endsWith("/api/v1/home/drafts")) {
        return Response.json({ requestId: "draft", data: { draft: EDITOR_RESPONSE.drafts.template_b } });
      }
      return Response.json({ requestId: "publish", data: { published: EDITOR_RESPONSE.drafts.template_b } });
    });
    const user = userEvent.setup();
    render(<HomeContentEditor />);

    await screen.findByRole("heading", { name: COPY.home.editorTitle });
    await user.click(screen.getByRole("radio", { name: COPY.home.templateBLabel }));
    const title = screen.getByLabelText(COPY.home.titleLabel);
    await user.clear(title);
    await user.type(title, "未儲存消息");
    await user.click(screen.getByRole("radio", { name: COPY.home.templateALabel }));
    await user.click(screen.getByRole("radio", { name: COPY.home.templateBLabel }));
    expect(screen.getByLabelText(COPY.home.titleLabel)).toHaveValue("未儲存消息");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/home/editor",
      expect.objectContaining({ method: "GET" })
    );
  });
  test("toggles the preview between phone and desktop widths", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/api/v1/home/editor")) {
        return Response.json({ requestId: "editor", data: EDITOR_RESPONSE });
      }
      return Response.json({ requestId: "history", data: { history: [] } });
    });
    const user = userEvent.setup();
    render(<HomeContentEditor />);

    await screen.findByRole("heading", { name: COPY.home.editorTitle });
    const mobile = screen.getByRole("button", { name: COPY.home.previewMobile });
    const desktop = screen.getByRole("button", { name: COPY.home.previewDesktop });
    expect(mobile).toHaveAttribute("aria-pressed", "true");
    expect(desktop).toHaveAttribute("aria-pressed", "false");

    await user.click(desktop);
    expect(desktop).toHaveAttribute("aria-pressed", "true");
    expect(mobile).toHaveAttribute("aria-pressed", "false");
  });

  test("reveals before and after snapshots for each publish history entry", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/api/v1/home/editor")) {
        return Response.json({ requestId: "editor", data: EDITOR_RESPONSE });
      }
      if (path.endsWith("/api/v1/home/history")) {
        return Response.json({
          requestId: "history",
          data: {
            history: [
              {
                content_id: "draft-b",
                version: 8,
                template_type: "B",
                status: "Published",
                published_by_name: "管理員甲",
                published_at: "2026-08-16T02:00:00.000Z",
                before: {
                  version: 7,
                  template_type: "B",
                  status: "Published",
                  title: "舊標題",
                  summary: "舊摘要",
                  body_markdown: "舊正文",
                  cta_label: null,
                  cta_url: null,
                  image_url: null,
                  image_alt: null,
                  featured_event_id: null,
                },
                after: {
                  version: 8,
                  template_type: "B",
                  status: "Published",
                  title: "新標題",
                  summary: "新摘要",
                  body_markdown: "新正文",
                  cta_label: null,
                  cta_url: null,
                  image_url: null,
                  image_alt: null,
                  featured_event_id: null,
                },
              },
            ],
          },
        });
      }
      return Response.json({ requestId: "draft", data: { draft: EDITOR_RESPONSE.drafts.template_b } });
    });
    const user = userEvent.setup();
    render(<HomeContentEditor />);

    await screen.findByText(COPY.home.historyViewDiff);
    const disclosure = screen.getByText(COPY.home.historyViewDiff);
    const details = disclosure.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    await user.click(disclosure);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("舊標題")).toBeVisible();
    expect(screen.getByText("新標題")).toBeVisible();
    expect(screen.getByText("舊摘要")).toBeVisible();
    expect(screen.getByText("新摘要")).toBeVisible();
  });


  test("preserves inputs and shows a top conflict banner after stale publish", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/api/v1/home/editor")) {
        return Response.json({ requestId: "editor", data: EDITOR_RESPONSE });
      }
      if (path.endsWith("/api/v1/home/drafts")) {
        return Response.json({ requestId: "draft", data: { draft: EDITOR_RESPONSE.drafts.template_b } });
      }
      return Response.json(
        {
          requestId: "publish",
          type: "about:blank",
          title: "Conflict",
          status: 409,
          code: "HOME_CONTENT_CONFLICT",
          detail: "已有其他管理員發佈了較新版本。",
        },
        { status: 409 }
      );
    });
    const user = userEvent.setup();
    render(<HomeContentEditor />);

    await screen.findByRole("heading", { name: COPY.home.editorTitle });
    await user.click(screen.getByRole("radio", { name: COPY.home.templateBLabel }));
    const title = screen.getByLabelText(COPY.home.titleLabel);
    await user.clear(title);
    await user.type(title, "保留我的草稿");
    await user.click(screen.getByRole("button", { name: COPY.home.publish }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.home.conflictTitle);
    expect(screen.getByLabelText(COPY.home.titleLabel)).toHaveValue("保留我的草稿");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/home/publish",
      expect.objectContaining({ method: "POST" })
    );
  });
});
