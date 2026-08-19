import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { RpcError } from "./api";
import { getHome } from "./home-api";
import type { HomeData } from "./home-api";

describe("home-api client", () => {
  test("getHome requests GET /api/v1/home and unwraps data", async () => {
    const mockData: HomeData = {
      featuredEvent: {
        eventId: "EVT-1",
        programId: "PRG-1",
        programTitle: "門徒訓練基礎課",
        title: "第三課聚會",
        startsAt: "2026-08-20T11:30:00.000Z",
        endsAt: "2026-08-20T13:00:00.000Z",
        location: "二樓禮堂",
        status: "Active",
        isEnrolled: true,
      },
      announcement: {
        contentId: "MSG-1",
        version: 1,
        title: "本週崇拜及聚會安排",
        summary: "請留意場地及時間更新 · 8月15日",
        bodyMarkdown: "請按現場指示前往聚會地點。",
        ctaLabel: "聚會場地資料 · 外部連結",
        ctaUrl: "https://example.com/venue",
        imageUrl: "https://example.com/cover.jpg",
        imageAlt: "場地照片",
        publishedAt: "2026-08-15T00:00:00.000Z",
      },
      exploreProgram: {
        programId: "PRG-2",
        title: "慕道入門課程",
        summary: "現正接受報名 · 9月7日開始",
        category: "福音",
        enrollmentType: "MemberRequest",
        nextEventStartAt: "2026-09-07T00:00:00.000Z",
      },
    };

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        assert.strictEqual(input, "/api/v1/home");
        assert.strictEqual(init?.method, "GET");
        return new Response(
          JSON.stringify({ requestId: "req-123", data: mockData }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": "req-123",
            },
          }
        );
      };

      const result = await getHome();
      assert.deepStrictEqual(result, mockData);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getHome throws RpcError on error response", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            type: "tag:apps-script/efcc/errors#AUTH_REQUIRED",
            title: "Unauthorized",
            status: 401,
            code: "AUTH_REQUIRED",
            detail: "Access cookie missing.",
            requestId: "req-err-1",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/problem+json",
              "X-Request-Id": "req-err-1",
            },
          }
        );
      };

      await assert.rejects(
        async () => {
          await getHome();
        },
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.status, 401);
          assert.strictEqual(error.problem.code, "AUTH_REQUIRED");
          assert.strictEqual(error.problem.requestId, "req-err-1");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
