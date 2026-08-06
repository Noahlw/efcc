"use client";

import Link from "next/link";

import { ApprovalQueue } from "@/lib/approval-queue";

import styles from "../auth.module.css";

/**
 * Teacher/Admin registration approval queue page (AUTH-05 #163). Protected on
 * the client (401/403 for non-Admin/Teacher callers) and enforced by the
 * Worker's role check on GET /api/v1/auth/registrations.
 */
export default function RegistrationsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="顯恩堂系統首頁">
          <span className={styles.seal} aria-hidden="true">
            恩
          </span>
          <span>中國基督教播道會顯恩堂</span>
        </Link>
      </header>
      <div
        className={styles.body}
        style={{ paddingTop: "clamp(1.5rem, 4vh, 2.5rem)" }}
      >
        <section
          className={styles.card}
          style={{ maxWidth: 920 }}
        >
          <ApprovalQueue />
        </section>
      </div>
    </main>
  );
}