# Optimize AGENTS.md and Wire Rule Books Implementation Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis).

**Goal:** Compress project `./AGENTS.md` and global `~/.omp/agent/AGENTS.md` down to high-density leading-word formats while preserving 100% of enforcement gates, and vendor `agent-rules-books` into `~/.omp/agent/rules/` with explicit skill pointers.

**Architecture:** Project `./AGENTS.md` is reduced to 19 lines of checkable gates (`Docs-Backed`, `Headless-Gate`, `Sheet-Immutable`). Global `AGENTS.md` drops the 28-line Context Mode section while retaining all core OMP execution invariants and a 4-book `nano` developer discipline block. Canonical `.mini.md` book rules are vendored to `~/.omp/agent/rules/` and linked via context pointers in global OMP skills (`code-review`, `implement`, `diagnosing-bugs`).

**Tech Stack:** OMP Markdown agent rules, POSIX shell file operations, Matt Pocock `agent-rules-books` distills.

## Global Constraints

- Project `./AGENTS.md` MUST retain all checkable gates: Context7 priority order, pre-implementation plan ordering, mechanical edit exemption, observable DOM state assertion rule, Playwright vs Orca `Stateless-Wall` routing, ADR-0012 result logging, Sheet manual edit rule, fail-closed `E2E_` fixture exceptions, and ADR-0013 reference.
- Global `~/.omp/agent/AGENTS.md` MUST retain all execution invariants (`Matt-Flow`, `Session-Recall`, `Search-First`, `Tight-Loop`, `Token-Budget`, `Planner-Acceptance`, `Serial-Default`, `Delegation-Gate`).
- Rule books MUST be vendored to `~/.omp/agent/rules/` to ensure path stability across sessions.

## File Structure & Changes

- Create: `~/.omp/agent/rules/*.mini.md` — Vendored canonical book rule sets.
- Modify: `AGENTS.md:1-107` — Compress project AGENTS.md to 19 lines.
- Modify: `~/.omp/agent/AGENTS.md:1-120` — Remove Context Mode section from global AGENTS.md while retaining invariants.
- Modify: `~/.omp/agent/skills/code-review/SKILL.md` — Add context pointers to APoSD and Clean Code mini rules.
- Modify: `~/.omp/agent/skills/implement/SKILL.md` — Add context pointer to Refactoring mini rules.
- Modify: `~/.omp/agent/skills/diagnosing-bugs/SKILL.md` — Add context pointer to Release It! mini rules.

## What Already Exists

- Cloned rule books repo at `~/Desktop/agent-rules-books`.
- Original OMP global instructions at `~/.omp/agent/AGENTS.md`.
- Original project guidance at `./AGENTS.md`.

## Not In Scope

- Modifying the underlying Playwright pipeline scripts (`tests/e2e/`).
- Modifying project source code or Google Apps Script `.gs` files.

---

### Task 1: Vendor Rule Books into Global OMP Directory

**Files:**
- Create: `~/.omp/agent/rules/a-philosophy-of-software-design.mini.md`
- Create: `~/.omp/agent/rules/clean-code.mini.md`
- Create: `~/.omp/agent/rules/refactoring.mini.md`
- Create: `~/.omp/agent/rules/release-it.mini.md`
- Create: `~/.omp/agent/rules/working-effectively-with-legacy-code.mini.md`
- Create: `~/.omp/agent/rules/domain-driven-design.mini.md`
- Create: `~/.omp/agent/rules/the-pragmatic-programmer.mini.md`

**OMP dispatch:**
- Agent type: `task`
- Inputs to subagent: Task block + Plan Header
- Reviewer gate: `reviewer` agent check

**Interfaces:**
- Consumes: Files in `~/Desktop/agent-rules-books/`
- Produces: Persistent files under `~/.omp/agent/rules/`

- [ ] **Step 1: Create global rules directory**
Run: `mkdir -p ~/.omp/agent/rules`

- [ ] **Step 2: Copy canonical mini rule files**
Run: `cp ~/Desktop/agent-rules-books/*/*.mini.md ~/.omp/agent/rules/`

- [ ] **Step 3: Verify vendored files exist**
Run: `ls -la ~/.omp/agent/rules/*.mini.md`
Expected: 14 `.mini.md` files listed.

- [ ] **Step 4: Commit/Verify**
Verify file count equals 14.

---

### Task 2: Wire Context Pointers into OMP Global Skills

**Files:**
- Modify: `~/.omp/agent/skills/code-review/SKILL.md`
- Modify: `~/.omp/agent/skills/implement/SKILL.md`
- Modify: `~/.omp/agent/skills/diagnosing-bugs/SKILL.md`

**OMP dispatch:**
- Agent type: `task`
- Inputs to subagent: Task block + Plan Header
- Reviewer gate: `reviewer` agent check

**Interfaces:**
- Consumes: Vendored rules under `~/.omp/agent/rules/`
- Produces: Updated skill instructions in `~/.omp/agent/skills/`

- [ ] **Step 1: Update `code-review/SKILL.md`**
Add context pointers to `a-philosophy-of-software-design.mini.md` and `clean-code.mini.md` under Standards sources section.

- [ ] **Step 2: Update `implement/SKILL.md`**
Add context pointer to `refactoring.mini.md` under Implementation guidelines.

- [ ] **Step 3: Update `diagnosing-bugs/SKILL.md`**
Add context pointer to `release-it.mini.md` under Diagnosis guidelines.

- [ ] **Step 4: Verify skill file pointers**
Run: `grep -H "agent/rules" ~/.omp/agent/skills/*/SKILL.md`
Expected: Pointers found in `code-review`, `implement`, `diagnosing-bugs`.

---

### Task 3: Refactor Project `./AGENTS.md`

**Files:**
- Modify: `AGENTS.md:1-107`

**OMP dispatch:**
- Agent type: `task`
- Inputs to subagent: Task block + Plan Header
- Reviewer gate: `reviewer` agent check

**Interfaces:**
- Consumes: Existing project rules
- Produces: 19-line project `AGENTS.md`

- [ ] **Step 1: Write ultra-concise project AGENTS.md**
Write 19-line leading-word version covering `Docs-Backed`, `Headless-Gate` (with mechanical exemption & DOM observation rule), and `Sheet-Immutable` (with fail-closed E2E exception).

- [ ] **Step 2: Verify line count and gate presence**
Run: `wc -l AGENTS.md`
Expected: $\le 22$ lines.

- [ ] **Step 3: Grep check key enforcement terms**
Verify `Context7`, `Stateless-Wall`, `ADR-0012`, `ADR-0013`, `E2E_`, `Users`, and `DOM state` exist in file.

---

### Task 4: Refactor Global `~/.omp/agent/AGENTS.md`

**Files:**
- Modify: `~/.omp/agent/AGENTS.md:1-120`

**OMP dispatch:**
- Agent type: `task`
- Inputs to subagent: Task block + Plan Header
- Reviewer gate: `reviewer` agent check

**Interfaces:**
- Consumes: Original global AGENTS.md
- Produces: Refactored global AGENTS.md without Context Mode section

- [ ] **Step 1: Write refactored global AGENTS.md**
Write global file retaining `Matt-Flow`, `Session-Recall`, `Search-First`, `Tight-Loop`, `Token-Budget`, `Planner-Acceptance`, `Serial-Default`, `Delegation-Gate`, and `Pragmatic-Developer` nano block. Omit Context Mode section.

- [ ] **Step 2: Verify line count**
Run: `wc -l ~/.omp/agent/AGENTS.md`
Expected: $\approx 65-75$ lines.

- [ ] **Step 3: Verify all invariants present**
Verify `Session-Recall`, `Search-First`, `Tight-Loop`, `Planner-Acceptance`, `Serial-Default`, and `Delegation-Gate` exist in file.
