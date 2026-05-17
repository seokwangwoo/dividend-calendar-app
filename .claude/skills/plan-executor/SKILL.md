---
name: plan-executor
description: >
  Execute an already-designed phased development plan end-to-end by delegating
  each phase to the phase-executor skill. Adds plan-level concerns:
  preflight discovery via git log, regression smoke between phases,
  conditional plan-level audit, and halt-on-failure policy.
  Trigger when the user says things like:
  - "이 플랜 전체를 실행해줘"
  - "docs/plans/<x>를 끝까지 구현해줘"
  - "Execute the whole plan"
  - "Run all phases"
  - Any request to implement an existing plan under docs/plans/ from start to finish.
---

## Purpose

This skill executes an **already-designed** phased plan from `docs/plans/<plan>/` end-to-end. It does not design plans (use `plan-designer`), does not run E2E (use `e2e-parallel` separately), and does not implement single phases (use `phase-executor` directly).

The skill is a thin plan-level orchestrator that:

1. Discovers the plan and its phase order.
2. Detects already-completed phases from git history so execution is resumable.
3. Delegates each remaining phase to the `phase-executor` skill (one sub-agent per phase).
4. Runs a regression smoke after each phase to catch breakage from earlier phases.
5. Optionally runs a plan-level audit to verify the README's promise is delivered.
6. Halts on the first unrecoverable failure and reports.

The skill must not skip phases, reimplement phase-executor logic, or commit work that has not passed both phase audit and regression smoke.

---

## Architecture Overview

```
PLAN-ORCHESTRATOR (main thread, thin)
 ├─ [1] DISCOVERY
 │      • Identify plan root, parse README
 │      • Build ordered phase queue
 │      • Count Completion Definition items (for plan-audit trigger)
 │
 ├─ [2] PREFLIGHT
 │      • git log --grep="<plan title> phase" → completed phases
 │      • Confirm resume point with user
 │      • Verify first remaining phase's Prerequisites match git state
 │
 ├─ [3] PER-PHASE LOOP (strictly sequential)
 │      for phase in remaining_phases:
 │        ├─ Spawn phase-executor sub-agent
 │        │   → { status, commit_hash, evidence_path, audit_rounds, blockers }
 │        ├─ FAIL → HALT + report
 │        ├─ PASS → REGRESSION SMOKE (parallel Bash, lean)
 │        │   • last 1–2 phases' core checks
 │        │   • core = lint + typecheck + test:integration (when available)
 │        │   • smoke FAIL → HALT + report
 │        └─ Append to commit log
 │
 ├─ [4] PLAN AUDIT (conditional, 1 sub-agent, read-only)
 │      Trigger: phase count ≥ 5  OR  Completion Definition items ≥ 3
 │
 └─ [5] REPORT
        • per-phase table (commit, audit rounds, smoke result)
        • plan-level audit verdict (when run)
        • outstanding blockers
```

### Design Principles

- **Composition over reimplementation** — phase-executor owns Implementer / Verifier / Auditor / Fixer mechanics. plan-executor never duplicates them.
- **Resumability via git** — no separate state file. Commit message pattern is the source of truth for what is done.
- **Sequential by necessity** — phase Prerequisites depend on prior phase Completion Criteria, so phases cannot be parallelized.
- **Cheap regression** — smoke only the last 1–2 phases' core checks. Full regression after every phase is O(N²) and impractical for long plans.
- **Halt-first** — a phase FAIL almost always invalidates the next phase's Prerequisites. Stop and let the user decide.

---

## Plan Discovery

The plan root must already exist under `docs/plans/<plan>/` and must follow the layout produced by `plan-designer`:

```text
docs/plans/<YYYYmmDD>_<plan_name>/
  README.md
  phase_01_<short_name>/plan.md
  phase_02_<short_name>/plan.md
  ...
```

Discovery rules:

1. If the user names a plan path or plan slug, use it directly.
2. Otherwise list `docs/plans/*/` and ask the user which plan to execute.
3. Read `README.md` and extract:
   - Plan title (used for commit-message search).
   - Phase order from the "Phase Order" section (links to `phase_XX_*/plan.md`).
   - Completion Definition items (used for plan-audit trigger).
4. If the README does not list phase order, fall back to lexically sorting `phase_*/plan.md` files.
5. If neither is available, stop and ask the user.

---

## Preflight

Before executing any phase, determine the resume point and validate the starting state.

### Detect completed phases

The `phase-executor` commits each completed phase with a message that begins with `<plan title> phase <NN>:`. Use that to detect progress:

```bash
git log --oneline --grep="<plan title> phase" | awk '{print $0}'
```

For each phase in the queue, mark it **completed** if a commit message matching its number and short title exists on the current branch.

### Confirm resume point

Present the user with the detected resume point before proceeding:

```text
Plan: <plan title>
Total phases: <N>
Completed (from git log): phase 01, phase 02
Resuming from: phase 03

Proceed? (y/n)
```

If the user disagrees, stop and ask which phase to start from.

### Validate Prerequisites

Read the first remaining phase's `## Prerequisites` section. For each prerequisite that corresponds to a prior phase's Completion Criteria, confirm the matching commit is present. If not, stop and ask the user.

External prerequisites (credentials, third-party accounts) cannot be auto-validated — surface them as a checklist the user must confirm before continuing.

---

## Per-Phase Loop

```text
for phase in remaining_phases:

  1. DELEGATE
     - Spawn phase-executor as a sub-agent.
     - Pass: phase plan path, plan README path, reference file paths.
     - Wait for completion.
     - Parse result: status, commit_hash, evidence_path, audit_rounds, blockers.

  2. HANDLE PHASE RESULT
     - If status == FAIL:
         HALT. Report which phase, which round failed, blockers. Stop.
     - If status == PASS:
         Append { phase, commit_hash, audit_rounds } to plan commit log.

  3. REGRESSION SMOKE  (skip after the first phase; nothing prior to smoke)
     - Identify the last 1–2 completed phases (the just-finished one + the one before, if any).
     - The smoke set is a strict subset of phase-executor's verification command list
       (see phase-executor § "Verification Command Strategy"). Use the project-appropriate
       package manager (pnpm/yarn/npm — detect from the lockfile) and run only the cheap,
       broad checks:
         - lint
         - typecheck
         - test:integration  (fall back to test when test:integration is undefined)
     - Issue all available commands as parallel Bash calls in a single message.
     - Capture status + failure tail (~50 lines).
     - If any command FAILs:
         HALT. Report which prior phase likely regressed. Do not roll back; let the user decide.

  4. CONTINUE to next phase.
```

The Orchestrator must not run the phase implementation, verification, audit, or fixer itself — those are owned by `phase-executor` inside the sub-agent.

### Why smoke and not full regression

Running every prior phase's full test plan after every new phase is O(N²) work. For a 10-phase plan that turns minutes into hours. The smoke approximation catches the most common regression class (a later phase breaking earlier code paths) at near-constant cost.

If the user explicitly requests full regression, run `npm run test` (entire suite) once after the final phase, before the plan audit.

---

## Plan Audit (Conditional)

### Trigger

Run plan audit when **either** condition holds:

- Total phase count ≥ 5, **or**
- README Completion Definition section has ≥ 3 items.

For smaller plans, skip plan audit — the per-phase audits are sufficient and a plan audit would be overhead.

### Plan Auditor sub-agent

Spawn one read-only sub-agent with this prompt template:

```text
You are the Plan Auditor. Determine whether the executed plan delivers the
promise stated in its README.

Plan root: <PLAN_ROOT>
README: <PLAN_README_PATH>

Executed phases (in order):
- phase_01_...: commit <hash>, evidence <path>
- phase_02_...: commit <hash>, evidence <path>
- ...

## Task

1. Read README.md sections: Purpose, Scope (Must include), Completion Definition.
2. Read each phase's verification/verification.md to confirm what was actually verified.
3. For each Completion Definition item, locate concrete evidence that it is satisfied:
   - A specific commit that introduced the capability, and
   - A verification entry confirming it works.
4. Flag any Completion Definition item that has no clear evidence trail.
5. Flag any Scope "Must include" item that appears in no phase.

## Output (return exactly this format)

## Plan Audit Result

Status: PASS | FAIL

### Completion Definition Coverage
| Item | Evidence (commit / verification path) | Status |
|---|---|---|
| <item 1> | <hash> / <path> | OK / MISSING |
| ...     | ...               | ...        |

### Scope Coverage
| Must-Include Item | Phase(s) | Status |
|---|---|---|
| <item 1> | phase_03_... | OK / MISSING |
| ...     | ...           | ...           |

### Issues
- [CRITICAL] <gap that contradicts README promise>
- [MINOR] <gap that does not block the promise but should be tracked>

### Recommended follow-ups
- <suggested follow-up plan or issue, or "None">
```

PASS rules:

- `Status: PASS` only when every Completion Definition item has concrete evidence AND no Scope must-include is missing.
- A MINOR-only issue list can still be PASS if no CRITICAL issues exist.
- If the auditor returns FAIL, do not roll back. Surface the verdict and the gaps to the user with recommended follow-ups (typically a new plan or issue).

### When plan audit fails

The phases already committed remain committed. The Orchestrator's job is to report:

- which Completion Definition items lack evidence,
- which must-include scope was missed,
- whether the gap warrants a follow-up plan, an issue, or a scope amendment.

Do not attempt to spawn another phase-executor for unplanned scope. New scope requires a new plan via `plan-designer`.

---

## Halt Policy

The Orchestrator halts and reports immediately on any of:

- A phase returns FAIL from `phase-executor` (5 audit rounds exhausted).
- Regression smoke fails after a phase PASS.
- Preflight detects mismatched Prerequisites or a missing required commit.
- The user-confirmed resume point is invalid.
- A required external prerequisite (credentials, third-party setup) is missing.

On halt:

- Do not roll back committed phases.
- Do not attempt the next phase.
- Report the failure context and let the user decide whether to fix manually, restart phase-executor for the broken phase, or amend the plan.

---

## phase-executor Delegation

Each phase is executed by a single `phase-executor` sub-agent call. The sub-agent loads the `phase-executor` skill itself, so the prompt only carries inputs and the required return contract — it does not restate the skill's workflow.

```text
Use the phase-executor skill to execute exactly this one phase.

Inputs:
- Plan root: <PLAN_ROOT>
- Plan README: <PLAN_README_PATH>
- Phase plan: <PHASE_PLAN_PATH>
- Reference files (from README "Source Specifications"): <REFERENCE_PATHS>

Return exactly this format when done:

## Phase Result: <phase filename>

Status: PASS | FAIL
Commit: <hash> | none
Audit configuration: single | scope+test+domain
Audit rounds: <N>
Evidence: <verification/verification.md path>
Blockers: <list or "None">
```

The plan-executor parses this structured response. It does not read raw phase-executor logs or full diffs.

---

## Reporting Format

Final report after the plan completes (or halts):

```text
Plan: <plan title>
Plan root: <PLAN_ROOT>
Status: COMPLETED | HALTED at <phase>

## Phase Results
| Phase | Commit | Audit Rounds | Smoke | Notes |
|---|---|---|---|---|
| phase_01_... | <hash> | 1 | n/a   | first phase, no smoke |
| phase_02_... | <hash> | 2 | PASS  | |
| phase_03_... | <hash> | 1 | PASS  | |
| phase_04_... | <hash> | 5 | FAIL  | regressed phase_02 integration tests |
| phase_05_... | —      | — | —     | not started (halted) |

## Plan-Level Audit
<one of: "Skipped (under trigger threshold)", or the Plan Audit Result block>

## Blockers
- <unresolved item from any phase, or "None">

## Recommended next actions
- <e.g., "Restart phase-executor for phase_04 after resolving regression">
- <e.g., "Create follow-up plan for missing Completion Definition item X">
```

---

## Stop Conditions

Stop and ask the user when:

- Plan root cannot be determined.
- Detected resume point conflicts with the user's expectation.
- A first-phase Prerequisite is missing and cannot be auto-validated.
- A phase-executor sub-agent returns FAIL.
- Regression smoke fails after a phase PASS.
- Plan audit returns FAIL (deliver the report and stop; do not auto-amend).

---

## Out of Scope

This skill explicitly does **not**:

- Design plans (use `plan-designer`).
- Implement single phases directly (use `phase-executor`).
- Run E2E tests (use `e2e-parallel` separately after plan completion if needed).
- Roll back committed phases (the user decides recovery strategy).
- Modify the plan files during execution (the plan is treated as immutable input).
