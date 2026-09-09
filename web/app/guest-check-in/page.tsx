"use client";

import { AttendancePanel } from "@/lib/attendance-panel";
import { LANDING } from "@/lib/copy";

/** Squar-cut seal mark (恩) — same interim brand mark as the login surface. */
const SealMark = ({ size = 28 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--seal)" />
    <rect
      x="1"
      y="1"
      width="30"
      height="30"
      rx="6"
      fill="none"
      stroke="#fff"
      strokeOpacity="0.18"
    />
    <text
      x="16"
      y="22.6"
      textAnchor="middle"
      fontSize="17"
      fontWeight="800"
      fill="#fff"
      fontFamily="inherit"
    >
      恩
    </text>
  </svg>
);

/**
 * Public guest check-in deep-link (Spec 081 / ADR-0028): no auth, no shell —
 * the visitor lands on the official civic surface (seal + full church title),
 * then the check-in panel. The first impression at the church door is the
 * church itself, not a bare form.
 */
const GuestCheckInPage = () => (
  <div className="[--seal:var(--accent)] min-h-screen flex flex-col bg-[var(--surface)] text-[var(--ink)] font-sans antialiased">
    <header className="flex items-center p-[1rem_clamp(1.25rem,4vw,2.5rem)] border-b border-[var(--line)] bg-[var(--surface-raised)]">
      <a
        className="inline-flex items-center gap-[0.625rem] min-h-[44px] text-[var(--ink)] font-extrabold text-base tracking-[0.01em] no-underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-[var(--focus)] focus-visible:outline-offset-2 focus-visible:rounded-[4px] [&>svg]:rounded-[6px]"
        href="/"
        aria-label={LANDING.homeLabel}
      >
        <SealMark />
        <span>{LANDING.brandFull}</span>
      </a>
    </header>
    <main className="w-[min(100%,480px)] mx-auto min-[800px]:pt-12">
      <AttendancePanel />
    </main>
  </div>
);

export default GuestCheckInPage;
