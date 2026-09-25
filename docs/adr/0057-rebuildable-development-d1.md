---
status: accepted
date: 2026-09-24
supersedes: ADR-0030's shared development/production D1 directive
---

# Rebuildable development D1

EFCC has no production D1 data to preserve. Every D1 target that is authoritatively verified as development or test may be rebuilt from the current Wrangler migration baseline and current seeds; production and unknown targets are excluded. A remote target is eligible only after its Cloudflare account, Worker, route, D1 binding/ID, environment, and rate-limit identity are verified and the empty local baseline passes. If any identity remains unknown, stop before a remote command. This changes only ADR-0030's development/production sharing directive; its historical schema rationale remains intact.
