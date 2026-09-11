"use client";

import { useState } from "react";
import type { MouseEventHandler } from "react";

import { COPY } from "@/lib/copy";
import { ScreenHeader } from "@/lib/screen-foundations";

import { ProgramSettings, SettingsHub } from "./program-settings";
import type { ProgramSettingsSection } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import { hasModule, useWorkspaceTaskContext } from "./workspace-context";

export const SettingsTask = () => {
  const { program, modules, onTaskChange, departmentId, hash } =
    useWorkspaceTaskContext();
  const [section, setSection] = useState<ProgramSettingsSection | null>(null);
  const returnHref = buildProgramsHref({
    mode: "management",
    programId: program.program_id,
    departmentId,
    task: "settings",
    hash,
  });

  const accessAvailable =
    (program.capabilities.manage || program.capabilities.leader_assign) &&
    program.capabilities.role_read === true &&
    (program.capabilities.role_assign === true ||
      program.capabilities.role_revoke === true);
  const accessHref = `/management?module=accounts&scopeKind=Program&scopeId=${encodeURIComponent(program.program_id)}&view=access&return=${encodeURIComponent(returnHref)}`;
  const scheduleHref = buildProgramsHref({
    mode: "management",
    programId: program.program_id,
    departmentId,
    task: "schedule",
    hash,
  });
  const notificationsHref = buildProgramsHref({
    mode: "management",
    departmentId,
    task: "notifications",
    hash,
  });

  const focusedTitle =
    section === "basics"
      ? COPY.programs.settingsBasics
      : section === "publishing"
        ? COPY.programs.settingsPublishing
        : section === "enrollment"
          ? COPY.programs.settingsEnrollment
          : section === "attendance"
            ? COPY.programs.settingsAttendance
            : COPY.programs.schedulePageTitle;
  const focusedLead =
    section === "basics"
      ? COPY.programs.settingsBasicsLead
      : section === "publishing"
        ? COPY.programs.settingsPublishingLead
        : section === "enrollment"
          ? COPY.programs.settingsEnrollmentLead
          : section === "attendance"
            ? COPY.programs.settingsAttendanceLead
            : COPY.programs.schedulePageLead;
  const handleFocusedBack: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setSection(null);
  };

  return section === null ? (
    <SettingsHub
      program={program}
      eventsEnabled={hasModule(modules, "events")}
      attendanceEnabled={hasModule(modules, "attendance")}
      onSelect={setSection}
      accessHref={accessAvailable ? accessHref : undefined}
      scheduleHref={scheduleHref}
      notificationsHref={notificationsHref}
    />
  ) : (
    <section
      className="grid min-w-0 gap-[var(--screen-section-gap)]"
      aria-labelledby="program-settings-focused-title"
    >
      <ScreenHeader
        level="child"
        title={focusedTitle}
        lead={focusedLead}
        headingId="program-settings-focused-title"
        backHref={returnHref}
        backLabel={COPY.programs.settingsBackToHub}
        backReplace
        onBack={handleFocusedBack}
      />
      <ProgramSettings
        program={program}
        section={section}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onTaskChange={onTaskChange}
        showHeading={false}
      />
    </section>
  );
};
