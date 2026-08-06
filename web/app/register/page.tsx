"use client";

import { RegistrationForm } from "@/lib/registration-form";
import { REGISTRATION_COPY } from "@/lib/registration-copy";

const FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Helvetica Neue", Arial, sans-serif';

/**
 * Self-service registration page (AUTH-05 #163). Public surface — no session
 * required. The parent landing page (CF0-08) links here once integrated.
 */
export default function RegisterPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f2ede2",
        color: "#201d17",
        fontFamily: FONT,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "3rem 1.25rem" }}>
        <h1
          style={{
            margin: "0 0 0.375rem",
            fontSize: "1.75rem",
            fontWeight: 900,
            letterSpacing: "-0.01em",
          }}
        >
          {REGISTRATION_COPY.pageTitle}
        </h1>
        <p
          style={{
            margin: "0 0 2rem",
            fontSize: "0.9375rem",
            lineHeight: 1.7,
            color: "#5c564a",
          }}
        >
          {REGISTRATION_COPY.pageLead}
        </p>
        <RegistrationForm />
      </div>
    </main>
  );
}