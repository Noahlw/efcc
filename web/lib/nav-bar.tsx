"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

const NavIcon = ({ section }: { section: string }) => {
  const common = {
    viewBox: "0 0 24 24",
    width: 22,
    height: 22,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  switch (section) {
    case "home": {
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9v11h14V9" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    }
    case "programs": {
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
          <path d="M8 14h3M13 14h3M8 17h3" />
        </svg>
      );
    }
    case "scanner": {
      return (
        <svg {...common}>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M8 9h3v3H8zM14 9h2M14 13h2M8 16h3" />
        </svg>
      );
    }
    case "notices": {
      return (
        <svg {...common}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    }
    case "management": {
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
        </svg>
      );
    }
    case "profile": {
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    }
    default: {
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
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
  CANONICAL_SECTION_HREFS[key] ?? `/${key}`
;

const NavigationLink = ({
  section,
  current,
}: {
  section: { key: string; label: string };
  current: string;
}) => {
  const isScanner = section.key === "scanner";
  return (
    <Link
      href={canonicalHrefForSection(section.key)}
      className={`nav-item${isScanner ? " nav-item--scan" : ""}`}
      aria-current={section.key === current ? "page" : undefined}
    >
      <span className="nav-icon">
        <NavIcon section={section.key} />
      </span>
      <span className="nav-label">{section.label}</span>
    </Link>
  );
};

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
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        {bootstrap.navigation.map((section) => (
          <NavigationLink
            key={section.key}
            section={section}
            current={current}
          />
        ))}
      </nav>
      <nav aria-label={COPY.nav.label} className="nav-desktop">
        <div className="nav-desktop__list">
          {bootstrap.navigation.map((section) => (
            <NavigationLink
              key={section.key}
              section={section}
              current={current}
            />
          ))}
        </div>
      </nav>
    </>
  );
};
