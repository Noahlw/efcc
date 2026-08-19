"use client";

import { Suspense } from "react";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { MessagesPanel } from "@/lib/messages-panel";

import styles from "@/lib/notices-panel.module.css";

const MessagesPage = () => 
  (
    <AppShell>
      <Suspense
        fallback={
          <output className={styles.state} aria-busy="true">
            {COPY.home.messagesLoading}
          </output>
        }
      >
        <MessagesPanel />
      </Suspense>
    </AppShell>
  )
;

export default MessagesPage;
