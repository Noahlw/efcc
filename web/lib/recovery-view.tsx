"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";

import { COPY } from "@/lib/copy";
import { announce } from "@/lib/live-region";

const alertStyle: React.CSSProperties = {
  margin: "0 0 1.5rem",
  padding: "0.85rem 1rem",
  borderRadius: 8,
  background: "rgba(156, 48, 44, 0.09)",
  border: "1px solid rgba(156, 48, 44, 0.3)",
  color: "var(--accent-deep)",
  fontSize: "0.9375rem",
  lineHeight: 1.6,
  maxWidth: 400,
};

const primaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 1.5rem",
  minHeight: 44,
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  marginRight: "0.5rem",
};

const secondaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 1.5rem",
  minHeight: 44,
  borderRadius: 8,
  background: "transparent",
  border: "1px solid var(--line-strong)",
  color: "var(--ink)",
  fontSize: "1rem",
  fontWeight: 700,
  textDecoration: "none",
};

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
    announce(message);
  }, [message]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "1rem",
        background: "var(--surface)",
        color: "var(--ink)",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
      }}
      ref={liveRef}
      tabIndex={-1}
    >
      <p role="alert" style={alertStyle}>
        {message}
      </p>
      <div>
        {onRetry && (
          <button type="button" onClick={onRetry} style={primaryStyle}>
            {COPY.error.retry}
          </button>
        )}
        <Link href={safeHref} style={secondaryStyle}>
          {COPY.nav.backToHome}
        </Link>
      </div>
    </main>
  );
}