"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { announce } from "@/lib/live-region";

export interface AsyncResourceOptions<T, S extends { kind: string }> {
  /** Build the loading state (initial render and every retry). */
  toLoading: () => S;
  /** Build the ready state from the fetched data. */
  toReady: (data: T) => S;
  /**
   * Classify a load failure into the site's error state. Return `null` when
   * the error is already fully handled (e.g. AUTH_REQUIRED redirected); the
   * hook then leaves the current state unchanged.
   */
  onError: (error: unknown) => S | null;
  /** aria-live message announced when a load starts. */
  announceLoading?: string;
  /** aria-live message announced when a load succeeds; `undefined` stays silent. */
  announceReady?: (data: T) => string | undefined;
  /**
   * Selector of the panel focused when a retried load settles on an error
   * (shared "focus the error panel after a failed retry" behavior). Sites
   * with a bespoke focus policy leave this out and manage focus themselves.
   */
  focusTarget?: string;
}

export interface AsyncResource<T, S extends { kind: string }> {
  state: S;
  /** Run a load; pass a `{ cancelled }` token to drop the run when it flips. */
  run: (request?: { cancelled: boolean }) => Promise<void>;
  /** Re-run the load (and focus `focusTarget` when it fails again). */
  retry: () => void;
}

/**
 * Shared async-load machinery for the Programs shell: request staleness
 * guards (mounted ref + request id + optional per-run cancellation), the
 * loading/ready/error state machine, aria-live announcements, and
 * focus-on-retry. Call sites keep their own state shapes and error
 * classification (AUTH_REQUIRED redirect vs. inline banner vs. toast).
 *
 * `deps` controls when `run` is recreated, which re-triggers a mount-load
 * effect at the call site — pass the same values the load logic used to
 * close over, e.g. `[programId]` or `[router]`. The `load` function itself
 * is always read through a ref, so only `deps` identity matters.
 */
export function useAsyncResource<T, S extends { kind: string }>(
  load: (request?: { cancelled: boolean }) => Promise<T>,
  options: AsyncResourceOptions<T, S>,
  deps: readonly unknown[] = []
): AsyncResource<T, S> {
  const [state, setState] = useState<S>(() => options.toLoading());
  const mounted = useRef(true);
  const requestId = useRef(0);
  const retryFocusPending = useRef(false);
  const loadRef = useRef(load);
  const optionsRef = useRef(options);

  useEffect(() => {
    loadRef.current = load;
    optionsRef.current = options;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (request?: { cancelled: boolean }) => {
      requestId.current += 1;
      const currentRequest = requestId.current;
      const current = optionsRef.current;
      setState(current.toLoading());
      if (current.announceLoading) {
        announce(current.announceLoading);
      }
      try {
        const data = await loadRef.current(request);
        if (
          !mounted.current ||
          request?.cancelled ||
          requestId.current !== currentRequest
        ) {
          return;
        }
        setState(current.toReady(data));
        const readyMessage = current.announceReady?.(data);
        if (readyMessage) {
          announce(readyMessage);
        }
      } catch (error) {
        if (
          !mounted.current ||
          request?.cancelled ||
          requestId.current !== currentRequest
        ) {
          return;
        }
        const outcome = current.onError(error);
        if (outcome === null) {
          return;
        }
        setState(outcome);
      }
    },
    // `deps` intentionally drives run identity (mirrors each call site's
    // previous useCallback deps); load/options are read through refs.
    deps
  );

  const retry = useCallback(() => {
    if (optionsRef.current.focusTarget) {
      retryFocusPending.current = true;
    }
    void run();
  }, [run]);

  useEffect(() => {
    if (!retryFocusPending.current || state.kind !== "error") {
      return;
    }
    const target = optionsRef.current.focusTarget;
    if (!target) {
      retryFocusPending.current = false;
      return;
    }
    const panel = document.querySelector<HTMLElement>(target);
    if (!panel) {
      return;
    }
    panel.focus();
    retryFocusPending.current = false;
  }, [state.kind]);

  return { state, run, retry };
}
