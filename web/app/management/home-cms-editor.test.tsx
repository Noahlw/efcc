import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { HomeContentEditor } from "./home-cms-editor";
import { COPY } from "@/lib/copy";

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

const CONTENT = {
  contentId: "home-cms-1",
  version: 3,
  templateType: "A" as const,
  status: "Draft",
  publishMode: "immediate" as const,
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

function installHandlers(content = CONTENT) {
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
  const node = document.getElementById(id);
  if (!node) throw new Error(`Expected #${id}`);
  return node;
}
async function waitUntilReady(): Promise<void> {
  await screen.findByRole("heading", { name: EDITOR.editorTitle });
  await waitFor(() => expect(element("home-cms-featured-event")).toBeVisible());
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("HomeContentEditor", () => {
  test("switches between Template A and Template B fields", async () => {
    const user = userEvent.setup();
    installHandlers();
    render(<HomeContentEditor />);

    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: new RegExp(EDITOR.templateB) }));
    expect(element("home-cms-title")).toBeVisible();
    expect(element("home-cms-summary")).toBeVisible();
    expect(element("home-cms-body")).toBeVisible();
    expect(element("home-cms-cta-label")).toBeVisible();
    expect(element("home-cms-cta-url")).toBeVisible();
    expect(element("home-cms-image-url")).toBeVisible();
    expect(element("home-cms-image-alt")).toBeVisible();
    expect(document.getElementById("home-cms-featured-event")).toBeNull();
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
    await user.click(screen.getByRole("button", { name: new RegExp(EDITOR.templateB) }));
    await user.clear(element("home-cms-title") as HTMLInputElement);
    await user.type(element("home-cms-title") as HTMLInputElement, "未發佈草稿");
    await user.click(screen.getByRole("button", { name: EDITOR.saveDraft }));

    await waitFor(() => expect(draftBody?.publish_mode).toBe("immediate"));
    expect(draftBody?.template_type).toBe("B");
    expect(draftBody?.title).toBe("未發佈草稿");
    expect(publishCalls).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent(EDITOR.saveSuccess);
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
    const publishBodies: Array<Record<string, unknown>> = [];
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

    await user.click(screen.getByRole("button", { name: EDITOR.savePublished }));
    await waitFor(() => expect(publishBodies).toHaveLength(1));
    expect(publishBodies[0]?.publish_mode).toBe("immediate");

    await user.click(screen.getByLabelText(/預約發佈|scheduled/i));
    const startAt = screen.getByLabelText(/開始時間|start_at/i);
    fireEvent.change(startAt, { target: { value: "2026-08-18T10:00" } });
    await user.click(screen.getByRole("button", { name: EDITOR.savePublished }));
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
    expect(await screen.findByText(EDITOR.conflictTitle)).toBeVisible();
    const reload = screen.getByRole("button", { name: EDITOR.conflictReload });
    expect(reload).toBeVisible();
    await user.click(reload);
    expect((element("home-cms-title") as HTMLInputElement).value).toBe("最新已發佈版本");
  });

  test("renders visible publish audit rows", async () => {
    installHandlers();
    render(<HomeContentEditor />);
    await waitUntilReady();
    const heading = await screen.findByRole("heading", { name: EDITOR.auditTrail });
    const audit = heading.closest("section");
    expect(audit).not.toBeNull();
    if (!audit) return;
    expect(audit).toBeVisible();
    expect(audit).toHaveTextContent(EDITOR.auditPublishedBy);
    expect(audit).toHaveTextContent("U-EDITOR");
    expect(audit).toHaveTextContent("2026");
    expect(audit).toHaveTextContent("v3");
  });
});
