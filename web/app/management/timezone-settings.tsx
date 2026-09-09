import { COPY } from "@/lib/copy";

import {
  SettingsBackLink,
  SettingsDetailCard,
  SettingsDetailList,
  SettingsPill,
} from "./settings-ui";

export function TimezoneSettings() {
  return (
    <section
      className="mx-auto w-full max-w-[760px] min-w-0 px-4 pb-16 pt-8 text-[var(--ink)] min-[481px]:px-[clamp(1.25rem,4vw,2.75rem)]"
      aria-labelledby="timezone-settings-title"
    >
      <header className="grid gap-1">
        <SettingsBackLink
          href="/management?module=settings"
          label={COPY.settings.settingsBackToHub}
        />
        <h1
          id="timezone-settings-title"
          className="mt-1 text-[clamp(1.5rem,5.5vw,1.9rem)] font-extrabold leading-tight tracking-[-0.02em] wrap-anywhere"
        >
          {COPY.settings.timezoneTitle}
        </h1>
      </header>

      <p className="mt-3 max-w-[65ch] wrap-anywhere leading-[1.6] text-[var(--ink-muted)]">
        {COPY.settings.timezoneLead}
      </p>

      <div className="mt-[1.625rem] min-w-0">
        <SettingsDetailCard>
          <SettingsDetailList>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <span className="block min-w-0 wrap-anywhere font-semibold leading-[1.35]">
                {COPY.settings.gmt8}
              </span>
              <SettingsPill>{COPY.settings.gmt8Value}</SettingsPill>
            </div>
          </SettingsDetailList>
        </SettingsDetailCard>
      </div>
    </section>
  );
}
