"use client";

import {
  Bell,
  Briefcase,
  CalendarDays,
  Home,
  ScanLine,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

const NavIcon = ({ section }: { section: string }) => {
  const iconProps = {
    "aria-hidden": true,
    focusable: false,
    size: 22,
    strokeWidth: 1.8,
  } as const;

  switch (section) {
    case "home": {
      return <Home {...iconProps} />;
    }
    case "programs": {
      return <CalendarDays {...iconProps} />;
    }
    case "scanner": {
      return <ScanLine {...iconProps} />;
    }
    case "notices": {
      return <Bell {...iconProps} />;
    }
    case "management": {
      return <Briefcase {...iconProps} />;
    }
    case "profile": {
      return <UserRound {...iconProps} />;
    }
    default: {
      return <UserRound {...iconProps} />;
    }
  }
};
const CANONICAL_SECTION_HREFS: Record<string, string> = {
  home: "/home",
  programs: "/programs",
  scanner: "/scanner",
  notices: "/notices",
  profile: "/profile",
  management: "/management",
};

const canonicalHrefForSection = (key: string): string =>
  CANONICAL_SECTION_HREFS[key] ?? `/${key}`;

const NavigationLink = ({
  section,
  current,
}: {
  section: { key: string; label: string };
  current: string;
}) => {
  const isScanner = section.key === "scanner";
  return (
    <Button
      asChild
      variant="ghost"
      className={`nav-item${isScanner ? " nav-item--scan" : ""}`}
    >
      <Link
        href={canonicalHrefForSection(section.key)}
        aria-current={section.key === current ? "page" : undefined}
      >
        <span className="nav-icon">
          <NavIcon section={section.key} />
        </span>
        <span className="nav-label">{section.label}</span>
      </Link>
    </Button>
  );
};

/**
 * Authenticated primary navigation (TK-04/TK-05).
 *
 * One `<nav>` landmark (`#main-navigation`) renders the server-projected
 * sections once. The phone dock and the desktop rail are the same DOM list
 * presented by the global shell CSS at the named 800px breakpoint — exactly
 * one navigation landmark for screen readers at every width. The profile
 * section doubles as the account affordance on the rail; the header carries
 * the separate account actions (bell/sign-out) so the dock keeps its five
 * server-projected slots.
 */
export const NavBar = () => {
  const { bootstrap } = useApp();
  const pathname = usePathname();

  // Navigation is a server projection separate from authorization sections.
  // Stable links may lead to a deferred/forbidden surface; this component
  // never derives destinations from the profile role or section presence.
  // Prefix-aware: /profile/settings (and future sub-routes) still highlight
  // the owning section (review P2 aria-current finding).
  const current = pathname.replace(/^\//u, "").split("/")[0] || "profile";
  return (
    <nav id="main-navigation" aria-label={COPY.nav.label} className="nav-phone">
      {bootstrap.navigation.map((section) => (
        <NavigationLink key={section.key} section={section} current={current} />
      ))}
    </nav>
  );
};
