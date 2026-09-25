import { expect, waitFor, within } from "storybook/test";

export interface ProgramsScreenReadiness {
  readonly selector: string;
  readonly text: string;
  readonly requireRouteComposition?: boolean;
  readonly timeout?: number;
}

export async function assertProgramsScreen(
  canvasElement: HTMLElement,
  readiness: ProgramsScreenReadiness
) {
  const canvas = within(canvasElement);
  await expect(canvas.findByRole("main")).resolves.toBeVisible();
  const marker = await waitFor(
    () => {
      if (canvasElement.querySelector('[aria-busy="true"]')) {
        throw new Error("Programs presentation is still loading");
      }
      if (
        readiness.requireRouteComposition !== false &&
        !canvasElement.querySelector(
          '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
        )
      ) {
        throw new Error("Programs route frame is missing");
      }
      const element = canvasElement.querySelector(readiness.selector);
      if (!element || !element.textContent?.includes(readiness.text)) {
        throw new Error(
          `Expected settled Programs marker ${readiness.selector} to contain ${readiness.text}`
        );
      }
      return element;
    },
    { timeout: readiness.timeout ?? 5000 }
  );
  await expect(marker).toBeVisible();
}
