import { COPY } from "@/lib/copy";

import { SettingsBackLink, SettingsRow } from "./settings-ui";

export function SettingsHub() {
  return (
    <section
      className="mx-auto w-full max-w-[760px] min-w-0 px-4 pb-16 pt-8 text-[var(--ink)] min-[481px]:px-[clamp(1.25rem,4vw,2.75rem)]"
      aria-labelledby="settings-title"
    >
      <header className="grid gap-1">
        <SettingsBackLink
          href="/management"
          label={COPY.settings.settingsBack}
        />
        <h1
          id="settings-title"
          className="mt-1 text-[clamp(1.5rem,5.5vw,1.9rem)] font-extrabold leading-tight tracking-[-0.02em] wrap-anywhere"
        >
          {COPY.settings.settingsTitle}
        </h1>
      </header>

      <div className="mt-[1.625rem] min-w-0">
        <ul className="m-0 min-w-0 list-none overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-0 [&>li+li]:border-t [&>li+li]:border-[var(--line)]">
          <li>
            <SettingsRow
              href="/management?module=permissions&return=%2Fmanagement%3Fmodule%3Dsettings"
              label={COPY.settings.accountsPermissionsRow}
              description={COPY.settings.accountsPermissionsRowHint}
            />
          </li>
          <li>
            <SettingsRow
              href="/management?module=checkin-settings"
              label={COPY.settings.checkinSettingsRow}
              description={COPY.settings.checkinSettingsRowHint}
            />
          </li>
          <li>
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
