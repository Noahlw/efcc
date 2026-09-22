# ADR-0048 — Programs Local Recovery Boundary

- **Status:** Accepted
- **Decider:** Product owner (final recovery grilling, 2026-09-19)
- **Date:** 2026-09-19
- **Related:** #586 R43/R45/R52, #628 RP1/RP2, #629, #632, ADR-0047

Authenticated Programs operational recovery is tab-scoped but belongs to the
current authenticated session. Sign-out, expiry, failed logout cleanup, and a
child `AUTH_REQUIRED` boundary clear Management Drafts, Event drafts,
Generate recovery, and shared workspace mutation recovery together; guest-only
recovery remains separate. Recovery is not actor-keyed and must never restore
to another Account.

Every dirty Preview Occurrence Management Draft, including a hidden or orphan
draft, participates in one leave decision for in-app Back, task or tab switch,
external navigation, and browser Back. Continue Editing preserves the exact
drafts and destination context, opens the Schedule recovery surface, and
focuses the first dirty owner; the remaining drafts stay recoverable. Discard
and Leave clears every dirty Settings and Preview draft owned by the current
Program workspace before leaving. Visibility and focus do not decide whether
unsaved work is protected.

This chooses conservative cleanup and navigation blocking over preserving
authenticated local recovery across an authentication boundary or silently
losing a draft that is no longer visible. Engineering closure ends after the
final application SHA passes its required machine gates and independent
reviews; Owner L2, physical-device, pilot, merge, deployment, and release
remain separate human or promotion decisions.
