"use client";

import { AppShell } from "@/lib/app-shell";
import { LegacyRouteRedirect } from "@/lib/legacy-route-redirect";

const PermissionsPage = () => (
  <AppShell>
    <LegacyRouteRedirect route="permissions" />
  </AppShell>
);

export default PermissionsPage;
