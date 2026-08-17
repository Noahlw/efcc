"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { COPY } from "@/lib/copy";
import { parseProgramsIntent } from "@/lib/programs/programs-intent";

import styles from "./auth-shell.module.css";

const PATH_TITLES: Record<string, string> = {
  "/home": COPY.appBrand,
  "/programs": COPY.sections.programs,
  "/scanner": COPY.sections.scanner,
  "/notices": COPY.sections.notices,
  "/management": COPY.sections.management,
  "/permissions": COPY.sections.permissions,
  "/profile": COPY.sections.profile,
  "/profile/settings": COPY.profile.accountSettings,
};

function titleForPath(pathname: string | null, search = ""): string {
  const path = pathname?.replace(/\/+$/u, "") || "/home";
  if (path === "/programs") {
    const intent = parseProgramsIntent(search);
    if (
      !intent.malformed &&
      intent.mode === "participant" &&
      intent.programId !== null
    ) {
      return intent.eventId
        ? COPY.programs.eventDetailTitle
        : COPY.programs.programDetailTitle;
    }
  }
  return PATH_TITLES[path] ?? COPY.appBrand;
}

export function ShellHeader() {
  const pathname = usePathname();
  let search = "";
  try {
    search = useSearchParams().toString();
  } catch {
    // Some isolated component tests mock only the pathname hook.
    search = typeof window === "undefined" ? "" : window.location.search;
  }
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.title}>{titleForPath(pathname, search)}</span>
      </div>
    </header>
  );
}
