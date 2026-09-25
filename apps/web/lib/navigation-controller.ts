// Ponytail: pure controller, not a class. No framework, no deps.
// Two invariants: stale-response discard (generation counter) +
// duplicate-navigation coalescing (pending-op map).

export interface NavigationController {
  nextGeneration: () => number;
  isCurrent: (gen: number) => boolean;
  hasPending: (key: string) => boolean;
  run: <T>(
    key: string,
    fn: () => Promise<T>
  ) => { generation: number; promise: Promise<T> };
  cancelPending: (key: string) => void;
}

export function createNavigationController(): NavigationController {
  let generation = 0;
  let opCounter = 0;
  const pending = new Map<
    string,
    { promise: Promise<unknown>; op: number; gen: number }
  >();

  function nextGeneration(): number {
    generation += 1;
    return generation;
  }

  function isCurrent(gen: number): boolean {
    return gen === generation;
  }

  function hasPending(key: string): boolean {
    return pending.has(key);
  }

  function run<T>(
    key: string,
    fn: () => Promise<T>
  ): { generation: number; promise: Promise<T> } {
    const existing = pending.get(key);
    if (existing && existing.gen === generation) {
      // Ponytail: coalesce — a duplicate run within the same navigation
      // generation returns the same promise.
      return { generation, promise: existing.promise as Promise<T> };
    }
    // A pending op from an earlier navigation generation (or no pending op
    // at all) falls through: its result would be rejected by isCurrent, and
    // discarding it would leave the caller stuck in authorizing. Restart
    // under the current generation; the old op's cleanup cannot evict the
    // new entry because op ids differ.

    const gen = generation;
    opCounter += 1;
    const op = opCounter;
    const promise = (async () => {
      try {
        return await fn();
      } finally {
        // Drop the entry only if it still belongs to THIS op. A newer run
        // (even at the same generation, after cancelPending + re-run) gets
        // a distinct op id, so a late-settling old promise can never evict
        // a fresh pending entry.
        if (pending.get(key)?.op === op) {
          pending.delete(key);
        }
      }
    })();
    pending.set(key, { promise, op, gen });
    return { generation: gen, promise };
  }

  function cancelPending(key: string): void {
    pending.delete(key);
  }

  return { nextGeneration, isCurrent, hasPending, run, cancelPending };
}
