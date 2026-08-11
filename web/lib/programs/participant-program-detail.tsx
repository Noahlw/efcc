"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- preserve the Programs status role contract */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { getParticipantProgramDetail } from "@/lib/programs/program-api";
import type {
  ParticipantProgramDetail as ParticipantProgramDetailData,
  ParticipantScheduleRule,
} from "@/lib/programs/program-api";
import { rememberDeepLink } from "@/lib/session";

import styles from "@/app/programs/programs.module.css";

export interface ParticipantProgramDetailProps {
  programId: string;
  onBack: () => void;
  canManage: boolean;
  onManagement: () => void;
}

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; detail: ParticipantProgramDetailData }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const lifecycleLabel: Record<
  ParticipantProgramDetailData["program"]["lifecycle"],
  string
> = {
  Draft: COPY.programs.detailLifecycleDraft,
  Active: COPY.programs.detailLifecycleActive,
  Archived: COPY.programs.detailLifecycleArchived,
};

const behaviorLabel: Record<
  ParticipantProgramDetailData["program"]["behavior_type"],
  string
> = {
  Recurring: COPY.programs.detailBehaviorRecurring,
  OneOff: COPY.programs.detailBehaviorOneOff,
};

const participationLabel: Record<
  ParticipantProgramDetailData["program"]["enrollment_mode"],
  string
> = {
  MemberRequest: COPY.programs.detailParticipationMemberRequest,
  ManagerOnly: COPY.programs.detailParticipationManagerOnly,
};

const eventTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function scheduleLabel(rule: ParticipantScheduleRule): string {
  if (rule.recurrence === "WEEKLY") {
    const day = COPY.programs.scheduleDays[rule.day_of_week ?? 0] ?? "";
    return `每週${day} ${rule.start_time}–${rule.end_time}`;
  }
  return `每月${rule.month_day ?? ""}日 ${rule.start_time}–${rule.end_time}`;
}

function eventIsUpcoming(startsAt: string): boolean {
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp >= Date.now();
}

export const ParticipantProgramDetail = ({
  programId,
  onBack,
  canManage,
  onManagement,
}: ParticipantProgramDetailProps) => {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const mounted = useRef(true);
  const requestId = useRef(0);
  const retryFocusPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    setState({ kind: "loading" });
    announce(COPY.programs.detailLoading);
    try {
      const detail = await getParticipantProgramDetail(programId);
      if (!mounted.current || requestId.current !== currentRequest) {
        return;
      }
      setState({ kind: "ready", detail });
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) {
        return;
      }
      if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
        return;
      }
      if (
        error instanceof RpcError &&
        (error.problem.code === "NOT_FOUND" ||
          error.problem.code === "FORBIDDEN")
      ) {
        setState({ kind: "unavailable" });
        announce(COPY.programs.detailUnavailable);
        return;
      }
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      setState({ kind: "error", message });
      announce(message);
    }
  }, [programId, router]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!retryFocusPending.current || state.kind === "loading") {
      return;
    }
    const panel = document.querySelector<HTMLElement>("#program-detail-state");
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  const retryDetail = () => {
    retryFocusPending.current = true;
    void loadDetail();
  };

  const upcomingEvents = useMemo(() => {
    if (state.kind !== "ready") {
      return [];
    }
    return state.detail.events
      .filter((event) => event.status === "Active")
      .filter((event) => eventIsUpcoming(event.starts_at))
      .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [state]);

  if (state.kind === "loading") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryState}
        tabIndex={-1}
        role="status"
        aria-busy="true"
      >
        <p>{COPY.programs.detailLoading}</p>
      </section>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryState}
        tabIndex={-1}
        role="status"
      >
        <h2 className={styles.boundaryTitle}>
          {COPY.programs.detailUnavailable}
        </h2>
        <p>{COPY.programs.detailUnavailableHint}</p>
        <button className={styles.retry} type="button" onClick={onBack}>
          {COPY.programs.detailBack}
        </button>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        id="program-detail-state"
        className={styles.boundaryError}
        tabIndex={-1}
        role="alert"
      >
        <h2 className={styles.boundaryTitle}>
          {COPY.programs.detailLoadError}
        </h2>
        <p>{state.message}</p>
        <div className={styles.programDetailActions}>
          <button className={styles.retry} type="button" onClick={retryDetail}>
            {COPY.programs.detailRetry}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onBack}
          >
            {COPY.programs.detailBack}
          </button>
        </div>
      </section>
    );
  }

  const { department, program, schedule_rules: scheduleRules } = state.detail;
  return (
    <article
      className={styles.programDetail}
      aria-labelledby="program-detail-title"
    >
      <button
        className={styles.programDetailBack}
        type="button"
        aria-label={COPY.programs.detailBack}
        onClick={onBack}
      >
        ← {COPY.programs.detailBack}
      </button>
      <header className={styles.programDetailHeader}>
        <p className={styles.programDetailEyebrow}>
          {department.name}
          {program.category ? ` · ${program.category}` : ""}
        </p>
        <h2 id="program-detail-title" className={styles.boundaryTitle}>
          {program.name}
        </h2>
      </header>

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-purpose"
      >
        <h3 id="program-detail-purpose" className={styles.programDetailHeading}>
          {COPY.programs.detailPurpose}
        </h3>
        <p className={styles.programDetailDescription}>
          {program.description ?? COPY.programs.catalogEmptyHint}
        </p>
      </section>

      <dl className={styles.programDetailFacts}>
        <div>
          <dt>{COPY.programs.detailBehavior}</dt>
          <dd>{behaviorLabel[program.behavior_type]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailLifecycle}</dt>
          <dd>{lifecycleLabel[program.lifecycle]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailParticipation}</dt>
          <dd>{participationLabel[program.enrollment_mode]}</dd>
        </div>
        <div>
          <dt>{COPY.programs.detailDepartment}</dt>
          <dd>{department.name}</dd>
        </div>
        {program.category && (
          <div>
            <dt>{COPY.programs.detailCategory}</dt>
            <dd>{program.category}</dd>
          </div>
        )}
      </dl>

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-schedule"
      >
        <h3
          id="program-detail-schedule"
          className={styles.programDetailHeading}
        >
          {COPY.programs.detailSchedule}
        </h3>
        {scheduleRules.length > 0 ? (
          <ul className={styles.programDetailList}>
            {scheduleRules.map((rule) => (
              <li key={rule.rule_id}>{scheduleLabel(rule)}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.detailScheduleNone}
          </p>
        )}
      </section>

      <section
        className={styles.programDetailSection}
        aria-labelledby="program-detail-events"
        role="region"
      >
        <h3 id="program-detail-events" className={styles.programDetailHeading}>
          {COPY.programs.detailEvents}
        </h3>
        {upcomingEvents.length > 0 ? (
          <ul className={styles.programDetailList}>
            {upcomingEvents.map((event) => (
              <li key={event.event_id} className={styles.programDetailEvent}>
                <span>{COPY.programs.detailEventTime}</span>
                <time dateTime={event.starts_at}>
                  {eventTimeFormatter.format(new Date(event.starts_at))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.programDetailMuted}>
            {COPY.programs.detailEventsNone}
          </p>
        )}
      </section>
      {canManage && (
        <div className={styles.managementEntry}>
          <div>
            <h3>{COPY.programs.managementMode}</h3>
            <p>{COPY.programs.managementLead}</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={onManagement}
          >
            {COPY.programs.enterManagement}
          </button>
        </div>
      )}
    </article>
  );
};
