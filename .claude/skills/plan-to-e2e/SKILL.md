---
name: plan-to-e2e
description: >
  Orchestrate the full development lifecycle as a thin composition of three
  skills: plan-designer → plan-executor → e2e-parallel. The main agent only
  sequences sub-agents and reports; all design, phase execution, and E2E
  fixing are delegated to their respective skills.
  Trigger when the user says things like:
  - "계획 세우고 구현해줘"
  - "Plan and execute"
  - "Plan then implement"
  - "처음부터 끝까지 구현해줘"
  - Any request to design a plan and then execute it end-to-end.
---

## Purpose

You are the **Orchestrator**. You compose three existing skills in sequence and never duplicate their logic:

1. **plan-designer** — design a phased plan from the user's goal.
2. **plan-executor** — execute all phases (with preflight, regression smoke, optional plan audit).
3. **e2e-parallel** — run and fix Playwright E2E tests.

You do not implement code, design phases, run verifications, or fix E2E tests yourself. Each step is a single sub-agent invocation.

---

## Architecture

```
ORCHESTRATOR (main thread, very thin)
 ├─ [1] DESIGN     : spawn sub-agent → plan-designer skill
 │                   ← PLAN_ROOT
 ├─ [2] EXECUTE    : spawn sub-agent → plan-executor skill
 │                   ← per-phase commits, halt status
 ├─ [3] E2E        : spawn sub-agent → e2e-parallel skill   (skippable)
 │                   ← pass/fail table
 └─ [4] REPORT     : aggregate the three structured replies
```

Sequential by necessity: each step's output is the next step's input.

---

## Step 1 — Plan Design

Spawn a sub-agent and instruct it to run the `plan-designer` skill. Do not paste skill content; the sub-agent loads the skill itself.

Sub-agent prompt:

```text
Use the plan-designer skill to design a phased plan for the user goal below.
Follow the skill's full workflow including the mandatory grill-me review.

USER GOAL:
<paste the user's original request>

CONTEXT:
- Today's date: <YYYY-MM-DD>
- Working directory: <repo root>
- Existing plans live under docs/plans/.
- Read CLAUDE.md for architecture and tooling.

When the plan is final, reply with exactly:
  PLAN_ROOT: <relative path to the plan directory>
  PHASES: <count>
```

If the sub-agent does not return a valid `PLAN_ROOT`, halt and ask the user to verify the plan.

---

## Step 2 — Execute Plan

Spawn a single sub-agent and instruct it to run the `plan-executor` skill against `PLAN_ROOT`. The `plan-executor` skill owns the per-phase loop, preflight, regression smoke, and conditional plan audit — do not reimplement them here.

Sub-agent prompt:

```text
Use the plan-executor skill to execute this plan end-to-end.

PLAN_ROOT: <PLAN_ROOT>

Follow the skill's full workflow: discovery, preflight, sequential per-phase
delegation to phase-executor, regression smoke between phases, conditional
plan audit, and halt-on-failure policy.

When done, reply with exactly:
  STATUS: COMPLETED | HALTED at <phase>
  PHASE_COMMITS:
    - <hash> <phase folder>: <message>
    - ...
  PLAN_AUDIT: <PASS | FAIL | skipped>
  BLOCKERS: <none, or list>
```

If `STATUS: HALTED`, skip Step 3 and proceed directly to Step 4 with the halt context.

---

## Step 3 — E2E Tests

Only run when Step 2 returns `STATUS: COMPLETED` **and** the user has not requested to skip E2E.

The user may opt out by saying "skip e2e", "e2e 건너뛰어", "no e2e" anywhere in the original request. In that case, skip Step 3 and proceed to Step 4.

Sub-agent prompt:

```text
Use the e2e-parallel skill to run and, if necessary, fix the Playwright E2E
suite for this repository.

CONTEXT:
- All implementation phases are complete.
- The dev server may already be running; check before starting one.
- Do not modify playwright.config.ts.

When done, reply with exactly:
  E2E_STATUS: PASS | PARTIAL | FAIL
  SUMMARY_TABLE:
    | File | Tests fixed | Root cause | Files changed |
    | ... |
  REMAINING_FAILURES: <none, or list>
```

If `E2E_STATUS: PARTIAL` or `FAIL`, list remaining failures to the user in Step 4 — do not auto-retry.

---

## Step 4 — Final Report

Aggregate the three structured replies. Do not re-read raw logs.

```text
## Orchestration Complete

### Plan
- Plan root: <PLAN_ROOT>
- Phases: <count>

### Execution
- Status: <COMPLETED | HALTED at phase_XX_...>
- Plan audit: <PASS | FAIL | skipped>
- Commits:
  - <hash> phase_01_...: <message>
  - ...

### E2E
<one of:
 - "Skipped (user request)"
 - "Skipped (execution halted)"
 - E2E_STATUS line + SUMMARY_TABLE
>

### Blockers
- <unresolved item from any step, or "None">

### Recommended next actions
- <e.g., "Restart plan-executor after resolving regression in phase_04">
- <e.g., "Investigate remaining E2E failures in tests/e2e/foo.spec.ts">
```

---

## Orchestrator Rules

- Do not paste any sub-skill's SKILL.md content into prompts — reference by name only.
- Do not implement, design, verify, or fix anything yourself. If you would touch a source file, you have lost the plot.
- Do not duplicate plan-executor's per-phase loop. One sub-agent call covers all phases.
- Do not auto-retry on halt or partial E2E failure — surface to the user and stop.
- Do not run `git` commands beyond inspecting branch state, if needed, before Step 1.

---

## Stop Conditions

Halt and ask the user when:

- Step 1 sub-agent does not return a valid `PLAN_ROOT`.
- Step 2 sub-agent returns `HALTED`.
- Step 3 sub-agent returns `PARTIAL` or `FAIL` with remaining failures.
- The user's original request is too ambiguous to hand to plan-designer without first clarifying (in that case, ask before spawning Step 1).
