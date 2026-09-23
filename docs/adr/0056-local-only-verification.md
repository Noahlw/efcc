---
status: accepted
date: 2026-09-23
---

# Local-only verification

The repository will remove GitHub Actions and use a deterministic local pnpm verify as its complete machine readiness gate; contributors run affected checks while iterating and keep pre-commit limited to fast formatting and static checks. This avoids maintaining a remote CI gate while preserving code review, owner approval, independent review, human/device checks, and deployment evidence as separate gates. Remove the workflows and the required Fast CI status together; this ADR records the accepted target, not a claim that implementation is already complete.
