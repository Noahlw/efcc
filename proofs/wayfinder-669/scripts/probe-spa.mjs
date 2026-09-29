import assert from "node:assert/strict";

import { chromium, expect } from "@playwright/test";

const worker = process.env.PROOF_WORKER_ORIGIN ?? "http://127.0.0.1:8799";
const ui = process.env.PROOF_UI_ORIGIN ?? "http://127.0.0.1:4180";
const state = await (await fetch(`${worker}/state`)).json();
const version = Math.max(...state.home.map((row) => row.version)) + 1;
assert.equal(
  (
    await fetch(`${worker}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    })
  ).status,
  201
);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${ui}/`);
  await page.getByTestId("home-state").getByText("Sign in required").waitFor();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByTestId("home-state")
    .getByText(`Synthetic Home v${version}: Draft`)
    .waitFor();
  await page.getByRole("link", { name: "About" }).click();
  await expect(page.locator("h1")).toBeFocused();
  await page.reload();
  await expect(page.locator("h1")).toHaveText("About proof");
  await page.goBack();
  await expect(page.locator("h1")).toBeFocused();
  await page.getByRole("button", { name: "Publish" }).click();
  await page
    .getByTestId("home-state")
    .getByText(`Synthetic Home v${version}: Published`)
    .waitFor();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByTestId("home-state").getByText("Sign in required").waitFor();
  assert.equal(await page.getByRole("button", { name: "Publish" }).count(), 0);
  console.log(
    `SPA browser proof: URL/Back/focus, auth, publish v${version}, logout cache clear passed`
  );
} finally {
  await browser.close();
}
