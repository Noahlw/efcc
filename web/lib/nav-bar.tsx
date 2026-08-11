"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

export function NavBar() {
  const { bootstrap } = useApp();
  const pathname = usePathname();

  // Navigation is a server projection separate from authorization sections.
  // Stable links may lead to a deferred/forbidden surface; this component
  // never derives destinations from the profile role or section presence.
  // Prefix-aware: /profile/settings (and future sub-routes) still highlight
  // the owning section (review P2 aria-current finding).
  const current = pathname.replace(/^\//u, "").split("/")[0] || "profile";
  return (
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        {bootstrap.navigation.map((s) => (
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
        {bootstrap.navigation.map((s) => (
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
