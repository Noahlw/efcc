"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { rememberDeepLink } from "@/lib/session";

import { EventDetail } from "./event-detail";

export function ParticipantEventDetailPage({
  programId,
  eventId,
}: {
  programId: string;
  eventId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

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
      onBack={handleBack}
      onAuthRequired={handleAuthRequired}
    />
  );
}
