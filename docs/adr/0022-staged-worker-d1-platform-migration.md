# Staged Worker/D1 platform migration

**Status: accepted.** Cloudflare Worker + D1 is the eventual platform owner for EFCC identity and domain capabilities, but the migration proceeds capability by capability. PR #166 establishes D1 as the Identity Authority for credentials, sessions, login, registration, and approval; Apps Script + Google Sheets remains the transitional Domain Backend for programs, events, attendance, enrollments, and other capabilities until each replacement has implementation and acceptance proof. This boundary keeps the new authentication foundation mergeable without deleting still-load-bearing domain behavior.

> **Amendment (2026-08-15): migration complete.** Programs, Events,
> Attendance, and Enrollments reached Worker/D1 parity, the web application
> cut over to those native surfaces, and no live caller of the Apps Script
> backend remained. `src/gas/`, `tests/gas/`, the clasp configuration, and
> the Worker's transitional `/api/v1/rpc` proxy were removed. The
> capability-by-capability staging below is complete.
