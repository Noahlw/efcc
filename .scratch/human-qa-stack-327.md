# Human QA — Full gh-stack #327 (PRs #325–#347)

Test **everything in one pass** on stack top. All 43 commits live on a single branch — you do not need to check out intermediate PR branches.

| Item | Value |
|------|-------|
| Branch | `prototype-port/085-07-notices` |
| PR | [#347](https://github.com/Noahlw/efcc/pull/347) (stack top) |
| Worktree | `.worktrees/prototype-port-stack` (recommended) |
| Server | `http://127.0.0.1:8787` |
| Traces | `.scratch/prototype-port-2026/acceptance-traces/` (18 layers) |

## Environment (run once)

```bash
cd .worktrees/prototype-port-stack   # or any checkout on 085-07-notices
pnpm dev:local                       # build + migrate + wrangler dev
pnpm db:seed:local                   # E2E_ accounts
pnpm db:seed:demo                    # E2E_DEMO_ programs + 3 member notices
```

Re-run `pnpm db:seed:local && pnpm db:seed:demo` if Home shows stale `E2E Home CMS …` announcement text from a prior automated CMS test.

### Fixtures

| Persona | Username | Password | Use for |
|---------|----------|----------|---------|
| Admin | `E2E_admin` | `E2E_admin!dev` | Hub (full), CMS, permissions, approvals |
| Staff | `E2E_staff` | `E2E_staff!dev` | Hub subset (no 首頁內容 without grant) |
| Member | `E2E_member` | `E2E_member!dev` | Home, Programs, Notices, Event detail |
| Legacy upgrade | `E2E_legacy` | PIN `1234` → new `E2E_legacy!upgrade` | Auth upgrade flow |

**Viewports:** phone ~375px and desktop ~1280px for shell regressions.

### Optional automated preflight (~15–45 min)

Confirms headless coverage before you click:

```bash
pnpm verify
pnpm exec playwright test -c tests/e2e/auth-d1.config.ts
pnpm exec playwright test -c tests/e2e/shell-nav.config.ts
pnpm exec playwright test -c tests/e2e/home.test.ts -c tests/e2e/responsive.config.ts
pnpm exec playwright test -c tests/e2e/account-settings.config.ts
pnpm exec playwright test -c tests/e2e/home-cms.config.ts
pnpm exec playwright test -c tests/e2e/member-directory.config.ts
pnpm exec playwright test -c tests/e2e/programs-d1.config.ts
pnpm exec playwright test -c tests/e2e/pui-05-home-origin.test.ts -c tests/e2e/programs-d1.config.ts
pnpm exec playwright test -c tests/e2e/attendance-d1.config.ts
```

(`programs-d1` is long; run it last or overnight.)

---

## Phase 1 — Auth & shell (084, #325–#328, #334)

**Member** → `/`

- [ ] Login with username/password; session persists on reload
- [ ] 5-slot dock: Home, Programs, Notices, Account (not Management, not Care)
- [ ] Offline banner when DevTools → Offline; clears when back online
- [ ] Skip link + polite live region present

**Staff** → `/`

- [ ] 5-slot dock shows **管理** instead of Notices
- [ ] `/care` not reachable

**Member** → `/profile` → 帳戶設定

- [ ] Profile shows name, phone, role, QR
- [ ] Username change + password change (≥8 chars, mismatch validation)

**Admin or Staff** → `/management?module=settings` (or Account → 設定)

- [ ] Hub lists 帳戶與權限 / 簽到設定 / 時區 (read-only informational screens)
- [ ] Back returns to management hub

*Trace:* `084-04-settings-hub.md` · *E2E:* `account-settings.test.ts`, `shell-nav.test.ts`

---

## Phase 2 — Participant experience (085 + #346 + #347)

**Member** → `/home`

- [ ] Greeting + next-event card (or empty state)
- [ ] 教會消息 → announcement detail (venue, external https link only)
- [ ] 探索 / 全部課程 → `/programs`

**Member** → `/programs`

- [ ] Directory filters (PUI-02); open `E2E_DEMO_成人查經`
- [ ] Program detail: purpose, enrollment actions, schedule advisory
- [ ] Request enrollment → Pending → withdraw confirm dialog

**Member** → Home or Programs → **Event detail**

- [ ] Event name, time, location, instructions
- [ ] 可簽到 badge when window open
- [ ] 前往掃描 → `/scanner?event=<id>`
- [ ] 返回 → prior origin (Home, Program, or **Notices**)

**Member** → `/notices`

- [ ] 3 demo notices, 2 unread dots, HK timestamps
- [ ] 全部標示已讀 → toast; reload → 0 unread
- [ ] 聚會提醒 → event detail; 報名結果 → program; 帳戶更新 → `/profile`

**Scanner** (member, event in check-in window)

- [ ] Resolve event from URL / scan flow → confirm → result screen
- [ ] *Trace:* `085-05-scanner-resolve.md`, `085-06-scanner-confirm.md`

*Traces:* `085-01` … `085-04-event-detail.md` · *E2E:* `home.test.ts`, `programs-d1` PUI-* / NTC-01

---

## Phase 3 — Management hub & operations (086–087, #332–#345)

**Admin** → `/management`

- [ ] Three groups in order: 會員與權限, 事工營運, 內容與系統
- [ ] No Care row anywhere
- [ ] 前往課程管理 → `/programs` management mode

**Staff (no home.publish)** → `/management`

- [ ] 首頁內容 row **omitted** (not disabled)
- [ ] Granted rows only

### Hub modules (Admin unless noted)

| Module | URL | Smoke |
|--------|-----|-------|
| 註冊審批 | `?module=approvals` | List → detail URL; approve one / reject one; back preserves scroll |
| 帳戶與權限 | `?module=permissions` | Role matrix; DM grant reflects live |
| 部門設定 | `?module=departments` | Scoped directory; toggles; create program |
| 聚會／出席 | `?module=attendance` | Hub chooser → roster |
| 參與者 | `?module=members` | Search-then-view directory |
| 首頁內容 | `?module=home-content` | Template A/B, draft, publish, preview, conflict, audit |

### Programs management mode (`/programs` → 管理模式)

- [ ] Management directory → status-first **Course Cockpit**
- [ ] Course Facts read-only + minimal edit
- [ ] Events: manual creation primary; recurring preview/generation
- [ ] Participants: three tabs; inline approve/reject
- [ ] Program settings / leaders / notifications smoke

*Traces:* `086-01` … `086-06`, `087-01` … `087-05` · *E2E:* `programs-d1` MUI-*, EVT-*, HUB-01, PERM-01, `member-directory.test.ts`, `home-cms.test.ts`

---

## Phase 4 — Home CMS deep pass (#345)

**Admin** → `/management?module=home-content`

- [ ] Template A ↔ B field swap
- [ ] Save draft — public `/home` unchanged
- [ ] Preview phone/desktop; Template A preview tracks **typed** featured event id
- [ ] Publish immediately — 教會消息 updates on Home
- [ ] *(Optional)* Schedule HK-time publish
- [ ] Two-session conflict → 重新載入最新版本
- [ ] 發佈紀錄 after publish

---

## Sign-off

| Section | PR range | pass / fail | Notes |
|---------|----------|-------------|-------|
| 1 Auth & shell | #325–#328, #334 | | |
| 2 Participant | #329–#331, #335, #346, #347 | | |
| 3 Management ops | #332–#344, #337–#341 | | |
| 4 Home CMS | #345 | | |

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Branch | `prototype-port/085-07-notices` |
| Blockers (issue #) | |

**Merge note:** CI green required on **#347** only; intermediate stack PRs may show red `programs-d1` until the stack lands.
