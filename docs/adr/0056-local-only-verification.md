---
status: accepted
date: 2026-09-23
supersedes: GitHub CI policy in ADR-0014 and ADR-0044
---

# Local-only verification

EFCC uses deterministic local `pnpm verify` as its complete machine-readiness gate; contributors run affected checks while iterating and keep pre-commit limited to fast formatting and static checks. Remove the GitHub Actions workflows and the `Fast CI` required status together. Code review, owner approval, independent review, human/device checks, and deployment evidence remain separate gates. This supersedes only the GitHub CI policy in ADR-0014 and ADR-0044; their historical testing rationale remains intact.
