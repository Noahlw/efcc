"use client";

import type { ScheduleRule } from "./program-api";
import { ProgramSettings } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import {
  refreshWorkspaceAfterMutation,
  useWorkspaceTaskContext,
} from "./workspace-context";
import { RecurringSchedulePanel } from "./workspace-events-task";

interface ScheduleAddonResource {
  rules: ScheduleRule[] | null;
  rulesError: string | null;
}

const ScheduleAddon = ({
  programId,
  rules,
  onGenerated,
  onOpenEvent,
  onMutationBlockChange,
  onWorkspaceRefresh,
}: {
  programId: string;
  rules: ScheduleRule[] | null;
  onGenerated: () => void;
  onOpenEvent?: (eventId: string) => void;
  onMutationBlockChange?: (blocked: boolean) => void;
  onWorkspaceRefresh?: () => void | Promise<unknown>;
}) => (
  <RecurringSchedulePanel
    programId={programId}
    rules={rules}
    // ProgramSettings already owns the rule-load alert. Reusing the same
    // resource must not render a second identical alert beside the preview
    // controls.
    rulesError={null}
    onGenerated={onGenerated}
    onOpenEvent={onOpenEvent}
    onMutationBlockChange={onMutationBlockChange}
    onWorkspaceRefresh={onWorkspaceRefresh}
  />
);
ScheduleAddon.displayName = "ScheduleAddon";

const makeScheduleAddon = (
  programId: string,
  onGenerated: () => void,
  onOpenEvent?: (eventId: string) => void,
  onMutationBlockChange?: (blocked: boolean) => void,
  onWorkspaceRefresh?: () => void | Promise<unknown>
) =>
  function renderScheduleAddon({ rules }: ScheduleAddonResource) {
    return (
      <ScheduleAddon
        programId={programId}
        rules={rules}
        onGenerated={onGenerated}
        onOpenEvent={onOpenEvent}
        onMutationBlockChange={onMutationBlockChange}
        onWorkspaceRefresh={onWorkspaceRefresh}
      />
    );
  };

/**
 * Canonical focused Schedule destination. The editor keeps the existing
 * schedule-rule API and recovery behavior while the workspace owns the route
 * and the Events/Settings entry points own navigation into it.
 */
export const ScheduleTask = () => {
  const {
    program,
    modules,
    onTaskChange,
    onWorkspaceRefresh,
    onMutationBlockChange,
    departmentId,
    hash,
  } = useWorkspaceTaskContext();
  const eventsEnabled = modules.some(
    ({ module_key, enabled }) => module_key === "events" && enabled === 1
  );

  return (
    <div className="grid min-w-0 gap-3" data-programs-schedule-task>
      <ProgramSettings
        program={program}
        section="schedule"
        showHeading={false}
        eventsEnabled={eventsEnabled}
        onTaskChange={onTaskChange}
        onReload={onWorkspaceRefresh}
        onMutationBlockChange={onMutationBlockChange}
        scheduleAddon={makeScheduleAddon(
          program.program_id,
          () => {
            void refreshWorkspaceAfterMutation(onWorkspaceRefresh);
          },
          (eventId) => onTaskChange("events", eventId),
          onMutationBlockChange,
          onWorkspaceRefresh
        )}
        scheduleBackHref={buildProgramsHref({
          mode: "management",
          programId: program.program_id,
          departmentId,
          task: "schedule",
          hash,
        })}
      />
    </div>
  );
};
