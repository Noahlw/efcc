"use client";

import Link from "next/link";

import { LANDING } from "@/lib/copy";
import { REGISTRATION_COPY } from "@/lib/registration-copy";
import { RegistrationForm } from "@/lib/registration-form";

import styles from "../auth.module.css";

/**
 * Self-service registration page (AUTH-05 #163). Public surface — no session
 * required. The parent landing page (CF0-08) links here once integrated.
 */
const RegisterPage = () => 
  (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#register">
        {LANDING.skipToRegister}
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={LANDING.homeLabel}>
          <span>{LANDING.brandFull}</span>
        </Link>
      </header>
      <div className={styles.body}>
        <section
          className={`${styles.card} gap-0 overflow-visible border border-[var(--line)] bg-[var(--surface-raised)] p-3 shadow-none ring-0`}
          id="register"
          tabIndex={-1}
          aria-labelledby="register-title"
        >
          <h1 id="register-title" className={styles.cardTitle}>
            {REGISTRATION_COPY.pageTitle}
          </h1>
          <p className={styles.cardLead}>{REGISTRATION_COPY.pageLead}</p>
          <RegistrationForm />
        </section>
      </div>
    </main>
  )
;

export default RegisterPage;
