import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { ProgramsAttentionCenter } from "@/lib/programs/programs-attention-center";

const server = setupServer();

const view = {
  actionable_count: 2,
  unread_count: 1,
  tasks: [
    {
      task_id: "registration:r1",
      module: "membership",
      title: "新會員 (new-member)",
      submitted_at: "2026-08-15T10:00:00.000Z",
      warning: false,
      priority: "high",
      href: "/registrations",
    },
    {
      task_id: "event:e1",
      module: "attendance",
      title: "週會",
      submitted_at: "2026-08-15T11:00:00.000Z",
      warning: true,
      priority: "normal",
      href: "/programs?mode=management&program=p1&task=events&event=e1",
    },
  ],
  notifications: [
    {
      notification_id: "editorial:n1",
      title: "教會消息",
      body: "請留意本週安排。",
      created_at: "2026-08-15T09:00:00.000Z",
      read: false,
      href: null,
    },
  ],
};

describe(ProgramsAttentionCenter, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => server.close());

  test("shows exact actionable badge and fixed module grouping", async () => {
    server.use(
      http.get("/api/v1/attention", () =>
        HttpResponse.json({ requestId: "r1", data: view })
      )
    );
    const user = userEvent.setup();
    const [, eventTask] = view.tasks;
    render(<ProgramsAttentionCenter actorRole="Staff" />);
    await waitFor(() => expect(screen.getByLabelText("2")).toBeInTheDocument());
    await user.click(
      screen.getByRole("button", { name: COPY.attention.bellLabel })
    );
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toStrictEqual([
      COPY.attention.moduleMembership,
      COPY.attention.moduleAttendance,
    ]);
    expect(screen.getByRole("link", { name: /週會/u })).toHaveAttribute(
      "href",
      eventTask.href
    );
  });

  test("marks only notifications read and exposes Admin priority mutation", async () => {
    const marked = vi.fn<(body: unknown) => void>();
    const updated = vi.fn<(body: unknown) => void>();
    server.use(
      http.get("/api/v1/attention", () =>
        HttpResponse.json({ requestId: "r1", data: view })
      ),
      http.post("/api/v1/attention/notifications/read", async ({ request }) => {
        marked(await request.json());
        return HttpResponse.json({
          requestId: "r2",
          data: { marked_count: 1 },
        });
      }),
      http.put(
        "/api/v1/attention/tasks/event%3Ae1/priority",
        async ({ request }) => {
          updated(await request.json());
          return HttpResponse.json({
            requestId: "r3",
            data: { task_id: "event:e1", priority: "low" },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<ProgramsAttentionCenter actorRole="Admin" />);
    await waitFor(() =>
      expect(
        screen.getByLabelText(COPY.attention.bellLabel)
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attention.bellLabel })
    );
    await user.click(screen.getByRole("tab", { name: /通知/u }));
    await user.click(
      screen.getByRole("button", { name: COPY.attention.markAllRead })
    );
    expect(marked).toHaveBeenCalledWith({ notification_ids: ["editorial:n1"] });
    await user.click(screen.getByRole("tab", { name: /待處理/u }));
    const [, priority] = screen.getAllByRole("combobox");
    await user.selectOptions(priority, "low");
    expect(updated).toHaveBeenCalledWith({ priority: "low" });
  });
});
