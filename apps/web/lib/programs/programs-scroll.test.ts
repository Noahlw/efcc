import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  clearWorkspaceScroll,
  consumeWorkspaceScroll,
  rememberWorkspaceScroll,
  readProgramsScrollY,
} from "./programs-scroll";

const scope = "program-1:participants";

describe("Programs scroll memory", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '<div id="shell-content"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  test("persists an intentional return to the top", () => {
    const scroller = document.getElementById("shell-content") as HTMLElement;
    scroller.scrollTop = 240;
    rememberWorkspaceScroll(scope, true);
    scroller.scrollTop = 0;
    rememberWorkspaceScroll(scope, true);

    expect(consumeWorkspaceScroll(scope)).toBe(0);
    expect(
      sessionStorage.getItem("efcc_programs_workspace_scroll:" + scope)
    ).toBe("0");
  });

  test("keeps a pending position until the destination restores it", () => {
    const scroller = document.getElementById("shell-content") as HTMLElement;
    scroller.scrollTop = 180;
    rememberWorkspaceScroll(scope, true);

    expect(consumeWorkspaceScroll(scope)).toBe(180);
    expect(consumeWorkspaceScroll(scope)).toBe(180);
    expect(readProgramsScrollY()).toBe(180);

    clearWorkspaceScroll(scope);
    expect(consumeWorkspaceScroll(scope)).toBeNull();
  });
});
