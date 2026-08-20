# Origin-Aware Detail Navigation

**Status:** accepted

Participant detail Sections must preserve a validated first-party origin (`home`, `notices`, `messages`, or `programs`) when building canonical Program/Event/Message URLs, so a detail Back action returns to the Section that opened it instead of assuming the Programs catalog. The origin is a closed query enum rather than an arbitrary return URL because it survives refresh and copied deep links while remaining safe to validate; missing or invalid origins use canonical fallbacks. Stale or unauthorized Event Detail links keep the existing backend enrollment gate and show safe Program/Catalog recovery, never a failing Event CTA or a weakened authorization rule. Strict export-only schedule/history parity is deferred; this decision covers navigation behavior and recovery only.

**Consequences:** URL intent builders and parsers own origin validation; browser history remains an escape hatch but cannot be the only Back implementation. New route-contract tests are required for Home, Notices, Messages, Program Detail, and Event Detail paths. `CONTEXT.md` defines the corresponding ubiquitous language as Origin-aware Back Navigation / 按來源返回.
