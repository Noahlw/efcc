import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import type {
  ManagementAttention,
  ManagementAttentionItem,
} from "@/lib/programs/program-api";
import {
  ProgramsAttention,
  type ManagementAttentionState,
} from "@/lib/programs/programs-attention";

import styles from "@/app/programs/programs.module.css";

afterEach(() => {
  cleanup();
});

const enrollmentItem: ManagementAttentionItem = {
  kind: "enrollment",
  actionable: true,
  count: 2,
  program_id: "program-enrollment",
  program_name: "青年小組",
  department_id: "department-youth",
  department_name: "青年事工",
};

const inactiveEventItem: ManagementAttentionItem = {
  kind: "event",
  actionable: true,
  event_id: "event-inactive",
  program_id: "program-events",
  program_name: "社區服務",
  department_id: "department-outreach",
  department_name: "外展事工",
  starts_at: "2026-08-20T02:00:00.000Z",
  status: "Active",
  availability: "Inactive",
  name: "八月服務日",
};

const cancelledEventItem: ManagementAttentionItem = {
  ...inactiveEventItem,
  actionable: false,
  event_id: "event-cancelled",
  status: "Cancelled",
  availability: "Active",
  name: "取消的服務日",
};

function readyState(
  items: ManagementAttentionItem[],
  totalActionableCount = 0,
  hasMore = false
): ManagementAttentionState {
  const programs: ManagementAttention["programs"] = items.flatMap((item) =>
    item.kind === "enrollment"
      ? [
          {
            program_id: item.program_id,
            department_id: item.department_id,
            pending_enrollment_count: item.count,
            inactive_event_count: 0,
            cancelled_event_count: 0,
            actionable_count: item.count,
          },
        ]
      : []
  );
  return {
    kind: "ready",
    attention: {
      programs,
      items,
      total_actionable_count: totalActionableCount,
      has_more: hasMore,
    },
  };
}

describe(ProgramsAttention, () => {
  test("opens real sources with exact management deep links", async () => {
    render(
      <ProgramsAttention
        state={readyState([enrollmentItem, inactiveEventItem, cancelledEventItem], 3)}
        onRetry={vi.fn()}
      />
    );

    expect(screen.queryByText(COPY.programs.attentionZero)).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", {
      name: new RegExp(COPY.programs.attentionTitle),
    });
    expect(trigger).toHaveTextContent("3");

    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: COPY.programs.attentionTitle,
    });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-enrollment&task=participants"
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-events&task=events&event=event-inactive"
    );
    expect(links[2]).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-events&task=events&event=event-cancelled"
    );
    expect(links[2].parentElement).toHaveClass(styles.attentionInformational);
  });

  test("suppresses zero badge and explains the zero state", async () => {
    render(
      <ProgramsAttention state={readyState([])} onRetry={vi.fn()} />
    );

    const trigger = screen.getByRole("button", {
      name: COPY.programs.attentionTitle,
    });
    expect(trigger).not.toHaveTextContent("0");
    await userEvent.click(trigger);
    expect(screen.getByText(COPY.programs.attentionZero)).toBeInTheDocument();
  });

  test("keeps retry state recoverable", async () => {
    const onRetry = vi.fn();
    render(
      <ProgramsAttention
        state={{ kind: "error", message: COPY.error.networkError }}
        onRetry={onRetry}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.attentionTitle })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.attentionRetry })
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
