# S2 Warm Community Visual System (Participant Phone Polish)

**Issue:** [#422](https://github.com/Noahlw/efcc/issues/422) · **ADR:** [0037](../adr/0037-warm-community-visual-system.md) · **Parent:** [#396](396-s2-participant-hardening-integration-addendum.md)
**Lineage:** Wayfinder #366 → #368 → #383 → #396 → #422
**Evidence catalog:** `.scratch/s2-phone-polish-evidence.md`

## Summary

The S2 participant Sections adopt the **Warm Community Visual System** as their display language: rounded single-layer group cards, pill buttons, solid-tint pill badges, and a floating dock bottom navigation with the scanner as a normal dock tab. It resolves the 12 systemic defects discovered during the 2026-08-22 live evidence pass. All colours remain the existing EFCC design tokens (`--surface`, `--surface-raised`, cinnabar `--accent`, state pairs); no new palette is introduced.

## System Contracts

1. **Single Title:** One screen title in the top app bar; no duplicated H1 below.
2. **Back in Chrome:** Back affordance lives in top chrome as a text link, not a boxed chip inside content.
3. **Surface Layer Rule:** At most two stacked visual surfaces (canvas + one group card). Content groups are separated by spacing + section headers, never card-in-card.
4. **Time Display Contract:** Spoken 12-hour format (`晚上 7:30–8:45`) on participant surfaces; unbroken date+time range chip (`white-space: nowrap`).
5. **Badge System:** Pill shape (`border-radius: 999px`), solid tints, AA contrast, single size. Zero-count badges hidden.
6. **Button Hierarchy:** Pill primary (cinnabar), quiet (neutral tint), disabled with reason.
7. **Bottom Navigation:** Floating dock with scanner as a normal tab; active tab is an accent capsule.
8. **Scroll Clearance:** Every scrolling view reserves bottom clearance above the floating dock.
9. **Action bars:** every participant action bar renders static in normal document flow — supersedes the #385/#383 sticky-CTA requirement (user ruling 2026-08-22).

## Delivery Sequence

1. **Program Detail (V1 忠實重排)** — [#422 slice 1]
2. Event Detail
3. Programs catalog
4. Home
5. Notices
6. Messages
7. Desktop pass
