"use client";

import Link from "next/link";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";

import { AccountSettings } from "../account-settings";

import styles from "./settings.module.css";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <Link href="/profile" className={styles.back}>
          {COPY.nav.backToProfile}
        </Link>
        <AccountSettings />
      </div>
    </AppShell>
  );
}
