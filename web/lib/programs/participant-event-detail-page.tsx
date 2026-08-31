"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { rememberDeepLink } from "@/lib/session";

import { EventDetail } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsOrigin } from "./programs-intent";

export const ParticipantEventDetailPage = ({
  programId,
  eventId,
  origin,
}: {
  programId: string;
  eventId: string;
  origin?: ProgramsOrigin;
}) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleBack = useCallback(() => {
    const hasInternalHistory =
      typeof window !== "undefined" &&
      window.history.state?.efccParent === "program-detail";
    if (hasInternalHistory) {
      window.history.back();
      return;
    }
    if (origin === "home" || origin === "notices" || origin === "messages") {
      router.replace(
        origin === "home"
          ? "/home"
          : origin === "notices"
            ? "/notices"
            : "/messages"
      );
      return;
    }
    router.replace(
      buildProgramsHref({
        mode: "participant",
        programId,
        origin: origin ?? "programs",
      })
    );
  }, [origin, programId, router]);

  const handleAuthRequired = useCallback(() => {
    rememberDeepLink(
      `${pathname}${window.location.search}${window.location.hash}`
    );
    router.replace("/");
  }, [pathname, router]);

  return (
    <EventDetail
      programId={programId}
      eventId={eventId}
      canManage={false}
      origin={origin}
      backHref={buildProgramsHref({
        mode: "participant",
        programId,
        origin: origin ?? "programs",
      })}
      onBack={handleBack}
      onAuthRequired={handleAuthRequired}
    />
  );
};
