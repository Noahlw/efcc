import type { Page } from "@playwright/test";

export interface EventWindowSnapshot {
  eventId: string;
  opensAt: string | null;
  closesAt: string | null;
}

export interface EventWindowSetup {
  snapshot: EventWindowSnapshot;
  opened: boolean;
}

export async function restoreEventWindow(
  adminPage: Page,
  programId: string,
  snapshot: EventWindowSnapshot
): Promise<void> {
  const restored = await adminPage.evaluate(
    async ({ targetProgramId, event }) => {
      const response = await fetch(
        `/api/v1/programs/${encodeURIComponent(targetProgramId)}/events/${encodeURIComponent(event.eventId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            check_in_window_opens_at: event.opensAt,
            check_in_window_closes_at: event.closesAt,
          }),
        }
      );
      return response.ok;
    },
    { targetProgramId: programId, event: snapshot }
  );
  if (!restored) {
    throw new Error(`Failed to restore event window for ${snapshot.eventId}`);
  }
}
