"use client";

import { AttendancePanel } from "@/lib/attendance-panel";
import { LANDING } from "@/lib/copy";

import styles from "./guest-check-in.module.css";

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
  <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand} aria-label={LANDING.homeLabel}>
        <SealMark />
        <span>{LANDING.brandFull}</span>
      </div>
    </header>
    <main>
      <AttendancePanel guest />
    </main>
  </div>
);

export default GuestCheckInPage;