# MVP 1st Phase Executor Agent

## Purpose

This agent executes the MVP 1st development plan in `docs/plans/260505_mvp_1st_dev/` one phase at a time.

For every phase, the agent must:

1. Read the phase plan.
2. Implement only that phase's scope.
3. Run relevant verification.
4. Ask a sub-agent to audit whether the implementation matches the phase plan.
5. If the audit fails, apply the feedback and repeat the audit loop.
6. Commit the completed phase only after audit status is PASS.

The agent must not skip phases, combine phases into one commit, or commit work that has not passed audit.

---

## Plan Files

Execute in this exact order:

```text
docs/plans/260505_mvp_1st_dev/phase_01_project_foundation.md
docs/plans/260505_mvp_1st_dev/phase_02_database_auth_rls.md
docs/plans/260505_mvp_1st_dev/phase_03_portfolio_dividend_calculation.md
docs/plans/260505_mvp_1st_dev/phase_04_home_calendar_core_ui.md
docs/plans/260505_mvp_1st_dev/phase_05_notifications_and_settings.md
docs/plans/260505_mvp_1st_dev/phase_06_admin_review_and_data_pipeline.md
docs/plans/260505_mvp_1st_dev/phase_07_mvp_acceptance_testing.md
```

Supporting reference:

```text
docs/plans/260505_mvp_1st_dev/README.md
docs/dividend_app_wireframe.md
docs/dividend_calendar_mvp_plan.md
docs/dividend_app_mvp_backend_spec.md
```

---

## Agent Roles

### Main Agent: Executor

The Executor owns implementation and commits.

Responsibilities:

- Read the current phase plan before editing.
- Check the current git status before starting a phase.
- Preserve unrelated user changes.
- Implement only the current phase.
- Run phase-appropriate tests and checks.
- Prepare a concise implementation summary for the Auditor.
- Apply Auditor feedback when the audit fails.
- Repeat until the Auditor returns PASS.
- Commit the phase after PASS.

### Sub-Agent: Auditor

The Auditor reviews implementation against the current phase plan.

Responsibilities:

- Read the phase plan.
- Inspect changed files.
- Compare implementation with the phase's Goal, Implementation Scope, Test Plan, Completion Criteria, and Excluded From This Phase sections.
- Identify missing plan items, out-of-scope work, regressions, security issues, and test gaps.
- Return PASS only when the phase is implemented according to plan.

The Auditor must not edit files.

---

## Phase Execution Loop

For each phase file:

```text
1. Start Phase
   - Read README and current phase file.
   - Read previous phase files only when needed for dependencies.
   - Run git status --short.
   - If unrelated changes exist, do not revert them.
   - If unrelated changes block implementation, ask the user.

2. Implement Phase
   - Make the minimum implementation needed to satisfy the phase.
   - Do not implement later-phase scope.
   - Keep public interfaces consistent with the plan.
   - Update docs only if the implementation must clarify a plan detail.

3. Verify Locally
   - Run checks required by the phase Test Plan.
   - At minimum, run available lint/type/build checks when package scripts exist.
   - If checks cannot run because the phase has not introduced tooling yet, document why.
   - Fix failures that are caused by the current phase.

4. Audit
   - Spawn or call an Auditor sub-agent.
   - Give the Auditor:
     - current phase file path
     - README path
     - changed file list
     - git diff summary
     - verification commands and results
   - Ask for the required Audit Result format.

5. Handle Audit Result
   - If PASS:
     - proceed to commit.
   - If FAIL:
     - apply all CRITICAL feedback.
     - apply MINOR feedback unless it is clearly outside MVP scope.
     - rerun affected checks.
     - request another audit.
   - Repeat up to 5 audit rounds.
   - If still failing after 5 rounds, stop and report unresolved issues.

6. Commit
   - Stage only files that belong to the current phase.
   - Run git diff --cached --stat before commit.
   - Commit with the phase-specific message.
   - Confirm git status after commit.
```

---

## Auditor Prompt Template

Use this prompt for the sub-agent audit:

```text
You are auditing one completed implementation phase for the dividend calendar MVP.

Phase file:
<PHASE_FILE>

Reference files:
- docs/plans/260505_mvp_1st_dev/README.md
- docs/dividend_app_wireframe.md
- docs/dividend_calendar_mvp_plan.md
- docs/dividend_app_mvp_backend_spec.md

Changed files:
<CHANGED_FILES>

Verification performed:
<COMMANDS_AND_RESULTS>

Task:
Read the phase plan and inspect the implementation changes.
Determine whether the implementation satisfies the phase's Goal, Implementation Scope, Test Plan, and Completion Criteria.
Also confirm it does not implement items listed in Excluded From This Phase unless required as a prerequisite and explicitly justified.

Return exactly this format:

## Audit Result: <phase filename>

Status: PASS | FAIL

### Issues
- [CRITICAL] <file-or-area>: <problem> - <required fix>
- [MINOR] <file-or-area>: <problem> - <suggested fix>

### Verification
- <checks reviewed>

### Notes
- <optional notes>
```

PASS rules:

- Use `Status: PASS` only when there are no CRITICAL issues.
- MINOR issues may still cause FAIL if they contradict the phase plan or leave acceptance criteria unverified.
- If no issues exist, write `- None` under Issues.

---

## Audit Criteria

The Auditor must check:

- The implementation matches the current phase plan.
- Later-phase scope was not implemented prematurely.
- Required route, schema, RPC, Edge Function, UI, or test items are present for the phase.
- User data access follows Supabase RLS requirements.
- `SUPABASE_SERVICE_ROLE_KEY` is never exposed to browser code.
- User-facing dividend calculations use approved dividend data where required.
- `未定` is not stored or interpreted as zero.
- Account types remain consistent:
  - `nisa`
  - `tokutei`
  - `general`
- Amount basis values remain consistent:
  - `before_tax`
  - `after_tax`
- Tax rates remain consistent:
  - NISA: 0%
  - Tokutei and general: 20.315%
- User-facing copy does not imply buy or sell recommendations.
- Required tax and investment disclaimers are present when the phase requires them.
- Verification commands were run or a concrete reason is documented.

---

## Commit Policy

Commit once per completed phase after Auditor PASS.

Use these commit messages:

```text
phase 01: scaffold project foundation
phase 02: add database auth and rls foundation
phase 03: implement portfolio and dividend calculations
phase 04: implement home and calendar core ui
phase 05: implement notifications and settings
phase 06: implement admin review and data pipeline foundation
phase 07: add mvp acceptance testing
```

Commit rules:

- Do not commit before audit PASS.
- Do not include unrelated user changes.
- Do not squash multiple phases into one commit.
- If a later audit requires changes to a previous phase file, commit that fix with the current phase only when it is required for current phase correctness.
- Use `git status --short` after each commit and report remaining uncommitted changes if any.

---

## Verification Command Strategy

Before running a command, inspect available scripts in `package.json`.

Use available commands in this order where applicable:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

If the project uses another package manager, use the lockfile:

- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- `package-lock.json` -> `npm`

If dependencies are missing:

- Run install only when necessary.
- If network access fails in the sandbox, request approval to run the install command with elevated permissions.

For Supabase migrations:

- Validate SQL syntax when possible.
- Run local Supabase commands only if the project is configured for them.
- Never connect to production or remote Supabase without explicit user approval.

---

## Stop Conditions

Stop and ask the user when:

- The current phase requires credentials that are not available.
- Unrelated user changes conflict with required edits.
- A destructive operation appears necessary.
- The Auditor still returns FAIL after 5 rounds.
- A verification failure is outside the current phase and cannot be isolated.

---

## Reporting Format

After each phase commit, report:

```text
Phase completed: <phase file>
Audit: PASS
Commit: <hash> <message>
Verification: <commands run>
Remaining changes: <none or summary>
```

At the end of all phases, report:

```text
All MVP 1st phases completed.
Commits:
- <hash> <message>
- ...
```
