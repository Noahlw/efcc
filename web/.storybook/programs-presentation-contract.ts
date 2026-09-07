import { expect, waitFor, within } from "storybook/test";

export interface ProgramsScreenReadiness {
  readonly selector: string;
  readonly text: string;
}

export async function assertProgramsScreen(
  canvasElement: HTMLElement,
  readiness: ProgramsScreenReadiness
) {
  const canvas = within(canvasElement);
  await expect(canvas.findByRole("main")).resolves.toBeVisible();
  const marker = await waitFor(() => {
    const element = canvasElement.querySelector(readiness.selector);
    if (!element || !element.textContent?.includes(readiness.text)) {
      throw new Error(
        `Expected settled Programs marker ${readiness.selector} to contain ${readiness.text}`
      );
    }
    return element;
  });
  await expect(marker).toBeVisible();
}
