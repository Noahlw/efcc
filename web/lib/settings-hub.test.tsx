import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { CheckinSettings } from "@/app/management/checkin-settings";
import { SettingsHub } from "@/app/management/settings-hub";
import { TimezoneSettings } from "@/app/management/timezone-settings";
import { COPY } from "@/lib/copy";

/**
 * 084-04 (#311 / spec 084 US 24-26) — System Settings hub.
 *
 * Acceptance trace `.scratch/prototype-port-2026/acceptance-traces/084-04-settings-hub.md`:
 * exactly three rows in the locked order, 簽到設定 / 時區 navigate to the locked
 * routes, 帳戶與權限 links to the 087-03 permissions matrix
 * (/management?module=permissions), and both informational screens are pure
 * read-only displays — the no-form regression is asserted per screen. Copy
 * strings are asserted via COPY.settings (centralized copy is the single
 * source; no hardcoded text in components).
 */

afterEach(() => {
  cleanup();
});

const SETTINGS = COPY.settings;

/** Assert `first` appears before `second` in document order (locked row order). */
function expectBefore(first: HTMLElement, second: HTMLElement) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
}

/** No editable form controls anywhere on the screen. */
function expectNoFormElements() {
  expect(document.querySelector("form, input, select, textarea")).toBeNull();
}

describe(SettingsHub, () => {
  test("renders exactly three rows in the locked order with the locked descriptions", () => {
    render(<SettingsHub />);

    expect(
      screen.getByRole("heading", { name: SETTINGS.settingsTitle })
    ).toBeInTheDocument();

    const rows = [
      screen.getByText(SETTINGS.accountsPermissionsRow),
      screen.getByText(SETTINGS.checkinSettingsRow),
      screen.getByText(SETTINGS.timezoneRow),
    ];
    expect(rows).toHaveLength(3);

    expect(
      screen.getByText(SETTINGS.accountsPermissionsRowHint)
    ).toBeInTheDocument();
    expect(
      screen.getByText(SETTINGS.checkinSettingsRowHint)
    ).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.timezoneRowHint)).toBeInTheDocument();

    expectBefore(rows[0], rows[1]);
    expectBefore(rows[1], rows[2]);
    expect(
      document.querySelectorAll('[data-slot="settings-row"]')
    ).toHaveLength(3);
  });

  test("簽到設定 and 時區 rows link to the locked routes", () => {
    render(<SettingsHub />);

    const checkinRow = screen.getByRole("link", {
      name: new RegExp(SETTINGS.checkinSettingsRow),
    });
    expect(checkinRow).toHaveAttribute(
      "href",
      "/management?module=checkin-settings"
    );

    const timezoneRow = screen.getByRole("link", {
      name: new RegExp(SETTINGS.timezoneRow),
    });
    expect(timezoneRow).toHaveAttribute(
      "href",
      "/management?module=timezone-settings"
    );
  });

  test("帳戶與權限 row links to the 087-03 permissions matrix", () => {
    render(<SettingsHub />);

    expect(
      screen.getByText(SETTINGS.accountsPermissionsRow)
    ).toBeInTheDocument();
    expect(
      screen.getByText(SETTINGS.accountsPermissionsRowHint)
    ).toBeInTheDocument();

    // 087-03 wires the row: it navigates to the real permissions screen.
    const permissionsRow = screen.getByRole("link", {
      name: new RegExp(SETTINGS.accountsPermissionsRow),
    });
    expect(permissionsRow).toHaveAttribute(
      "href",
      "/management?module=permissions&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
  });

  test("hub back action returns to the management directory", () => {
    render(<SettingsHub />);

    const back = screen.getByRole("link", { name: SETTINGS.settingsBack });
    expect(back).toHaveAttribute("href", "/management");
  });
});

describe(CheckinSettings, () => {
  test("renders the three enabled check-in methods and two fixed window durations", () => {
    render(<CheckinSettings />);

    expect(
      screen.getByRole("heading", { name: SETTINGS.checkinTitle })
    ).toBeInTheDocument();

    // 簽到方式: three method rows, all 已啟用.
    expect(
      screen.getByRole("heading", { name: SETTINGS.checkinMethods })
    ).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.memberQr)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.memberQrHint)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.eventCode)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.eventCodeHint)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.assisted)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.assistedHint)).toBeInTheDocument();
    expect(screen.getAllByText(SETTINGS.enabledBadge)).toHaveLength(3);

    // 開放時段: two read-only duration rows with the fixed values.
    expect(
      screen.getByRole("heading", { name: SETTINGS.openWindow })
    ).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.beforeStart)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.beforeStartHint)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.beforeStartValue)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.afterEnd)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.afterEndHint)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.afterEndValue)).toBeInTheDocument();
  });

  test("is a pure read-only screen — no form controls anywhere", () => {
    render(<CheckinSettings />);
    expectNoFormElements();
  });

  test("back action returns to the settings hub", () => {
    render(<CheckinSettings />);

    const back = screen.getByRole("link", { name: SETTINGS.settingsBackToHub });
    expect(back).toHaveAttribute("href", "/management?module=settings");
  });
});

describe(TimezoneSettings, () => {
  test("renders the lead and the read-only GMT+8 row", () => {
    render(<TimezoneSettings />);

    expect(
      screen.getByRole("heading", { name: SETTINGS.timezoneTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.timezoneLead)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.gmt8)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.gmt8Value)).toBeInTheDocument();
  });

  test("is a pure read-only screen — no form controls anywhere", () => {
    render(<TimezoneSettings />);
    expectNoFormElements();
  });

  test("back action returns to the settings hub", () => {
    render(<TimezoneSettings />);

    const back = screen.getByRole("link", { name: SETTINGS.settingsBackToHub });
    expect(back).toHaveAttribute("href", "/management?module=settings");
  });
});
