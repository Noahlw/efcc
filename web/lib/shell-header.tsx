"use client";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import { ProgramsAttentionCenter } from "@/lib/programs/programs-attention-center";

import styles from "./auth-shell.module.css";

export const ShellHeader = () => {
  const { bootstrap, signOut } = useApp();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.title}>{COPY.appFullName}</span>
      </div>
      <div className={styles.headerActions}>
        <ProgramsAttentionCenter actorRole={bootstrap.profile.role} />
        <button type="button" className={styles.signOut} onClick={signOut}>
          {COPY.logout.submit}
        </button>
      </div>
    </header>
  );
};
