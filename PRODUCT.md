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
- The app is a Next.js static export served with a Cloudflare Worker. The Worker owns `/api/v1/*` routes and D1 access; the product has no Next.js production server.
- Authentication, Programs, Departments, Events, Enrollments, Attendance, Home content, notices, and management use the Worker/D1 backend. Google Sheets, Apps Script, the old RPC bridge, and the external scanner opener are retired paths.
- Authentication uses username/password with cookie sessions and registration approval. The editable scoped Role Definition and Grant model supplies product permissions; Auth-provider replacement is deferred to [#639](https://github.com/Noahlw/efcc/issues/639).
- The product supports Admin, Staff, and Member identities. Program Leader authority is a scoped grant, not a global Account role.

## Capabilities and Constraints

**Current capabilities:** username/password login with cookie sessions; self-service registration and approval; account profile and credential settings; editable scoped roles and grants; Programs, Departments, Events, Enrollments, Attendance/check-in, Home content, notices, and management workflows.

**Constraints future work must preserve:**

- Internal-only church tool; do not invent public marketing claims, testimonials, or multi-church positioning.
- Cantonese Chinese is the primary product language.
- Phone interface is the main surface for Members, Program Leaders, and Staff; PC is for management.
- Worker + D1 own current application data and API behavior. Development/test D1 data is rebuildable; never infer or mutate a remote database without verifying its identity and authorization.
- There are no legacy Google Sheets accounts to import. New accounts use the current registration and approval flow.
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
