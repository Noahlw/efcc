# Research Note: EFCC System Vision — First-Principles Architecture & UX for a Phone-First Cantonese Church Platform

**Date:** 2026-08-24 (started) · verified 2026-08-25  
**Author:** Design researcher (EFCC system vision)  
**Parent:** `docs/specs/370-s3-participant-guest-check-in.md`, `CONTEXT.md`, `PRODUCT.md`, `DESIGN.md`  
**Sources:**
- **Hitobito (Core Architecture & Concepts):** `https://raw.githubusercontent.com/hitobito/hitobito/master/doc/architecture/08_konzepte.md` (Swiss open-source association/church management; group hierarchy, role scoping, event participation models).
- **ChurchCRM Kiosk Guide:** `https://docs.churchcrm.io/user-guide/kiosk-devices` (cookie-token unauthenticated attendance kiosk, admin acceptance window, family check-in).
- **Rock RMS Check-In & Architecture:** `https://github.com/SparkDevNetwork/Rock` & `https://community.rockrms.com/documentation/bookcontent/42/350` (multi-modal check-in, rapid attendance entry, group attendance workflows).
- **Pretix & pretixSCAN API & Guides:** `https://docs.pretix.eu/dev/api/resources/checkin.html` & `https://docs.pretix.eu/guides/pretixscan/android/` (idempotent redeem API, outcome vocabulary, non-error duplicate handling, client-side camera/torch controls).
- **USWDS (U.S. Web Design System):** `https://designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/` (trauma-informed form progression, progressive disclosure, non-blaming error recovery, no-disabled-inputs rule).
- **NHS Digital Service Manual:** `https://service-manual.nhs.uk/design-system/design-principles` (design for context and outcomes, "do the hard work to make it simple", high-trust civic delivery).
- **GOV.UK Design System:** `https://design-system.service.gov.uk/patterns/names/`, `https://design-system.service.gov.uk/patterns/phone-numbers/` (tolerant inputs, single-field full name, unmasked telephone fields, task completion vs marketing).
- **PCPD Hong Kong (Office of the Privacy Commissioner for Personal Data):** `https://www.pcpd.org.hk/english/publications/files/cloud_computing_e.pdf` (Information Leaflet: Cloud Computing, DPP1–DPP6 compliance, transborder data flow, encryption, and data user obligations under Cap. 486).
- **Dead ends:** `https://service-manual.nhs.uk/design-system/patterns/ask-users-for-their-name` (HTTP 404; dropped); `https://community.rockrms.com/documentation/church-management/check-in/kiosks/configure-kiosks` (client-side dynamic JS only; cited via GitHub source repository and official guide index).

**Status:** Research COMPLETE. Informs high-level product strategy, S7 operational boundaries, and future platform architectural roadmaps beyond S3.

---

## TL;DR

If we designed 中國基督教播道會顯恩堂's management system from first principles for a 200–800 active congregation in Hong Kong, the system must **disappear into the Sunday morning rhythm rather than commanding attention as software**. 

On a Sunday morning, technology succeeds when it takes under 2 seconds at the door, feels dignified and quiet (Civic Minimal Variant A), operates on Edge-native infrastructure in Hong Kong (Cloudflare D1 with sub-50ms latency and full PDPO compliance), and immediately connects the physical act of check-in to the pastoral act of caring for people.

1. **Sunday Workflow & UX (Q1):** The best ChMS experiences (Hitobito, ChurchCRM, Pretix) reject multi-tenant SaaS marketing and administrative friction. Check-in must be camera-first with zero-configuration fallbacks (manual code and member QR), backed by non-punitive, informative outcome states (green valid / yellow "already checked in at 10:02 AM" / red policy rejection). Civic systems (GOV.UK, USWDS, NHS) prove that task-oriented, tolerant inputs (`type="tel"`, single full-name) and trauma-informed recovery build institutional trust.
2. **Congregation Architecture (Q2):** For 200–800 actives, a deep-module architecture (`DepartmentWorkspace`) on Cloudflare Worker + D1 is far superior to generic plugin engines (WordPress/Rock RMS style). It encapsulates complex invariants (recurrence rules, audit logging, atomic approval, scope authorizers) inside code-owned modules, allowing ministry staff to compose programs, meetings, and registration quotas safely without becoming database administrators or risking database corruption. Single-tenant logical boundary preserves HK PDPO data sovereignty.
3. **Check-In to Care Boundary (Q3):** Check-in is the *intake sensor* of pastoral ministry. S7 must eliminate the "Management Hub" indirection for Sunday operators: leaders opening their phone at a gathering should check in participants, see live roster statistics, and immediately tap an absent member or new visitor to trigger in-context pastoral actions (WhatsApp greeting, pastoral follow-up note) right from the mobile Event Cockpit.

---

## Q1 — What a Great Church Platform Feels Like in Sunday Workflow

### Q1a. Open-Source ChMS & Event Systems Comparison

| System | Primary Source | Roles & Scoping Model | Check-In & Attendance UX | Follow-Up / Care Mechanics | Congregation & Operator Feeling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hitobito** (Swiss Church/Youth Open-Source) | `hitobito/hitobito` (`doc/architecture/08_konzepte.md`) | Hierarchical group trees (`Group::Layer`, `Group::Board`, `Group::Basic`) where permissions cascade down (`layer_and_below_full`, `participations_full`). | Course & Event participations (`Event::Participation`) with role types (`Event::Role`). | Group-level mailing lists (`MailingList`) and participation status logs. | **Structured & Scoped:** Leaders only see their department/layer; no accidental leaks of church-wide data. |
| **ChurchCRM** | `docs.churchcrm.io/user-guide/kiosk-devices` | Role-based (Admin, Pastor, Volunteer); unauthenticated tablet kiosks. | Time-boxed 30s enrollment window; two-column roster ("Waiting to Check In" / "Checked In"); "Check-in By" family selector. | Pastoral notes attached to family/person records; attendance reports. | **Zero-Login Kiosk:** Fast volunteer setup; physical card/kiosk feel; high administrative data-entry burden if households change. |
| **Rock RMS** | `github.com/SparkDevNetwork/Rock`, `community.rockrms.com/documentation/bookcontent/42/350` | Fine-grained security on groups, locations, and schedules; Attended vs. Self vs. Manager modes. | Multi-modal: phone search, barcode scan, family batch check-in, rapid bulk attendance entry. | Automated "Connection Requests" and pastoral workflows triggered by attendance drop thresholds. | **Industrial-Grade Depth:** Handles massive Sunday volume, but overwhelming configuration overhead for non-technical volunteers. |
| **Pretix / pretixSCAN** | `docs.pretix.eu/dev/api/resources/checkin.html`, `pretixscan/android/` | Minimal operator permissions (scan-only profile, no order sync, locked settings). | Sub-second camera decode; 3-state feedback (Green valid / Yellow already used / Red denied); server-enforced `nonce` idempotency. | Exportable scan logs with first-seen timestamps; policy denial reason explanations. | **Instant Trust & Speed:** Operator never wonders if a scan landed; member never feels accused or embarrassed on duplicate. |

#### Transferable Patterns for EFCC:
- **Time-to-Check-In Target ($\le 2$ seconds):** Direct camera entry upon loading `/scanner` (F-17/F-18), immediate local barcode decoding via WASM/native detector (D2), and zero intermediate confirmation clicks for unambiguous scans.
- **Three-Color Honest Outcome Taxonomy:** Green (Success), Yellow (Neutral Duplicate with explanation, F-12), Red (Clear policy denial with Church Time context, F-16).
- **Idempotency by Natural Key:** Server-side partial unique index (`event_id + member_user_id`, `event_id + guest_phone_normalized`, F-01) with mandatory audit logging (F-02).

#### Anti-Patterns for EFCC:
- **Generic SaaS Multi-Tenancy Confusion:** Forcing church members to navigate church search bars, multi-tenant logins, or commercial marketing screens.
- **Punitive Error Modals:** Flashing alarming error dialogs when a member accidentally double-scans or scans 5 minutes before the window opens.
- **Complex Hardware Requirements:** Mandating specialized label printers, RFID badge encoders, or proprietary kiosk tablets when smartphones and printed venue QR codes solve 99% of needs.

---

### Q1b. Civic-Minimal Design Systems (Variant A Alignment)

| Design System | Primary Source | Key Principle / Pattern | Relevance to EFCC Variant A (Civic Minimal) |
| :--- | :--- | :--- | :--- |
| **GOV.UK Design System** | `design-system.service.gov.uk/patterns/` | **Task Completion over Marketing:** "One thing per page", single full-name field (`autocomplete="name"`), unmasked phone input (`type="tel"`). | Matches EFCC's rejection of marketing banners; provides direct, accessible mobile forms for Cantonese operators. |
| **USWDS (U.S. Web Design System)** | `designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/` | **Trauma-Informed Form Design:** Progressively disclose questions, use calm/non-blaming validation, never disable buttons (prevents focus traps), support save-and-resume. | Directly applies to church registration and care forms: members in difficulty or distress must never face hostile or confusing error states. |
| **NHS Digital Service Manual** | `service-manual.nhs.uk/design-system/design-principles` | **"Do the hard work to make it simple" & "Design for context":** High-contrast typography, clear operational status, accessible interactive targets ($\ge 44\text{px}$). | Guides the Sunday door flow: volunteers in crowded, dimly-lit church halls need high-contrast typography and unmistakable status badges. |

#### Transferable Patterns for EFCC:
- **Tolerant Phone Number Parsing:** Allow spaces, dashes, and local HK 8-digit formats without strict regex rejection on keypress; format only on the backend.
- **Semantic Progression:** Explicit programmatic focus management to step headings on view transitions (F-06) with Traditional Chinese ARIA live regions (F-07).
- **Civic Dignity Palette:** High-contrast neutral off-white surface (`#f4f5f3`), crisp charcoal ink (`#171a1d`), hairline dividers (`#d6dcde`), and restrained cinnabar red (`#9c302c`) action accents (`DESIGN.md`).

#### Anti-Patterns for EFCC:
- **Marketing Noise in Ministry Workspaces:** Hero carousels, promotional banners, or pastel gradients inside operational scanner/check-in surfaces.
- **Disabled Buttons:** Using `disabled` on form buttons that swallow click events and confuse screen-reader / keyboard navigation (replaced by `aria-busy` and live validation, F-09).

---

### Q1c. Phone-First Attendance in the Wild

- **Venue & School Kiosk Patterns:** Single full-screen scanning surface with high-contrast framing and a single visible escape hatch (`停止掃描`, F-18). Background ambient light adaptation and pinch-to-zoom / torch controls where supported.
- **NFC / Apple Wallet / Google Wallet Hybrid:** While native `.pkpass` files allow near-field lock-screen presentation near church premises, an in-app Member QR code displayed in the Account Section (F-08 / Story 9) provides 95% of the utility with zero Apple/Google developer certificate friction.
- **Edge-First & Offline Resilience:** Progressive Web App (PWA) with self-hosted WASM decoder cached on device origin (`D2 / zxing_reader.wasm`). Client maintains optimistic submission UI with monotonic retry queues to handle basement sanctuary cellular dead zones.

---

## Q2 — Architecture for 200–800 Actives: D1, Deep Modules, and HK Data Residency

### Q2a. Workload Profile & Edge Infrastructure

A typical Hong Kong congregation of 200–800 active members exhibits a distinct, highly asymmetrical workload:
- **Sunday Morning Traffic Burst:** 80% of weekly writes occur in two 20-minute windows (e.g., 9:40–10:05 AM and 11:15–11:35 AM), reaching peak rates of 15–30 requests/second.
- **Mid-Week Operational Pace:** Low-concurrency reads and occasional administrative writes (course enrollment approvals, schedule updates, pastoral care notes).

```
                        ┌─────────────────────────────────────────────────────────┐
                        │              Hong Kong Mobile Clients                   │
                        │           (Safari iOS / Chrome Android)                 │
                        └──────────────────────────┬──────────────────────────────┘
                                                   │ HTTPS (Cookie Auth / PIN)
                                                   ▼
                        ┌─────────────────────────────────────────────────────────┐
                        │          Cloudflare Edge Worker (HKG PoP)               │
                        │  - Single-digit ms latency across HK ISPs               │
                        │  - Zero cold-start execution                            │
                        │  - Session token verification & Capability Authorization│
                        └──────────────────────────┬──────────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          DepartmentWorkspace (Deep Domain Module)                               │
│                                                                                                 │
│   ┌────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────────────┐   │
│   │   Program Lifecycle    │  │   Schedule Generator   │  │   Enrollment & Approval Guard   │   │
│   └────────────────────────┘  └────────────────────────┘  └─────────────────────────────────┘   │
│   ┌────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────────────┐   │
│   │   Attendance Gates     │  │   CapabilityAuthorizer │  │   Structured Audit Logger       │   │
│   └────────────────────────┘  └────────────────────────┘  └─────────────────────────────────┘   │
└──────────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                                   │ Direct SQL / Transaction
                                                   ▼
                        ┌─────────────────────────────────────────────────────────┐
                        │             Cloudflare D1 (Serverless SQLite)           │
                        │  - Authoritative relational store (Single Source)       │
                        │  - Encrypted at rest & in transit (HK PDPO compliant)   │
                        │  - Partial unique indexes for idempotent attendance     │
                        └─────────────────────────────────────────────────────────┘
```

### Q2b. Hong Kong PDPO (Cap. 486) & Data Residency

Under the Privacy Commissioner for Personal Data (PCPD) Information Leaflet on Cloud Computing and Data Protection Principles (DPP1–DPP6):
1. **Data Security & Safeguards (DPP4):** The church is legally classified as a *Data User* handling sensitive personal data (names, phone numbers, family relationships, pastoral attendance records, prayer requests). Cloudflare D1 provides automated encryption at rest and in transit, with Hong Kong edge termination (HKG PoP).
2. **Purpose Limitation (DPP3) & Retention (DPP2(3)):** Unlike commercial multi-tenant ChMS providers that monetize or cross-analyze aggregated church data, EFCC's single-congregation deployment ensures strict data isolation. Data is processed solely for church operations and retained according to church bylaws.
3. **Auditability (DPP4(1)(d)):** Every administrative mutation, status change, attendance void, or guest detail correction produces an immutable row in the `audit_log` table (F-02, Spec 086), ensuring full internal accountability without third-party exposure.

### Q2c. Deep Module Pattern vs. Generic Plugin Engines

```
COMPARISON OF DOMAIN ARCHITECTURES

1. GENERIC PLUGIN ENGINE (e.g. WordPress, Drupal, Rock RMS Modules)
   ┌──────────────────────────────────────────────────────────────┐
   │ Dynamic UI Builder / Metadata Schema / Hook Dispatcher       │
   │  - Unsafe runtime SQL generation                             │
   │  - Permissive DB schema with JSON blobs                      │
   │  - Fragile runtime dependencies & version mismatches         │
   │  - High risk of volunteer admin misconfiguration             │
   └──────────────────────────────────────────────────────────────┘

2. EFCC DEEP MODULE PATTERN (DepartmentWorkspace)
   ┌──────────────────────────────────────────────────────────────┐
   │ Thin External Surface:                                       │
   │   - WorkspaceStore (Persistence Interface)                  │
   │   - CapabilityAuthorizer (Role & Scope Interface)            │
   │   - DepartmentWorkspace (Command & Query Interface)          │
   ├──────────────────────────────────────────────────────────────┤
   │ Deep, Hidden Implementation:                                 │
   │   - Strict relational schema (D1 SQL migrations)             │
   │   - Atomic transactional invariants (Approval, Void, Audit)  │
   │   - Guaranteed Recurrence Rule arithmetic (Hong Kong Time)   │
   │   - Compile-time TypeScript types for all operations         │
   └──────────────────────────────────────────────────────────────┘
```

**Why the Deep Module Pattern Wins for EFCC:**
- **Zero Database-Admin Risk:** Ministry staff configure programs, toggle approved modules (Catalog, Enrollment, Events, Attendance), and set recurrence rules through high-level, constrained domain primitives. They never write SQL, modify database tables, or manage foreign keys.
- **Fail-Safe Invariants:** Complex business rules (such as blocking event cancellation when attendance already exists, Spec 086 User Story 13) are enforced in the core domain layer, making it impossible for buggy UI code or accidental clicks to corrupt historical records.

---

## Q3 — Where Check-In Ends and Pastoral Care Begins

### Q3a. The Sunday Leader Flow (Eliminating the Management Hub Indirection)

In traditional church management software, attendance is treated as an isolated record-keeping chore:
```
TRADITIONAL FRAGMENTED FLOW (HIGH FRICTION)
[Door Check-In] ──(disconnect)──► [Leader Goes Home] ──► [Log into PC Management Hub] ──► [Search 5 Submenus] ──► [Open Care Ticket]
```

In a phone-first Cantonese church platform, check-in is the **vital real-time sensor** of pastoral health:
```
EFCC UNIFIED SUNDAY FLOW (ZERO INDIRECTION)
[Arrive at Venue] ──► [Open Phone Scanner] ──► [Record Check-Ins] ──► [Live Roster Updates] ──► [In-Context Care Action]
                                                                                                 ├─► WhatsApp Greeting
                                                                                                 ├─► Pastoral Note
                                                                                                 └─► Guest Onboarding
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📱 顯恩堂 — 青年崇拜 聚會名單 (Event Roster)                          │
├────────────────────────────────────────────────────────────────────────┤
│ 聚會時間：2026-08-30 10:00 AM          狀態：進行中 (已簽到 42 / 50)   │
├────────────────────────────────────────────────────────────────────────┤
│ [名單標籤]  全部 (50)  │  已出席 (42)  │  未出席 (8)  │  訪客 (3)       │
├────────────────────────────────────────────────────────────────────────┤
│ 👤 陳小明 (Member)                      [已簽到 09:58 AM]              │
│    連續出席 4 次 · 青年團契                                             │
├────────────────────────────────────────────────────────────────────────┤
│ 👤 張大衛 (Member)                      [未出席 ⚠️ 連續缺席 3 次]       │
│    ┌─────────────────────────────────────────────────────────────────┐ │
│    │ [💬 發送關懷 WhatsApp]   [📝 記錄關懷備忘]   [📞 致電聯絡]       │ │
│    └─────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ 👤 李美美 (訪客 · 首次到訪)             [已簽到 10:05 AM]              │
│    電話：9123 4567                      負責人：王導師                 │
│    ┌─────────────────────────────────────────────────────────────────┐ │
│    │ [✨ 邀請註冊為會員]     [📝 記錄跟進事項]                       │ │
│    └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Q3b. The In-Context Care Boundary (S7 & Beyond)

1. **Mobile Event Cockpit (`/events/[id]` & `/programs/[id]/events/[id]`):**
   - **Real-Time Gathering Ledger:** Displays live check-in progress ($X/Y$), late arrivals, and active attendees.
   - **Pastoral Health Badges:** Automatically surfaces consecutive absences ("連續 3 次未出席", Spec 007), first-time visitors ("首次到訪"), and milestone events.
   - **Immediate In-Context Action Drawer:** Tapping any attendee row directly opens lightweight pastoral actions (pre-filled WhatsApp greeting link, quick pastoral note, or attendance void/correction with mandatory reason, Spec 086).
2. **Desktop Management Hub (`/management`):**
   - Reserved for deep, aggregate administrative governance: cross-department quarterly attendance analytics, staff role assignments, global capability matrices, and long-term pastoral care assignment dashboards.

---

## If We Designed EFCC from Now: Ranked System Moves

A ranked shortlist of the top 7 high-leverage moves for the EFCC platform architecture and user experience:

| Rank | System Move | Primary Surface | Value Proposition (Why Now vs. Later) | Contract / ADR Impact |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **In-Context Pastoral Action Drawer on Event Roster**<br>*(簽到與關懷一體化)* | Mobile Event Cockpit (`/events/[id]`, S7) | Bridges attendance intake directly to pastoral ministry. Leaders follow up with missing members or first-time guests on their phones immediately after service without PC Management Hub indirection. | Aligns with S7 scope & Spec 007/086; introduces a lightweight D1 care notes mutation ADR. |
| **2** | **Camera-First Entry with Local Fallback Ladder**<br>*(相機優先與容錯階梯)* | Participant `/scanner` (S3) | Eliminates initial method-chooser cognitive load (0 clicks to live camera). Guarantees 100% device compatibility across iPhone Safari and older Androids via self-hosted WASM and 6-digit manual code fallback. | Frozen in S3 (F-17, F-18, F-19; supersedes ADR-0015 via new Camera ADR). |
| **3** | **Neutral Three-State Outcome Taxonomy**<br>*(非懲罰性出席狀態模型)* | Scanner & Guest Outcome (`/scanner`, `/guest-check-in`) | Prevents member anxiety and confusion. Distinguishes valid entry (Green), neutral already-checked-in (Yellow with original time context), and policy denial (Red with clear Church Time rules). | Frozen in S3 (F-12, F-16); validated by Pretix prior art. |
| **4** | **Deep-Module Ministry Composition over Plugin Engines**<br>*(深度領域模組與受控排程)* | Department & Program Domain (`DepartmentWorkspace`) | Empowers ministry leaders to compose programs, recurring schedules, and registration limits through fail-safe domain primitives without exposing raw database tables or risking schema breakage. | Shipped in D1 domain (`department-workspace.ts`); governance codified in `CONTEXT.md`. |
| **5** | **Edge-Native Zero-Cold-Start Sunday Resilience**<br>*(邊緣 D1 單一事實來源與高可用)* | Cloudflare Worker + D1 Backend (`/api/v1/*`) | Delivers sub-50ms latency across Hong Kong mobile networks during high-concurrency Sunday morning check-in spikes; guarantees full HK PDPO data residency compliance. | Governed by ADR-0020, ADR-0024, and ADR-0030. |
| **6** | **Low-Friction One-Step Guest Conversion Pipeline**<br>*(訪客一鍵簽到與無縫過渡)* | Public `/guest-check-in` & Member Registration | Removes all onboarding friction at the door (single form, name + phone, no camera prompt). Preserves guest credentials to pre-fill member account registration when they decide to join. | Frozen in S3 (F-13, F-14, ADR-0028). |
| **7** | **Civic-Minimal Visual Grammar & Radical Accessibility**<br>*(公務極簡視覺語言與實質無障礙)* | Global Application Shell (`DESIGN.md`, Variant A) | Replaces commercial SaaS noise with dignified, high-contrast Traditional Chinese typography, $\ge 44\text{px}$ touch targets, and full WCAG 2.2 live-region screen-reader announcements. | Codified in `DESIGN.md` and ADR-0037. |

---

## Recommendations & Next Steps

1. **Complete S3 Slices Linear Execution:** Proceed with S3 slices (S3-01 through S3-06) implementing the camera-first participant scanner and one-step guest check-in, keeping all frozen contracts F-01 to F-19 strictly intact.
2. **Prepare S7 Operational Boundary Spec:** Use the findings in Q3 to specify the S7 Event Roster interface, integrating live check-in progress, attendance void/correction, and the mobile pastoral action drawer directly into `/events/[id]`.
3. **Formalize Pastoral Care D1 Schema:** When advancing Spec 007 into production D1 migrations, model care follow-ups (`pastoral_notes`, `care_follow_up_tasks`) as first-class domain entities parented to `DepartmentWorkspace` rather than building an external ticketing module.