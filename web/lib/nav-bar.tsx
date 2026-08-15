"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Section } from "@/lib/api";
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

const NavigationItem = ({
  section,
  current,
  desktop,
}: {
  section: Section;
  current: string;
  desktop: boolean;
}) => {
  if (section.key === "slot4-skeleton") {
    return <div className="nav-item-skeleton" aria-hidden="true" />;
  }

  const isScan = !desktop && section.key === "scanner";
  const iconName = iconForSection(section.key);
  return (
    <Link
      href={`/${section.key}`}
      className={isScan ? "nav-item-scan" : "nav-item"}
      aria-current={section.key === current ? "page" : undefined}
    >
      <Icon name={iconName} size={isScan ? 24 : 20} />
      <span>{section.label}</span>
    </Link>
  );
};

const NavigationItems = ({
  sections,
  current,
  desktop,
}: {
  sections: Section[];
  current: string;
  desktop: boolean;
}) =>
  sections.map((section) => (
    <NavigationItem
      key={section.key}
      section={section}
      current={current}
      desktop={desktop}
    />
  ));

export const NavBar = () => {
  const { bootstrap } = useApp();
  const pathname = usePathname();
  const safePathname = pathname ?? "/home";
  const current = safePathname.replace(/^\//u, "").split("/")[0] || "home";

  return (
    <>
      <nav aria-label={COPY.nav.label} className="nav-phone">
        <NavigationItems
          sections={bootstrap.navigation}
          current={current}
          desktop={false}
        />
      </nav>
      <nav aria-label={COPY.nav.label} className="nav-desktop">
        <NavigationItems
          sections={bootstrap.navigation}
          current={current}
          desktop
        />
      </nav>
    </>
  );
};
