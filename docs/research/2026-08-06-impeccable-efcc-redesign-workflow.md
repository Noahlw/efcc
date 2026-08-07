# Impeccable Workflow & Context7 Availability for the EFCC Redesign

**Date:** 2026-08-06
**Target:** The EFCC full-product "Minimal" frontend redesign (Cloudflare/React/Next.js map, per
[#117](https://github.com/Noahlw/efcc/issues/117)).
**Question:** What is the authoritative Impeccable workflow the prototype and design-contract tickets
must follow, and what Context7-backed documentation exists for the skill?
**Ticket:** [#177](https://github.com/Noahlw/efcc/issues/177) (labels `wayfinder:child`, `wayfinder:research`).

---

## TL;DR

1. **The authoritative source is the locally installed Impeccable skill, version 4.0.4**, at
   `~/.claude/skills/impeccable` (→ `~/.agents/skills/impeccable/`). It is a first-party Claude skill
   (part of `anthropics/skills`); the repo's own copy of the workflow is the installed `SKILL.md` +
   `reference/` tree, not any external doc. There is **no usable Context7 source**: every Context7 call
   (`resolve-library-id`, `query-docs`) fails with `Invalid API key`, so the environment cannot reach
   Context7 at all, and the "impeccable" skill is not a Context7-catalog library anyway.
2. **Setup/context:** run `node <skill-base>/scripts/context.mjs --target <path>` once per session.
   This repo has **no `PRODUCT.md`** (only `.impeccable/config.local.json`, hook consent accepted), so a
   full-product redesign routes through `$impeccable init` (write `PRODUCT.md`) **then** `new-work`
   (create/replace the visual world). The EFCC surfaces are **Operate** mode (church-management app:
   dashboards, forms, scanners, enrollment) — scanability and native expectations outrank expression.
3. **Shape/new-work:** for a new or replacement visual world, run the concept roll
   (`concept-seed.mjs --scope surface --mode <mode>`), present the dealt directions on the decision page
   (`serve-question.mjs`), commit the world (color strategy + typefaces), record the direction contract
   in the emitted markup, build fully committed, then finish (inspect + reviewer + documenter).
4. **Craft floor:** load `reference/craft-floor.md` immediately before editing UI. It sets the quality
   floor (contrast ≥4.5:1, type measure 65–75ch, one authored motion moment, real states/copy/coverage)
   and the absolute refuses (kickers/eyebrows, gradient text, glyph icons, hard offset shadows, system
   display faces, template cards, hero-metrics, `border-left/right` stripes, decorative glass).
5. **Review workflow:** bounded-pass verification, not an open loop. One batched desktop+mobile
   screenshot round → fix everything it shows in one batch → confirm with at most one more round. The
   design detector hook is enabled (`.impeccable/config.local.json`, `hook.consent: accepted`) and
   auto-runs after UI edits. Finish = spawn the **shipped `impeccable-finish-reviewer`** fresh (no
   inherited history) with the request, answers, artifact + screenshot paths, direction contract, hook
   findings, QUALITY BAR card + comp, and craft-floor path; it returns `disposition` (rebuild/fix/ship)
   + five contract sections. Apply fixes in one batch, rebuild, recapture, get a verdict. Then spawn the
   **shipped `impeccable-documenter`** to write `DESIGN.md` + the `.impeccable/design.json` sidecar from
   the built world.
6. **Durable artifacts the implementation must preserve:** `PRODUCT.md`, `DESIGN.md` +
   `.impeccable/design.json`, `.impeccable/config.local.json` (hook consent), per-route surface briefs,
   `.impeccable/sketches/` and `.impeccable/mocks/` (comps + approval records), and the enabled hook. The
   **Sheet-immutable rule** (Steering) is a project constraint the redesign must respect — the UI must
   not write to the Google Sheet DB.

---

## 1. Source of truth: the installed skill, v4.0.4

- The skill is installed locally and is the canonical reference. Symlink chain:
  `~/.claude/skills/impeccable` → `~/.agents/skills/impeccable/`
  ([verified](https://github.com/Noahlw/efcc/blob/main/AGENTS.md) `ls` of the skill tree).
- `SKILL.md` declares `version: 4.0.4`. The tree ships `SKILL.md`, `scripts/` (context.mjs, detect.mjs,
  concept-seed.mjs, serve-question.mjs, surface-brief.mjs, doctor.mjs, hook-admin.mjs, pin.mjs, live-*),
  `reference/` (new-work.md, craft-floor.md, init.md, document.md, routing.md, shape.md, hooks.md,
  doctor.md, operate.md, and the rest of the command playbooks), and `agents/` (the shipped
  `impeccable_finish_reviewer.toml`, `impeccable_documenter.toml`, `impeccable_asset_producer.toml`,
  `impeccable_manual_edit_applier.toml`).
- The skill is a first-party Anthropic skill (the public `anthropics/skills` repo hosts it); the
  installed files, not a web page, are what the redesign must follow.

### Context7 availability limitation (recorded, blocking for this purpose)

- `CONTEXT7_API_KEY` **is set** in the environment, but the key is **invalid**: both
  `resolve-library-id` and `query-docs` return
  `Invalid API key. Please check your API key. API keys should start with 'ctx7sk' prefix.`
  (verified by direct calls 2026-08-06). **Context7 is therefore not usable in this environment.**
- Independent of the key, the "impeccable" skill is a **Claude skill, not a code library** in Context7's
  catalog; there is no `/org/project` library for it to fetch. The authoritative source is the local
  skill install, not Context7.
- Implication for the prototype/design tickets: do **not** plan to cite Context7 for Impeccable
  workflow facts; cite the local skill files (paths below). If Context7 is later needed for
  frontend-library research (React/Next.js), the API key must be repaired first.

---

## 2. Setup & context loading

- **One-time per session:** run
  `node <skill-base-dir>/scripts/context.mjs --target <path>` (keep cwd at the project). The skill note
  says to use the loaded base dir if the runtime shows it; here that is
  `~/.agents/skills/impeccable/scripts/context.mjs`. It loads `PRODUCT.md`, `DESIGN.md` when present,
  the matching surface brief, and native-platform guidance. Do not rerun it in the session.
- **This repo state:** no `PRODUCT.md`, no `DESIGN.md`, no surface briefs exist yet. The only
  `.impeccable/` file is `config.local.json` = `{ "hook": { "consent": "accepted" } }` (the design
  detector hook is consented/enabled). `context.mjs` will therefore print a `NO_PRODUCT_MD:` branch.
- **Consequence:** a full-product redesign (new surface / replacement world) is **not** greenfield
  despite the missing files — `new-work` decides preserve/expand/replace from the code. It must first
  complete `init` (interview → write `PRODUCT.md` at project root), then enter `new-work`.
- **Mode:** the target surfaces are the church-management app (login, shell/nav, programs, enrollment,
  scanner, care, events, attendance) → **Operate**. Mode is chosen per surface, not per product; a
  landing page inside the product is still Persuade. Operate means scanability, consistency, native
  expectations, and the real usage scene outrank expression; brand lives in precise details.

---

## 3. Shape / new-work flow (full-product redesign)

`new-work.md` is the playbook for a new surface or replacement visual world. Sequence:

1. **Decide what is already true.** Redesign preserves **product truth, content, function, constraints,
   and explicit brand commitments** and **replaces** the old visual world rather than polishing it; the
   old look is evidence, not authority. (EFCC product truth lives in `CONTEXT.md` + `docs/adr/` +
   `docs/specs/`; the Sheet-immutable rule is a preserved constraint.)
2. **Ask what will change the work** (one compact round via the structured question tool when
   available): what success looks like, what must remain untouched, what would make a polished result
   feel wrong. For Operate: the task, important states, frequency, constraints. For a full redesign this
   is the design-contract interview.
3. **Choose the amount of invention.** A whole-product visual-world replacement runs the concept roll:
   - `node <skill-base>/scripts/concept-seed.mjs --scope surface --mode <mode>` — deals 5–7 materially
     different structures; the script assigns which gets built (the dice come from outside).
   - Present the dealt directions on the decision page: author the options payload, run
     `node <skill-base>/scripts/serve-question.mjs --start --payload <file>` (prints URL + key), open it
     for the user, collect the choice with `--wait --key <key>`. Every direction must already be viable
     on truth; the "canon" (category standard) card is the standing exit, never recommended.
   - When image generation exists, each card also carries a `sketch` under `.impeccable/sketches/`
     (flat, deliberately unfinished, matched framing).
4. **Commit the world.** Pick a color strategy (Restrained / Committed / Full palette / Drenched —
   Operate/Read default to Restrained) and choose faces from the subject's world, not the training-data
   defaults. Avoid the calibration ruts (cream+serif, near-black+one neon, editorial hairlines).
5. **Record the decision.** Before code, state the chosen direction as a contract comment in the
   artifact's opening markup (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM + FINISH line, ≤150
   words, first child of `<body>` in the root layout; verify it survives the production build). **On a
   new/replacement world, `DESIGN.md` is written at finish by the documenter from the built world** — not
   before the build.
6. **Build with full commitment.** Phase one reproduces the approved comp near-pixel-perfectly at its
   breakpoint (overlap comparison is the authority); phase two adds motion/interactivity/responsiveness.
   Commit every atom in the form's vocabulary; preserve semantics, a11y, performance, responsiveness,
   project conventions, and working behavior.

---

## 4. Craft floor (`reference/craft-floor.md`)

Load **immediately before editing UI** (not for planning only). It sets the quality floor and the
absolute refuses. The floor holds mechanics; it never picks the direction.

- **Verify (checks on the built result, run together in the batched inspection rounds):**
  - Contrast: body/placeholder text ≥4.5:1, large text ≥3:1; on colored surfaces tint secondary text
    from the hue, never gray.
  - Depth: shadows carry an offset + soft blur; a zero-offset halo is decoration.
  - Spacing: tight groups, generous separation, more space above a heading than below.
  - Type: body measure 65–75ch, display max 6rem, tracking floor −0.04em, balanced headings, obvious
    scale/weight steps; run real copy at every breakpoint.
  - Motion: one authored moment, exponential ease-out from a visible default; reach past
    transform/opacity (blur, backdrop-filter, clip-path, mask, shadow).
  - States: hover, disabled, loading, error, empty; real content, working controls, responsive
    composition, keyboard focus.
  - Copy: the product's own language; controls name their action, errors name the problem + recovery.
  - Coverage: every brief requirement present and findable within seconds.
- **Refuse (category defaults; a pinned brief can earn any back, but reaching for one on a free axis
  means you stopped deciding):** kickers/eyebrows above a heading (a ban, nothing earns it back),
  gradient text, decorative glass/blur, `border-left/right` stripes >1px on cards/list items, hard
  offset shadows outside a neobrutalist world, sparklines/progress-rings/soft-shadowed rounded rects
  standing in for content, mono-as-costume, system display faces, emoji/Unicode glyphs as icons, light/
  dark picked by category, section numbers (01/02/03) unless the sequence carries information, same-size
  icon+heading+text cards as the page structure, hero-metric templates, modals for tasks that need
  neither interruption nor protected focus, `feTurbulence`/sketch-style SVG grain (real illustration or
  none; geometric SVG is fine).
- **Pinned briefs and the committed visual world override the floor; your own habit never does.**

---

## 5. Review workflow (bounded passes, then the finish handoffs)

- **Bounded inspection:** inspect desktop and mobile **in one batched screenshot round**, critique the
  render against the request and the direction contract, fix material gaps in one batch, confirm with at
  most one final round. **Two rounds is the ceiling.** No open-ended self-QA. When a comp exists, the
  critique is a side-by-side at legible scale (hero + each section cropped), never one full-page
  thumbnail.
- **Design detector hook (enabled):** `.impeccable/config.local.json` has `hook.consent: accepted`, so
  the hook auto-runs the detector after UI file edits and surfaces findings (`$impeccable hooks` manages
  it). In a hookless build the fallback is `node <skill-base>/scripts/detect.mjs --json <targets>`.
- **Stop polishing after the second inspection round.** Whatever remains ships through the handoffs.
- **Finish review (must be a fresh context):** capture desktop + mobile screenshots to files, then spawn
  the shipped **`impeccable-finish-reviewer`** with: original request, confirmed answers, artifact path,
  screenshot paths, its direction contract, existing hook findings, QUALITY BAR card + approved comp
  paths, and the craft-floor reference path. The reviewer has no browser — screenshots you fail to pass
  are checks it cannot run. **Never read the shipped agents' definition files before spawning** and never
  fork history into it. It returns `disposition` (rebuild / fix / ship) then five sections: `persistence`,
  `fidelity` (element matrix), `ceiling`, `material_fixes` (≤8, ordered), `keep`. A first material fix
  that is a rebuild directive means fidelity failed wholesale → execute the rebuild, not a fix batch.
  Apply material fixes in one batch, rebuild once, recapture the same viewports, send back for a
  **verdict** (each fix scored resolved/partial/unresolved). Two rounds is the unattended budget; an
  attended session's ceiling belongs to the user (put the open-item table in front of them). Report the
  verdict table verbatim under the reviewer's disposition word.
- **Documenter:** after review closes, spawn the shipped **`impeccable-documenter`** with the project
  root, artifact path, direction contract, `PRODUCT.md`, `reference/document.md`, and the write boundary.
  It records `DESIGN.md` + the `.impeccable/design.json` sidecar from the built world (ground truth over
  intention). A clean detector pass is not finished; finished = contract kept, comp honored, review
  closed, system recorded.
- **Drift:** `$impeccable doctor` reports/repairs drift between artifacts and what this version reads; a
  `CONTEXT_STALE` directive in `context.mjs` output is reported, not acted on, unless the user asks.
  Never repair drift as a side effect of a design task.

---

## 6. Durable artifacts the implementation must preserve

| Artifact | Path | Purpose |
|---|---|---|
| `PRODUCT.md` | project root | Durable product truth (users, jobs, workflows, platform, stack, commitments). Missing today → must be created via `init` before visual work. |
| `DESIGN.md` | project root | Durable visual decisions (official DESIGN.md spec: YAML token frontmatter + up to 8 fixed-order sections). Written **at finish** by the documenter. |
| `.impeccable/design.json` | project root | Sidecar extensions (tonal ramps, elevation/motion tokens, breakpoints, component HTML/CSS, narrative). Regenerated with `DESIGN.md`. |
| `.impeccable/config.json` + `config.local.json` | project root | Skill config; `config.local.json` currently holds the accepted hook consent — do not regress it. |
| Surface briefs | per route/artifact | Scope/strategy that belongs to one surface (via `surface-brief.mjs read/write`). |
| `.impeccable/sketches/`, `.impeccable/mocks/` | project root | Concept sketches, comps, and approval records (required for the finish reviewer's persistence check). |
| Design detector hook | enabled | Auto-runs after UI edits; preserves the finish-review input chain. |

**Must not be violated:** the **Sheet-immutable rule** (AGENTS.md) — the Google Sheet DB is read-only
for agents; redesign visuals must not add UI that writes to Sheets. The `Users` tab is strictly
immutable; only CI may reset `E2E_`-prefixed rows per ADR-0013.

---

## 7. Exact starter sequence for the prototype/design-contract tickets

1. `node ~/.agents/skills/impeccable/scripts/context.mjs --target <frontend surface>` (once per session).
2. `$impeccable init` → interview → write `PRODUCT.md` (confirms the platform/stack; EFCC frontend is
   web). Resume without rerunning `context.mjs`.
3. `$impeccable shape <surface>` (task discovery + brief confirmation) or go straight to `new-work` for
   the visual-world decision.
4. `new-work`: concept roll (`concept-seed.mjs`), decision page (`serve-question.mjs`), commit the
   world, write the direction contract, build fully committed while holding `craft-floor.md`.
5. Finish: batched screenshots (≤2 rounds) → `impeccable-finish-reviewer` → fix/verdict loop →
   `impeccable-documenter` → `DESIGN.md` + sidecar.

---

## Sources

- Local skill install (authoritative), version 4.0.4: `~/.claude/skills/impeccable` →
  `~/.agents/skills/impeccable/` — `SKILL.md`, `reference/new-work.md`, `reference/craft-floor.md`,
  `reference/init.md`, `reference/document.md`, `reference/routing.md`, `reference/shape.md`,
  `reference/hooks.md`, `reference/doctor.md`, `scripts/context.mjs`,
  `agents/impeccable_finish_reviewer.toml`, `agents/impeccable_documenter.toml`.
- Repo artifacts: `.impeccable/config.local.json` (hook consent accepted); `AGENTS.md` (Sheet-immutable,
  Headless-Gate, Docs-Backed rules); `CONTEXT.md` (domain model, D1 restart, ADR index).
- Context7: `resolve-library-id` and `query-docs` both returned `Invalid API key` (2026-08-06);
  `CONTEXT7_API_KEY` set but not `ctx7sk…`. Context7 is **not usable** in this environment.
- First-party skill provenance: `anthropics/skills` public repo hosts the Impeccable skill
  ([repo](https://github.com/anthropics/skills), [topic listing](https://github.com/topics/anthropic-skills)).