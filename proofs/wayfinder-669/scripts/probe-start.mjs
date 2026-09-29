import assert from "node:assert/strict";

import { chromium, expect } from "@playwright/test";

const base = process.env.PROOF_START_ORIGIN ?? "http://127.0.0.1:4181";
assert.equal((await fetch(`${base}/api/seed`, { method: "POST" })).status, 200);
const state = await (await fetch(`${base}/api/state`)).json();
const version = Math.max(...state.home.map((row) => row.version)) + 1;
const draft = await fetch(`${base}/api/draft`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ version }),
});
assert.equal(draft.status, 201);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(base);
  await page.locator('body[data-hydrated="true"]').waitFor();
  await expect(page.getByTestId("home-state")).toHaveText("Sign in required");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("home-state")).toHaveText(
    `Synthetic Home v${version}: Draft`
  );
  await page.getByRole("link", { name: "About" }).click();
  await expect(page.locator("h1")).toBeFocused();
  await page.goBack();
  await expect(page.locator("h1")).toBeFocused();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("home-state")).toHaveText(
    `Synthetic Home v${version}: Published`
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByTestId("home-state")).toHaveText("Sign in required");
  assert.equal(await page.getByRole("button", { name: "Publish" }).count(), 0);
  console.log(
    "Start browser proof: SSR loader, URL/Back/focus, auth, publish, logout passed"
  );
} finally {
  await browser.close();
}
