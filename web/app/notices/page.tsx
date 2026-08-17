"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { NoticesPanel } from "@/lib/notices-panel";

import styles from "@/lib/notices-panel.module.css";

export default function NoticesPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{COPY.sections.notices}</h1>
          <p className={styles.pageLead}>{COPY.notices.noticesLead}</p>
        </header>
        <NoticesPanel />
      </div>
    </AppShell>
  );
}
