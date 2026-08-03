"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";

import { COPY } from "@/lib/copy";

export function RecoveryView({
  message,
  safeHref,
  onRetry,
}: {
  message: string;
  safeHref: string;
  onRetry?: () => void;
}) {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveRef.current?.focus();
  }, [message]);

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
      ref={liveRef}
      tabIndex={-1}
    >
      <p style={{ color: "#b00020", marginBottom: "1.5rem" }}>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            minHeight: 44,
            fontSize: "1rem",
            color: "#fff",
            backgroundColor: "#1565c0",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            marginRight: "0.5rem",
          }}
        >
          {COPY.error.retry}
        </button>
      )}
      <Link
        href={safeHref}
        style={{
          display: "inline-block",
          padding: "0.75rem 1.5rem",
          minHeight: 44,
          fontSize: "1rem",
          color: "#1565c0",
          textDecoration: "underline",
        }}
      >
        {COPY.nav.backToHome}
      </Link>
    </main>
  );
}
