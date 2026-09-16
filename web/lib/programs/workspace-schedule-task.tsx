"use client";

import type { ScheduleException, ScheduleRule } from "./program-api";
import { ProgramSettings } from "./program-settings";
import { buildProgramsHref } from "./programs-intent";
import { useWorkspaceTaskContext } from "./workspace-context";
import { RecurringSchedulePanel } from "./workspace-events-task";

interface ScheduleAddonResource {
  rules: ScheduleRule[] | null;
  rulesError: string | null;
  exceptions: Record<string, ScheduleException[]>;
  scheduleMutationVersion: number;
}

const ScheduleAddon = ({
  programId,
  rules,
  exceptions,
  scheduleMutationVersion,
  onGenerated,
  onOpenEvent,
  onMutationBlockChange,
  onWorkspaceRefresh,
}: {
  programId: string;
  rules: ScheduleRule[] | null;
  exceptions: Record<string, ScheduleException[]>;
  scheduleMutationVersion: number;
  onGenerated: () => boolean | Promise<boolean>;
  onOpenEvent?: (eventId: string) => void;
  onMutationBlockChange?: (blocked: boolean) => void;
  onWorkspaceRefresh?: () => void | Promise<unknown>;
}) => (
  <RecurringSchedulePanel
    programId={programId}
    rules={rules}
    exceptions={exceptions}
    scheduleMutationVersion={scheduleMutationVersion}
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
  onGenerated: () => boolean | Promise<boolean>,
  onOpenEvent?: (eventId: string) => void,
  onMutationBlockChange?: (blocked: boolean) => void,
  onWorkspaceRefresh?: () => void | Promise<unknown>
) =>
  function renderScheduleAddon({
    rules,
    exceptions,
    scheduleMutationVersion,
  }: ScheduleAddonResource) {
    return (
      <ScheduleAddon
        programId={programId}
        rules={rules}
        exceptions={exceptions}
        scheduleMutationVersion={scheduleMutationVersion}
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
          async () => {
            if (!onWorkspaceRefresh) {
              return true;
            }
            try {
              return (await onWorkspaceRefresh()) !== undefined;
            } catch {
              return false;
            }
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
