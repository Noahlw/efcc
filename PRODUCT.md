# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audiences are all active users of this internal church system:

- **Members** — register, maintain profile, enroll in programs, and participate in church life through the phone interface.
- **Program Leaders** — run events and attendance/check-in for programs they lead, primarily on phone during gatherings.
- **Staff** — approve registrations and operate church workflows on phone; share management duties with Admins.
- **Admins** — manage the church system, including heavier administrative work on PC.

This is not a public marketing product. It is the operational system for 中國基督教播道會顯恩堂 (Evangelical Free Church of China — Glorious Grace Church).

## Product Purpose

EFCC (顯恩堂系統) is the church-management system that moves day-to-day church workload onto technology: identity and access, programs, events, attendance, care follow-up, and related operations.

Success means staff and members can run real church work in one place, with a durable platform for automation and future capabilities—not a one-off collection of spreadsheets and manual process.

## Positioning

An internal system built specifically for this church’s roles, workflows, and Hong Kong church operating context—not a generic multi-tenant church SaaS. It exists to absorb operational workload into software and to be the home for automation and pending church-ops capabilities as they are ready.

## Operating Context

- Used by members and ministry operators around gatherings (phone), and by management on PC.
- Schedules and user-facing timestamps use Church Time: `Asia/Hong_Kong`, Hong Kong calendar dates, 24-hour clock.
- Identity and authentication live on Cloudflare Worker + D1; Programs, Events, Attendance, Enrollments and related domain capabilities remain on the transitional Apps Script + Google Sheets backend until each capability is migrated with acceptance proof.
- Roles in production: Admin, Staff, Member (ADR-0025; Teacher retired); Program Leader is a separate per-program grant, not a global role value.
- Navigable Sections after auth include Profile, Programs, Events, Scanner, Care, and Permissions (some still transitional or placeholder on the new web shell).

## Capabilities and Constraints

**Confirmed capabilities (current or transitional):** cookie-only login/session; legacy-PIN upgrade; self-service registration; Admin/Staff approval queue; member profile; programs, events, attendance/check-in, enrollments (domain still transitional); care dashboard and permissions planned/partial.

**Constraints future work must preserve:**

- Internal-only church tool; do not invent public marketing claims, testimonials, or multi-church positioning.
- Cantonese Chinese is the primary product language.
- Phone interface is the main surface for Members, Program Leaders, and Staff; PC is for management.
- Staged ownership: D1 owns identity; do not delete the Apps Script domain backend merely because auth migrated.
- Production Google Sheet is operator-edited; agents do not mutate it (except documented E2E fixture rules).
- Disposable destructive auth tests use `E2E_`-prefixed usernames only.

**Open / undecided:**

- Final replacement logo asset (current 恩 seal is interim and will be replaced).
- Exact scope and timing of future automation features beyond the current roadmap.

## Brand Commitments

- **Official product / church name to use going forward:** 中國基督教播道會顯恩堂 (full church name). Shorter marks such as 「顯恩堂」/「顯恩堂系統」are legacy shorthand, not the binding brand string for new work.
- **Logo:** the current 恩 seal is temporary and will be replaced; do not treat it as permanent brand identity.
- **Voice:** practical church-ops tool language in Cantonese Chinese primary; no marketing flourish required for Operate surfaces.
- English may appear in code, docs, and technical identifiers; user-facing UI is Cantonese Chinese primary.

## Evidence on Hand

- Domain glossary, data model, and ADR status: `CONTEXT.md`
- Feature roadmap and architecture boundaries: `README.md`
- Behavioral specs and acceptance traces under `docs/specs/` (including accessibility/shell plans such as Spec 071 / 074)
- Architecture decisions under `docs/adr/`
- Runnable web app under `web/` (Next.js static export + Cloudflare Worker)

**Must not fabricate:** final logo artwork; third-party testimonials; multi-church case studies; pricing or licensing claims.

## Product Principles

1. **Serve every church role in one system** — member self-serve and staff/admin management share one product, with surfaces matched to who is working.
2. **Absorb real workload** — design for operational jobs people already do, and leave room for automation rather than one-off screens.
3. **Cantonese Chinese first** — copy, hierarchy, and defaults prioritize Cantonese Chinese for the congregation and operators.
4. **Phone for ministry, PC for management** — Members, Program Leaders, and Staff succeed on phone; administrative depth belongs on desktop.
5. **Church-specific and durable** — preserve this church’s name, roles, Church Time, and staged platform constraints; do not genericize into multi-tenant SaaS patterns.

## Accessibility & Inclusion

- Primary interaction context for Members, Program Leaders, and Staff is the phone interface (touch targets, safe areas, readable type, and recoverable errors matter in real gathering conditions).
- PC is the management context for Admin (and heavier Staff) workflows; desktop layouts must support those tasks without forcing phone compromises onto management density.
- Existing shell accessibility baseline from product specs remains in force unless explicitly revised: phone-first below 768px with bottom nav, desktop side rail at ≥768px, ≥44×44px interactive targets, semantic navigation, and announced busy/error states.

  (The implemented breakpoint is 800px — DESIGN.md and globals.css — which is the authoritative value for layout; the 768px figure above is historical spec wording.)
