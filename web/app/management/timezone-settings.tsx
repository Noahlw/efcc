import { COPY } from "@/lib/copy";

import {
  SettingsBackLink,
  SettingsDetailCard,
  SettingsDetailList,
  SettingsPill,
} from "./settings-ui";

import styles from "./management-settings.module.css";

export function TimezoneSettings() {
  return (
    <section className={styles.page} aria-labelledby="timezone-settings-title">
      <header className={styles.header}>
        <SettingsBackLink
          href="/management?module=settings"
          label={COPY.settings.settingsBackToHub}
        />
        <h1 id="timezone-settings-title" className={styles.title}>
          {COPY.settings.timezoneTitle}
        </h1>
      </header>

      <p className={styles.lead}>{COPY.settings.timezoneLead}</p>

      <div className={styles.section}>
        <SettingsDetailCard>
          <SettingsDetailList>
            <div className={styles.detailRow}>
              <span className={styles.rowCopy}>
                <span className={styles.rowLabel}>{COPY.settings.gmt8}</span>
              </span>
              <SettingsPill>{COPY.settings.gmt8Value}</SettingsPill>
            </div>
          </SettingsDetailList>
        </SettingsDetailCard>
      </div>
    </section>
  );
}
