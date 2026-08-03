"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

export function NavBar() {
  const { bootstrap } = useApp();
  const pathname = usePathname();

  const current = pathname.replace(/^\//u, "") || "profile";

  return (
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        {bootstrap.sections.map((s) => (
          <Link
            key={s.key}
            href={`/${s.key}`}
            className="nav-item"
            aria-current={s.key === current ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <nav aria-label={COPY.nav.label} className="nav-desktop">
        {bootstrap.sections.map((s) => (
          <Link
            key={s.key}
            href={`/${s.key}`}
            className="nav-item"
            aria-current={s.key === current ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
