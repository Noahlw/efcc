/* oxlint-disable vitest/max-expects eslint/require-unicode-regexp eslint/no-unused-vars eslint/no-inline-comments */
import {
  cleanup,
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
    action: "HOME_PUBLISH",
    entityId: "home-cms-1",
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
});
