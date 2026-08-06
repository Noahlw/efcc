import { cleanup, render, screen } from "@testing-library/react";
import { describe, test, expect, afterEach } from "vitest";

import { SectionView } from "@/app/_sections/section-view";
import { AppProvider } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import type { Bootstrap, Section } from "@/lib/api";

const events: Section = {
  key: "events",
  label: "聚會",
  capability: "READ",
  requiresServerAuth: false,
};

afterEach(() => cleanup());

function bootstrapWith(...sections: Section[]): Bootstrap {
  return {
    sections,
    profile: {
      userId: "U-test",
      name: "測試用",
      username: "test",
      phone: "00000000",
  role: "Staff",
      status: "Active",
      qrCodeString: "qr-placeholder",
    },
  };
}

describe(SectionView, () => {
  test("renders the section heading and the truthful building-state placeholder", () => {
    render(
      <AppProvider bootstrap={bootstrapWith(events)} onSignOut={() => {}}>
        <SectionView sectionKey="events" title={COPY.sections.events} />
      </AppProvider>
    );
    expect(
      screen.getByRole("heading", { name: COPY.sections.events })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.sections.placeholder)).toBeInTheDocument();
  });

  test("exposes the section as a named landmark region", () => {
    render(
      <AppProvider bootstrap={bootstrapWith(events)} onSignOut={() => {}}>
        <SectionView sectionKey="events" title={COPY.sections.events} />
      </AppProvider>
    );
    expect(screen.getByRole("region", { name: COPY.sections.events })).toBeInTheDocument();
  });

  test("renders the forbidden view for a section absent from the bootstrap", () => {
    render(
      <AppProvider bootstrap={bootstrapWith(events)} onSignOut={() => {}}>
        <SectionView sectionKey="scanner" title={COPY.sections.scanner} />
      </AppProvider>
    );
    expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.sections.scanner })
    ).not.toBeInTheDocument();
  });

  test("renders every Ui03 section heading from centralized zh-Hant COPY", () => {
    const cases: Array<[string, string]> = [
      ["events", COPY.sections.events],
      ["scanner", COPY.sections.scanner],
      ["care", COPY.sections.care],
      ["permissions", COPY.sections.permissions],
    ];
    const ALL_SECTIONS: Section[] = [
      { key: "events", label: "聚會", capability: "READ", requiresServerAuth: false },
      { key: "scanner", label: "掃描", capability: "AUTH", requiresServerAuth: false },
      { key: "care", label: "關懷", capability: "AUTH", requiresServerAuth: false },
      { key: "permissions", label: "權限管理", capability: "AUTH", requiresServerAuth: false },
    ];
    for (const [key, title] of cases) {
      cleanup();
      render(
        <AppProvider bootstrap={bootstrapWith(...ALL_SECTIONS)} onSignOut={() => {}}>
          <SectionView sectionKey={key} title={title} />
        </AppProvider>
      );
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });
});