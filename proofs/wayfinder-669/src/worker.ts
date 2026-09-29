/// <reference types="@cloudflare/workers-types" />

import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  ACCESS_COOKIE_NAME,
  readAuthCookies,
} from "../../../web/lib/auth/cookies";
import {
  resolveRequestSession,
  signAccessToken,
  verifyAccessToken,
} from "../../../web/lib/auth/sessions";
import { accounts, auditEvents, homeContent, sessions } from "./schema";

interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Public, synthetic proof key. The real EFCC Worker reads its secret from
    // a binding; this branch exercises route/session mechanics only.
    const signingSecret = "efcc-669-public-test-key";
    const url = new URL(request.url);
    const db = drizzle(env.DB);

    if (request.method === "POST" && url.pathname === "/seed") {
      await db
        .insert(accounts)
        .values({ userId: "U-PROOF" })
        .onConflictDoNothing();
      await db
        .insert(homeContent)
        .values({
          contentId: "home",
          version: 1,
          templateType: "B",
          status: "Draft",
          publishMode: "immediate",
          title: "Synthetic Home",
          createdBy: "U-PROOF",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
      return json({ seeded: true });
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      await db.insert(sessions).values({
        sessionId,
        userId: "U-PROOF",
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
      });
      const accessToken = await signAccessToken(signingSecret, {
        sid: sessionId,
        uid: "U-PROOF",
        iat: now,
      });
      return Response.json(
        { loggedIn: true },
        {
          headers: {
            "Set-Cookie": `${ACCESS_COOKIE_NAME}=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/`,
          },
        }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      const { accessToken } = readAuthCookies(request.headers);
      const claims = accessToken
        ? await verifyAccessToken(signingSecret, accessToken)
        : null;
      if (claims) {
        await env.DB.prepare(
          "UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND user_id = ?"
        )
          .bind(Date.now(), claims.sid, claims.uid)
          .run();
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Set-Cookie": `${ACCESS_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/home") {
      const actor = await resolveRequestSession(request, env.DB, signingSecret);
      if (actor.status !== "authenticated") {
        return json({ error: "AUTH_REQUIRED" }, 401);
      }
      const latest = await db
        .select()
        .from(homeContent)
        .orderBy(desc(homeContent.version))
        .limit(1);
      return json({
        userId: actor.account.user_id,
        content: latest[0] ?? null,
      });
    }

    if (request.method === "POST" && url.pathname === "/draft") {
      const body = (await request.json()) as { version?: number };
      if (!Number.isSafeInteger(body.version) || (body.version ?? 0) < 1) {
        return json({ error: "version required" }, 422);
      }
      await db.insert(homeContent).values({
        contentId: "home",
        version: body.version!,
        templateType: "B",
        status: "Draft",
        publishMode: "immediate",
        title: `Synthetic Home v${body.version}`,
        createdBy: "U-PROOF",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return json({ draft: body.version }, 201);
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const home = await db
        .select()
        .from(homeContent)
        .orderBy(desc(homeContent.version));
      const audit = await db.select().from(auditEvents);
      return json({ home, audit });
    }

    if (request.method === "POST" && url.pathname === "/audit-tamper") {
      try {
        await env.DB.prepare(
          "UPDATE audit_events SET outcome = 'FAILED' WHERE audit_id = (SELECT audit_id FROM audit_events LIMIT 1)"
        ).run();
        return json({ blocked: false }, 500);
      } catch {
        return json({ blocked: true });
      }
    }

    if (request.method === "POST" && url.pathname === "/invalid-foreign-key") {
      try {
        await db.insert(homeContent).values({
          contentId: "invalid-fk",
          version: 100,
          templateType: "B",
          status: "Draft",
          publishMode: "immediate",
          createdBy: "missing-user",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return json({ blocked: false }, 500);
      } catch {
        return json({ blocked: true });
      }
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/publish" || url.pathname === "/api/publish")
    ) {
      if (url.pathname === "/api/publish") {
        const actor = await resolveRequestSession(
          request,
          env.DB,
          signingSecret
        );
        if (actor.status !== "authenticated") {
          return json({ error: "AUTH_REQUIRED" }, 401);
        }
      }
      const body = (await request.json()) as {
        version?: number;
        auditId?: string;
        correlationId?: string;
      };
      if (!Number.isSafeInteger(body.version) || (body.version ?? 0) < 1) {
        return json({ error: "version required" }, 422);
      }
      const auditId = body.auditId ?? crypto.randomUUID();
      const correlationId = body.correlationId ?? crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        // D1 batch keeps the conditional write and audit in one transaction.
        // changes() ties SUCCESS to the preceding UPDATE's actual row count.
        const result = await env.DB.batch([
          env.DB.prepare(
            "UPDATE home_content SET status = 'Published', updated_by = ?, updated_at = ?, published_by = ?, published_at = ? WHERE content_id = 'home' AND version = ? AND status = 'Draft'"
          ).bind("U-PROOF", now, "U-PROOF", now, body.version),
          env.DB.prepare(
            "INSERT INTO audit_events (audit_id, inserted_at, actor_user_id, action, entity_type, entity_id, new_value_json, outcome, correlation_id) SELECT ?, ?, 'U-PROOF', 'HOME_PUBLISH', 'home_content', 'home', ?, 'SUCCESS', ? WHERE changes() = 1"
          ).bind(
            auditId,
            now,
            JSON.stringify({ version: body.version }),
            correlationId
          ),
        ]);
        const changed = result[0]?.meta.changes ?? 0;
        return json(
          { changed, auditInserted: result[1]?.meta.changes ?? 0 },
          changed === 1 ? 200 : 409
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : String(error) },
          503
        );
      }
    }

    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : json({ error: "not found" }, 404);
  },
};
