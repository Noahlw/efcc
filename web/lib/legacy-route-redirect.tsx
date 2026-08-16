"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { isPermitted } from "@/lib/sections";

export type LegacyRoute = "permissions" | "care";

const redirectFor = (route: LegacyRoute, role: string, permitted: boolean) => {
  if (route === "permissions") {
    return role === "Admin" && permitted
      ? "/management?module=permissions"
      : "/home";
  }
  return permitted ? "/management?module=care" : "/home";
};

export const LegacyRouteRedirect = ({ route }: { route: LegacyRoute }) => {
  const router = useRouter();
  const { bootstrap } = useApp();

  useEffect(() => {
    const permitted = isPermitted(bootstrap.sections, route);
    const target = redirectFor(route, bootstrap.profile.role, permitted);
    router.replace(target);
  }, [bootstrap, route, router]);

  return <output aria-live="polite">{COPY.restore.loading}</output>;
};
