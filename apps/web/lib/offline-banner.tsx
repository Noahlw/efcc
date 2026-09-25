"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the accessible status role contract */

import { useEffect, useState } from "react";

import { COPY } from "@/lib/copy";

export const OfflineBanner = () => {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed z-[var(--layer-offline-banner,95)] top-[max(8px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 w-[min(440px,calc(100%-24px))] px-4 py-[11px] border border-[var(--pending-border,#c1ad95)] rounded-[9px] text-[var(--ink)] bg-[var(--pending-surface,#f3eee8)] shadow-[0_10px_30px_rgba(23,26,29,0.09)] text-[0.86rem] font-[550] text-center"
    >
      {COPY.offlineBanner}
    </div>
  );
};
