import { COPY } from "@/lib/copy";

import { SettingsBackLink, SettingsRow } from "./settings-ui";

import styles from "./management-settings.module.css";

export function SettingsHub() {
  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.header}>
        <SettingsBackLink
          href="/management"
          label={COPY.settings.settingsBack}
        />
        <h1 id="settings-title" className={styles.title}>
          {COPY.settings.settingsTitle}
        </h1>
      </header>

      <div className={styles.section}>
        <ul className={`${styles.card} ${styles.list}`}>
          <li className={styles.listItem}>
            <SettingsRow
              label={COPY.settings.accountsPermissionsRow}
              description={COPY.settings.accountsPermissionsRowHint}
              showChevron
            />
          </li>
          <li className={styles.listItem}>
            <SettingsRow
              href="/management?module=checkin-settings"
              label={COPY.settings.checkinSettingsRow}
              description={COPY.settings.checkinSettingsRowHint}
            />
          </li>
          <li className={styles.listItem}>
            <SettingsRow
              href="/management?module=timezone-settings"
              label={COPY.settings.timezoneRow}
              description={COPY.settings.timezoneRowHint}
            />
          </li>
        </ul>
      </div>
    </section>
  );
}
