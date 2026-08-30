"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { ProgramSettings } from "./program-settings";
import { hasModule, useWorkspaceTaskContext } from "./workspace-context";

export const SettingsTask = () => {
  const { program, modules, onTaskChange } = useWorkspaceTaskContext();

  return (
    <>
      <ProgramSettings
        program={program}
        eventsEnabled={hasModule(modules, "events")}
        attendanceEnabled={hasModule(modules, "attendance")}
        onTaskChange={onTaskChange}
      />
      {(program.capabilities.manage || program.capabilities.leader_assign) && (
        <section
          className="mt-4 grid gap-2"
          aria-labelledby="identity-access-title"
        >
          <h3 id="identity-access-title" className="text-base font-bold">
            身份組指派
          </h3>
          <p className="text-sm text-muted-foreground">
            身份組指派及撤銷現由帳戶存取管理統一處理。
          </p>
          <Button asChild className="min-h-11 w-fit">
            <Link
              href={`/management?module=accounts&return=${encodeURIComponent(`/programs?program=${program.program_id}`)}`}
            >
              管理帳戶身份組
            </Link>
          </Button>
        </section>
      )}
    </>
  );
};
