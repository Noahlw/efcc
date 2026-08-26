"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { MemberPicker } from "@/lib/programs/member-picker";
import {
  assignProgramLeader,
  listProgramLeaders,
  revokeProgramLeader,
} from "@/lib/programs/program-api";
import type { Program, ProgramLeader } from "@/lib/programs/program-api";
import { hkWallDateTimeLabel } from "@/lib/programs/recurrence";

import styles from "@/app/programs/programs.module.css";

function errorMessage(err: unknown): string {
  return err instanceof RpcError
    ? errorCopyFor(err.problem.code)
    : COPY.error.networkError;
}

export const LeadersPanel = ({
  program,
  canManage,
  onAttentionRefresh,
}: {
  program: Program;
  canManage: boolean;
  onAttentionRefresh?: () => void;
}) => {
  const [leaders, setLeaders] = useState<ProgramLeader[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const load = useCallback(async () => {
    setLeaders(null);
    setActionError(null);
    try {
      const { leaders: rows } = await listProgramLeaders(program.program_id);
      if (!mounted.current) {
        return;
      }
      setLeaders(rows);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setActionError(errorMessage(error));
      setLeaders([]);
    }
  }, [program.program_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, successCopy: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        if (!mounted.current) {
          return;
        }
        onAttentionRefresh?.();
        await load();
        if (!mounted.current) {
          return;
        }
        setNotice(successCopy);
        announce(successCopy);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setActionError(errorMessage(error));
        announce(errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [load, onAttentionRefresh]
  );

  const handleAssign = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("user_id") ?? "").trim();
    if (!userId) {
      return;
    }
    event.currentTarget.reset();
    void runAction(
      () => assignProgramLeader(program.program_id, userId),
      COPY.programs.leaderAssignedNotice
    );
  };

  const handleRevoke = (userId: string) => {
    setConfirmingUserId(userId);
  };

  const confirmRevoke = (userId: string) => {
    setConfirmingUserId(null);
    void runAction(
      () => revokeProgramLeader(program.program_id, userId),
      COPY.programs.leaderRevokedNotice
    );
  };

  const headingId = `${program.program_id}-leaders-heading`;

  return (
    <section className={styles.eventsPanel} aria-labelledby={headingId}>
      {notice !== null && (
        <output className={styles.panelNotice}>{notice}</output>
      )}
      {actionError !== null && (
        <Alert className={styles.panelError} variant="destructive">
          {actionError}
        </Alert>
      )}

      <h3 id={headingId} className={styles.panelHeading}>
        {COPY.programs.leaders}
      </h3>

      {canManage && (
        <form className={styles.ruleForm} onSubmit={handleAssign}>
          <MemberPicker
            programId={program.program_id}
            name="user_id"
            label={COPY.programs.leaderUserId}
            placeholder={COPY.programs.leaderUserIdPlaceholder}
          />
          <Button type="submit" disabled={busy} className={styles.actionButton}>
            {busy ? COPY.programs.submitting : COPY.programs.assignLeader}
          </Button>
        </form>
      )}

      <ul className={styles.eventList} aria-label={COPY.programs.leaders}>
        {leaders === null ? (
          <li className={styles.emptyLine} aria-live="polite">
            {COPY.nav.loading}
          </li>
        ) : leaders.length === 0 ? (
          <li className={styles.emptyLine}>{COPY.programs.noLeaders}</li>
        ) : (
          leaders.map((leader) => (
            <li key={leader.user_id} className={styles.eventRow}>
              <span className={styles.eventDate}>
                {leader.user_name ?? leader.user_id}
                {leader.username ? ` (${leader.username})` : ""}
              </span>
              <Badge className={styles.eventSource} variant="outline">
                {hkWallDateTimeLabel(leader.granted_at)}
              </Badge>
              {canManage &&
                (confirmingUserId === leader.user_id ? (
                  <div className={styles.confirmRow}>
                    <span>{COPY.programs.confirmRevokeLeader}</span>
                    <Button
                      type="button"
                      disabled={busy}
                      className={styles.dangerButton}
                      onClick={() => confirmRevoke(leader.user_id)}
                    >
                      {COPY.programs.confirmRevoke}
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      className={styles.toggle}
                      onClick={() => setConfirmingUserId(null)}
                    >
                      {COPY.programs.cancelRevoke}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    disabled={busy}
                    className={styles.actionButton}
                    onClick={() => handleRevoke(leader.user_id)}
                  >
                    {COPY.programs.revokeLeader}
                  </Button>
                ))}
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
