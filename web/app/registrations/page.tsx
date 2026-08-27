"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const RegistrationsPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/management?module=approvals");
  }, [router]);
  return <output aria-busy="true">正在前往註冊審批…</output>;
};

export default RegistrationsPage;
