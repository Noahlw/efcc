"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const PermissionsPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/management?module=permissions");
  }, [router]);
  return <output aria-busy="true">正在前往帳戶與權限…</output>;
};

export default PermissionsPage;
