"use client";

import { AppShell } from "@/lib/app-shell";
import { LegacyRouteRedirect } from "@/lib/legacy-route-redirect";

const CarePage = () => (
  <AppShell>
    <LegacyRouteRedirect route="care" />
  </AppShell>
);

export default CarePage;
