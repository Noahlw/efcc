"use client";

import { AppShell } from "@/lib/app-shell";
import { LegacyRouteRedirect } from "@/lib/legacy-route-redirect";

const EventsPage = () => (
  <AppShell>
    <LegacyRouteRedirect route="events" />
  </AppShell>
);

export default EventsPage;
