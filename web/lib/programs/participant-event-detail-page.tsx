"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, type MouseEventHandler } from "react";

import { rememberDeepLink } from "@/lib/session";

import { EventDetail } from "./event-detail";
import { buildProgramsHref } from "./programs-intent";
import type { ProgramsOrigin } from "./programs-intent";

function participantEventBackHref(
  programId: string,
  origin: ProgramsOrigin | undefined,
  hash: string | null | undefined
): string {
  switch (origin) {
    case "home":
      return "/home";
    case "notices":
      return "/notices";
    case "messages":
      return "/messages";
    default:
      return buildProgramsHref({
        mode: "participant",
        programId,
        origin: origin ?? "programs",
        hash,
      });
  }
}

export const ParticipantEventDetailPage = ({
  programId,
  eventId,
  origin,
  hash,
  onBack,
}: {
  programId: string;
  eventId: string;
  origin?: ProgramsOrigin;
  hash?: string | null;
  /** Boundary-owned in-place navigation for same-app route state. */
  onBack?: () => void;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const backHref = participantEventBackHref(programId, origin, hash);

  const handleBack = useCallback<MouseEventHandler<HTMLAnchorElement>>(
    (event) => {
      if (
        typeof window === "undefined" ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      if (window.history.state?.efccParent === "program-detail") {
        event.preventDefault();
        window.history.back();
        return;
      }
      if (onBack) {
        event.preventDefault();
        onBack();
        return;
      }
      event.preventDefault();
      router.replace(backHref);
    },
    [backHref, onBack, router]
  );

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
      hash={hash}
      backHref={backHref}
      backReplace
      onBack={handleBack}
      onAuthRequired={handleAuthRequired}
    />
  );
};
