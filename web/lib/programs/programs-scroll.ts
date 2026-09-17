/**
 * Programs scroll memory.
 *
 * The authenticated shell scrolls inside `#shell-content` (globals.css: "the
 * sole scroll container of the authenticated shell"), so `window.scrollY` stays
 * 0 on a Programs route. Every capture and restore goes through here so the
 * value read is the one the user actually scrolled.
 *
 * Typed through `globalThis` like management-draft.ts because this module is
 * also compiled by the Worker tsconfig, which has no DOM library.
 */

const WORKSPACE_SCROLL_PREFIX = "efcc_programs_workspace_scroll:";

interface SessionStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

interface ProgramsBrowserGlobals {
  document?: { getElementById: (id: string) => { scrollTop: number } | null };
  scrollTo?: (options: { top: number; behavior: "auto" }) => void;
  scrollY?: number;
  sessionStorage?: SessionStorageLike;
}

function browser(): ProgramsBrowserGlobals {
  return globalThis as typeof globalThis & ProgramsBrowserGlobals;
}

function shellScroller(): { scrollTop: number } | null {
  try {
    return browser().document?.getElementById("shell-content") ?? null;
  } catch {
    return null;
  }
}

export function readProgramsScrollY(): number {
  const scroller = shellScroller();
  return scroller ? scroller.scrollTop : (browser().scrollY ?? 0);
}

export function restoreProgramsScrollY(scrollY: number): void {
  const scroller = shellScroller();
  if (scroller) {
    scroller.scrollTop = scrollY;
    return;
  }
  browser().scrollTo?.({ top: scrollY, behavior: "auto" });
}

/** Session-scoped list position for one Program task surface (#626 R45.1). */
export function rememberWorkspaceScroll(scope: string): void {
  try {
    browser().sessionStorage?.setItem(
      `${WORKSPACE_SCROLL_PREFIX}${scope}`,
      String(readProgramsScrollY())
    );
  } catch {
    // ponytail: scroll memory is cosmetic; a blocked storage write just skips it.
  }
}

export function consumeWorkspaceScroll(scope: string): number | null {
  try {
    const storage = browser().sessionStorage;
    if (!storage) {
      return null;
    }
    const stored = storage.getItem(`${WORKSPACE_SCROLL_PREFIX}${scope}`);
    if (stored === null) {
      return null;
    }
    storage.removeItem(`${WORKSPACE_SCROLL_PREFIX}${scope}`);
    const value = Number(stored);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
