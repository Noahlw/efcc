import Link from "next/link";

import { COPY } from "@/lib/copy";

export default function NotFound() {
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
    >
      <h1
        style={{
          margin: 0,
          fontSize: "1.6rem",
          fontWeight: 800,
          color: "var(--ink)",
        }}
      >
        {COPY.notAvailable.title}
      </h1>
      <p
        role="alert"
        style={{
          margin: 0,
          padding: "0.85rem 1rem",
          borderRadius: 8,
          background: "rgba(156, 48, 44, 0.09)",
          border: "1px solid rgba(156, 48, 44, 0.3)",
          color: "var(--accent-deep)",
          fontSize: "0.9375rem",
          lineHeight: 1.6,
          maxWidth: 400,
        }}
      >
        {COPY.notAvailable.message}
      </p>
      <Link
        href="/"
        style={{
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
          textDecoration: "none",
        }}
      >
        {COPY.notAvailable.backToHome}
      </Link>
    </main>
  );
}