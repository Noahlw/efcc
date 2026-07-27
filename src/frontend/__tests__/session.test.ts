import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_EXPIRY_DAYS,
  SESSION_STORAGE_KEY,
  clearSession,
  getSession,
  setSession,
} from "../src/services/session";
import type { SessionPayload } from "../src/types";

const basePayload: SessionPayload = {
  userId: "USER-TEST-1",
  name: "Test Member",
  role: "MEMBER",
  sessionToken: "test-token-abc",
  qrCodeString: "EFCC|USER-TEST-1|1700000000",
  expiryTimestamp: 0,
};

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns null when no session is stored", () => {
    expect(getSession()).toBeNull();
  });

  it("restores a payload via setSession + getSession", () => {
    const payload: SessionPayload = {
      ...basePayload,
      expiryTimestamp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    setSession(payload);
    const restored = getSession();
    expect(restored).not.toBeNull();
    expect(restored?.userId).toBe("USER-TEST-1");
    expect(restored?.name).toBe("Test Member");
    expect(restored?.role).toBe("MEMBER");
  });
  it("carries the session token and QR code string", () => {
    const payload: SessionPayload = {
      ...basePayload,
      expiryTimestamp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    setSession(payload);
    const restored = getSession();
    expect(restored?.sessionToken).toBe("test-token-abc");
    expect(restored?.qrCodeString).toBe("EFCC|USER-TEST-1|1700000000");
  });

  it("assigns a 30-day rolling expiryTimestamp when missing", () => {
    const payload: SessionPayload = { ...basePayload, expiryTimestamp: 0 };
    setSession(payload);
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as SessionPayload;
    const expectedLowerBound =
      Date.now() + (SESSION_EXPIRY_DAYS - 1) * 24 * 60 * 60 * 1000;
    const expectedUpperBound =
      Date.now() + (SESSION_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(parsed.expiryTimestamp).toBeGreaterThan(expectedLowerBound);
    expect(parsed.expiryTimestamp).toBeLessThan(expectedUpperBound);
    expect(SESSION_EXPIRY_DAYS).toBe(30);
  });

  it("clears the session via clearSession", () => {
    setSession({
      ...basePayload,
      expiryTimestamp: Date.now() + 24 * 60 * 60 * 1000,
    });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    clearSession();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(getSession()).toBeNull();
  });

  it("returns null and clears expired sessions", () => {
    const expired: SessionPayload = {
      ...basePayload,
      expiryTimestamp: Date.now() - 1000,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expired));
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
