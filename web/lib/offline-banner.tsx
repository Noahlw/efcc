"use client";

import { useEffect, useState } from "react";
import { COPY } from "@/lib/copy";
import styles from "./auth-shell.module.css";

export function OfflineBanner() {
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
    <div role="status" className={styles.offlineBanner}>
      {COPY.offlineBanner}
    </div>
  );
}
