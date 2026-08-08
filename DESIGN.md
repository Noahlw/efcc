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
