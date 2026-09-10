"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";

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
    <>
      <Button
        type="button"
        className="min-h-11 min-w-11 w-fit rounded-[var(--screen-radius-control)] border-[var(--screen-line-strong)] bg-transparent px-4 py-2 text-[var(--screen-ink)] whitespace-normal hover:bg-[var(--screen-surface-soft)]"
        onClick={() => setSection(null)}
      >
        {COPY.programs.settingsBackToHub}
      </Button>
      <ProgramSettings
        program={program}
        section={section}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onTaskChange={onTaskChange}
      />
    </>
  );
};
