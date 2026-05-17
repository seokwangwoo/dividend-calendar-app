---
name: issue-implementer
description: >
  Implement a single issue document under docs/issue/active/ end-to-end without
  enforcing TDD. Reads the issue, asks the user which "제안하는 해결 방향"
  alternative to apply, then implements in an isolated git worktree, runs
  project verification (lint, typecheck, unit, integration), and commits.
  Archiving is intentionally left to the issue-archiver skill.
  Trigger when the user says things like:
  - "이 이슈 구현해줘"
  - "이슈 고쳐줘"
  - "Implement this issue"
  - "docs/issue/active/<file>.md 해결해줘"
  - Any request to resolve an issue from docs/issue/active/ without the
    Red → Green → Refactor cycle that issue-tdd enforces.
---

## Purpose

Resolve **exactly one** issue under `docs/issue/active/` by: parse → ask the
user which solution → implement in a worktree → verify → audit → commit.
Stops at commit. Archiving is `issue-archiver`. TDD enforcement is `issue-tdd`.
E2E is `e2e-parallel`. One invocation = one issue file; no batch mode.

## Architecture

```
ORCHESTRATOR (main thread, lean)
 ├─ PARSE    : issue → { title, type, labels, solutions, criteria, files }
 ├─ CONFIRM  : AskUserQuestion → chosen solution (no auto-select)
 ├─ SETUP    : git worktree add -b issue/<slug> .worktrees/issue-<slug>
 ├─ SPAWN    : IMPLEMENTER (cold sub-agent, runs in worktree)
 │              → { changed_files, manual_notes, blockers }
 ├─ VERIFY   : lint / typecheck / test / test:integration
 │              parallel Bash in a single message, summaries only
 ├─ AUDIT    : ACCEPTANCE (+DOMAIN if split trigger fires; parallel spawn)
 ├─ LOOP     : any axis FAIL → FIXER cold spawn → VERIFY → AUDIT (max 3)
 ├─ COMMIT   : inside worktree, only after audit PASS
 └─ REPORT
```

Principles: context isolation (sub-agents do heavy reads; Orchestrator keeps
summaries), cold sub-agents (recover state from the worktree, not the
conversation), single Implementer (only one writer), Verifiers are Bash (no
reasoning needed), solution is contract (no drift mid-flight), bounded retry.

## Agent Roles

- **Orchestrator** (main) — parses the issue, runs the workflow, spawns
  sub-agents, runs Verifier Bash, merges audit verdicts (any FAIL → FAIL),
  commits. Does not edit files or read every change.
- **Implementer** (1 cold sub-agent, in worktree) — implements **only** the
  chosen solution against the issue's "관련 파일" + whatever the acceptance
  criteria require. If the solution is infeasible, returns a Blocker instead
  of pivoting. Returns `{ changed_files, manual_notes, blockers }`.
- **Verifiers** (parallel Bash) — `lint`, `typecheck`, `test`,
  `test:integration` (last one only when `changed_files` touch data/server).
  Each call has `cwd = worktree`; capture exit code + ~50-line failure tail.
- **Acceptance Auditor** (cold, read-only) — confirms every acceptance
  criterion has concrete evidence, the implementation matches the **chosen**
  solution (not another listed one), verifier results are clean, no test was
  silently disabled.
- **Domain Auditor** (cold, read-only, conditional) — covers RLS / auth /
  PII / migration safety / required user-facing copy. Spawned only when the
  audit split trigger fires.
- **Fixer** (cold sub-agent per FAIL round, max 3) — applies the combined
  audit feedback inside the worktree. Forbidden from switching solutions:
  reports as `remaining_concerns` instead.

## Audit Split Trigger

Spawn the **Domain Auditor** alongside Acceptance when **any** holds:

- Labels include any of: `security`, `auth`, `rls`, `permission`, `pii`,
  `compliance`, `privacy`.
- `changed_files` include `supabase/migrations/*.sql`, `src/middleware*`,
  `src/**/auth/**`, `**/rls*.sql`, or `**/policies*.sql`.
- Issue body (case-insensitive) contains: `RLS`, `보안`, `security`, `auth`,
  `권한`, `PII`, `compliance`, `암호화`, `disclaimer`, `면책`.
- User explicitly asks for a domain audit.

Record the configuration (`acceptance` or `acceptance+domain`) in the report.

## Workflow

### 1. Parse

Read the issue file once. Extract from frontmatter: `type`, `priority`,
`status`, `labels`. From the body: title (first `#`), all entries under
"제안하는 해결 방향", "구현 수용 기준" list, "관련 파일" list. Derive `<slug>`
from the filename (`YYYYMMDD-<slug>.md`).

Stop if the file is not under `docs/issue/active/`, has no
"제안하는 해결 방향" section, or `status` is not `open`/`in-progress`
(confirm with the user before reopening).

### 2. Confirm solution

Present every documented solution via `AskUserQuestion`. List the
`Recommended?: 예` option first with `(Recommended)` — never auto-select.
If only one solution exists, surface that and ask whether to proceed,
pause to update the issue, or supply a custom approach.

Record the chosen solution title verbatim for use in the Implementer prompt,
commit message, and report.

### 3. Setup (mandatory worktree)

```bash
git worktree add -b issue/<slug> .worktrees/issue-<slug> HEAD
cd .worktrees/issue-<slug>
```

After this point the main checkout is read-only. Every file read/edit, every
npm script, every git command in steps 4–8 runs inside the worktree (absolute
path under it, or `cwd` set to it). Never edit the root tree again. The issue
file's authoritative copy is the parsed content from step 1 — do not reach
back into the root tree to re-read it.

If the branch or worktree already exists, reuse after confirming with the
user. Never auto-delete prior work.

### 4. Implement (Implementer sub-agent)

Cold-spawn one Implementer using the [prompt template](#implementer-prompt).
Parse the response:

- Non-empty `blockers` → halt and surface to the user.
- Empty `blockers` → keep `changed_files` and `manual_notes` for the Auditor.

Orchestrator does **not** open the changed files itself.

### 5. Verify (parallel Bash)

In a single message, issue one Bash call per command (each with
`cwd = worktree`):

| Command | When |
|---|---|
| `npm run lint` | always |
| `npm run typecheck` | always |
| `npm run test` | always |
| `npm run test:integration` | when `changed_files` touch data/server |

Capture only exit status + ~50-line failure tail. A failed verifier does
**not** halt — it feeds into the audit bundle so the Fixer can address it
alongside auditor feedback in one round. Mark a step `SKIPPED` only when a
concrete environmental blocker (e.g. missing Supabase service) exists; never
mark missing infrastructure as `PASS`.

### 6. Audit

Evaluate the [Audit Split Trigger](#audit-split-trigger). Cold-spawn either
the Acceptance Auditor alone, or Acceptance + Domain in the same message
(parallel). Pass each: full issue body, chosen solution title+body,
acceptance criteria, `changed_files`, `manual_notes`, verifier results,
worktree path.

Merge: any axis `Status: FAIL` → overall FAIL. Concatenate every CRITICAL +
MINOR into one feedback bundle for the Fixer.

### 7. Fix loop (max 3 rounds)

```
round = 1
while round ≤ 3 and audit == FAIL:
  cold-spawn FIXER with { worktree, round, combined feedback,
                          verifier failure tails, prior changed_files }
  re-run VERIFY (step 5)
  re-run AUDIT (step 6, same configuration as the first audit)
  round += 1
```

- PASS → step 8.
- Round 3 still FAIL → halt with remaining CRITICAL items; user decides.

Fixer is cold every round — never reuse prior context.

### 8. Commit

After audit PASS, one commit on the `issue/<slug>` branch inside the worktree.

Subject: `<prefix>: <issue title>`. Prefix from frontmatter `type`:
`bug → fix`, `feature → feat`, `refactor → refactor`.

Body (HEREDOC) must include:

- One short paragraph: what changed and why.
- `Solution: <chosen solution title>`
- `Issue: docs/issue/active/<file>.md`
- Standard `Co-Authored-By: Claude ...` trailer.

Do not push, open a PR, deploy, or modify the source issue file.

## Final Report

```
Issue:     docs/issue/active/<file>.md
Worktree:  .worktrees/issue-<slug>
Branch:    issue/<slug>
Solution:  <chosen solution title>
Commit:    <hash> <subject>

Audit:     PASS (<acceptance | acceptance+domain>)
Rounds:    <N> of 3

Verification (inside worktree):
- lint                : PASS
- typecheck           : PASS
- test                : PASS
- test:integration    : PASS | SKIPPED (<reason>)

Next steps:
- Review the worktree branch.
- If browser coverage is needed, run e2e-parallel.
- When satisfied, run issue-archiver to move the file and update README.
```

## Prompt Templates

Cold sub-agents recover state from the worktree — prompts must be
self-contained. The Orchestrator fills placeholders.

### Implementer

```text
You are the Implementer for one active issue. Implement ONLY the chosen
solution below.

Worktree (absolute): <WORKTREE_PATH>
Issue file (read-only ref): <ISSUE_FILE_PATH>

## Issue
Title: <ISSUE_TITLE>
Type: <bug | feature | refactor>
Labels: <LABELS>

## Chosen solution (the contract)
<SOLUTION_TITLE>

<SOLUTION_BODY_VERBATIM>

## Acceptance criteria
1. <criterion 1>
2. ...

## Related files
- <path 1>
- ...

## Rules
- Operate ONLY inside the worktree (absolute paths under <WORKTREE_PATH>).
- Implement ONLY the chosen solution. If infeasible, report as a Blocker —
  do NOT switch to another solution from the issue.
- Touch tests ONLY when the chosen solution explicitly invalidates them.
- If you touch supabase/migrations/, update generated types and RPC
  consumers in the same pass so the worktree stays buildable.
- Do NOT modify the source docs/issue/active/ file.
- Do NOT run the verification suite; the Orchestrator does.

## Output (return exactly)
### Changed files
- <path>: <one-line description>

### Manual verification notes
- <step, with observed result>

### Blockers
- <blocker, or "None">
```

### Acceptance Auditor

```text
You are the Acceptance Auditor. Read-only.

Worktree (absolute): <WORKTREE_PATH>
Issue file: <ISSUE_FILE_PATH>

## Contract
Title: <ISSUE_TITLE>
Chosen solution: <SOLUTION_TITLE>
<SOLUTION_BODY_VERBATIM>

Acceptance criteria:
1. <criterion 1>
2. ...

## Implementation summary
Changed files:
- <path>: <description>

Manual notes:
- <note>

## Verifier results
- npm run lint            : <PASS | FAIL>  <tail if FAIL>
- npm run typecheck       : <PASS | FAIL>  <tail if FAIL>
- npm run test            : <PASS | FAIL>  <tail if FAIL>
- npm run test:integration: <PASS | FAIL | SKIPPED (<reason>)>  <tail if FAIL>

## Task
1. Read changed files in the worktree.
2. For each criterion, find file:line evidence it is satisfied.
3. Confirm the implementation matches the CHOSEN solution, not another.
4. Confirm verifier results are clean; a FAILED required verifier is CRITICAL
   unless unambiguously pre-existing and unrelated.
5. Confirm no test was silently skipped, disabled, or weakened.

Skip cross-cutting security/RLS/PII — the Domain Auditor covers those.

## Output (return exactly)
## Audit Result: Acceptance
Status: PASS | FAIL

### Issues
- [CRITICAL] <area>: <problem> - <required fix>
- [MINOR] <area>: <problem> - <suggested fix>
- (or "- None")

### Criteria coverage
| # | Criterion | Evidence (file:line) | Status |
|---|---|---|---|
| 1 | <criterion 1> | <path:line> | OK / MISSING |

### Notes
- <optional>
```

PASS only when every criterion has evidence AND no CRITICAL issues.
Skipped integration test with a concrete environmental blocker is MINOR;
vague justification is CRITICAL.

### Domain Auditor (conditional)

```text
You are the Domain Auditor. Read-only. Focus ONLY on cross-cutting risk.

Worktree (absolute): <WORKTREE_PATH>
Issue file: <ISSUE_FILE_PATH>

## Issue (excerpt)
Title: <ISSUE_TITLE>
Labels: <LABELS>
Chosen solution: <SOLUTION_TITLE>

## Changed files
- <path>: <description>

## Task
Inspect the worktree and check:
- RLS / authorization / access-control rules preserved or correctly changed.
- Secret and PII handling unchanged or correctly tightened (no secrets in
  code, logs, fixtures).
- Migration SQL reversible OR has a documented forward-only justification.
- Required user-facing copy (disclaimers, warnings, compliance text) present
  and unchanged in meaning.

Skip acceptance coverage and verifier results — the Acceptance Auditor
covers those.

## Output (return exactly)
## Audit Result: Domain
Status: PASS | FAIL

### Issues
- [CRITICAL] <area>: <problem> - <required fix>
- [MINOR] <area>: <problem> - <suggested fix>
- (or "- None")

### Notes
- <optional>
```

### Fixer

```text
You are the Fixer. Audit FAILED; apply the feedback.

Worktree (absolute): <WORKTREE_PATH>
Issue file: <ISSUE_FILE_PATH>
Chosen solution: <SOLUTION_TITLE>
Round: <N> of 3

## Audit feedback (combined)
<ALL_CRITICAL_AND_MINOR>

## Prior verifier failures
<VERIFIER_FAILURE_TAILS>

## Files previously changed
<CHANGED_FILES>

## Rules
- Operate ONLY inside the worktree.
- Apply every CRITICAL. Apply MINOR unless clearly outside chosen-solution
  scope.
- Do NOT switch solutions. If feedback implies the chosen solution is wrong,
  report under "Remaining concerns" — do NOT silently change direction.
- Do NOT modify the source docs/issue/active/ file.
- Do NOT run the verification suite; the Orchestrator does.

## Output (return exactly)
### Changes applied
- <path>: <one-line description tied to a feedback item>

### Verifications to rerun
- <command>: <reason, or "all" if uncertain>

### Remaining concerns
- <unresolved, or "None">
```

## Stop Conditions

Halt and ask the user when:

- Provided path is not under `docs/issue/active/` or does not exist.
- Issue has no "제안하는 해결 방향" section.
- User selects nothing (or "Other" without a concrete description).
- Acceptance criteria contradict the chosen solution.
- Implementer returns a non-empty `Blockers` list.
- A verifier fails because of pre-existing breakage unrelated to this fix.
- An external prerequisite (Supabase service, env vars) is missing for a
  required verifier.
- Worktree cannot be created or entered — never fall back to the main
  checkout.
- Fixer round 3 still FAILs audit; report the remaining CRITICAL items.

On halt, never roll back work the user has reviewed.
