"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RpcError } from "@/lib/api";
import { ContextualTaskHeader } from "@/lib/contextual-task-header";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { searchManagementMembers } from "@/lib/programs/program-api";
import type { MemberDirectoryMember } from "@/lib/programs/program-api";
import { useAsyncResource } from "@/lib/programs/use-async-resource";
import { rememberDeepLink } from "@/lib/session";

import { DirectoryFrame } from './directory-frame';
import type { DirectoryFrameState } from './directory-frame';
import { safeManagementReturnHref } from "./management-action-framework";

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 20;
const MEMBERS = COPY.managementMembers;
const MEMBER_INPUT_CLASS =
  "h-12 min-h-12 w-full min-w-0 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-base text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--focus)]/30";
const MEMBER_STATE_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-4)] text-[var(--ink-muted)]";
const MEMBER_ERROR_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--error-border)] bg-[var(--error-surface)] p-[var(--space-4)] text-[var(--ink)]";
const MEMBER_EMPTY_CLASS =
  "mt-[var(--space-4)] grid min-w-0 gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-4)] text-center text-[var(--ink-muted)]";
const MEMBER_DETAIL_CLASS =
  "min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-[var(--space-5)] text-[var(--ink)]";
const MEMBER_FIELD_CLASS = "grid min-w-0 gap-2";
const MEMBER_FIELD_LABEL_CLASS = "font-bold leading-6 text-[var(--ink)]";

type DirectoryState =
  | { kind: "idle"; members: MemberDirectoryMember[] }
  | { kind: "loading"; members: MemberDirectoryMember[] }
  | { kind: "ready"; members: MemberDirectoryMember[] }
  | {
      kind: "error";
      failure: "forbidden" | "error";
      message: string;
    };

function memberErrorMessage(error: unknown): string {
  if (!(error instanceof RpcError)) {
    return MEMBERS.loadError;
  }
  const { code, detail, status } = error.problem;
  if (code === "FORBIDDEN") {
    return MEMBERS.forbidden;
  }
  if (
    code === "INTERNAL" ||
    code === "INTERNAL_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "UNAVAILABLE" ||
    code === "MALFORMED_RESPONSE" ||
    code === "MALFORMED_REQUEST"
  ) {
    return MEMBERS.loadError;
  }
  return errorCopyFor(status === 404 ? "NOT_FOUND" : code, detail);
}

function isAuthRequired(error: unknown): error is RpcError {
  return error instanceof RpcError && error.problem.code === "AUTH_REQUIRED";
}

function MemberLoadingState({
  stateRef,
}: {
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <output
      ref={(node) => {
        stateRef.current = node;
      }}
      aria-busy="true"
      aria-live="polite"
      className={MEMBER_STATE_CLASS}
      tabIndex={-1}
    >
      {MEMBERS.loading}
    </output>
  );
}

function MemberErrorState({
  message,
  onRetry,
  stateRef,
}: {
  message: string;
  onRetry: () => void;
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={(node) => {
        stateRef.current = node;
      }}
      className={MEMBER_ERROR_CLASS}
      role="alert"
      tabIndex={-1}
    >
      <h2 className="m-0 text-base font-extrabold">{message}</h2>
      <Button
        className="min-h-11 w-fit border-[var(--accent)] bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
        onClick={onRetry}
        type="button"
      >
        {MEMBERS.retry}
      </Button>
    </section>
  );
}

function MemberEmptyState({
  stateRef,
}: {
  stateRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <output
      ref={(node) => {
        stateRef.current = node;
      }}
      aria-live="polite"
      className={MEMBER_EMPTY_CLASS}
      tabIndex={-1}
    >
      <strong className="font-extrabold text-[var(--ink)]">
        {MEMBERS.noResults}
      </strong>
      <span className="wrap-anywhere">{MEMBERS.emptyHint}</span>
    </output>
  );
}

export const MemberDirectoryPanel = () => {
  const router = useRouter();
  const stateRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemberDirectoryMember | null>(null);
  const [listRetryKey, setListRetryKey] = useState(0);

  const memberResource = useAsyncResource<
    { members: MemberDirectoryMember[] },
    DirectoryState
  >(
    async () => {
      const normalizedQuery = query.trim();
      if (normalizedQuery.length < MIN_QUERY_LENGTH) {
        return { members: [] };
      }
      return searchManagementMembers(normalizedQuery, {
        limit: SEARCH_LIMIT,
      });
    },
    {
      toLoading: () =>
        query.trim().length < MIN_QUERY_LENGTH
          ? { kind: "idle", members: [] }
          : { kind: "loading", members: [] },
      toReady: (data) =>
        query.trim().length < MIN_QUERY_LENGTH
          ? { kind: "idle", members: [] }
          : { kind: "ready", members: data.members },
      onError: (error) => ({
        kind: "error",
        failure:
          error instanceof RpcError && error.problem.code === "FORBIDDEN"
            ? "forbidden"
            : "error",
        message: memberErrorMessage(error),
      }),
      announceLoading:
        query.trim().length >= MIN_QUERY_LENGTH ? MEMBERS.loading : undefined,
      announceReady: (data) =>
        query.trim().length >= MIN_QUERY_LENGTH && data.members.length === 0
          ? MEMBERS.noResults
          : undefined,
      isAuthRequired,
      onAuthRequired: () => {
        rememberDeepLink(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
        router.replace("/");
      },
    },
    [query, router]
  );

  const {state} = memberResource;
  const members = state.kind === "ready" ? state.members : [];
  const hasResults = members.length > 0;
  const frameState: DirectoryFrameState =
    state.kind === "error"
      ? state.failure
      : state.kind === "ready" && !hasResults
        ? "empty"
        : state.kind;
  const returnHref = safeManagementReturnHref(
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("return"),
    "/management"
  );

  useEffect(() => {
    void memberResource.run();
  }, [memberResource.run]);

  useEffect(() => {
    setSelected(null);
  }, [query]);

  const retry = () => {
    setListRetryKey((key) => key + 1);
    memberResource.retry();
  };

  return (
    <DirectoryFrame
      ariaLabelledBy="member-directory-title"
      detail={
        selected ? (
          <article
            ref={(node) => {
              detailRef.current = node;
            }}
            aria-labelledby="member-directory-detail-title"
            className={MEMBER_DETAIL_CLASS}
            tabIndex={-1}
          >
            <h2
              className="m-0 text-[1.1rem] font-extrabold leading-6"
              id="member-directory-detail-title"
            >
              {MEMBERS.memberDetail}
            </h2>
            <p className="m-0 mt-3 wrap-anywhere text-[1.4rem] font-extrabold leading-7">
              {selected.name}
            </p>
            <dl className="mt-5 grid min-w-0 gap-3">
              <div className="grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] gap-3 text-sm leading-6 max-[479px]:grid-cols-[minmax(4.5rem,5.5rem)_minmax(0,1fr)]">
                <dt className="text-[var(--ink-muted)]">
                  {MEMBERS.memberContact}
                </dt>
                <dd className="m-0 min-w-0 wrap-anywhere font-semibold text-[var(--ink)]">
                  <span className="mb-0.5 block text-xs font-normal text-[var(--ink-muted)]">
                    {MEMBERS.detailPhone}
                  </span>
                  {selected.phone ?? MEMBERS.detailUnavailable}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] gap-3 text-sm leading-6 max-[479px]:grid-cols-[minmax(4.5rem,5.5rem)_minmax(0,1fr)]">
                <dt className="text-[var(--ink-muted)]">
                  {MEMBERS.memberRole}
                </dt>
                <dd className="m-0 min-w-0 wrap-anywhere font-semibold text-[var(--ink)]">
                  {selected.role}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] gap-3 text-sm leading-6 max-[479px]:grid-cols-[minmax(4.5rem,5.5rem)_minmax(0,1fr)]">
                <dt className="text-[var(--ink-muted)]">
                  {MEMBERS.detailStatus}
                </dt>
                <dd className="m-0 min-w-0 wrap-anywhere font-semibold text-[var(--ink)]">
                  {selected.status}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] gap-3 text-sm leading-6 max-[479px]:grid-cols-[minmax(4.5rem,5.5rem)_minmax(0,1fr)]">
                <dt className="text-[var(--ink-muted)]">
                  {MEMBERS.memberDepartments}
                </dt>
                <dd className="m-0 min-w-0 wrap-anywhere font-semibold text-[var(--ink)]">
                  {selected.departments.length > 0 ? (
                    <ul className="m-0 grid gap-1 pl-4">
                      {selected.departments.map((department) => (
                        <li key={department.id}>{department.name}</li>
                      ))}
                    </ul>
                  ) : (
                    MEMBERS.noDepartments
                  )}
                </dd>
              </div>
            </dl>
          </article>
        ) : null
      }
      empty={<MemberEmptyState stateRef={stateRef} />}
      error={
        state.kind === "error" && state.failure === "error" ? (
          <MemberErrorState
            message={state.message}
            onRetry={retry}
            stateRef={stateRef}
          />
        ) : null
      }
      forbidden={
        state.kind === "error" && state.failure === "forbidden" ? (
          <MemberErrorState
            message={state.message}
            onRetry={retry}
            stateRef={stateRef}
          />
        ) : null
      }
      focus={{
        detailKey: selected?.userId ?? null,
        detailRef,
        resultsRef,
        retryKey: listRetryKey,
        stateRef,
      }}
      hasDetail={Boolean(selected)}
      hasResults={hasResults}
      header={
        <ContextualTaskHeader
          backHref={returnHref}
          backLabel={MEMBERS.backToManagement}
          headingId="member-directory-title"
          lead={MEMBERS.membersLead}
          title={MEMBERS.membersTitle}
        />
      }
      list={
        hasResults
          ? ({ selection }) => (
              <section
                aria-labelledby="member-directory-results-title"
                className="min-w-0"
              >
                <h2
                  ref={(node) => {
                    resultsRef.current = node;
                  }}
                  className="m-0 mb-2 wrap-anywhere text-base font-extrabold outline-none"
                  id="member-directory-results-title"
                  tabIndex={-1}
                >
                  {MEMBERS.membersTitle}
                </h2>
                <ul
                  aria-label={MEMBERS.membersTitle}
                  className="m-0 min-w-0 list-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] p-0"
                >
                  {members.map((member) => (
                    <li
                      key={member.userId}
                      className="min-w-0 border-t border-[var(--line)] first:border-t-0"
                    >
                      <Button
                        aria-label={member.name}
                        aria-pressed={selection.selectedId === member.userId}
                        className="grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-none border-0 bg-transparent px-4 py-3 text-left text-[var(--ink)] hover:bg-[var(--surface)] aria-pressed:bg-[var(--surface)]"
                        onClick={() => selection.onSelect(member.userId)}
                        type="button"
                        variant="ghost"
                      >
                        <span className="grid min-w-0 gap-1">
                          <span className="wrap-anywhere font-semibold leading-5">
                            {member.name}
                          </span>
                          <span className="wrap-anywhere text-[0.84rem] leading-5 text-[var(--ink-muted)]">
                            {member.role} ·{" "}
                            {member.departments.length > 0
                              ? member.departments
                                  .map((department) => department.name)
                                  .join("、")
                              : MEMBERS.noDepartments}
                          </span>
                        </span>
                        <svg
                          aria-hidden="true"
                          className="size-5 shrink-0 fill-none stroke-[var(--ink-muted)] stroke-[1.5]"
                          focusable="false"
                          viewBox="0 0 20 20"
                        >
                          <path
                            d="m8 5 7 7-7 7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          : undefined
      }
      loading={<MemberLoadingState stateRef={stateRef} />}
      search={
        <>
          <label
            className={MEMBER_FIELD_CLASS}
            htmlFor="member-directory-search"
          >
            <span className={MEMBER_FIELD_LABEL_CLASS}>
              {MEMBERS.searchLabel}
            </span>
            <Input
              aria-describedby="member-directory-lead"
              autoComplete="off"
              className={MEMBER_INPUT_CLASS}
              id="member-directory-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={MEMBERS.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
          <span className="sr-only" id="member-directory-lead">
            {MEMBERS.membersLead}
          </span>
        </>
      }
      selection={{
        onSelect: (id) => {
          const member = members.find((candidate) => candidate.userId === id);
          if (member) {
            setSelected(member);
            announce(member.name);
          }
        },
        selectedId: selected?.userId ?? null,
      }}
      state={frameState}
      width="compact"
    />
  );
};
