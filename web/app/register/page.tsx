"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { LANDING } from "@/lib/copy";
import { REGISTRATION_COPY } from "@/lib/registration-copy";
import { RegistrationForm } from "@/lib/registration-form";

/**
 * Self-service registration page (AUTH-05 #163). Public surface — no session
 * required. The parent landing page (CF0-08) links here once integrated.
 */
const RegisterPage = () => (
  <main className="flex min-h-screen flex-col bg-[var(--surface)] text-[var(--ink)] antialiased">
    <a
      className="absolute left-4 top-[-3rem] z-[200] inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white transition-[top] duration-150 ease-out motion-reduce:transition-none focus-visible:top-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
      href="#register"
    >
      {LANDING.skipToRegister}
    </a>
    <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-raised)] px-[clamp(1.25rem,4vw,2.5rem)] py-2">
      <Link
        className="inline-flex min-h-11 items-center gap-2.5 rounded-lg font-extrabold tracking-[0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
        href="/"
        aria-label={LANDING.homeLabel}
      >
        <span className="min-w-0 wrap-anywhere">{LANDING.brandFull}</span>
      </Link>
    </header>
    <div className="flex flex-1 items-start justify-center px-5 py-2">
      <Card
        className="w-full max-w-[440px] min-w-0 gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-3 shadow-none ring-0"
        id="register"
        tabIndex={-1}
        role="region"
        aria-labelledby="register-title"
      >
        <h1
          id="register-title"
          className="mb-2 text-2xl font-extrabold leading-tight tracking-[-0.02em] wrap-anywhere"
        >
          {REGISTRATION_COPY.pageTitle}
        </h1>
        <p className="mb-3 wrap-anywhere text-[0.9375rem] leading-[1.6] text-[var(--ink-muted)]">
          {REGISTRATION_COPY.pageLead}
        </p>
        <RegistrationForm />
      </Card>
    </div>
  </main>
);

export default RegisterPage;
