"use client";

import { ProgramSettings } from "./program-settings";
import { LeadersPanel } from "./programs-leaders-panel";
import { hasModule, useWorkspaceTaskContext } from "./workspace-context";

export const SettingsTask = () => {
  const { program, modules, onTaskChange, onAttentionRefresh } =
    useWorkspaceTaskContext();

  return (
    <>
      <ProgramSettings
        program={program}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onTaskChange={onTaskChange}
      />
      {(program.capabilities.manage || program.capabilities.leader_assign) && (
        <LeadersPanel
          program={program}
          canManage={program.capabilities.leader_assign}
          onAttentionRefresh={onAttentionRefresh}
        />
      )}
    </>
  );
};
