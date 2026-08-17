"use client";

import { usePathname } from "next/navigation";

import { COPY } from "@/lib/copy";

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

function titleForPath(pathname: string | null): string {
  const path = pathname?.replace(/\/+$/u, "") || "/home";
  return PATH_TITLES[path] ?? COPY.appBrand;
}

export function ShellHeader() {
  const pathname = usePathname();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.title}>{titleForPath(pathname)}</span>
      </div>
    </header>
  );
}
