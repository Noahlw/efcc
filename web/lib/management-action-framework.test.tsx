import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  ManagementFilterSheet,
  ManagementPageHeader,
  ManagementStickyActionBar,
  safeManagementReturnHref,
} from "@/app/management/management-action-framework";

describe("S4 management action framework", () => {
  test("accepts only internal Management return URLs", () => {
    expect(
      safeManagementReturnHref(
        "/management?module=accounts#selected",
        "/management"
      )
    ).toBe("/management?module=accounts#selected");
    expect(
      safeManagementReturnHref("https://attacker.example", "/management")
    ).toBe("/management");
    expect(safeManagementReturnHref("//attacker.example", "/management")).toBe(
      "/management"
    );
    expect(safeManagementReturnHref("/home", "/management")).toBe(
      "/management"
    );
  });

  test("renders one consistent Back, title, lead, and contextual action", () => {
    render(
      <ManagementPageHeader
        action={<button type="button">重新整理</button>}
        backHref="/management"
        backLabel="返回管理工作"
        lead="處理已授權工作。"
        title="帳戶名錄"
      />
    );

    expect(screen.getByRole("link", { name: "返回管理工作" })).toHaveAttribute(
      "href",
      "/management"
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "帳戶名錄" })
    ).toBeInTheDocument();
    expect(screen.getByText("處理已授權工作。")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新整理" })
    ).toBeInTheDocument();
  });

  test("exposes labelled filter-sheet and sticky-action regions", () => {
    render(
      <>
        <ManagementFilterSheet label="篩選帳戶" onClose={() => {}}>
          <label htmlFor="role-filter">角色</label>
          <select aria-label="角色" id="role-filter">
            <option>全部角色</option>
          </select>
        </ManagementFilterSheet>
        <ManagementStickyActionBar label="審批選取集">
          <button type="button">核准所選</button>
        </ManagementStickyActionBar>
      </>
    );

    expect(
      screen.getByRole("dialog", { name: "篩選帳戶" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "審批選取集" })
    ).toBeInTheDocument();
  });
});
