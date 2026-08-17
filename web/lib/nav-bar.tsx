"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useApp } from "@/lib/app-context";
import { COPY } from "@/lib/copy";

const SAFE_SECTION_KEY = /^[a-z0-9_-]+$/iu;

function sectionHref(key: string): string {
  return SAFE_SECTION_KEY.test(key) ? `/${key}` : "/home";
}

function SectionIcon({ sectionKey }: { sectionKey: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  switch (sectionKey) {
    case "home": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m3.5 10.5 8.5-7 8.5 7" />
          <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
        </svg>
      );
    }
    case "programs": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3M8 17h5" />
        </svg>
      );
    }
    case "scanner": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />
          <path d="M8 12h8" />
        </svg>
      );
    }
    case "notices": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 7h-15c0-1.5 2-2 2-7Z" />
          <path d="M10 20h4" />
        </svg>
      );
    }
    case "management": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M9 6V4h6v2M8 11h8M8 15h5" />
        </svg>
      );
    }
    case "profile": {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.6-3.3 3-5 7-5s6.4 1.7 7 5" />
        </svg>
      );
    }
    default: {
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
    }
  }
}

function NavigationLinks({
  navigation,
  activeIndex,
}: {
  navigation: ReturnType<typeof useApp>["bootstrap"]["navigation"];
  activeIndex: number;
}) {
  return navigation.map((section, index) => (
    <Link
      key={`${section.key}-${index}`}
      href={sectionHref(section.key)}
      className={`nav-item${section.key === "scanner" ? " nav-item--scanner" : ""}`}
      aria-current={index === activeIndex ? "page" : undefined}
    >
      <span className="nav-icon">
        <SectionIcon sectionKey={section.key} />
      </span>
      {section.label}
    </Link>
  ));
}

export function NavBar() {
  const { bootstrap } = useApp();
  const pathname = usePathname();

  // Navigation is a server projection separate from authorization sections.
  // Stable links may lead to a deferred/forbidden surface; this component
  // never derives destinations from the profile role or section presence.
  // Prefix-aware: /profile/settings (and future sub-routes) still highlight
  // the owning section (review P2 aria-current finding).
  const current = pathname?.replace(/^\/+/u, "").split("/")[0] ?? "";
  const activeIndex = bootstrap.navigation.findIndex(
    (section) => section.key === current
  );
  return (
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        <NavigationLinks
          navigation={bootstrap.navigation}
          activeIndex={activeIndex}
        />
      </nav>
      <nav aria-label={COPY.nav.label} className="nav-desktop">
        <NavigationLinks
          navigation={bootstrap.navigation}
          activeIndex={activeIndex}
        />
      </nav>
    </>
  );
}
