---
name: plan-to-e2e
description: >
  Orchestrate the full development lifecycle: design a phased plan, implement each phase via
  isolated sub-agents, then run E2E tests. The main agent only orchestrates — all plan design,
  phase implementation, and E2E fixing are delegated to sub-agents.
  Trigger when the user says things like:
  - "계획 세우고 구현해줘"
  - "Plan and execute"
  - "Plan then implement"
  - "처음부터 끝까지 구현해줘"
  - Any request to design a plan and then execute it end-to-end.
---

## Purpose

You are the **Orchestrator**. You do not write application code directly. Your only job is to:

1. Delegate plan design to a Plan Designer sub-agent.
2. Delegate each phase implementation to a Phase Executor sub-agent, one phase at a time.
3. After all phases pass, delegate E2E testing to an E2E sub-agent.
4. Report the final outcome to the user.

You never implement code yourself. You never run lint, typecheck, or build yourself. If you find yourself about to edit a source file, stop and spawn a sub-agent instead.

---

## Step 1 — Plan Design (sub-agent)

Spawn a **Plan Designer** sub-agent with the user's goal and all relevant context. The sub-agent runs the full `plan-designer` skill workflow: clarifies scope via `grill-me`, drafts `README.md` and all `phase_*/plan.md` files, and confirms the plan is ready for execution.

Sub-agent prompt template:

```
You are running the plan-designer skill for this repository.

SKILL INSTRUCTIONS:
<paste the full contents of .claude/skills/plan-designer/SKILL.md here>

USER GOAL:
<paste the user's original request here>

CONTEXT:
- Working directory: <repo root>
- Today's date: <YYYY-MM-DD>
- Existing plans are under docs/plans/ — read them to understand conventions.
- Read CLAUDE.md for architecture, domain invariants, and tooling.

Complete the full plan-designer workflow including the mandatory grill-me review.
When the plan is final and all files are written, reply with:
  PLAN_ROOT: <relative path to the plan directory>
  PHASES: <ordered list of phase folder names, one per line>
```

Wait for the sub-agent to return `PLAN_ROOT` and `PHASES` before proceeding.

If the sub-agent does not return a valid `PLAN_ROOT`, stop and ask the user to verify the plan was created correctly.

---

## Step 2 — Phase Implementation (sub-agent per phase, sequential)

For each phase in the `PHASES` list, in order:

1. Spawn a **Phase Executor** sub-agent for that single phase.
2. Wait for the sub-agent to return `PASS` before spawning the next.
3. If the sub-agent reports `FAIL` after 5 audit rounds, stop and report the blockers to the user before continuing.

Do **not** spawn multiple phase sub-agents in parallel. Phases are sequential because each phase's output is the next phase's prerequisite.

Sub-agent prompt template (fill in placeholders before spawning):

```
You are running the phase-executor skill for one phase of a development plan.

SKILL INSTRUCTIONS:
<paste the full contents of .claude/skills/phase-executor/SKILL.md here>

PLAN ROOT: <PLAN_ROOT>
CURRENT PHASE: <phase folder name, e.g. phase_02_auth_foundation>
PHASE PLAN FILE: <PLAN_ROOT>/<phase folder>/plan.md

CONTEXT:
- Main repo path: <absolute path to main repo>
- Base branch: <current git branch>
- Read CLAUDE.md for architecture, domain invariants, and tooling.
- Do not implement scope from any other phase.

Execute only this phase:
1. Create a git worktree and branch for this phase.
2. Implement the phase scope inside the worktree.
3. Run the phase Test Plan inside the worktree.
4. Write verification evidence to <PLAN_ROOT>/<phase folder>/verification/verification.md.
5. Run the Auditor sub-agent loop until PASS or 5 rounds exhausted.
6. Commit and merge back to the base branch.

When done, reply with:
  PHASE: <phase folder name>
  STATUS: PASS | FAIL
  COMMIT: <hash> <message>
  BLOCKERS: <none or list of unresolved issues>
```

After each phase, record the commit hash and status in your orchestration log before proceeding to the next phase.

---

## Step 3 — E2E Tests (sub-agent)

After all phases report `STATUS: PASS`, spawn a single **E2E** sub-agent.

Sub-agent prompt template:

```
You are running the e2e-parallel skill for this repository.

SKILL INSTRUCTIONS:
<paste the full contents of .claude/skills/e2e-parallel/SKILL.md here>

CONTEXT:
- All implementation phases are complete.
- The dev server may need to be started; check whether it is already running before starting it.
- Do not modify playwright.config.ts.
- Do not restart the dev server if it is already running.

Run the full E2E suite. Fix any failures following the e2e-parallel workflow.
When done, reply with a summary table:
  | File | Tests fixed | Root cause | Files changed |
```

If the E2E sub-agent reports remaining failures it could not fix, list them to the user and ask whether to retry or proceed.

---

## Step 4 — Final Report

After E2E completes, report to the user:

```
## Orchestration Complete

### Plan
- Plan root: <PLAN_ROOT>
- Phases: <count>

### Phase Commits
- <hash> phase_01_...: <message>
- <hash> phase_02_...: <message>
- ...

### E2E Result
<pass count> / <total count> tests passing.
<table from E2E sub-agent, if any fixes were made>

### Blockers
<none, or list of unresolved issues with the phase and reason>
```

---

## Orchestrator Rules

- You are the **only agent** that reads the `PHASES` list and decides what to spawn next.
- You must read `PLAN_ROOT/README.md` after the Plan Designer sub-agent finishes to extract the ordered phase list, in case the sub-agent's reply is incomplete.
- You do not modify plan files unless a phase sub-agent explicitly tells you to update the orchestration log.
- You do not skip a phase, even if it looks trivial.
- You do not combine phases into a single sub-agent call.
- You do not run `git` commands yourself unless checking branch state before spawning a phase.
- If any sub-agent stops with an unresolvable blocker, surface it immediately and wait for the user's decision before continuing.
- If the user says "skip e2e" or "e2e 건너뛰어", omit Step 3 and go directly to Step 4.

---

## Sub-agent Skill Content

When building sub-agent prompts, paste the **full raw text** of the relevant SKILL.md file into the prompt. Do not summarize or paraphrase the skill instructions — the sub-agent must receive the complete specification.

Skill file paths (relative to repo root):
- Plan Designer: `.claude/skills/plan-designer/SKILL.md`
- Phase Executor: `.claude/skills/phase-executor/SKILL.md`
- E2E Parallel:  `.claude/skills/e2e-parallel/SKILL.md`

Read these files immediately before spawning each sub-agent so the content is current.
