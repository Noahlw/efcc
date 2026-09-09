import type { TestInfo } from "@playwright/test";

/**
 * Attaches numeric evidence as UTF-8 JSON to the current Playwright testInfo.
 * Never captures or attaches images.
 */
export async function attachNumericEvidence(
  testInfo: TestInfo,
  name: string,
  value: unknown
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: "application/json",
  });
}
