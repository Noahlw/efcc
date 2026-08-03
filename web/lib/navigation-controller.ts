// Ponytail: pure controller, not a class. No framework, no deps.
// Two invariants: stale-response discard (generation counter) +
// duplicate-navigation coalescing (pending-op map).

export interface NavigationController {
  nextGeneration: () => number;
  isCurrent: (gen: number) => boolean;
  run: <T>(
    key: string,
    fn: () => Promise<T>
  ) => { generation: number; promise: Promise<T> };
  cancelPending: (key: string) => void;
}

export function createNavigationController(): NavigationController {
  let generation = 0;
  const pending = new Map<string, { promise: Promise<unknown>; gen: number }>();

  function nextGeneration(): number {
    generation += 1;
    return generation;
  }

  function isCurrent(gen: number): boolean {
    return gen === generation;
  }

  function run<T>(
    key: string,
    fn: () => Promise<T>
  ): { generation: number; promise: Promise<T> } {
    const existing = pending.get(key);
    if (existing) {
      // Ponytail: coalesce — duplicate nav for the same key returns the same promise
      return { generation, promise: existing.promise as Promise<T> };
    }

    const gen = generation;
    const promise = (async () => {
      try {
        return await fn();
      } finally {
        // Drop the entry only if it still belongs to this run (a newer run
        // may have replaced it after cancelPending + re-run).
        if (pending.get(key)?.gen === gen) {
          pending.delete(key);
        }
      }
    })();
    pending.set(key, { promise, gen });
    return { generation: gen, promise };
  }

  function cancelPending(key: string): void {
    pending.delete(key);
  }

  return { nextGeneration, isCurrent, run, cancelPending };
}
