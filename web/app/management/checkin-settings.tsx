import { COPY } from "@/lib/copy";

import {
  SettingsBackLink,
  SettingsDetailCard,
  SettingsDetailList,
  SettingsDetailRow,
} from "./settings-ui";

import styles from "./management-settings.module.css";

export function CheckinSettings() {
  return (
    <section className={styles.page} aria-labelledby="checkin-settings-title">
      <header className={styles.header}>
        <SettingsBackLink
          href="/management?module=settings"
          label={COPY.settings.settingsBackToHub}
        />
        <h1 id="checkin-settings-title" className={styles.title}>
          {COPY.settings.checkinTitle}
        </h1>
      </header>

      <section
        className={styles.section}
        aria-labelledby="checkin-methods-title"
      >
        <h2 id="checkin-methods-title" className={styles.sectionTitle}>
          {COPY.settings.checkinMethods}
        </h2>
        <SettingsDetailCard>
          <SettingsDetailList>
            <SettingsDetailRow
              label={COPY.settings.memberQr}
              description={COPY.settings.memberQrHint}
              value={COPY.settings.enabledBadge}
              enabled
            />
            <SettingsDetailRow
              label={COPY.settings.eventCode}
              description={COPY.settings.eventCodeHint}
              value={COPY.settings.enabledBadge}
              enabled
            />
            <SettingsDetailRow
              label={COPY.settings.assisted}
              description={COPY.settings.assistedHint}
              value={COPY.settings.enabledBadge}
              enabled
            />
          </SettingsDetailList>
        </SettingsDetailCard>
      </section>

      <section
        className={styles.section}
        aria-labelledby="checkin-window-title"
      >
        <h2 id="checkin-window-title" className={styles.sectionTitle}>
          {COPY.settings.openWindow}
        </h2>
        <SettingsDetailCard>
          <SettingsDetailList separated>
            <SettingsDetailRow
              label={COPY.settings.beforeStart}
              description={COPY.settings.beforeStartHint}
              value={COPY.settings.beforeStartValue}
            />
            <SettingsDetailRow
              label={COPY.settings.afterEnd}
              description={COPY.settings.afterEndHint}
              value={COPY.settings.afterEndValue}
            />
          </SettingsDetailList>
        </SettingsDetailCard>
      </section>
    </section>
  );
}
