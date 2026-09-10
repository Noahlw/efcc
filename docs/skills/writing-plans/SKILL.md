---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, exact function/type names and signatures, interface contracts, testing strategy, and expected behavior per step. Plans contain instructions, not implementation code. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `using-git-worktrees` skill at execution time.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Scope Challenge (Reuse & Minimalism)

Before turning the spec into tasks, run this check:

1. **Reuse vs. rebuild:** What existing code, utilities, or flows already solve part of this? Name them.
2. **Ruthless minimalism:** What's the smallest change that actually hits the spec's goal? Cut anything speculative.
3. **Size smell:** If the plan would touch more than ~8 files or introduce more than ~2 new classes/services, pause and reconsider decomposition before writing tasks.
4. **Framework-first:** Before designing a custom mechanism, check whether the language/framework/library already has a built-in for it.
5. **Completeness over shortcut:** When a corner-cutting shortcut and the complete version cost about the same (tests, edge cases, error paths), plan for the complete version.
6. **Distribution check:** If the plan introduces a new distributable artifact (CLI, library, package, container image), the plan must include how it's built/versioned/shipped — or explicitly defer that as out of scope.

## Test Coverage Design

Before writing tasks, design the test coverage — don't discover it task-by-task:

1. **Detect the test framework** already in use in this codebase (check `CLAUDE.md`, existing test files, config).
2. **Trace the data flow**: input → validation → computation/mapping → storage → output/response. Note every branch and error path. A short ASCII diagram of the flow with branch points is useful for anything non-trivial.
3. **Pick the right test level per flow**: unit tests for pure functions/logic, integration/E2E for anything crossing 3+ components, eval-style tests for LLM/prompt-driven behavior.
4. **Regression rule**: if a task changes existing behavior (not just adds new), it must include a regression test that would have failed under the old behavior.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

## File Structure & Changes

[From the File Structure step above: which files are created/modified and what each is responsible for.]

## What Already Exists

[From the Scope Challenge step: existing code/utilities/flows this plan reuses instead of rebuilding.]

## Not In Scope

[Explicitly excluded work, so a future reader doesn't wonder why it's missing.]

## ASCII Diagrams

[Data flow / state machine / architecture sketch from the Test Coverage Design step, where non-trivial.]

## Failure Modes & Gaps

[Known edge cases, error paths, or open risks the plan doesn't fully close — named, not hidden.]

## Parallelization / Worktree Strategy

[Whether tasks can run in parallel across worktrees (see using-git-worktrees), or must run sequentially, and why.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write a failing test**

Test intent: verify that `function(input)` returns `expected` for case X (describe the case).
Test framework: [pytest/jest/unittest/etc]. File: `tests/exact/path/to/test.py`.
The test must fail initially with error "function not defined" or similar.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement the function**

Location: `src/path/file.py`
Function name: `function(input)` → returns [exact type]
Behavior: accept input of type [X], perform [specific operation], return [Y].
Handle edge case [Z] by [how].
Do NOT include error handling for [constraint]; that's in Task M.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

Commit message: "feat: add specific feature"
Stage: `tests/exact/path/to/test.py` and `src/path/file.py`
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases" (be explicit: what error? how handle it?)
- "Write tests for the above" (without concrete test intent or case description)
- "Similar to Task N" (repeat the instructions — the engineer may be reading tasks out of order)
- Vague instructions (e.g. "implement a function" without the function name, parameter types, return type, or expected behavior)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Precise instructions, not code — exact function/type names, parameter types, return types, and expected behavior per step; leave implementation to the executing agent
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Instruction clarity scan:** Search your plan for vague or incomplete instructions — missing function names, parameter types, return types, expected behavior, or edge case handling. Ensure every step describes exactly what to do without leaving guesses for the implementer.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Boring by default:** Does the plan reach for proven, well-understood tech over novel/clever approaches where both would work?

**5. Systems over heroes:** Would this plan still make sense to a tired developer picking it up cold, or does it assume unusual focus/cleverness to execute correctly?

**6. Reversibility:** Are the changes easy to roll back if something goes wrong? Flag any step that isn't.

**7. Essential vs. accidental complexity:** Is any of this complexity solving a problem the spec doesn't actually have?

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## No Implementation Code

**Plans contain instructions, not finished code.** A plan should give the implementing agent everything they need — exact file paths, function/type names and signatures, data flow, edge cases, expected behavior — but the actual code writing belongs to the agent that executes the plan (`subagent-driven-development` or `executing-plans`).

**What belongs in a plan:**
- Exact function/type names, parameter types, return types
- Expected behavior per function (what it does, what it returns for input X)
- Edge cases and how to handle them
- Data flow and state transitions (as text or ASCII diagram)
- Pseudocode when it clarifies a non-obvious algorithm
- Test intent and expected outcomes

**What does NOT belong in a plan:**
- Runnable, complete code that could be copy-pasted into the codebase
- Implementation details (code block syntax, libraries used, exactly how to compute something)

**Exception:** Brief ASCII diagrams, pseudocode, or illustrative code snippets that clarify a complex algorithm or data flow are fine — they aren't runnable in production, they're just teaching aids. If it would compile and run in the codebase as-is, it's too finished.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
<!-- Note: subagent-driven-development skill is not available -->
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- Batch execution with checkpoints for review

**Optional: track as an issue.** If the user wants this plan tracked as a backlog item rather than executed immediately, offer to hand it to the `spec` skill to file it as a GitHub issue instead of duplicating that flow here.
