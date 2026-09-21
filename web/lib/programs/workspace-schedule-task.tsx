"use client";

import { useCallback, useRef, useState } from "react";

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
  onScheduleRefresh: () => Promise<boolean>;
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
  onScheduleRefresh,
  onFocusChange,
  onDirtyChange,
  scheduleDraftDiscardSignal,
  scheduleDraftFocusKey,
}: {
  programId: string;
  rules: ScheduleRule[] | null;
  exceptions: Record<string, ScheduleException[]>;
  scheduleMutationVersion: number;
  onGenerated: () => boolean | Promise<boolean>;
  onOpenEvent?: (eventId: string) => void;
  onMutationBlockChange?: (blocked: boolean) => void;
  onWorkspaceRefresh?: () => void | Promise<unknown>;
  onScheduleRefresh: () => Promise<boolean>;
  onFocusChange?: (focused: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  scheduleDraftDiscardSignal?: number;
  scheduleDraftFocusKey?: string | null;
}) => (
  <RecurringSchedulePanel
    programId={programId}
    rules={rules}
    exceptions={exceptions}
    scheduleMutationVersion={scheduleMutationVersion}
    onScheduleRefresh={onScheduleRefresh}
    onFocusedTaskDirtyChange={onDirtyChange}
    onFocusedTaskFocusChange={onFocusChange}
    scheduleDraftDiscardSignal={scheduleDraftDiscardSignal}
    scheduleDraftFocusKey={scheduleDraftFocusKey}
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
  onWorkspaceRefresh?: () => void | Promise<unknown>,
  onFocusChange?: (focused: boolean) => void,
  onDirtyChange?: (dirty: boolean) => void,
  scheduleDraftDiscardSignal?: number,
  scheduleDraftFocusKey?: string | null
) =>
  function renderScheduleAddon({
    rules,
    exceptions,
    scheduleMutationVersion,
    onScheduleRefresh,
  }: ScheduleAddonResource) {
    return (
      <ScheduleAddon
        programId={programId}
        rules={rules}
        exceptions={exceptions}
        scheduleMutationVersion={scheduleMutationVersion}
        onScheduleRefresh={onScheduleRefresh}
        onGenerated={onGenerated}
        onOpenEvent={onOpenEvent}
        onMutationBlockChange={onMutationBlockChange}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onFocusChange={onFocusChange}
        onDirtyChange={onDirtyChange}
        scheduleDraftDiscardSignal={scheduleDraftDiscardSignal}
        scheduleDraftFocusKey={scheduleDraftFocusKey}
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
    scheduleOrigin,
    scheduleEditor,
    scheduleRuleId,
    onScheduleEditorChange,
    onFocusedTaskFocusChange,
    onFocusedTaskDirtyChange,
    scheduleDraftDiscardSignal,
    scheduleDraftFocusKey,
    scheduleSettingsSection,
    settingsDraftDiscardSignal,
  } = useWorkspaceTaskContext();
  // RP2.1: workspace dirty is the union of Settings dirty and inline dirty.
  // Both children report into shared parent state; a clean Settings editor
  // must not overwrite an inline dirty draft, so union here, not last-write.
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [inlineDirty, setInlineDirty] = useState(false);
  const [settingsFocused, setSettingsFocused] = useState(false);
  const [inlineFocused, setInlineFocused] = useState(false);
  const dirtyRef = useRef(false);
  const focusedRef = useRef(false);
  const reportDirty = useCallback(
    (next: boolean) => {
      dirtyRef.current = next;
      onFocusedTaskDirtyChange?.(next);
    },
    [onFocusedTaskDirtyChange]
  );
  const reportFocused = useCallback(
    (next: boolean) => {
      focusedRef.current = next;
      onFocusedTaskFocusChange?.(next);
    },
    [onFocusedTaskFocusChange]
  );
  const handleSettingsDirtyChange = useCallback(
    (dirty: boolean) => {
      setSettingsDirty(dirty);
      if (dirty || inlineDirty) {
        reportDirty(true);
      } else {
        reportDirty(false);
      }
    },
    [inlineDirty, reportDirty]
  );
  const handleInlineDirtyChange = useCallback(
    (dirty: boolean) => {
      setInlineDirty(dirty);
      if (dirty || settingsDirty) {
        reportDirty(true);
      } else {
        reportDirty(false);
      }
    },
    [settingsDirty, reportDirty]
  );
  const handleSettingsFocusChange = useCallback(
    (focused: boolean) => {
      setSettingsFocused(focused);
      reportFocused(focused || inlineFocused);
    },
    [inlineFocused, reportFocused]
  );
  const handleInlineFocusChange = useCallback(
    (focused: boolean) => {
      setInlineFocused(focused);
      reportFocused(focused || settingsFocused);
    },
    [settingsFocused, reportFocused]
  );
  const eventsEnabled = modules.some(
    ({ module_key, enabled }) => module_key === "events" && enabled === 1
  );

  return (
    <div className="grid min-w-0 gap-3" data-programs-schedule-task>
      <ProgramSettings
        program={program}
        section={scheduleSettingsSection ?? "schedule"}
        showHeading={false}
        scheduleAddonDirty={inlineDirty}
        eventsEnabled={eventsEnabled}
        onTaskChange={onTaskChange}
        onReload={onWorkspaceRefresh}
        onMutationBlockChange={onMutationBlockChange}
        onFocusChange={handleSettingsFocusChange}
        onDirtyChange={handleSettingsDirtyChange}
        scheduleEditor={scheduleEditor}
        scheduleRuleId={scheduleRuleId}
        onScheduleEditorChange={onScheduleEditorChange}
        settingsDraftDiscardSignal={settingsDraftDiscardSignal}
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
          onWorkspaceRefresh,
          handleInlineFocusChange,
          handleInlineDirtyChange,
          scheduleDraftDiscardSignal,
          scheduleDraftFocusKey
        )}
        scheduleBackHref={buildProgramsHref({
          mode: "management",
          programId: program.program_id,
          departmentId,
          task: "schedule",
          scheduleOrigin,
          hash,
        })}
      />
    </div>
  );
};
