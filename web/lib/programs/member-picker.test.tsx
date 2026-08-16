import { cleanup, render, screen } from "@testing-library/react";
// PRG-05 (#201) — keyboard accessibility for the member picker combobox.
// MSW intercepts the Worker member-options endpoint; fixtures carry no
// credential material.
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { MemberPicker } from "@/lib/programs/member-picker";

const server = setupServer();

const MEMBERS = [
  { user_id: "U003", name: "陳大文", username: "chanman" },
  { user_id: "U004", name: "李小美", username: "li" },
];

describe("member picker keyboard navigation", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  function renderPicker() {
    return render(
      <form onSubmit={(event) => event.preventDefault()}>
        <MemberPicker
          programId="prog-1"
          name="leader_user_id"
          label="領袖帳號"
          placeholder="輸入最少兩個字"
        />
        <button type="submit">送出</button>
      </form>
    );
  }

  function hiddenField(): HTMLInputElement {
    const field = document.querySelector(
      'input[name="leader_user_id"]'
    ) as HTMLInputElement | null;
    if (!field) {
      throw new Error("hidden leader field not found");
    }
    return field;
  }

  test("ArrowDown moves the active option, Enter picks it, Escape closes the list", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/member-options", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q");
        const members =
          query === "chan"
            ? MEMBERS
            : MEMBERS.filter((member) => member.username.includes(query ?? ""));
        return HttpResponse.json({
          requestId: "rid-1",
          data: { members },
        });
      })
    );
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole("combobox");
    await user.type(input, "chan");

    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).not.toHaveAttribute("aria-selected", "true");

    // ArrowDown highlights the first option via activedescendant.
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "leader_user_id-option-0"
    );

    // ArrowDown again moves to the second option.
    await user.keyboard("{ArrowDown}");
    expect(options[0]).not.toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "leader_user_id-option-1"
    );

    // ArrowUp returns to the first.
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Enter picks the highlighted option into the hidden form field.
    await user.keyboard("{Enter}");
    expect(hiddenField()).toHaveValue("U003");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("Escape closes the list without selecting", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/member-options", () =>
        HttpResponse.json({ requestId: "rid-1", data: { members: MEMBERS } })
      )
    );
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole("combobox");
    await user.type(input, "chan");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "leader_user_id-option-0"
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(hiddenField()).toHaveValue("");
  });
});
