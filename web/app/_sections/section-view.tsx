"use client";

import { COPY } from "@/lib/copy";
import { GuardedSection } from "@/lib/guarded-section";
/**
 * Shared Section presentation for Home and the transitional Ui03 surfaces
 * (Events, Scanner, Care, Permissions), carbonized from the accepted Minimal
 * prototype (Variant A).
 * Where no real domain RPC exists yet, each Section renders its authoritative
 * heading plus an honest building/empty state (COPY.sections.placeholder =
 * "內容建置中"). The prototype's "(Events)" / "(Scanner)" English helper suffixes
 * are NOT production copy and are intentionally omitted so the accessible heading
 * name matches the centralized COPY constant exactly.
 *
 * ponytail: this component is deliberately presentational only — it adds no
 * network calls, no route handlers, no data writes, and no scanner authority.
 * Domain surfaces will replace the building state when their RPCs land.
 */
export const SectionView = ({
  sectionKey,
  title,
}: {
  sectionKey: string;
  title: string;
}) => {
  const headingId = `section-${sectionKey}-title`;
  return (
    <GuardedSection sectionKey={sectionKey}>
      <section
        className="max-w-[760px] mx-auto p-[2rem_clamp(1.25rem,4vw,2.75rem)_4rem]"
        aria-labelledby={headingId}
      >
        <header className="flex items-baseline gap-3 pb-3 border-b border-[var(--line)] mb-8">
          <h2
            id={headingId}
            className="font-sans text-[1.5rem] font-extrabold tracking-[-0.02em] leading-[1.25] text-[var(--ink)]"
          >
            {title}
          </h2>
        </header>
        <div className="flex flex-col items-center justify-center text-center min-h-[40vh] gap-4">
          <p className="text-[var(--ink-muted)] text-base leading-[1.6]">
            {COPY.sections.placeholder}
          </p>
        </div>
      </section>
    </GuardedSection>
  );
};
