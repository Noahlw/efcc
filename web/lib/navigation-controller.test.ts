import { describe, test, expect } from "vitest";

import { createNavigationController } from "./navigation-controller";

describe(createNavigationController, () => {
  test("nextGeneration increments and isCurrent tracks the latest", () => {
    const ctrl = createNavigationController();
    const g1 = ctrl.nextGeneration();
    expect(ctrl.isCurrent(g1)).toBeTruthy();
    const g2 = ctrl.nextGeneration();
    expect(ctrl.isCurrent(g2)).toBeTruthy();
    expect(ctrl.isCurrent(g1)).toBeFalsy();
  });

  test("run with same key coalesces — returns same promise", () => {
    const ctrl = createNavigationController();
    const deferred = Promise.withResolvers<string>();
    const r1 = ctrl.run("nav", () => deferred.promise);
    const r2 = ctrl.run("nav", () => Promise.resolve("second"));
    expect(r2.promise).toBe(r1.promise);
    expect(r2.generation).toBe(r1.generation);
  });

  test("run with different keys runs independently", () => {
    const ctrl = createNavigationController();
    const d1 = Promise.withResolvers<string>();
    const d2 = Promise.withResolvers<string>();
    const r1 = ctrl.run("a", () => d1.promise);
    const r2 = ctrl.run("b", () => d2.promise);
    expect(r1.promise).not.toBe(r2.promise);
  });

  test("cancelPending removes the pending op so next run creates fresh", () => {
    const ctrl = createNavigationController();
    const deferred = Promise.withResolvers<string>();
    const r1 = ctrl.run("nav", () => deferred.promise);
    ctrl.cancelPending("nav");
    const r2 = ctrl.run("nav", () => Promise.resolve("fresh"));
    expect(r2.promise).not.toBe(r1.promise);
  });

  test("after a completed op, a new run with same key creates fresh promise", async () => {
    const ctrl = createNavigationController();
    const r1 = ctrl.run("nav", () => Promise.resolve("done"));
    await r1.promise;
    const r2 = ctrl.run("nav", () => Promise.resolve("again"));
    expect(r2.promise).not.toBe(r1.promise);
    await expect(r2.promise).resolves.toBe("again");
  });

  test("stale-response discard: isCurrent returns false after bump", () => {
    const ctrl = createNavigationController();
    const gen = ctrl.nextGeneration();
    ctrl.nextGeneration();
    expect(ctrl.isCurrent(gen)).toBeFalsy();
  });

  test("rejected promise is cleaned up from pending map", async () => {
    const ctrl = createNavigationController();
    const r1 = ctrl.run("nav", () => Promise.reject(new Error("oops")));
    await expect(r1.promise).rejects.toThrow("oops");
    const r2 = ctrl.run("nav", () => Promise.resolve("retry"));
    await expect(r2.promise).resolves.toBe("retry");
    expect(r2.promise).not.toBe(r1.promise);
  });
});
