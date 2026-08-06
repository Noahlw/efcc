"use client";

import { ApprovalQueue } from "@/lib/approval-queue";

const FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Helvetica Neue", Arial, sans-serif';

/**
 * Teacher/Admin registration approval queue page (AUTH-05 #163). Protected on
 * the client (401/403 for non-Admin/Teacher callers) and enforced by the
 * Worker's role check on GET /api/v1/auth/registrations.
 */
export default function RegistrationsPage() {
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
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "3rem 1.25rem" }}>
        <ApprovalQueue />
      </div>
    </main>
  );
}