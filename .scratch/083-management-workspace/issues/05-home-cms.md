# 05 — feat(cms): In-App Home Content CMS, Scheduled Cron & Impeccable Quality Gate

**What to build:** The complete Home Content CMS publishing engine, scheduled Cloudflare cron worker, Markdown sanitizer, and final Impeccable UI polish and end-to-end multi-persona verification suite.

1. **D1 Schema Migration (`0010_home_content_cms.sql`):**
   - Tables for `home_content` with `STRICT`, version uniqueness, foreign keys, and indexes on `(status, publish_mode, start_at, end_at)`.
2. **In-App Home Content Editor (`M-28` to `M-31`):**
   - **Template A (`近期聚會優先`):** Featured upcoming event with church-wide earliest active event fallback.
   - **Template B (`教會消息優先`):** Title, summary, sanitized Markdown rich body, CTA button, and validated external HTTPS photo URL.
   - Independent A/B draft retention.
   - Exact mobile phone preview (`M-30`).
   - Immediate vs. Scheduled HK-time publishing window.
   - Stale-version 409 Conflict banner preserving unsaved draft inputs.
   - Immutable publish audit log (`M-31`).
3. **Cloudflare 5-Minute Scheduled Cron Handler:**
   - `wrangler.toml` configured with `[triggers] crons = ["*/5 * * * *"]`.
   - `scheduled()` handler scans for expired versions, marks them `Archived`, and writes `HOME_CONTENT_EXPIRED` audit records.
4. **Time-Authoritative Read Path:**
   - `GET /api/v1/home` evaluates time invariants directly in SQL, falling back to default System Home on expiry or empty state.
5. **Final Impeccable UI Polish & Persona Verification:**
   - Run Impeccable design inspection across all 55 screens.
   - Playwright multi-persona E2E suite covering Member, Staff, Department Manager, and Admin across 320px, 390px, and 1280px viewports.

**Blocked by:** 04 — feat(hub): Management Hub, Department Settings & Registration Approvals (GitHub #295)

**Status:** ready-for-agent

- [ ] D1 migration `0010_home_content_cms.sql` applies cleanly and enforces relational constraints.
- [ ] Home CMS editor allows switching and independently authoring Templates A and B.
- [ ] Template B Markdown is sanitized server-side, disallowing raw HTML, scripts, and embeds.
- [ ] Mobile phone preview accurately renders the exact layout of the draft.
- [ ] Immediate and scheduled publishing persist valid HK-time publication windows.
- [ ] 5-minute scheduled cron worker correctly archives expired content versions.
- [ ] Concurrent publish conflict returns 409 and displays the conflict banner without losing inputs.
- [ ] Public `GET /api/v1/home` resolves in a single indexed query (<8ms) and gracefully falls back when expired.
- [ ] Impeccable automated polish returns zero layout-thrashing or design anti-patterns.
- [ ] Full Playwright multi-persona test matrix passes 100% against local `wrangler dev` (127.0.0.1:8787).
