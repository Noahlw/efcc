# S4 Management Access UI Prototype

This throwaway branch answers: **What should the final S4 management workflows look and feel like on phone and desktop?**

## Run

```sh
pnpm --dir web dev --hostname 127.0.0.1 --port 3004
```

Open:

```text
http://127.0.0.1:3004/management?prototype=s4&pack=directory&variant=a&scenario=default
```

The floating development-only switcher provides:

- packs: `directory`, `approvals`, `permissions`
- variants: `a`, `b`, `c`
- pack-specific empty, forbidden, resolved, and conflict scenarios
- left/right arrow-key variant switching when a text field is not focused

All data and mutations stay in memory. The prototype bypass is unavailable in production builds.

## Decision authority

Read `docs/research/2026-08-25-s4-management-access-reconciliation.md`, ADR-0038, and ADR-0039. The original 2026-08-18 export is foundation evidence only. Preserve this branch after selection; only the selected decisions should enter the production S4 specification.

## First verification pass

- Ultracite: zero errors and warnings on the three changed UI targets
- TypeScript: pass
- production build: pass, 18 static pages
- browser render: 9 variants at 390px and 1440px, zero horizontal overflow or console errors
- geometry: 320px, 390px, 800px, and 1440px; shell breakpoint and 44px targets pass
- interactions: Directory search, Approval confirmation dialog, Permission toggle and atomic Save simulation pass
