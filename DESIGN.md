---
name: 中國基督教播道會顯恩堂系統
description: Official Church Management System for EFCC (Variant A: Official Civic Minimal)
colors:
  surface: "#f4f5f3"
  surface-raised: "#ffffff"
  ink: "#171a1d"
  ink-muted: "#59636a"
  line: "#d6dcde"
  line-strong: "#aeb8bc"
  accent: "#9c302c"
  accent-deep: "#76231f"
  focus: "#176a87"
  success: "#2e6b37"
  success-surface: "#eef4ef"
  success-border: "#b9cfbe"
  error: "#b3261e"
  error-surface: "#fbeeed"
  error-border: "#e5b4b0"
  pending: "#8a5b16"
  pending-surface: "#f3eee8"
  pending-border: "#c1ad95"
  skeleton: "#e3e0e1"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif"
    fontSize: "clamp(2.65rem, 6vw, 5rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
  caption:
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  sm: "0.75rem"
  md: "1.25rem"
  lg: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
    minHeight: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
    minHeight: "44px"
  input-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    minHeight: "44px"
---

# Design System: 中國基督教播道會顯恩堂系統

## Overview

**Creative North Star: "The Official Ordinance" (Variant A: Official Civic Minimal)**

The documented visual design system for 中國基督教播道會顯恩堂, carbonized from the accepted prototype direction (Issue #178). It prioritizes direct operational clarity, civic dignity, and dependable workflows for Members, Program Leaders, Staff, and Admins.

The visual language rejects generic SaaS marketing heroes, commercial hype, and decorative pastel gradients. It embraces civic future-minimalism: neutral off-white surfaces, crisp ink charcoal typography, hairline dividers, and a restrained cinnabar red accent for action and state emphasis.

**Key Characteristics:**

- **Official Identity:** Full church title (`中國基督教播道會顯恩堂`) used as the primary brand string.
- **Direct Operation:** Immediate sign-in access; no marketing tour detour.
- **Cantonese-First:** Copy, labels, and ARIA accessibility descriptions prioritize Traditional Chinese for Hong Kong operating context.
- **Phone-First Ministry, Desktop Management:** Touch targets ≥44px everywhere, bottom nav bar on mobile, and side rail nav on desktop.

## Colors

The palette uses civic neutral surfaces with high-contrast ink and a restrained cinnabar red action accent.

### Primary Accent

- **Cinnabar Red** (#9c302c / hover #76231f): Reserved for primary submit actions, active state indicators, and focus accent.

### Neutrals

- **Surface Off-White** (#f4f5f3): Base background for civic calm.
- **Surface Raised White** (#ffffff): Card, panel, and input background.
- **Ink Charcoal** (#171a1d): Primary typography and high-contrast headers.
- **Ink Muted Slate** (#59636a): Secondary text, field labels, and metadata.
- **Hairline Line** (#d6dcde / strong #aeb8bc): Structural section dividers and panel boundaries.
- **Focus Teal** (#176a87): High-contrast focus-visible indicator ring.
- **Success Green** (#2e6b37): Positive confirmation and enabled state.
- **Error Red** (#b3261e): Error, warning, and destructive confirmation state.
- **Pending** (--pending `#8a5b16`): pending/awaiting-review state.
- **Pending Surface** (--pending-surface `#f3eee8`): pending/awaiting-review surface tint.
- **Pending Border** (--pending-border `#c1ad95`): pending/awaiting-review border.
- **Skeleton** (--skeleton `#e3e0e1`): loading placeholder.

### Named Rules

**The Cinnabar Accent Rule.** The cinnabar accent is used solely for primary submission, active state indicators, and the brand mark slot. Its rarity preserves its visual authority.

## Typography

**Display / Body Font:** Clean system sans stack (`-apple-system`, `BlinkMacSystemFont`, `PingFang TC`, `Noto Sans TC`, `Microsoft JhengHei`, `Arial`, `sans-serif`)

### Hierarchy

- **Display** (800, clamp(2.65rem, 6vw, 5rem), 1.08): Page hero title.
- **Title** (800, 1.5rem, 1.25): Panel and modal headings.
- **Subtitle** (800, 1.35rem, 1.35): Section and capacity group headings.
- **Body** (400, 1rem, 1.6): Standard narrative text.
- **Label** (700, 0.875rem, 1.4): Field labels and metadata.

## Layout

- **Container:** Max width 1180px, centered with fluid inline padding (`clamp(1.25rem, 4vw, 2.75rem)`).
- **Desktop Grid (≥800px):** 2-column command layout with system copy on left and direct sign-in panel on right.
- **Phone Grid (<800px):** Stacked single column with direct sign-in panel placed FIRST at the top of the viewport.

## Elevation & Depth

Flat civic surfaces with hairline borders (`1px solid #d6dcde`). Depth is conveyed through background contrast (`#f4f5f3` vs. `#ffffff`) rather than heavy drop shadows.

## Shapes

- **Inputs & Buttons:** 8px border-radius (`rounded-sm`), min-height ≥44px.
- **Panels & Cards:** 12px border-radius (`rounded-md`).
- **Pills & Tags:** `rounded-pill` is reserved for compact status and metadata tags.
- **Mark Slot:** 6px border-radius squar-cut seal container, structured as a clean replaceable component slot for the official church icon.

## Components

### Primary Button

- **Shape:** 8px radius
- **Style:** Background `#9c302c`, text `#ffffff`, min-height 44px
- **Hover/Focus:** `#76231f` background, 3px `#176a87` focus ring

### Secondary Button

- **Shape:** 8px radius
- **Style:** Transparent background, 1px `#aeb8bc` border, text `#171a1d`, min-height 44px
- **Hover:** Background `#e9eceb`, border `#171a1d`

### Input Fields

- **Style:** 1px `#aeb8bc` border, `#ffffff` background, `#171a1d` text, min-height 44px, 8px radius
- **Focus:** 3px `#176a87` focus ring, `#176a87` border

## Do's and Don's

### Do:

- **Do** use the full title `中國基督教播道會顯恩堂` as the primary brand string.
- **Do** place the sign-in panel first on phone viewports (<800px).
- **Do** ensure interactive controls maintain min-height ≥44px for touch targets.

### Don't:

- **Don't** add generic SaaS marketing fluff, pricing tables, or fake social proof.
- **Don't** use neon gradients or drop-shadow halo cards.
- **Don't** treat the temporary `恩` seal mark as a permanent non-replaceable logo asset.

## Phase F final contract — 2026-09-01

The shipped product keeps Civic Minimal as the visual authority: Cantonese-first copy, cinnabar action emphasis, teal visible focus, light civic surfaces, functional borders, restrained elevation, and phone-first operation. The 800px shell transition remains the only shell breakpoint; layout utilities and the documented token variables express route geometry.

Production route and module styling is Tailwind/token based. `globals.css` is reserved for token declarations, base/document behavior, shell and safe-area platform rules, reduced motion, and irreducible print behavior. The three remaining shipped CSS Module ownership islands were deleted; `/prototype` and historical evidence remain outside this contract.

Local shadcn/Radix primitives are the default for equivalent controls. Camera/video/device APIs, native print, native selects/date inputs, navigation anchors, live regions, and domain-specific radio semantics remain only as the documented native exceptions. Numeric DOM evidence records geometry and behavioral state; it never substitutes for human accessibility, hardware, print-preview, or WCAG review.

The implementation evidence is summarized in `docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}` and the current release disposition is recorded in `docs/qa/2026-09-01-s4-phase-f-release-gate.md`.

## Programs Screen Foundations — Wave 0 / #587

**Status:** Spec-authorized shared contract; the coded result still requires the owner L2 visual gate. **Authority:** Spec #586 and the frozen HTML reference set at `docs/design/programs-screen-foundations-v1/`, with `00-screen-foundations.html` as the canonical foundation specimen. This is a token and composition evolution, not a redesign or a replacement for domain authority.

The production runtime mapping for this contract is the `--screen-*` token family in `web/app/globals.css`. The existing Civic Minimal aliases remain a compatibility surface for untouched routes; later consumers adopt the screen tokens as their route-family work lands. No route may invent a competing foundation token set.

### Four screen families

Every new screen chooses one recipe, or records an explicit exception before implementation. These are composable responsibilities, not four universal page components:

| Family | Foundation responsibility | Programs examples |
| --- | --- | --- |
| **Directory / Collection** | Root title/lead rhythm, search/filter placement, grouped compact rows, and in-family result/recovery states | Participant Directory; Management Directory |
| **Overview / Detail** | Entity identity, concise metadata/status, summary or next-event block, and ordered secondary sections | Participant Program Detail; Participant Event Detail; Workspace Overview |
| **Operational Task** | Program/task context, persistent sibling tabs where applicable, action header, local filters, actionable rows, and item feedback | Events; Participants; Notifications |
| **Settings / Editor** | Grouped settings hub, focused editor fields, help/error rhythm, and dirty-only Save/Discard surface | Program Settings Hub and focused editors |

### Warm Civic Minimal defaults

- Use a slightly warm shell/background (`--screen-shell-bg`) with a near-white content plane (`--screen-canvas`, `--screen-surface`) and functional hairline dividers (`--screen-line`).
- Keep cinnabar (`--screen-accent`) scarce: primary actions and active indicators only. State colors are semantic, not decorative.
- The screen itself is not a card. Default composition is a content plane, whitespace, dividers, and compact rows.
- A **semantic card** is allowed only when it contains one meaningful unit such as a next-event summary, highlighted operational state, task tile, confirmation surface, or overlay. Do not use card-on-card nesting as a default composition.
- Ordinary rows and semantic cards are shadow-free. Use only the restrained `--screen-shadow-sticky`, `--screen-shadow-dock`, and `--screen-shadow-sheet` tokens for genuinely layered UI.
- Radius is foundation-owned: control `10px`, surface `14px`, sheet `20px`, and pill `999px`. Callers do not select arbitrary radii.
- Compact utility density uses the tokenized `8px` utility gap, `10px` collection-row block padding, and `8px` settings-row block padding. Rows are minimums and grow for long Cantonese content.

### Typography, geometry, and controls

The frozen prototype values below are the implementation contract. They are minimums where stated, not fixed boxes:

| Concern | Token | Contract |
| --- | --- | --- |
| Phone gutter | `--screen-gutter` | `16px` |
| Shell / bottom navigation | `--screen-shell-height` / `--screen-bottom-nav-height` | `56px` / `72px` plus safe-area handling |
| Interactive target | `--screen-touch-target` | `44px` minimum in both dimensions |
| Root title | `--screen-root-title-size` / `--screen-root-title-leading` | `28px` / `34px` |
| Child/workspace title | `--screen-child-title-size` / `--screen-child-title-leading` | `24px` / `30px` |
| Section heading | `--screen-section-title-size` / `--screen-section-title-leading` | `17px` / `24px` |
| Body | `--screen-body-size` / `--screen-body-leading` | `15px` / `22px` |
| Metadata | `--screen-meta-size` / `--screen-meta-leading` | `13px` / `18px` |
| Collection/settings row | `--screen-row-min-height` / `--screen-settings-row-min-height` | `64px` / `56px` minimum; auto-grow |
| Section rhythm | `--screen-section-gap` | `24px` |
| Icon | `--screen-icon-size` | `20px` |

The canonical authenticated font stack is `--screen-font-sans`. Touched production UI uses Lucide icons with one consistent outline vocabulary; arbitrary hand-drawn SVG families, emoji, filled/outline mixing, and new icon libraries are not permitted. CVA exposes semantic axes only (`intent`, `tone`, `selected`, `danger`, `disabled`, and equivalent product meanings), never raw padding, radius, font-size, gap, or geometry knobs.

### Presentation ownership and escape hatch

Foundations own gutter/content width, header and Back geometry, title/lead rhythm, section spacing, standard row padding/minimums/dividers, icon sizes, status-pill grammar, action alignment, feedback placement, surface/radius/ shadow defaults, and responsive baseline behavior. Route/domain modules own records and copy, section presence/order, permission truth, mutations, loading/business state, URL destinations, and draft ownership.

Consumers must not repeat foundation-owned visual constants in local Tailwind classes or inline styles. If a real product distinction cannot use an existing semantic variant, the only escape hatch is a **named semantic variant** with a documented reason and affected consumers, or a documented one-off exception approved before implementation. The exception must not become a raw geometry prop or a silent source-order override. Missing or unavailable states stay at their natural family locus; one giant error card is not a substitute for loading, empty, forbidden, conflict, recovery, or validation grammar.
