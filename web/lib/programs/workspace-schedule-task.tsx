"use client";

import type { ScheduleRule } from "./program-api";
import { ProgramSettings } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import { useWorkspaceTaskContext } from "./workspace-context";
import { RecurringSchedulePanel } from "./workspace-events-task";

interface ScheduleAddonResource {
  rules: ScheduleRule[] | null;
  rulesError: string | null;
}

const noop = (): void => {
  // Focused Schedule has no event list to refresh after generation.
};

const ScheduleAddon = ({
  programId,
  rules,
  onOpenEvent,
}: {
  programId: string;
  rules: ScheduleRule[] | null;
  onOpenEvent?: (eventId: string) => void;
}) => (
  <RecurringSchedulePanel
    programId={programId}
    rules={rules}
    // ProgramSettings already owns the rule-load alert. Reusing the same
    // resource must not render a second identical alert beside the preview
    // controls.
    rulesError={null}
    onGenerated={noop}
    onOpenEvent={onOpenEvent}
  />
);
ScheduleAddon.displayName = "ScheduleAddon";

const makeScheduleAddon = (
  programId: string,
  onOpenEvent?: (eventId: string) => void
) =>
  function renderScheduleAddon({ rules }: ScheduleAddonResource) {
    return (
      <ScheduleAddon
        programId={programId}
        rules={rules}
        onOpenEvent={onOpenEvent}
      />
    );
  };

/**
 * Canonical focused Schedule destination. The editor keeps the existing
 * schedule-rule API and recovery behavior while the workspace owns the route
 * and the Events/Settings entry points own navigation into it.
 */
export const ScheduleTask = () => {
  const { program, modules, onTaskChange, departmentId, hash } =
    useWorkspaceTaskContext();
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
        scheduleAddon={makeScheduleAddon(program.program_id, (eventId) =>
          onTaskChange("events", eventId)
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
