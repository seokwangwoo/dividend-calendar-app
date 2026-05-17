---
name: phase-executor
description: >
  Execute exactly one phase of a phased development plan with git worktree
  isolation, using an Orchestrator + specialized sub-agents architecture
  (Implementer / Verifiers / Auditor / Fixer). Single phase only — for
  running every phase of a plan end-to-end, the user should reach
  plan-executor instead.
  Trigger when the user says things like:
  - "Phase 02만 실행해줘"
  - "다음 phase 구현해줘"
  - "Run the next phase"
  - "Implement phase 02"
  - "이 phase 하나만 실행해줘"
  - Any request that names a single phase under docs/plans/ to execute.
---

## Purpose

This skill executes a phased development plan one phase at a time. It is not tied to a specific MVP, product area, or plan directory.

The user or repository context must identify the execution plan root. When no explicit root is provided, discover it from the requested work, nearby plan files, or a plan README. A valid plan root normally contains:

- A README or overview file describing phase order and shared references.
- One or more phase plan files.
- Each phase plan's goal, implementation scope, test plan, completion criteria, and excluded scope, or equivalent sections.

For every phase, the skill must:

1. Parse the phase plan into a structured directive (Orchestrator).
2. Implement only that phase's scope in an isolated git worktree (Implementer sub-agent).
3. Run every check required by the phase test plan in parallel (Verifiers, parallel Bash).
4. Save verification evidence under the current phase's execution folder (Orchestrator).
5. Audit whether the implementation matches the phase plan and whether the test plan was properly verified (Auditor sub-agent(s)).
6. If the audit fails, spawn a cold-context Fixer sub-agent with the audit feedback and repeat from step 3.
7. Commit the completed phase only after audit status is PASS.
8. Merge the worktree branch back into the original branch.

The skill must not skip phases, combine phases into one commit, or commit work that has not passed audit.

---

## Architecture Overview

```
ORCHESTRATOR (main thread, lean)
 ├─ PARSE   : phase plan → distilled directive (sections + paths + commands)
 ├─ SETUP   : git worktree + branch
 ├─ SPAWN 1 : IMPLEMENTER (sub-agent, in worktree)
 │            → { changed_files, manual_notes, blockers }
 ├─ VERIFY  : lint / typecheck / test:unit / test:integration / build
 │            → parallel Bash in a single message, summaries only
 ├─ EVIDENCE: orchestrator writes verification/verification.md
 ├─ AUDIT   : evaluate split trigger
 │            ├─ trigger met → AUDITOR × 3 parallel (scope / test / domain)
 │            └─ otherwise   → AUDITOR × 1
 ├─ LOOP    : FAIL → FIXER cold spawn → VERIFY → AUDIT (max 5 rounds)
 ├─ COMMIT  : inside worktree (after PASS)
 └─ MERGE   : main worktree, --no-ff, then cleanup
```

### Design Principles

- **Context isolation**: heavy file reads/edits live in sub-agents. The Orchestrator receives summaries only.
- **Parallelism**: independent verifications run as parallel Bash calls in a single message. Conditional 3-way audit also runs in parallel.
- **State in worktree**: sub-agents are cold-spawned and read durable state from the worktree, not from prior conversation context.
- **Single responsibility per agent**: Implementer implements, Verifiers verify, Auditors audit, Fixer fixes. No role overlap.
- **Cheap retries on FAIL**: Fixer is always cold-spawned, so accumulated context never bloats the retry loop.

---

## Git Worktree Isolation

Every phase must be implemented in a dedicated git worktree.

### Worktree setup

```bash
# 1. Identify the base branch (current branch in the main worktree)
BASE_BRANCH=$(git branch --show-current)

# 2. Create a worktree branch
WORKTREE_BRANCH="phase/<plan-name>/<phase-number>"
git branch "${WORKTREE_BRANCH}"

# 3. Add a worktree
git worktree add "../<repo-name>-wt-${WORKTREE_BRANCH##*/}" "${WORKTREE_BRANCH}"
```

### Worktree rules

- Use a unique branch per phase: `phase/<plan-name>/<phase-number>` (e.g. `phase/mvp-1st/02`).
- The worktree path should be a sibling of the main repo: `../<repo-name>-wt-<phase-number>`.
- Do not modify the main worktree during phase implementation.
- Pass the absolute worktree path to every sub-agent prompt.
- If dependencies need installing, run install inside the worktree.

### Merge back

After the phase commits and audit passes:

```bash
cd "<original-repo-path>"
git merge --no-ff "${WORKTREE_BRANCH}" -m "Merge ${WORKTREE_BRANCH}"
git worktree remove "../<repo-name>-wt-${WORKTREE_BRANCH##*/}"
git branch -d "${WORKTREE_BRANCH}"
```

If a merge conflict occurs, resolve it in the main worktree, re-run the phase test plan, and commit the resolution.

---

## Plan Discovery

Determine phase order from the plan root in this priority order:

1. An explicit ordered list in the user's request.
2. An ordered list in the plan README or overview file.
3. Numerically or lexically ordered phase folders in the plan root, each containing a `plan.md`, such as `phase_01_*/plan.md`, `phase-01-*/plan.md`, or `01_*/plan.md`.

Supporting references are plan-specific. Use the references named by the phase file, plan README, or user request.

If phase order cannot be determined safely, stop and ask the user for the plan root or ordered phase list.

---

## Execution And Verification Folders

Default folder layout:

```text
<PLAN_ROOT>/<PHASE_STEM>/
  verification/
    verification.md
```

Where `<PHASE_STEM>` is the phase filename without extension. Example: `docs/plans/my_plan/phase_01_foundation/verification/verification.md`.

If the plan already defines a different per-phase execution folder, use that folder and create `verification/` under it.

`verification/verification.md` must be created or updated before audit and committed with the phase. It must include:

- Phase file path.
- Verification date and environment, when relevant.
- Every test-plan item and its verification status.
- Exact commands run, with pass/fail/skipped status.
- Important output summaries or links to captured logs.
- Manual verification steps performed, including what was checked.
- Reasons for skipped checks, including missing tooling, unavailable credentials, or out-of-scope dependencies.
- Any failures discovered and how they were fixed or why they remain blocked.

Passing audit requires the test plan to be verified and the evidence file to make that verification reproducible enough for another engineer to review.

---

## Agent Roles

### Orchestrator (main thread)

Owns the workflow. Stays lean by delegating heavy work and keeping only summaries in context.

Responsibilities:

- Read the phase plan once and parse it into a structured directive (scope, test plan, completion criteria, exclusions, references).
- Run `git status --short` in the main worktree.
- Create and tear down the git worktree.
- Spawn the Implementer sub-agent.
- Run verification commands as parallel Bash calls and collect summarized results.
- Write `verification/verification.md` based on the Implementer's notes and Verifier results.
- Evaluate the audit-split trigger and spawn the appropriate Auditor configuration.
- On FAIL, cold-spawn a Fixer with structured feedback.
- Commit and merge.

The Orchestrator must not perform large file reads, multi-file edits, or test runs of unknown output size directly; delegate those to sub-agents or summarized Bash.

### Implementer (sub-agent, runs in worktree)

Implements the phase scope. Runs once per phase. Worktree writes are serialized through this single agent to avoid conflicts.

Responsibilities:

- Read the phase plan and any required reference files.
- Implement only the current phase's Implementation Scope.
- Do not implement later-phase scope or excluded scope.
- Record manual verification notes for steps that cannot be automated.
- Return a concise summary of changed files, manual notes, and blockers.

The Implementer must not run the full test plan or write `verification.md` — those belong to Verifiers and the Orchestrator.

### Verifiers (parallel Bash, not sub-agents)

Run the phase Test Plan commands. Each verification command is an independent Bash call issued by the Orchestrator in parallel (single message, multiple Bash tool calls).

Responsibilities (per command):

- Run inside the worktree directory.
- Capture exit status and a short failure tail (first ~50 lines on failure).
- Return only the summary to the Orchestrator.

Verifiers do not get their own sub-agent context because they require no reasoning — just command execution. This avoids spawn overhead.

### Auditor(s) (sub-agent, read-only, 1 or 3 in parallel)

Review implementation against the phase plan and evidence. Auditors must not edit files.

**Single Auditor** (default): one agent covers all checks.

**Three-way split** (triggered): three agents run in parallel, each focused on one axis:

- **Scope Auditor** — implementation matches Goal / Implementation Scope / Completion Criteria; no Excluded scope leaked in.
- **Test Auditor** — every Test Plan item verified or justified-skipped; evidence file reproducible.
- **Domain Auditor** — security, RLS, authorization, secret handling, privacy, compliance copy, user-facing disclaimers per the plan.

The Orchestrator merges results: any axis FAIL → overall FAIL.

### Fixer (sub-agent, cold-spawned on every FAIL)

Applies audit feedback. A new Fixer is spawned for every FAIL round — never reuse a prior Fixer context.

Responsibilities:

- Read the worktree state to understand current implementation.
- Apply all CRITICAL feedback. Apply MINOR feedback unless clearly outside phase scope.
- Return a concise summary of applied changes and which verifications need rerunning.

The Fixer must not run the full audit itself or write `verification.md`.

---

## Audit Split Trigger

Use three parallel Auditors when **any** of the following holds, otherwise use a single Auditor:

- `plan.md` line count ≥ 200.
- Plan contents include any keyword (case-insensitive): `RLS`, `보안`, `security`, `auth`, `권한`, `PII`, `compliance`, `암호화`, `disclaimer`, `면책`.
- The user explicitly requests a multi-axis audit.

Record which configuration was used in the Reporting Format output.

---

## Phase Execution Loop

For each phase file:

```text
1. PARSE (Orchestrator)
   - Identify PLAN_ROOT, phase order, supporting references.
   - Read the plan README/overview when present.
   - Read the current phase file once.
   - Extract: Goal, Implementation Scope, Core Tasks, Test Plan commands,
     Completion Criteria, Excluded scope, reference paths.
   - Read previous phase files only when needed for dependencies.

2. SETUP (Orchestrator, Bash)
   - Run git status --short in the main worktree.
   - If unrelated changes exist, do not revert them.
   - If unrelated changes block implementation, ask the user.
   - Create the phase branch and worktree.

3. IMPLEMENT (Implementer sub-agent)
   - Spawn one Implementer with the worktree path, distilled directive,
     and reference file paths.
   - Implementer makes the minimum changes needed to satisfy the phase.
   - Implementer returns changed_files, manual_notes, blockers.

4. VERIFY (Orchestrator, parallel Bash)
   - In a single message, issue one Bash call per Test Plan command:
     lint / typecheck / test:unit / test:integration / build / etc.
   - Each Bash call runs inside the worktree.
   - Collect status and failure tails. Discard verbose successful output.
   - If a command is unavailable, mark as skipped with a concrete reason.

5. EVIDENCE (Orchestrator, Write tool)
   - Create or update <PHASE_EXECUTION_FOLDER>/verification/verification.md.
   - Include: phase file path, date, every Test Plan item with status,
     exact commands run with pass/fail/skipped, output summaries,
     manual checks from Implementer notes, skip justifications,
     unresolved blockers.

6. AUDIT (Auditor sub-agent(s))
   - Evaluate Audit Split Trigger.
   - Spawn 1 Auditor OR 3 Auditors in parallel (single message).
   - Merge results: any axis FAIL → overall FAIL.

7. LOOP (on FAIL)
   - Cold-spawn a new FIXER with audit feedback + worktree path
     + last changed_files + verifier failure tails.
   - Fixer applies fixes inside the worktree.
   - Return to step 4 (re-run affected verifications).
   - Re-run audit (step 6).
   - Maximum 5 rounds. Then stop and report unresolved issues.

8. COMMIT (Orchestrator, Bash inside worktree)
   - Stage only files belonging to the current phase.
   - Include the verification/ folder in the phase commit.
   - Run git diff --cached --stat before commit.
   - Commit with the phase-specific message.
   - Confirm git status after commit.

9. MERGE (Orchestrator, Bash in main worktree)
   - Switch back to the original worktree.
   - Merge the phase branch with --no-ff.
   - Remove the worktree and delete the branch.
   - If merge conflicts occur, resolve them and re-run the phase test plan.
```

---

## Implementer Prompt Template

```text
You are the Implementer for one development phase.

Worktree (absolute path): <WORKTREE_PATH>
Phase file: <PHASE_FILE>
Plan README: <PLAN_README>
Reference files: <REFERENCE_FILES>

## Distilled directive

Goal:
<GOAL>

Implementation Scope:
<IMPLEMENTATION_SCOPE>

Core Tasks:
<CORE_TASKS>

Excluded from this phase (do NOT implement):
<EXCLUDED>

## Rules

- Operate ONLY inside the worktree. Use absolute paths.
- Implement the minimum needed to satisfy this phase.
- Do NOT implement later-phase scope or excluded scope.
- Do NOT run the full test plan; the Orchestrator runs verifications.
- Do NOT write verification/verification.md; the Orchestrator writes it.
- Keep public interfaces consistent with the plan.

## Output (return exactly this format)

### Changed files
- <path>: <one-line description>
- ...

### Manual verification notes
- <step that cannot be automated, with the observed result>
- ...

### Blockers
- <blocker description, or "None">
```

---

## Auditor Prompt Template — Single

```text
You are the Auditor for one completed implementation phase.

Phase file: <PHASE_FILE>
Plan root: <PLAN_ROOT>
Reference files: <REFERENCE_FILES>
Changed files: <CHANGED_FILES>
Verification evidence: <VERIFICATION_EVIDENCE_PATH>
Verification performed: <COMMANDS_AND_RESULTS>

Task:
Read the phase plan and inspect the implementation changes in the worktree.
Determine whether the implementation satisfies the phase's Goal, Implementation
Scope, Test Plan, and Completion Criteria, and does not implement items listed
in Excluded From This Phase. Inspect the verification evidence file and confirm
that every phase Test Plan item was actually verified, manually checked, or
explicitly justified as skipped.

Return exactly this format:

## Audit Result: <phase filename>

Status: PASS | FAIL

### Issues
- [CRITICAL] <file-or-area>: <problem> - <required fix>
- [MINOR] <file-or-area>: <problem> - <suggested fix>

### Verification
- <checks reviewed>
- <test-plan verification evidence reviewed>

### Notes
- <optional notes>
```

PASS rules (apply to every Auditor variant):

- Use `Status: PASS` only when there are no CRITICAL issues.
- MINOR issues may still cause FAIL if they contradict the phase plan or leave acceptance criteria unverified.
- Missing, incomplete, or non-reproducible verification evidence is CRITICAL.
- A test-plan item that was not verified and has no concrete skip justification is CRITICAL.
- If no issues exist, write `- None` under Issues.

---

## Auditor Prompt Templates — Three-Way Split

Spawn all three in a single message (parallel).

### Scope Auditor

```text
You are the Scope Auditor. Focus ONLY on plan-to-implementation alignment.

Phase file: <PHASE_FILE>
Plan root: <PLAN_ROOT>
Changed files: <CHANGED_FILES>

Check:
- Implementation matches Goal and Implementation Scope.
- Every Completion Criterion is observably satisfied by the changes.
- Nothing in "Excluded From This Phase" is implemented (unless required as a
  prerequisite and explicitly justified by the plan).
- Later-phase scope is not implemented prematurely.
- Interface contracts (schema, RPC, shared types) defined in this phase are
  consistent across all changed files.

Do NOT comment on tests, security, or copy — other auditors cover those.

Return the standard Audit Result format with axis name "Scope".
```

### Test Auditor

```text
You are the Test Auditor. Focus ONLY on verification quality.

Phase file: <PHASE_FILE>
Verification evidence: <VERIFICATION_EVIDENCE_PATH>
Verification performed: <COMMANDS_AND_RESULTS>
Changed files: <CHANGED_FILES>

Check:
- Every phase Test Plan item appears in the evidence file with a clear status.
- Commands recorded in evidence match what was actually run.
- Skipped checks have a concrete blocker, not convenience.
- Manual verification steps include enough detail to reproduce.
- Integration tests cover new boundaries (API routes, DB, external calls).
- No silent regressions in pre-existing test commands.

Do NOT comment on scope or security — other auditors cover those.

Return the standard Audit Result format with axis name "Test".
```

### Domain Auditor

```text
You are the Domain Auditor. Focus ONLY on security, privacy, and product
constraints called out by the plan.

Phase file: <PHASE_FILE>
Plan root: <PLAN_ROOT>
Reference files: <REFERENCE_FILES>
Changed files: <CHANGED_FILES>

Check:
- RLS, authorization, and access-control rules from the plan are enforced.
- Secret handling matches plan requirements (no secrets in code, logs, or tests).
- PII / privacy constraints respected.
- Required disclaimers, warnings, or compliance copy are present where the
  plan demands them.
- User-facing copy and behavior match the plan's product constraints.

Do NOT comment on scope coverage or test mechanics — other auditors cover those.

Return the standard Audit Result format with axis name "Domain".
```

The Orchestrator merges the three results: any axis FAIL → overall FAIL. Concatenate all CRITICAL/MINOR issues into one combined feedback bundle for the Fixer.

---

## Fixer Prompt Template

```text
You are the Fixer. A prior implementation FAILED audit. Apply the feedback.

Worktree (absolute path): <WORKTREE_PATH>
Phase file: <PHASE_FILE>
Audit round: <N> of 5

## Audit feedback (combined)

<ALL_CRITICAL_AND_MINOR_ISSUES>

## Prior verification failures (if any)

<VERIFIER_FAILURE_TAILS>

## Files previously changed for this phase

<CHANGED_FILES>

## Rules

- Operate ONLY inside the worktree.
- Apply every CRITICAL feedback item.
- Apply MINOR feedback unless it is clearly outside this phase's scope.
- If you disagree with a feedback item, fix the underlying concern in a way
  that satisfies the auditor's intent — do not skip silently.
- Do NOT run the full test plan; the Orchestrator will re-run verifications.
- Do NOT write verification/verification.md; the Orchestrator will update it.

## Output (return exactly this format)

### Changes applied
- <path>: <one-line description tied to feedback item>
- ...

### Verifications to rerun
- <command>: <reason it needs rerunning, or "all" if uncertain>
- ...

### Remaining concerns
- <issue you could not resolve and why, or "None">
```

---

## Verification Command Strategy

Before running, inspect available scripts in `package.json` to pick exact commands.

Default commands (run in parallel as separate Bash calls):

```text
npm run lint
npm run typecheck
npm run test          # or test:unit
npm run test:integration
npm run build
```

Adjust for the project's package manager:

- `pnpm-lock.yaml` → `pnpm`
- `yarn.lock` → `yarn`
- `package-lock.json` → `npm`

Parallelization rules:

- Issue all independent verification commands as separate Bash tool calls **in a single Orchestrator message**.
- Each call runs inside the worktree directory.
- Capture only exit status and the failure tail (~50 lines). Discard verbose successful output.
- If a command requires sequential ordering (e.g. a generator that other checks read), run it first and the rest in parallel afterward.

For Supabase migrations:

- Validate SQL syntax when possible.
- Run local Supabase commands only if the project is configured for them.
- Never connect to production or remote Supabase without explicit user approval.

For project-specific tooling:

- Prefer commands named by the phase Test Plan.
- If a command is unavailable, mark it skipped in the evidence with a concrete reason.
- If manual verification replaces automation, document the exact workflow and observed result in the evidence file.

---

## Commit Policy

Commit once per completed phase after Auditor PASS.

Use the commit message specified by the phase plan when present. Otherwise use:

```text
<plan title> phase <number>: <short phase title>
```

Example: `MVP 1st phase 02: add database auth and rls foundation`.

Commit rules:

- Do not commit before audit PASS.
- Do not include unrelated user changes.
- Do not squash multiple phases into one commit.
- If a later audit requires changes to a previous phase file, commit that fix with the current phase only when it is required for current phase correctness.
- Do not commit a phase without its verification evidence folder unless the user explicitly overrides this policy.
- Use `git status --short` after each commit and report remaining uncommitted changes if any.

---

## Stop Conditions

Stop and ask the user when:

- The current phase requires credentials that are not available.
- Unrelated user changes conflict with required edits.
- A destructive operation appears necessary.
- The audit still returns FAIL after 5 rounds.
- A verification failure is outside the current phase and cannot be isolated.
- A required test-plan item cannot be verified and no concrete skip justification exists.

---

## Reporting Format

After each phase commit, report:

```text
Phase completed: <phase file>
Audit: PASS (<single | scope+test+domain>)
Audit rounds: <N>
Commit: <hash> <message>
Verification: <commands run>
Verification evidence: <path>
Remaining changes: <none or summary>
Worktree: <worktree path> merged and removed
```

At the end of all phases, report:

```text
All requested phases completed.
Commits:
- <hash> <message>
- ...
```
