import { COPY } from "@/lib/copy";

import {
  SettingsBackLink,
  SettingsDetailCard,
  SettingsDetailList,
  SettingsDetailRow,
} from "./settings-ui";

export function CheckinSettings() {
  return (
    <section
      className="mx-auto w-full max-w-[760px] min-w-0 px-4 pb-16 pt-8 text-[var(--ink)] min-[481px]:px-[clamp(1.25rem,4vw,2.75rem)]"
      aria-labelledby="checkin-settings-title"
    >
      <header className="grid gap-1">
        <SettingsBackLink
          href="/management?module=settings"
          label={COPY.settings.settingsBackToHub}
        />
        <h1
          id="checkin-settings-title"
          className="mt-1 text-[clamp(1.5rem,5.5vw,1.9rem)] font-extrabold leading-tight tracking-[-0.02em] wrap-anywhere"
        >
          {COPY.settings.checkinTitle}
        </h1>
      </header>

      <section
        className="mt-[1.625rem] min-w-0"
        aria-labelledby="checkin-methods-title"
      >
        <h2
          id="checkin-methods-title"
          className="mb-2 text-[1.1rem] font-bold leading-[1.35] wrap-anywhere"
        >
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
        className="mt-[1.625rem] min-w-0"
        aria-labelledby="checkin-window-title"
      >
        <h2
          id="checkin-window-title"
          className="mb-2 text-[1.1rem] font-bold leading-[1.35] wrap-anywhere"
        >
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
