"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import type { IconName } from "@/lib/icons";
import { Icon } from "@/lib/icons";

const iconForSection = (key: string): IconName => {
  switch (key) {
    case "home": {
      return "home";
    }
    case "programs": {
      return "programs";
    }
    case "scanner": {
      return "scan";
    }
    case "management": {
      return "management";
    }
    case "notices": {
      return "bell";
    }
    default: {
      return "user";
    }
  }
};

export const NavBar = () => {
  const { bootstrap } = useApp();
  const pathname = usePathname();
  // Prefix-aware: /profile/settings (and future sub-routes) still highlight
  // the owning section.
  const current = pathname.replace(/^\//u, "").split("/")[0] || "home";

  return (
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        {bootstrap.navigation.map((s) => {
          const isScan = s.key === "scanner";
          const isCurrent = s.key === current;
          const iconName = iconForSection(s.key);
          return (
            <Link
              key={s.key}
              href={`/${s.key}`}
              className={isScan ? "nav-item-scan" : "nav-item"}
              aria-current={isCurrent ? "page" : undefined}
            >
              <Icon name={iconName} size={isScan ? 24 : 20} />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>
      <nav aria-label={COPY.nav.label} className="nav-desktop">
        {bootstrap.navigation.map((s) => {
          const isCurrent = s.key === current;
          const iconName = iconForSection(s.key);
          return (
            <Link
              key={s.key}
              href={`/${s.key}`}
              className="nav-item"
              aria-current={isCurrent ? "page" : undefined}
            >
              <Icon name={iconName} size={20} />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
};
