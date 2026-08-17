# 088 — Prototype screen map (binding inventory)

Authority: Spec 088. Open the **Standalone HTML files**, not this table, when
restyling. Do not use the retired design-tree or 8787 as the prototype.

## Files (byte lock)

Binding originals (open these):

| Role | Path | SHA-256 |
| --- | --- | --- |
| Participant | `/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html` | `3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2` |
| Management | `/Users/noah.wong/Desktop/code/temp/EFCC Management Workspace (Standalone).html` | `b101731d680e4c18054be396048207a355d73ce46135701ecfd83579dbc52754` |

In-repo snapshot only (must match the hashes above; if not, recopy from Standalone):
`design/efcc-participant-checkin-prototype.html`,
`design/efcc-management-workspace-prototype.html`.

How to open: browser, no build. `?screen={name}` selects a real screen.
Management cockpit screens also use `&program=discipleship&mode=management`.
Manual reference viewports: **390×844** (phone) and **1280×800** (desktop).
Open the exact screen in the Standalone file before editing or reviewing it.
For stateful screens, perform the interaction steps in the relevant ticket;
the base `?screen=` URL alone does not define every visual state.

Dead JS-only names are omitted (see `design/README.md`).

## Participant — 21 real screens

| `?screen=` | Prototype chrome / h1 | Production route (existing) |
| --- | --- | --- |
| `login` | 登入顯恩堂 | `/` (Auth Surface; title unchanged) |
| `legacy-upgrade` | 設定新密碼 | existing legacy-upgrade Auth Surface |
| `register` | 建立帳戶 | existing register Auth Surface |
| `registration-result` | 申請已提交 | existing registration result |
| `guest-checkin` | 訪客簽到 | existing guest check-in |
| `guest-result` | 訪客簽到完成 | existing guest result |
| `session-expired` | 工作階段已過期 | existing session-expired (out of Shared Shell) |
| `not-available` | 找不到此內容 | existing not-available / forbidden |
| `home` | header 顯恩堂; h1 greeting | `/home` |
| `message-detail` | 教會消息 | Home announcement detail |
| `programs` | header 課程 | `/programs` |
| `program-detail` | 課程詳情 | `/programs/:id` (existing) |
| `event-detail` | 聚會詳情 | existing participant event detail |
| `scan` | header 掃描; h1 聚會簽到 | `/scanner` |
| `scan-chooser` | 選擇聚會 | existing scan chooser |
| `scan-outcome` | 簽到狀態 | existing scan outcome |
| `scan-context` | 確認簽到 | existing scan confirm |
| `checkin-result` | 簽到結果 | existing check-in result |
| `notices` | 通知 | `/notices` |
| `account` | 帳戶 / 我的帳戶 | `/profile` |
| `account-settings` | 帳戶設定 | `/profile/settings` |

## Management — 30 real screens

| `?screen=` | Prototype title | Production route (existing) |
| --- | --- | --- |
| `directory` | 管理工作 | `/management` |
| `home` | 首頁 (staff home) | `/home` (management-capable) |
| `message-detail` | 教會消息 | announcement detail |
| `programs` | 課程 | `/programs` (management-capable) |
| `program-detail-p` | program name | program detail |
| `event-detail-p` | event title | event detail |
| `program-workspace` | Course Cockpit | existing cockpit |
| `course-facts` | 課程資料 | existing course facts |
| `course-edit` | 編輯課程 | existing course edit |
| `program-events` | 聚會 | existing program events |
| `mgmt-event-roster` | 出席點名 | existing roster |
| `attendance-chooser` | 聚會／出席 | existing attendance chooser |
| `program-participants` | 參與者 | existing participants tabs |
| `departments` | 部門設定 | existing departments |
| `department-detail` | dept name | existing department detail |
| `create-program` | 建立課程 | existing create program |
| `approvals` | 註冊審批 | existing approvals |
| `approval-detail` | 申請詳情 | existing approval detail |
| `participants` | 參與者 (hub) | existing member directory |
| `participant-detail` | 參與者資料 | existing member detail |
| `home-editor` | 首頁內容 | existing Home CMS |
| `notifications` | 通知 | `/notices` (management) |
| `settings` | 設定 | existing settings hub |
| `account-permissions` | 帳戶與權限 | existing permissions |
| `checkin-settings` | 簽到設定 | existing check-in settings |
| `timezone-settings` | 時區 | existing timezone settings |
| `scan` | scan overlay | `/scanner` |
| `account` | 帳戶 | `/profile` |
| `account-settings` | 帳戶設定 | `/profile/settings` |
| `not-available` | 找不到此內容 | existing not-available |

## Visual DNA (from the HTML, not from 8787)

- Surface `#f4f5f3`, cards white, accent `#9c302c`.
- Phone dock: five slots, **icon + visible label**, raised circular **掃描** FAB.
- Desktop `≥920px` in production: left icon rail ~180px, header in the content column.
- Participant Home header brand: **顯恩堂**. Management header: brand + actor + role + bell.
- No `示範資料` / persona hard-links / scenario chips in production.
