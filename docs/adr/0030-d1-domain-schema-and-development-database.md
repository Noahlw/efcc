# ADR-0030 — D1 Domain Schema, Generic Audit, and Development-Database Directive

The D1 Programs/Enrollment domain (Spec #190) starts from an empty baseline and owns the entire relational schema in `docs/specs/080-d1-relational-schema.md`: TEXT UUID PKs, ISO-8601 UTC TEXT timestamps, `ON DELETE RESTRICT` FKs (D1 enforces them by default), and CHECK constraints on every closed vocabulary. The `audit_events` table is rebuilt generically — one immutable append-only stream addressed by `entity_type`/`entity_id` with ADR-0023's `outcome`/`correlation_id` vocabulary — superseding ADR-0023's per-entity-column Sheet shape for D1 (the Sheet `Audit_Log` remains for legacy). The same D1 database is used for development as for production unless a concrete split need appears; the new domain starts fresh from the latest `main` database with no xlsx import, no Sheet adapter, and no dual-write path.

**Status:** Accepted (Spec #190 grilling, 2026-08-06)
**Supersedes (D1 side):** ADR-0023's audit-table shape
**Related:** [Spec #190](https://github.com/Noahlw/efcc/issues/190) · [Decision #184](https://github.com/Noahlw/efcc/issues/184) · [Schema 080](docs/specs/080-d1-relational-schema.md)

## Considered options

- **Per-entity audit columns** (ADR-0023's `Target_Program_ID`/`Target_Event_ID`) → rejected; column growth forks one stream into many. Generic `entity_type`/`entity_id` is the deliberate polymorphic-FK exception (the only authorized one).
- **Separate archive tables** for ten-year history → deferred to #206 (`type:optional`); soft-delete lifecycle is the baseline.
- **Separate dev database** → rejected absent a concrete need; single DB keeps the acceptance trace honest against the real deployment.

## Consequences

- PRG-01 (#197) turns schema 080 into `web/migrations/0001_*.sql`; the `Teacher→Staff` role migration is handled first in the current PR stack (rebase onto `ui-04-196`).
- Identity tables keep epoch-millis until a separate table-rebuild migration; code must handle the dual-format transitional state.
- `audit_events` immutability is enforced by triggers shipped in `0001_*.sql`.