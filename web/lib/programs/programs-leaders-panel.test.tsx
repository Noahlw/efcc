import { cleanup, render, screen } from "@testing-library/react";
// PRG-04 (#200) — component tests for the leaders panel (UI-1..UI-5).
// MSW intercepts the Worker program endpoints; fixtures carry no credential
// material.
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { COPY, errorCopyFor } from "@/lib/copy";
import type { Program, ProgramLeader } from "@/lib/programs/program-api";
import { LeadersPanel } from "@/lib/programs/programs-leaders-panel";

const server = setupServer();

const PROGRAM: Program = {
  program_id: "prog-1",
  department_id: "dept-1",
  name: "週六團契",
  description: null,
  category: null,
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const LEADER_BOB: ProgramLeader = {
  program_id: "prog-1",
  user_id: "U002",
  granted_by: "U001",
  granted_at: "2026-08-01T00:00:00.000Z",
  revoked_by: null,
  revoked_at: null,
};

function leadersHandlers(leaders: ProgramLeader[]) {
  return [
    http.get("/api/v1/programs/prog-1/leaders", () =>
      HttpResponse.json({ requestId: "rid-1", data: { leaders } })
    ),
  ];
}

describe("PRG-04 leaders panel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("UI-1 managers see the leader list and can assign a leader", async () => {
    const leaders: ProgramLeader[] = [];
    server.use(
      ...leadersHandlers(leaders),
      http.post("/api/v1/programs/prog-1/leaders", async ({ request }) => {
        const body = (await request.json()) as { user_id: string };
        expect(body.user_id).toBe("U003");
        leaders.push({ ...LEADER_BOB, user_id: "U003" });
        return HttpResponse.json({
          requestId: "rid-2",
          data: { leader: { ...LEADER_BOB, user_id: "U003" } },
        });
      })
    );
    const user = userEvent.setup();
    render(<LeadersPanel program={PROGRAM} canManage />);
    await screen.findByText(COPY.programs.noLeaders);
    await user.type(screen.getByLabelText(COPY.programs.leaderUserId), "U003");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.assignLeader })
    );
    await expect(
      screen.findByText(COPY.programs.leaderAssignedNotice)
    ).resolves.toBeInTheDocument();
    await expect(screen.findByText("U003")).resolves.toBeInTheDocument();
  });

  test("UI-2 managers revoke a leader with the success notice", async () => {
    const leaders: ProgramLeader[] = [{ ...LEADER_BOB }];
    server.use(
      ...leadersHandlers(leaders),
      http.post("/api/v1/programs/prog-1/leaders/U002/revoke", () => {
        leaders.splice(0, 1);
        return HttpResponse.json({
          requestId: "rid-2",
          data: {
            leader: { ...LEADER_BOB, revoked_at: "2026-08-06T00:00:00.000Z" },
          },
        });
      })
    );
    const user = userEvent.setup();
    render(<LeadersPanel program={PROGRAM} canManage />);
    await screen.findByText("U002");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.revokeLeader })
    );
    await expect(
      screen.findByText(COPY.programs.leaderRevokedNotice)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.noLeaders)
    ).resolves.toBeInTheDocument();
  });

  test("UI-3 assign failure surfaces the mapped error in an alert", async () => {
    server.use(
      ...leadersHandlers([]),
      http.post("/api/v1/programs/prog-1/leaders", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not Found",
            status: 404,
            code: "NOT_FOUND",
            detail: "Unknown user_id.",
            requestId: "rid-2",
          },
          { status: 404 }
        )
      )
    );
    const user = userEvent.setup();
    render(<LeadersPanel program={PROGRAM} canManage />);
    await screen.findByText(COPY.programs.noLeaders);
    await user.type(
      screen.getByLabelText(COPY.programs.leaderUserId),
      "ghost-user"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.assignLeader })
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      errorCopyFor("NOT_FOUND")
    );
  });

  test("UI-4 load failure surfaces the mapped error in an alert", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/leaders", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            code: "INTERNAL_ERROR",
            detail: "boom",
            requestId: "rid-1",
          },
          { status: 500 }
        )
      )
    );
    render(<LeadersPanel program={PROGRAM} canManage />);
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      errorCopyFor("INTERNAL_ERROR")
    );
  });

  test("UI-5 members see the leader list without assign/revoke controls", async () => {
    const leaders: ProgramLeader[] = [{ ...LEADER_BOB }];
    server.use(...leadersHandlers(leaders));
    render(<LeadersPanel program={PROGRAM} canManage={false} />);
    await screen.findByText("U002");
    expect(
      screen.queryByRole("button", { name: COPY.programs.assignLeader })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.revokeLeader })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(COPY.programs.leaderUserId)
    ).not.toBeInTheDocument();
  });
});
