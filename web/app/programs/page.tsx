"use client";

import { AppShell } from "@/lib/app-shell";
import { ProgramsManager } from "@/lib/programs/programs-manager";

import styles from "./programs.module.css";

/**
 * Programs surface (PRG-01 #197). Authenticated, cookie-only: the Worker
 * enforces capability authorization on every /api/v1/programs/* call; this
 * page renders departments, their modules, and (for Members) only the
 * server-filtered Listed programs.
 */
export default function ProgramsPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <ProgramsManager />
      </div>
    </AppShell>
  );
}
