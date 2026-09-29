import assert from "node:assert/strict";

import { chromium, expect } from "@playwright/test";

const variants = [
  {
    name: "Next",
    origin: "http://127.0.0.1:8799",
    page: "/proof-query",
    data: "http://127.0.0.1:8799",
    prefix: "",
  },
  {
    name: "SPA",
    origin: "http://127.0.0.1:4180",
    page: "/",
    data: "http://127.0.0.1:8799",
    prefix: "",
  },
  {
    name: "Start",
    origin: "http://127.0.0.1:4181",
    page: "/",
    data: "http://127.0.0.1:4181",
    prefix: "/api",
  },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const variant of variants) {
    if (process.argv[2] && process.argv[2] !== variant.name) continue;
    const state = await (
      await fetch(`${variant.data}${variant.prefix}/state`)
    ).json();
    const version = Math.max(...state.home.map((row) => row.version)) + 1;
    const draft = await fetch(`${variant.data}${variant.prefix}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    assert.equal(draft.status, 201);
    const page = await browser.newPage();
    await page.goto(`${variant.origin}${variant.page}`);
    if (variant.name === "Start")
      await page.locator('body[data-hydrated="true"]').waitFor();
    await expect(page.getByTestId("home-state")).toHaveText("Sign in required");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("home-state")).toHaveText(
      `Synthetic Home v${version}: Draft`
    );
    let attempts = 0;
    await page.route("**/api/publish", async (route) => {
      attempts++;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("p[role=status]")).toContainText(
      "Outcome unknown"
    );
    await page.waitForTimeout(250);
    assert.equal(
      attempts,
      1,
      `${variant.name} must not replay an uncertain publish`
    );
    const after = await (
      await fetch(`${variant.data}${variant.prefix}/state`)
    ).json();
    assert.equal(
      after.audit.filter(
        (row) => JSON.parse(row.newValueJson).version === version
      ).length,
      1
    );
    await page.unroute("**/api/publish");
    await page.reload();
    await expect(page.getByTestId("home-state")).toHaveText(
      `Synthetic Home v${version}: Published`
    );
    console.log(
      `${variant.name}: one server commit, lost response, no replay, reload reconciled v${version}`
    );
    await page.close();
  }
} finally {
  await browser.close();
}
