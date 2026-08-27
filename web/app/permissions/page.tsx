"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { safeManagementReturnHref } from "@/app/management/management-action-framework";

const PermissionsPage = () => {
  const router = useRouter();
  useEffect(() => {
    const returnHref =
      typeof window === "undefined"
        ? "/management"
        : safeManagementReturnHref(
            new URLSearchParams(window.location.search).get("return"),
            "/management"
          );
    const target = new URLSearchParams({ module: "permissions" });
    if (returnHref !== "/management") {
      target.set("return", returnHref);
    }
    router.replace(`/management?${target.toString()}`);
  }, [router]);
  return <output aria-busy="true">正在前往帳戶與權限…</output>;
};

export default PermissionsPage;
