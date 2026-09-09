import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export interface ParticipantEnrollmentCleanupCopy {
  cancelEnrollment: string;
  cancelConfirmTitle: string;
  cancelConfirmAccept: string;
  withdrawRequest: string;
  withdrawConfirmTitle: string;
  withdrawConfirmAccept: string;
  enroll: string;
  reEnroll: string;
}

export async function resetParticipantEnrollment(
  page: Page,
  panel: Locator,
  copy: ParticipantEnrollmentCleanupCopy
): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  if ((await dialog.count()) > 0) {
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  const active = panel.getByRole("button", {
    name: copy.cancelEnrollment,
  });
  const pending = panel.getByRole("button", {
    name: copy.withdrawRequest,
  });
  const submit = panel.getByRole("button", {
    name: new RegExp(`^(${copy.enroll}|${copy.reEnroll})$`, "u"),
  });
  await expect(submit.or(active).or(pending)).toBeVisible({
    timeout: 15_000,
  });

  if (await active.isVisible()) {
    await active.click();
    await page
      .getByRole("alertdialog", { name: copy.cancelConfirmTitle })
      .getByRole("button", {
        name: new RegExp(`^${copy.cancelConfirmAccept}$`, "u"),
      })
      .click();
  }

  await expect(submit.or(pending)).toBeVisible({ timeout: 15_000 });
  if (await pending.isVisible()) {
    await pending.click();
    await page
      .getByRole("alertdialog", { name: copy.withdrawConfirmTitle })
      .getByRole("button", {
        name: new RegExp(`^${copy.withdrawConfirmAccept}$`, "u"),
      })
      .click();
  }
  await expect(submit).toBeVisible({ timeout: 15_000 });
}
