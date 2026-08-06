"use client";

import Link from "next/link";

import { RegistrationForm } from "@/lib/registration-form";
import { REGISTRATION_COPY } from "@/lib/registration-copy";

import styles from "../auth.module.css";

/**
 * Self-service registration page (AUTH-05 #163). Public surface — no session
 * required. The parent landing page (CF0-08) links here once integrated.
 */
export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#register">
        跳到註冊表單
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="顯恩堂系統首頁">
          <span className={styles.seal} aria-hidden="true">
            恩
          </span>
          <span>中國基督教播道會顯恩堂</span>
        </Link>
      </header>
      <div className={styles.body}>
        <section className={styles.card} id="register" aria-labelledby="register-title">
          <h1 id="register-title" className={styles.cardTitle}>
            {REGISTRATION_COPY.pageTitle}
          </h1>
          <p className={styles.cardLead}>{REGISTRATION_COPY.pageLead}</p>
          <RegistrationForm />
        </section>
      </div>
    </main>
  );
}