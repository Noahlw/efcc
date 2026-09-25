/* oxlint-disable vitest/max-expects eslint/require-unicode-regexp eslint/no-unused-vars eslint/no-inline-comments */
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { COPY } from "@/lib/copy";
import type { HomeContent } from "@/lib/home-cms-api";

import { HomeContentEditor } from "./home-cms-editor";
const EDITOR = COPY.homeEditor;
const mocks = vi.hoisted(() => ({
  announce: vi.fn<(message: string) => void>(),
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
  },
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));
vi.mock(import("@/lib/live-region"), () => ({
  announce: mocks.announce,
}));

const CONTENT: HomeContent = {
  contentId: "home-cms-1",
  version: 3,
  templateType: "A",
  status: "Draft",
  publishMode: "immediate",
  startAt: null,
  endAt: null,
  title: "本週聚會",
  summary: "歡迎參加本週聚會。",
  bodyMarkdown: "詳情內容",
  ctaLabel: "了解更多",
  ctaUrl: "https://example.com/more",
  imageUrl: null,
  imageAlt: null,
  featuredEventId: "event-1",
  updatedBy: "U-EDITOR",
  updatedAt: "2026-08-17T02:00:00.000Z",
  publishedBy: null,
  publishedAt: null,
};
const AUDIT_ITEMS = [
  {
    auditId: "audit-1",
    insertedAt: "2026-08-17T02:00:00.000Z",
    actorUserId: "U-EDITOR",
    actorName: null,
    action: "HOME_PUBLISH",
    entityId: "home-cms-1",
    contentId: "home-cms-1",
    version: 3,
    templateType: "A",
  },
];

const server = setupServer();

function json(data: unknown, init?: ResponseInit) {
  return HttpResponse.json({ requestId: "req-home-cms", data }, init);
}

function installHandlers(content: HomeContent = CONTENT) {
  server.use(
    http.get("/api/v1/home/content", () => json(content)),
    http.get("/api/v1/home/audit", () => json({ items: AUDIT_ITEMS })),
    http.get("/api/v1/home", () =>
      json({
        featuredEvent: null,
        announcement: null,
        exploreProgram: null,
      })
    ),
    http.post("/api/v1/home/draft", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return json({
        ...content,
        ...body,
        publishMode: body.publish_mode ?? content.publishMode,
        status: "Draft",
        version: content.version + 1,
      });
    }),
    http.post("/api/v1/home/publish", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return json({
        ...content,
        ...body,
        publishMode: body.publish_mode ?? content.publishMode,
        status: "Published",
        version: content.version + 1,
        publishedBy: "U-EDITOR",
        publishedAt: "2026-08-17T02:10:00.000Z",
      });
    })
  );
}

function element(id: string): HTMLElement {
  const node = document.querySelector(`#${id}`);
  if (!node) {
    throw new Error(`Expected #${id}`);
  }
  return node as HTMLElement;
}
async function waitUntilReady(): Promise<void> {
  await screen.findByRole("heading", { name: EDITOR.editorTitle });
  await waitFor(() => expect(element("home-cms-featured-event")).toBeVisible());
}

describe(HomeContentEditor, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("switches between Template A and Template B fields", async () => {
    const user = userEvent.setup();
    installHandlers();
    render(<HomeContentEditor />);

    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: new RegExp(EDITOR.templateB) })
    );
    expect(element("home-cms-title")).toBeVisible();
    expect(element("home-cms-summary")).toBeVisible();
    expect(element("home-cms-body")).toBeVisible();
    expect(element("home-cms-cta-label")).toBeVisible();
    expect(element("home-cms-cta-url")).toBeVisible();
    expect(element("home-cms-image-url")).toBeVisible();
    expect(element("home-cms-image-alt")).toBeVisible();
    expect(document.querySelector("#home-cms-featured-event")).toBeNull();
  });

  test("saves a draft without publishing it", async () => {
    const user = userEvent.setup();
    let draftBody: Record<string, unknown> | undefined;
    let publishCalls = 0;
    installHandlers();
    server.use(
      http.post("/api/v1/home/draft", async ({ request }) => {
        draftBody = (await request.json()) as Record<string, unknown>;
        return json({
          ...CONTENT,
          ...draftBody,
          publishMode: draftBody.publish_mode ?? CONTENT.publishMode,
          startAt: draftBody.start_at ?? CONTENT.startAt,
          endAt: draftBody.end_at ?? CONTENT.endAt,
          status: "Draft",
          version: 4,
        });
      }),
      http.post("/api/v1/home/publish", () => {
        publishCalls += 1;
        return json(CONTENT);
      })
    );
    render(<HomeContentEditor />);
    await waitUntilReady();
    await user.click(
      screen.getByRole("button", { name: new RegExp(EDITOR.templateB) })
    );
    await user.clear(element("home-cms-title") as HTMLInputElement);
    await user.type(
      element("home-cms-title") as HTMLInputElement,
      "未發佈草稿"
    );
    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));

    await waitFor(() => expect(draftBody?.publish_mode).toBe("immediate"));
    expect(draftBody?.template_type).toBe("B");
    expect(draftBody?.title).toBe("未發佈草稿");
    expect(publishCalls).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent(EDITOR.saveSuccess);
  });

  test("previews Template A from the draft featured event id", async () => {
    const user = userEvent.setup();
    installHandlers();
    server.use(
      http.get("/api/v1/home/cms/featured-event/event-2", () =>
        json({
          eventId: "event-2",
          programId: "program-2",
          programTitle: "Preview Program",
          title: "Preview Event Two",
          startsAt: "2026-09-01T10:00:00.000Z",
          endsAt: "2026-09-01T12:00:00.000Z",
          location: "Hall",
          status: "Active",
        })
      )
    );
    render(<HomeContentEditor />);
    await waitUntilReady();
    await user.clear(element("home-cms-featured-event") as HTMLInputElement);
    await user.type(
      element("home-cms-featured-event") as HTMLInputElement,
      "event-2"
    );
    await user.click(screen.getByRole("button", { name: EDITOR.preview }));
    await expect(screen.findByText("Preview Event Two")).resolves.toBeVisible();
  });

  test("toggles the real preview between phone and desktop viewports", async () => {
    const user = userEvent.setup();
    installHandlers();
    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: EDITOR.preview }));
    const phone = screen.getByRole("button", { name: EDITOR.previewPhone });
    const desktop = screen.getByRole("button", { name: EDITOR.previewDesktop });
    await user.click(phone);
    expect(phone).toHaveAttribute("aria-pressed", "true");
    expect(desktop).toHaveAttribute("aria-pressed", "false");
    await user.click(desktop);
    expect(desktop).toHaveAttribute("aria-pressed", "true");
    expect(phone).toHaveAttribute("aria-pressed", "false");
  });

  test("publishes immediately and with a scheduled HK start time", async () => {
    const user = userEvent.setup();
    const publishBodies: Record<string, unknown>[] = [];
    installHandlers();
    server.use(
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        publishBodies.push(body);
        return json({
          ...CONTENT,
          ...body,
          publishMode: body.publish_mode ?? CONTENT.publishMode,
          status: "Published",
          version: 4,
        });
      })
    );
    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    await waitFor(() => expect(publishBodies).toHaveLength(1));
    expect(publishBodies[0]?.publish_mode).toBe("immediate");

    await user.click(screen.getByLabelText(/預約發佈|scheduled/i));
    const startAt = screen.getByLabelText(/開始時間|start_at/i);
    fireEvent.change(startAt, { target: { value: "2026-08-18T10:00" } });
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    await waitFor(() => expect(publishBodies).toHaveLength(2));
    expect(publishBodies[1]?.publish_mode).toBe("scheduled");
    expect(publishBodies[1]?.start_at).toBeTruthy();
  });

  test("shows a conflict requiring reload of the latest version", async () => {
    const user = userEvent.setup();
    installHandlers();
    server.use(
      http.post("/api/v1/home/draft", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: EDITOR.conflictTitle,
            status: 409,
            detail: "請重新載入最新版本。",
            code: "CONFLICT",
            latest: {
              ...CONTENT,
              version: 4,
              templateType: "B",
              title: "最新已發佈版本",
            },
          },
          { status: 409 }
        )
      )
    );
    render(<HomeContentEditor />);
    await waitUntilReady();
    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));
    await expect(
      screen.findByText(EDITOR.conflictTitle)
    ).resolves.toBeVisible();
    const reload = screen.getByRole("button", { name: EDITOR.conflictReload });
    expect(reload).toBeVisible();
    await user.click(reload);
    expect((element("home-cms-title") as HTMLInputElement).value).toBe(
      "最新已發佈版本"
    );
  });

  test("renders visible publish audit rows", async () => {
    installHandlers();
    render(<HomeContentEditor />);
    await waitUntilReady();
    const heading = await screen.findByRole("heading", {
      name: EDITOR.auditTrail,
    });
    const audit = heading.closest("section");
    expect(audit).not.toBeNull();
    if (!audit) {
      return;
    }
    expect(audit).toBeVisible();
    expect(audit).toHaveTextContent(EDITOR.auditPublishedBy);
    expect(audit).toHaveTextContent("U-EDITOR");
    expect(audit).toHaveTextContent("2026");
    expect(audit).toHaveTextContent("v3");
  });

  test("visibly distinguishes Published status and binds expected version and content ID on save", async () => {
    const user = userEvent.setup();
    let draftBody: Record<string, unknown> | undefined;
    const publishedContent = {
      ...CONTENT,
      status: "Published" as const,
      version: 5,
      templateType: "B" as const,
      title: "已發佈標題",
    };
    installHandlers(publishedContent);
    server.use(
      http.post("/api/v1/home/draft", async ({ request }) => {
        draftBody = (await request.json()) as Record<string, unknown>;
        return json({
          ...publishedContent,
          ...draftBody,
          publishMode: draftBody.publish_mode ?? publishedContent.publishMode,
          status: "Draft",
          version: 6,
        });
      })
    );
    render(<HomeContentEditor />);
    await screen.findByRole("heading", { name: EDITOR.editorTitle });
    await waitFor(() => expect(element("home-cms-title")).toBeVisible());

    const statusBadge = document.querySelector(
      '[data-slot="home-cms-status-badge"]'
    );
    expect(statusBadge).not.toBeNull();
    expect(statusBadge).toHaveTextContent(EDITOR.statusPublished);
    expect(statusBadge).toHaveTextContent("v5");

    await user.clear(element("home-cms-title") as HTMLInputElement);
    await user.type(
      element("home-cms-title") as HTMLInputElement,
      "修改已發佈標題"
    );
    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));

    await waitFor(() => expect(draftBody?.content_id).toBe("home-cms-1"));
    expect(draftBody?.expected_version).toBe(5);
    expect(draftBody?.template_type).toBe("B");
    expect(draftBody?.title).toBe("修改已發佈標題");
  });

  test("converts scheduled Hong Kong wall-time start and end inputs to UTC ISO timestamps for publish", async () => {
    const user = userEvent.setup();
    let publishBody: Record<string, unknown> | undefined;
    installHandlers();
    server.use(
      http.post("/api/v1/home/publish", async ({ request }) => {
        publishBody = (await request.json()) as Record<string, unknown>;
        return json({
          ...CONTENT,
          ...publishBody,
          publishMode: publishBody.publish_mode ?? CONTENT.publishMode,
          status: "Published",
          version: 4,
        });
      })
    );
    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(screen.getByLabelText(/預約發佈|scheduled/i));
    const startAt = screen.getByLabelText(/開始時間|start_at/i);
    const endAt = screen.getByLabelText(/結束時間|end_at/i);
    fireEvent.change(startAt, { target: { value: "2026-08-18T10:00" } });
    fireEvent.change(endAt, { target: { value: "2026-08-18T12:00" } });
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => expect(publishBody).toBeDefined());
    expect(publishBody?.publish_mode).toBe("scheduled");
    expect(publishBody?.start_at).toBe("2026-08-18T02:00:00.000Z");
    expect(publishBody?.end_at).toBe("2026-08-18T04:00:00.000Z");
    expect(publishBody?.content_id).toBe("home-cms-1");
    expect(publishBody?.version).toBe(4);
  });

  test("preserves unpersisted draft form state across recoverable non-conflict save failure and allows retry", async () => {
    const user = userEvent.setup();
    installHandlers();
    server.use(
      http.post("/api/v1/home/draft", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "儲存失敗",
            status: 500,
            detail: "資料庫寫入逾時",
            code: "DATABASE_TIMEOUT",
          },
          { status: 500 }
        )
      )
    );
    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: new RegExp(EDITOR.templateB) })
    );
    await user.clear(element("home-cms-title") as HTMLInputElement);
    await user.type(
      element("home-cms-title") as HTMLInputElement,
      "未儲存的特別草稿"
    );
    await user.clear(element("home-cms-summary") as HTMLTextAreaElement);
    await user.type(
      element("home-cms-summary") as HTMLTextAreaElement,
      "這段草稿簡介在失敗後必須保留。"
    );

    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));

    await screen.findByText(/資料庫寫入逾時|載入失敗/);
    expect((element("home-cms-title") as HTMLInputElement).value).toBe(
      "未儲存的特別草稿"
    );
    expect((element("home-cms-summary") as HTMLTextAreaElement).value).toBe(
      "這段草稿簡介在失敗後必須保留。"
    );

    server.use(
      http.post("/api/v1/home/draft", () =>
        json({
          ...CONTENT,
          templateType: "B",
          title: "未儲存的特別草稿",
          summary: "這段草稿簡介在失敗後必須保留。",
          status: "Draft",
          version: 4,
        })
      )
    );
    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(EDITOR.saveSuccess)
    );
  });

  test("renders long CJK content without crashing in Template B preview across viewports", async () => {
    const user = userEvent.setup();
    const longContent = {
      ...CONTENT,
      templateType: "B" as const,
      title:
        "顯恩堂二零二六年度聯合培靈會及特別宣道聚會：在動盪時代中持守真道與見證基督的生命力",
      summary:
        "這是一個非常冗長的中文字串摘要，用於驗證系統在處理大量文字內容時不會發生樣式截斷或佈局破裂，並能完整呈現在桌面與手機預覽視窗之中。".repeat(
          3
        ),
      bodyMarkdown:
        "詳細內容第一段：歡迎各位弟兄姊妹參加。\n\n詳細內容第二段：講員將會分享寶貴信息。\n\n詳細內容第三段：請預早報名及預備心靈。".repeat(
          4
        ),
      ctaLabel: "立即報名參加二零二六年度特別聚會",
      ctaUrl: "https://example.com/events/2026-annual-joint-revival-conference",
    };
    installHandlers(longContent);
    render(<HomeContentEditor />);
    await screen.findByRole("heading", { name: EDITOR.editorTitle });
    await waitFor(() => expect(element("home-cms-title")).toBeVisible());

    await user.click(screen.getByRole("button", { name: EDITOR.preview }));
    const previewSection = await screen.findByRole("heading", {
      name: EDITOR.preview,
    });
    expect(previewSection).toBeVisible();
    expect(
      screen.getAllByText(/顯恩堂二零二六年度聯合培靈會/).length
    ).toBeGreaterThan(0);

    const phone = screen.getByRole("button", { name: EDITOR.previewPhone });
    const desktop = screen.getByRole("button", { name: EDITOR.previewDesktop });
    await user.click(phone);
    expect(phone).toHaveAttribute("aria-pressed", "true");
    await user.click(desktop);
    expect(desktop).toHaveAttribute("aria-pressed", "true");
  });

  test("adopts shared management header with safe back navigation and action surface controls", async () => {
    installHandlers();
    render(<HomeContentEditor />);
    await waitUntilReady();

    const backLink = screen.getByRole("link", {
      name: new RegExp(COPY.management.backHome),
    });
    expect(backLink).toHaveAttribute("href", "/management");
    expect(
      screen.getByRole("heading", { level: 1, name: EDITOR.editorTitle })
    ).toBeVisible();
    expect(
      document.querySelector('[data-slot="action-surface"]')
    ).not.toBeNull();
  });

  test("CS-01: confirmed publish remains visible when post-publish audit GET fails with transient error", async () => {
    const user = userEvent.setup();
    let auditGetCount = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditGetCount += 1;
        if (auditGetCount > 1) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Audit unavailable",
              status: 500,
              detail: "Audit read failed",
              code: "HOME_UNAVAILABLE",
            },
            { status: 500 }
          );
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({
          ...CONTENT,
          ...body,
          status: "Published",
          version: 4,
          publishedBy: "U-EDITOR",
          publishedAt: "2026-08-17T02:10:00.000Z",
        });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    expect(screen.getByText(/U-EDITOR/)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    const statusBadge = document.querySelector(
      '[data-slot="home-cms-status-badge"]'
    );
    await waitFor(() => {
      expect(statusBadge).toHaveTextContent(EDITOR.statusPublished);
      expect(statusBadge).toHaveTextContent("v4");
    });

    expect(screen.getByRole("status")).toHaveTextContent(EDITOR.publishSuccess);
    expect(screen.queryByText(EDITOR.loadError)).toBeNull();

    const auditSection = screen
      .getByRole("heading", {
        name: EDITOR.auditTrail,
      })
      .closest("section");
    expect(auditSection).toHaveTextContent(EDITOR.auditStale);
    expect(auditSection).toHaveTextContent("U-EDITOR");
    expect(auditSection).toHaveTextContent("v3");

    const auditRetryBtn = screen.getByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(auditRetryBtn).toBeVisible();
    expect(auditRetryBtn).toHaveAttribute("type", "button");
  });

  test("CS-02: audit retry only issues GET for audit and preserves draft/publish counts and form state", async () => {
    const user = userEvent.setup();
    let auditGetCount = 0;
    let draftPostCount = 0;
    let publishPostCount = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditGetCount += 1;
        if (auditGetCount === 2) {
          return HttpResponse.json(
            { title: "Audit timeout", status: 500, code: "NETWORK_ERROR" },
            { status: 500 }
          );
        }
        if (auditGetCount >= 3) {
          return json({
            items: [
              {
                auditId: "audit-2",
                insertedAt: "2026-08-17T02:10:00.000Z",
                actorUserId: "U-EDITOR",
                actorName: "編輯管理員",
                action: "HOME_PUBLISH",
                entityId: "home-cms-1",
                contentId: "home-cms-1",
                version: 4,
                templateType: "A",
              },
              ...AUDIT_ITEMS,
            ],
          });
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/draft", async () => {
        draftPostCount += 1;
        return json({ ...CONTENT, status: "Draft", version: 4 });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        publishPostCount += 1;
        const body = (await request.json()) as Record<string, unknown>;
        return json({
          ...CONTENT,
          ...body,
          status: "Published",
          version: 4,
          publishedBy: "U-EDITOR",
          publishedAt: "2026-08-17T02:10:00.000Z",
        });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => expect(auditGetCount).toBe(2));
    const initialDraftCount = draftPostCount;
    const initialPublishCount = publishPostCount;
    expect(initialPublishCount).toBe(1);

    const auditRetryBtn = await screen.findByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(auditRetryBtn).toBeVisible();

    await user.click(auditRetryBtn);

    await waitFor(() => expect(auditGetCount).toBe(3));
    expect(draftPostCount).toBe(initialDraftCount);
    expect(publishPostCount).toBe(initialPublishCount);

    const auditSection = screen
      .getByRole("heading", {
        name: EDITOR.auditTrail,
      })
      .closest("section");
    expect(auditSection).not.toHaveTextContent(EDITOR.auditStale);
    expect(auditSection).toHaveTextContent("編輯管理員");
    expect(auditSection).toHaveTextContent("v4");

    const statusBadge = document.querySelector(
      '[data-slot="home-cms-status-badge"]'
    );
    expect(statusBadge).toHaveTextContent(EDITOR.statusPublished);
    expect(statusBadge).toHaveTextContent("v4");
    expect(screen.getByRole("status")).toHaveTextContent(EDITOR.publishSuccess);
  });

  test("CS-03: unread audit displays unavailable instead of empty on failure and preserves publish status", async () => {
    const user = userEvent.setup();
    let auditCalls = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditCalls += 1;
        if (auditCalls === 1) {
          return json({ items: [] });
        }
        return HttpResponse.json(
          { title: "Audit down", status: 503, code: "HOME_UNAVAILABLE" },
          { status: 503 }
        );
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({
          ...CONTENT,
          ...body,
          status: "Published",
          version: 4,
        });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    const auditSection = screen
      .getByRole("heading", {
        name: EDITOR.auditTrail,
      })
      .closest("section");
    expect(auditSection).toHaveTextContent(EDITOR.noAudit);

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="home-cms-status-badge"]')
      ).toHaveTextContent(EDITOR.statusPublished);
    });

    expect(auditSection).toHaveTextContent(EDITOR.auditUnavailable);
    expect(auditSection).not.toHaveTextContent(EDITOR.noAudit);

    const retryBtn = screen.getByRole("button", { name: EDITOR.auditRetry });
    expect(retryBtn).toBeVisible();
    expect(retryBtn).toHaveAttribute("type", "button");

    await user.click(retryBtn);
    await waitFor(() => expect(auditCalls).toBe(3));
    await waitFor(() => {
      expect(auditSection).toHaveTextContent(EDITOR.auditUnavailable);
      expect(auditSection).not.toHaveTextContent(EDITOR.noAudit);
      expect(
        document.querySelector('[data-slot="home-cms-status-badge"]')
      ).toHaveTextContent(EDITOR.statusPublished);
      expect(
        document.querySelector('[data-slot="home-cms-status-badge"]')
      ).toHaveTextContent("v4");
    });
    expect(retryBtn).toBeVisible();
    expect(retryBtn).toHaveAttribute("type", "button");
  });
  test("CS-04: unsaved draft fields are preserved across audit retry success and failure", async () => {
    const user = userEvent.setup();
    let auditCalls = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditCalls += 1;
        if (auditCalls === 2 || auditCalls === 3) {
          // Call 2 (post-publish) and Call 3 (first retry) fail
          return HttpResponse.json({ title: "Fail" }, { status: 500 });
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Published", version: 4 });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    const retryBtn = await screen.findByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(retryBtn).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: new RegExp(EDITOR.templateB) })
    );
    await user.clear(element("home-cms-title") as HTMLInputElement);
    await user.type(
      element("home-cms-title") as HTMLInputElement,
      "新編輯的草稿標題"
    );

    // First retry fails (call 3)
    await user.click(retryBtn);
    expect(auditCalls).toBe(3);
    expect((element("home-cms-title") as HTMLInputElement).value).toBe(
      "新編輯的草稿標題"
    );
    expect(
      document.querySelector('[data-slot="home-cms-status-badge"]')
    ).toHaveTextContent("v4");

    // Second retry succeeds (call 4)
    await user.click(retryBtn);
    await waitFor(() => expect(auditCalls).toBe(4));
    expect((element("home-cms-title") as HTMLInputElement).value).toBe(
      "新編輯的草稿標題"
    );
    expect(
      document.querySelector('[data-slot="home-cms-status-badge"]')
    ).toHaveTextContent("v4");
  });

  test("CS-05: audit retry deduplicates in-flight GET and remains a type=button control", async () => {
    const user = userEvent.setup();
    let auditCalls = 0;
    let draftCalls = 0;
    let publishCalls = 0;
    let resolveAudit: (() => void) | undefined;

    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditCalls += 1;
        if (auditCalls === 2) {
          return HttpResponse.json({ title: "Fail" }, { status: 500 });
        }
        if (auditCalls > 2) {
          const { promise, resolve } = Promise.withResolvers<Response>();
          resolveAudit = () => resolve(json({ items: AUDIT_ITEMS }));
          return promise;
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/draft", async ({ request }) => {
        draftCalls += 1;
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Draft", version: 4 });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        publishCalls += 1;
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Published", version: 4 });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    expect(draftCalls).toBe(1);
    expect(publishCalls).toBe(1);

    const retryBtn = await screen.findByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(retryBtn).toHaveAttribute("type", "button");

    await user.click(retryBtn);
    await waitFor(() => expect(auditCalls).toBe(3));
    expect(retryBtn).toBeDisabled();

    await user.click(retryBtn);
    fireEvent.keyDown(retryBtn, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(retryBtn, { key: " ", code: "Space" });
    await waitFor(() => expect(auditCalls).toBe(3));
    expect(draftCalls).toBe(1);
    expect(publishCalls).toBe(1);

    resolveAudit?.();
    const auditSection = screen
      .getByRole("heading", { name: EDITOR.auditTrail })
      .closest("section");
    await waitFor(() => expect(auditSection).toHaveTextContent("U-EDITOR"));
  });

  test("CS-06: busy and disabled lifecycle is preserved continuously across save-before-publish and audit refresh", async () => {
    const user = userEvent.setup();
    let draftPostCount = 0;
    let publishPostCount = 0;
    let auditGetCount = 0;

    const draftGate = Promise.withResolvers<Response>();
    const publishGate = Promise.withResolvers<Response>();
    const auditGate = Promise.withResolvers<Response>();

    installHandlers();
    server.use(
      http.post("/api/v1/home/draft", async () => {
        draftPostCount += 1;
        return draftGate.promise;
      }),
      http.post("/api/v1/home/publish", async () => {
        publishPostCount += 1;
        return publishGate.promise;
      }),
      http.get("/api/v1/home/audit", () => {
        auditGetCount += 1;
        if (auditGetCount > 1) {
          return auditGate.promise;
        }
        return json({ items: AUDIT_ITEMS });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    const publishBtn = screen.getByRole("button", {
      name: EDITOR.savePublished,
    });
    const saveDraftBtn = screen.getByRole("button", {
      name: EDITOR.saveDraft,
    });

    // 1. Click publish
    await user.click(publishBtn);

    // 2. Draft is in-flight: operation is publishing, controls are disabled
    expect(draftPostCount).toBe(1);
    expect(publishBtn).toBeDisabled();
    expect(publishBtn).toHaveTextContent(EDITOR.loading);
    expect(saveDraftBtn).toBeDisabled();

    // Repeated clicks while save-draft in-flight are rejected
    await user.click(publishBtn);
    await user.click(saveDraftBtn);
    expect(draftPostCount).toBe(1);
    expect(publishPostCount).toBe(0);

    // 3. Resolve draft save -> publish POST starts immediately without returning to idle
    draftGate.resolve(json({ ...CONTENT, status: "Draft", version: 4 }));
    await waitFor(() => expect(publishPostCount).toBe(1));

    // Controls remain continuously disabled during publish phase
    expect(publishBtn).toBeDisabled();
    expect(publishBtn).toHaveTextContent(EDITOR.loading);
    expect(saveDraftBtn).toBeDisabled();

    // Repeated clicks while publish in-flight are rejected
    await user.click(publishBtn);
    expect(publishPostCount).toBe(1);

    // 4. Resolve publish -> audit GET starts immediately, busy lifecycle remains unbroken
    publishGate.resolve(
      json({
        ...CONTENT,
        status: "Published",
        version: 4,
        publishedBy: "U-EDITOR",
        publishedAt: "2026-08-17T02:10:00.000Z",
      })
    );
    await waitFor(() => expect(auditGetCount).toBe(2));

    // Controls remain disabled during post-publish audit refresh
    expect(publishBtn).toBeDisabled();
    expect(saveDraftBtn).toBeDisabled();

    // Repeated clicks during audit refresh are rejected
    await user.click(publishBtn);
    expect(publishPostCount).toBe(1);

    // 5. Resolve audit GET -> operation returns to idle and controls re-enable
    auditGate.resolve(
      json({
        items: [
          {
            auditId: "audit-2",
            insertedAt: "2026-08-17T02:10:00.000Z",
            actorUserId: "U-EDITOR",
            actorName: "管理員",
            action: "HOME_PUBLISH",
            entityId: "home-cms-1",
            version: 4,
            templateType: "A",
          },
          ...AUDIT_ITEMS,
        ],
      })
    );

    await waitFor(() => expect(publishBtn).not.toBeDisabled());
    expect(publishBtn).toHaveTextContent(EDITOR.savePublished);
    expect(saveDraftBtn).not.toBeDisabled();

    // Exactly one save draft and exactly one publish execution took place
    expect(draftPostCount).toBe(1);
    expect(publishPostCount).toBe(1);
  });

  test("continues publishing when the editor unmounts during the draft save", async () => {
    const user = userEvent.setup();
    let draftPostCount = 0;
    let publishPostCount = 0;
    const draftGate = Promise.withResolvers<Response>();

    installHandlers();
    server.use(
      http.post("/api/v1/home/draft", async () => {
        draftPostCount += 1;
        return draftGate.promise;
      }),
      http.post("/api/v1/home/publish", async () => {
        publishPostCount += 1;
        return json({ ...CONTENT, status: "Published", version: 4 });
      })
    );

    const editor = render(<HomeContentEditor />);
    await waitUntilReady();
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    expect(draftPostCount).toBe(1);

    editor.unmount();
    draftGate.resolve(json({ ...CONTENT, status: "Draft", version: 4 }));

    await waitFor(() => expect(publishPostCount).toBe(1));
  });

  test("disables audit retry while another publish is in progress", async () => {
    const user = userEvent.setup();
    let auditGetCount = 0;
    let draftPostCount = 0;
    let publishPostCount = 0;
    const secondDraftGate = Promise.withResolvers<Response>();

    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditGetCount += 1;
        return auditGetCount === 2
          ? HttpResponse.json({ title: "Audit unavailable" }, { status: 503 })
          : json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/draft", async () => {
        draftPostCount += 1;
        if (draftPostCount === 2) {
          return secondDraftGate.promise;
        }
        return json({ ...CONTENT, status: "Draft", version: 4 });
      }),
      http.post("/api/v1/home/publish", async () => {
        publishPostCount += 1;
        return json({ ...CONTENT, status: "Published", version: 4 });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => expect(auditGetCount).toBe(2));
    const retryButton = await screen.findByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(retryButton).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    await waitFor(() => expect(draftPostCount).toBe(2));
    expect(retryButton).toBeDisabled();
    await user.click(retryButton);
    expect(auditGetCount).toBe(2);

    secondDraftGate.resolve(json({ ...CONTENT, status: "Draft", version: 5 }));
    await waitFor(() => expect(publishPostCount).toBe(2));
    await waitFor(() => expect(auditGetCount).toBe(3));
  });

  test("CS-07: publish conflict presents reload-latest option without false publish success", async () => {
    const user = userEvent.setup();
    installHandlers();
    server.use(
      http.post("/api/v1/home/publish", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: EDITOR.conflictTitle,
            status: 409,
            detail: "最新內容已變更",
            code: "CONFLICT",
            latest: {
              ...CONTENT,
              version: 5,
              templateType: "B",
              title: "其他人發佈的最新版本",
            },
          },
          { status: 409 }
        )
      )
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await expect(
      screen.findByText(EDITOR.conflictTitle)
    ).resolves.toBeVisible();
    expect(screen.queryByText(EDITOR.publishSuccess)).toBeNull();
    expect(screen.queryByText(EDITOR.auditStale)).toBeNull();

    const reload = screen.getByRole("button", { name: EDITOR.conflictReload });
    expect(reload).toBeVisible();
    await user.click(reload);
    expect((element("home-cms-title") as HTMLInputElement).value).toBe(
      "其他人發佈的最新版本"
    );
  });

  test("CS-08: publish 403 displays purpose-specific forbidden copy", async () => {
    const user = userEvent.setup();
    installHandlers();
    server.use(
      http.post("/api/v1/home/publish", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Forbidden",
            status: 403,
            detail: "Forbidden",
            code: "FORBIDDEN",
          },
          { status: 403 }
        )
      )
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await expect(screen.findByText(EDITOR.forbidden)).resolves.toBeVisible();
    expect(screen.queryByText(EDITOR.publishSuccess)).toBeNull();
  });
  test("CS-08: publish AUTH_REQUIRED uses the safe deep-link behavior", async () => {
    const user = userEvent.setup();
    mocks.router.replace.mockClear();
    installHandlers();
    server.use(
      http.post("/api/v1/home/publish", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Unauthorized",
            status: 401,
            detail: "Session expired",
            code: "AUTH_REQUIRED",
          },
          { status: 401 }
        )
      )
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText(EDITOR.publishSuccess)).toBeNull();
  });

  test("CS-09: audit read AUTH_REQUIRED triggers safe deep-link redirect instead of retry banner", async () => {
    const user = userEvent.setup();
    let auditCalls = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditCalls += 1;
        if (auditCalls > 1) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Unauthorized",
              status: 401,
              detail: "Session expired",
              code: "AUTH_REQUIRED",
            },
            { status: 401 }
          );
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Published", version: 4 });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText(EDITOR.auditStale)).toBeNull();
  });

  test("CS-09: audit read FORBIDDEN stops exposing history and does not offer transient retry", async () => {
    const user = userEvent.setup();
    let auditCalls = 0;
    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditCalls += 1;
        if (auditCalls > 1) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Forbidden",
              status: 403,
              detail: "Permission denied",
              code: "FORBIDDEN",
            },
            { status: 403 }
          );
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Published", version: 4 });
      })
    );

    render(<HomeContentEditor />);
    await waitUntilReady();

    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );

    const auditSection = screen
      .getByRole("heading", {
        name: EDITOR.auditTrail,
      })
      .closest("section");
    await waitFor(() => {
      expect(auditSection).toHaveTextContent(EDITOR.auditDenied);
    });
    // Stops exposing previous audit history
    expect(auditSection).not.toHaveTextContent("U-EDITOR");
    // Does not present stale message or retry button
    expect(auditSection).not.toHaveTextContent(EDITOR.auditStale);
    expect(
      screen.queryByRole("button", { name: EDITOR.auditRetry })
    ).toBeNull();
  });

  test("CS-10: obsolete audit response arriving after newer request or unmount is discarded without overwriting rows", async () => {
    const user = userEvent.setup();
    let auditGetCount = 0;

    const olderAuditGate = Promise.withResolvers<Response>();
    const unmountAuditGate = Promise.withResolvers<Response>();

    installHandlers();
    server.use(
      http.get("/api/v1/home/audit", () => {
        auditGetCount += 1;
        if (auditGetCount === 1) {
          return json({ items: AUDIT_ITEMS });
        }
        if (auditGetCount === 2) {
          return HttpResponse.json({ title: "Fail" }, { status: 500 });
        }
        if (auditGetCount === 3) {
          return olderAuditGate.promise;
        }
        if (auditGetCount === 4) {
          return json({
            items: [
              {
                auditId: "audit-v4",
                insertedAt: "2026-08-17T02:10:00.000Z",
                actorUserId: "U-EDITOR",
                actorName: "最新發佈者",
                action: "HOME_PUBLISH",
                entityId: "home-cms-1",
                contentId: "home-cms-1",
                version: 4,
                templateType: "A",
              },
            ],
          });
        }
        if (auditGetCount === 5) {
          return unmountAuditGate.promise;
        }
        return json({ items: AUDIT_ITEMS });
      }),
      http.post("/api/v1/home/publish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return json({ ...CONTENT, ...body, status: "Published", version: 4 });
      })
    );

    const { unmount } = render(<HomeContentEditor />);
    await waitUntilReady();

    // 1. Initial publish with audit failure to reveal retry button
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    const retryBtn = await screen.findByRole("button", {
      name: EDITOR.auditRetry,
    });
    expect(retryBtn).toBeVisible();

    // 2. Start older retry (call 3), which stays pending on olderAuditGate
    await user.click(retryBtn);
    expect(auditGetCount).toBe(3);

    // 3. User publishes again (call 4), which finishes with newer audit version 4
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    const auditSection = screen
      .getByRole("heading", {
        name: EDITOR.auditTrail,
      })
      .closest("section");
    await waitFor(() => {
      expect(auditSection).toHaveTextContent("最新發佈者");
      expect(auditSection).toHaveTextContent("v4");
    });

    // 4. Now the older retry (call 3) resolves late with obsolete version 3
    olderAuditGate.resolve(
      json({
        items: [
          {
            auditId: "audit-v3",
            insertedAt: "2026-08-17T01:00:00.000Z",
            actorUserId: "U-OLD",
            actorName: "過期發佈者",
            action: "HOME_PUBLISH",
            entityId: "home-cms-1",
            version: 3,
            templateType: "A",
          },
        ],
      })
    );

    // Generation guard ensures newer v4 is kept, obsolete v3 is discarded
    await waitFor(() => {
      expect(auditSection).toHaveTextContent("最新發佈者");
      expect(auditSection).toHaveTextContent("v4");
      expect(auditSection).not.toHaveTextContent("過期發佈者");
    });

    // 5. Unmount guard: trigger another publish whose audit GET (call 5) is in-flight
    await user.click(
      screen.getByRole("button", { name: EDITOR.savePublished })
    );
    await waitFor(() => expect(auditGetCount).toBe(5));

    const announceCallsBeforeUnmount = mocks.announce.mock.calls.length;
    await act(async () => {
      unmount();
      unmountAuditGate.resolve(
        HttpResponse.json(
          { title: "Audit unavailable", status: 500, code: "HOME_UNAVAILABLE" },
          { status: 500 }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.announce).toHaveBeenCalledTimes(announceCallsBeforeUnmount);
  });
});
