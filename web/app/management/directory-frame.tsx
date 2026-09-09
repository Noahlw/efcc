"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const directoryFrameVariants = cva(
  "mx-auto min-w-0 w-full px-[var(--space-4)] pt-[var(--space-6)] pb-[var(--space-9)]",
  {
    variants: {
      width: {
        wide: "max-w-[1180px]",
        compact: "max-w-[760px]",
      },
      content: {
        list: "",
        detail: "max-[799px]:pb-[var(--space-8)]",
      },
    },
    compoundVariants: [
      {
        width: "wide",
        content: "detail",
        class: "min-[1024px]:px-[var(--space-6)]",
      },
    ],
    defaultVariants: {
      width: "wide",
      content: "list",
    },
  }
);

type DirectoryFrameVariants = VariantProps<typeof directoryFrameVariants>;

export type DirectoryFrameState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "forbidden";

export interface DirectorySelection {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export interface DirectoryVirtualization {
  /** Number of rows a virtualized caller should render outside the viewport. */
  overscan?: number;
  /** Optional range callback for a caller-owned virtualized list. */
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
}

export interface DirectoryFrameFocus {
  /** Focus target for loading, empty, error, or forbidden slots. */
  stateRef?: RefObject<HTMLElement | null>;
  /** Focus target for the list heading after a successful retry. */
  resultsRef?: RefObject<HTMLElement | null>;
  /** Focus target for the selected detail slot. */
  detailRef?: RefObject<HTMLElement | null>;
  /** Increment when a list retry starts so the frame can restore focus. */
  retryKey?: number | string;
  /** Change when a selected detail moves between loading, error, and ready. */
  detailKey?: number | string | null;
}

export interface DirectoryFramePagination {
  hasMore: boolean;
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  retryLabel?: string;
  onLoadMore: () => void;
  onRetry?: () => void;
  error?: ReactNode;
}

export interface DirectoryListSlotContext {
  selection: DirectorySelection;
  virtualization: DirectoryVirtualization;
}

export type DirectoryListSlot =
  | ReactNode
  | ((context: DirectoryListSlotContext) => ReactNode);

export interface DirectoryFrameProps extends DirectoryFrameVariants {
  ariaLabelledBy?: string;
  className?: string;
  header: ReactNode;
  search: ReactNode;
  filter?: ReactNode;
  desktopFilters?: ReactNode;
  filterSheet?: ReactNode;
  state?: DirectoryFrameState;
  loading?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  forbidden?: ReactNode;
  list?: DirectoryListSlot;
  hasResults?: boolean;
  detail?: ReactNode;
  hasDetail?: boolean;
  selection?: DirectorySelection;
  pagination?: DirectoryFramePagination;
  virtualization?: DirectoryVirtualization;
  focus?: DirectoryFrameFocus;
  children?: ReactNode;
}

const Pagination = ({
  pagination,
}: {
  pagination: DirectoryFramePagination;
}) => {
  const handleRetry = pagination.onRetry;
  const handleLoadMore = pagination.onLoadMore;

  if (!pagination.hasMore && !pagination.error) {
    return null;
  }

  return (
    <div
      className="mt-[var(--space-3)] grid justify-items-center gap-[var(--space-2)]"
      data-directory-pagination
    >
      {pagination.error && (
        <div
          aria-live="assertive"
          className="grid w-full gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--error-border)] bg-[var(--error-surface)] p-[var(--space-3)] text-[var(--ink)]"
          role="alert"
        >
          <div className="min-w-0 wrap-anywhere text-sm">
            {pagination.error}
          </div>
          {handleRetry && (
            <Button
              className="min-h-11 w-fit border-[var(--accent)] bg-[var(--accent)] px-4 font-extrabold text-white hover:bg-[var(--accent-deep)]"
              onClick={handleRetry}
              type="button"
            >
              {pagination.retryLabel ?? "重試連接"}
            </Button>
          )}
        </div>
      )}
      {pagination.hasMore && (
        <Button
          className="min-h-11 border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 font-bold text-[var(--ink)] hover:bg-[var(--surface)]"
          disabled={pagination.loading}
          onClick={handleLoadMore}
          type="button"
          variant="outline"
        >
          {pagination.loading
            ? (pagination.loadingLabel ?? pagination.label)
            : pagination.label}
        </Button>
      )}
    </div>
  );
};

/**
 * Shared responsive composition for management directories. Route adapters
 * provide every slot and retain their own data and action decisions; this frame
 * only coordinates placement and state focus.
 */
// oxlint-disable-next-line eslint/complexity -- the generic frame renders its finite state and slot matrix without domain branching.
export const DirectoryFrame = ({
  ariaLabelledBy,
  className,
  content,
  desktopFilters,
  detail,
  empty,
  error,
  filter,
  filterSheet,
  forbidden,
  focus,
  hasDetail: hasDetailProp,
  hasResults: hasResultsProp,
  header,
  list,
  loading,
  pagination,
  search,
  selection: selectionProp,
  state = "ready",
  virtualization: virtualizationProp,
  width,
  children,
}: DirectoryFrameProps) => {
  const selectedId = selectionProp?.selectedId ?? null;
  const hasDetail = hasDetailProp ?? selectedId !== null;
  const hasResults = hasResultsProp ?? Boolean(list);
  const showList = state === "ready" && hasResults && list !== undefined;
  const showEmpty = state === "empty" && !hasDetail;
  const showWorkspace = showList || hasDetail;
  const selection =
    selectionProp ??
    ({
      selectedId: null,
      onSelect: () => {},
    } satisfies DirectorySelection);
  const virtualization = virtualizationProp ?? {};
  const frameStateSlot =
    state === "loading"
      ? loading
      : state === "empty"
        ? empty
        : state === "error"
          ? error
          : state === "forbidden"
            ? forbidden
            : undefined;
  const shouldRenderState =
    state === "loading" ||
    state === "error" ||
    state === "forbidden" ||
    showEmpty;

  const retryPending = useRef(false);
  const previousRetryKey = useRef(focus?.retryKey);
  const previousSelectedId = useRef(selectedId);
  const previousDetailKey = useRef(focus?.detailKey);

  const stateRef = focus?.stateRef;
  const resultsRef = focus?.resultsRef;
  const detailRef = focus?.detailRef;
  const retryKey = focus?.retryKey;
  const detailKey = focus?.detailKey;

  useEffect(() => {
    const retryStarted = retryKey !== previousRetryKey.current;
    previousRetryKey.current = retryKey;
    if (retryStarted) {
      retryPending.current = true;
    }
    if (!retryPending.current || state === "loading") {
      return;
    }
    const target = state === "ready" && hasResults ? resultsRef : stateRef;
    target?.current?.focus();
    retryPending.current = false;
  }, [hasResults, resultsRef, retryKey, state, stateRef]);

  useEffect(() => {
    if (
      selectedId === previousSelectedId.current &&
      detailKey === previousDetailKey.current
    ) {
      return;
    }
    previousSelectedId.current = selectedId;
    previousDetailKey.current = detailKey;
    if (selectedId !== null) {
      detailRef?.current?.focus();
    }
  }, [detailKey, detailRef, selectedId]);

  return (
    <section
      aria-busy={state === "loading"}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        directoryFrameVariants({
          className,
          content: hasDetail ? "detail" : content,
          width,
        })
      )}
      data-directory-frame
      data-directory-state={state}
    >
      {header}

      <div
        className="mt-[var(--space-5)] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-[var(--space-3)] min-[800px]:grid-cols-[minmax(220px,1fr)_minmax(0,1.35fr)]"
        data-directory-controls
      >
        <div className="min-w-0">{search}</div>
        {filter && <div className="min-[800px]:hidden">{filter}</div>}
        {desktopFilters && (
          <div className="hidden min-w-0 gap-[var(--space-3)] min-[800px]:grid min-[800px]:grid-cols-3">
            {desktopFilters}
          </div>
        )}
      </div>

      {filterSheet}

      {shouldRenderState && frameStateSlot && (
        <div data-directory-state-slot>{frameStateSlot}</div>
      )}

      {showWorkspace && (
        <div
          className="mt-[var(--space-5)] grid min-w-0 gap-[var(--space-4)] min-[800px]:grid-cols-1 min-[1024px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[1024px]:items-start"
          data-directory-selected={hasDetail || undefined}
          data-directory-workspace
        >
          {showList && (
            <div
              className={cn("min-w-0", hasDetail && "max-[799px]:hidden")}
              data-directory-list
            >
              {typeof list === "function"
                ? list({ selection, virtualization })
                : list}
              {pagination && <Pagination pagination={pagination} />}
            </div>
          )}
          {hasDetail && (
            <div
              className="min-w-0 min-[1024px]:sticky min-[1024px]:top-[88px]"
              data-directory-detail
            >
              {detail}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
};
