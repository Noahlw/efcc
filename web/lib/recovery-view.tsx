import Link from "next/link";

import { COPY } from "@/lib/copy";

export function RecoveryView({
  message,
  safeHref,
}: {
  message: string;
  safeHref: string;
}) {
  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <p role="alert" style={{ color: "#b00020", marginBottom: "1.5rem" }}>
        {message}
      </p>
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
