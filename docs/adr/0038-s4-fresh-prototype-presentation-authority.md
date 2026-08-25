# S4 Fresh Prototype Presentation Authority

**Status:** accepted

For S4 Management Access, the 2026-08-18 EFCC design handoff and its exported management screens are foundation evidence, not the final presentation contract. They preserve useful information architecture, copy, tokens, and one realistic 390px scenario, but they do not settle desktop screen bodies, overlays, alternate states, mutation lifecycles, conflicts, or the final phone interaction model.

The selected fresh runnable S4 prototype is the presentation authority for the Management Hub entry, Registration Approvals, Account Directory and read-only Account Detail, and Permission Policy. Before selection, the prototype must compare structurally different alternatives. The selected system must then cover its required loading, empty, forbidden, pending, success, failure, conflict, confirmation, and read-only states at 320px, 390px, 800px, and 1440px.

This decision supersedes ADR-0032 only for S4 presentation authority and supersedes the conflicting S4 presentation assumptions in Spec 087 and issue #369. Domain language, security and server authorization, production route intent, accessibility, shared design tokens, and the approved S4 specification outrank prototype literals. The original source hashes and the decision record remain provenance evidence; no implementation ticket may depend on a machine-local source path.

**Consequences:** The complete prototype alternatives remain on a `prototype/` branch as primary decision evidence. Only the selected decisions enter the S4 specification and production implementation. Losing variants, demo routers, scenario controls, and prototype-only switchers do not ship on `main`.
