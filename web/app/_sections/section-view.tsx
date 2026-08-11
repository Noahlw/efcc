"use client";

import { GuardedSection } from "@/lib/guarded-section";
import { COPY } from "@/lib/copy";
import styles from "./section-view.module.css";

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
export function SectionView({
  sectionKey,
  title,
}: {
  sectionKey: string;
  title: string;
}) {
  const headingId = `section-${sectionKey}-title`;
  return (
    <GuardedSection sectionKey={sectionKey}>
      <section className={styles.section} aria-labelledby={headingId}>
        <header className={styles.sectionHead}>
          <h2 id={headingId} className={styles.sectionTitle}>
            {title}
          </h2>
        </header>
        <div className={styles.stateCenter}>
          <p className={styles.placeholderText}>{COPY.sections.placeholder}</p>
        </div>
      </section>
    </GuardedSection>
  );
}