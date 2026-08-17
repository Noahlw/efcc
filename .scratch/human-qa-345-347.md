# Human QA — Stack layers #345–#347

Test the **accumulated stack top** (`prototype-port/085-07-notices`) against local wrangler dev + seeded D1.

## Environment setup

```bash
pnpm dev:local          # build, migrate, wrangler dev @ http://127.0.0.1:8787
pnpm db:seed:local      # E2E_ account fixtures
pnpm db:seed:demo       # E2E_DEMO_ walkthrough + 3 demo notices
```

| Item | Value |
|------|-------|
| Server | `http://127.0.0.1:8787` |
| Admin (CMS) | `E2E_admin` / `E2E_admin!dev` |
| Member | `E2E_member` / `E2E_member!dev` |
| Viewports | Phone 375px + desktop 1280px |

## A. Home CMS (#345 — issue #322)

Login as **E2E_admin** → 管理 → **首頁內容** (`/management?module=home-content`)

- [ ] Switch Template A ↔ B; fields change per template.
- [ ] **Save draft** — public Home (`/home`) unchanged.
- [ ] **Publish immediately** — 教會消息 on Home updates.
- [ ] *(Optional)* Schedule HK-time publish — not live until scheduled window.
- [ ] Open **預覽**, toggle phone/desktop before publish.
- [ ] *(Two sessions)* Stale save → conflict banner → **重新載入最新版本**.
- [ ] **發佈紀錄** lists actor + timestamp after publish.

## B. Event Detail (#346 — issue #323)

Login as **E2E_member**

- [ ] **Home** → next-event card → event detail (name, when, where, instructions).
- [ ] During open check-in window: **可簽到** badge visible; outside window: absent.
- [ ] **前往掃描** → scanner URL `/scanner?event=<id>` resolves this exact event.
- [ ] **返回** from **Program detail** origin (program → event → back → program).
- [ ] **返回** from **Home** origin (home → event → back → home).
- [ ] Regression: management links `task=events&event=` still work.

## C. Notices (#347 — issue #324)

Login as **E2E_member** → dock **通知**

- [ ] List shows 3 demo notices, **2 unread** dots, HK timestamps.
- [ ] **全部標示已讀** → toast; reload → 3 items remain, 0 unread.
- [ ] **聚會提醒** → `/programs?program=…&event=…` (event detail).
- [ ] **報名結果** → `/programs?program=…` (program detail).
- [ ] **帳戶更新** → `/profile`.

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Branch | `prototype-port/085-07-notices` |
| A — Home CMS | pass / fail |
| B — Event Detail | pass / fail |
| C — Notices | pass / fail |
| Blockers (issue #) | |

**Known ceiling (QA note):** Template A CMS preview shows live `/api/v1/home` featured-event projection, not unsaved draft featured-event selection.
