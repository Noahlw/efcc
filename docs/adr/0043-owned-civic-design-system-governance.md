---
status: proposed
---

# Owned Civic Design-System Governance

EFCC will formalize a small, product-owned design system over the existing Civic Minimal implementation rather than introduce a second UI runtime or migrate to another component library. Discord contributes interaction-efficiency references only: dense grouped lists, concise row copy, predictable role hierarchy, focused task navigation, and clear state controls. EFCC retains its own Cantonese-first language, tokens, brand, authorization model, and domain vocabulary.

The authority chain is explicit: active domain ADRs/specs/`CONTEXT.md` own domain truth; `web/app/globals.css` owns runtime token values; `DESIGN.md` owns the human visual contract; `web/components/ui/` owns local shadcn/Radix primitive implementations; `web/COMPONENT_INVENTORY.md` owns adoption status and native exceptions; `.impeccable/design.json` is derived metadata; screenshots, prototypes, audits, and HTML reports are commit-pinned evidence only. Equivalent local primitives are the default, while native controls remain first-class only for documented platform, domain, or semantic exceptions. Capability keys are never the primary user-facing label.

The design-system acceptance bar is WCAG 2.2 Level AA plus human keyboard, screen-reader, and real-device evaluation. Every changed pattern must prove accessible name/state, keyboard operation, visible and non-obscured focus, target size, contrast, reflow, text spacing, loading/empty/error/forbidden/offline/conflict/success states, and reduced-motion behavior. Aggregate design scores cannot override a failed user-outcome gate. All reports and design records are kept inside the active worktree. The temporary grill ledger remains during this feature's design review for decision-history tracing and is retired only after scoped consolidation is explicitly reviewed.

## Consequences

- The current local shadcn/Radix + Tailwind v4 stack remains the only shared runtime foundation.
- Raw approval checkboxes, raw visual buttons, and equivalent raw controls become adoption targets when semantics can be preserved; tests assert behavior rather than native element shape.
- `cmdk`, TanStack Virtual/Table, and React Aria remain feature- or scale-triggered additions, never speculative global migrations.
- Design-system drift is inventoried across the whole route/state matrix and reconciled in a bounded pass rather than patched opportunistically.
- The role model in ADR-0042 and the WCAG gates in `docs/research/2026-08-27-wcag-2.2-ux-audit-gates.md` are required inputs for future role-management and screen audits.
