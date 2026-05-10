---
name: e2e-parallel
description: >
  Run Playwright E2E tests in parallel using worktree-isolated agents — one agent per failing test file.
  Minimises context by passing only the failure summary JSON to each agent, never full logs.
  Use when the user says "e2e 테스트 돌려줘", "run e2e", "fix e2e", "parallel e2e", or any request to
  run/fix end-to-end tests efficiently.
---

You are the **orchestrator**. Follow these steps exactly.

---

## Step 1 — Discover test configuration

Read `playwright.config.ts` (or `playwright.config.js`) to find:
- `testDir` (where spec files live)
- `webServer` command and URL (to know if a dev server is needed)

If the user supplied a glob pattern as an argument, use it. Otherwise default to
`<testDir>/**/*.spec.ts`.

---

## Step 2 — Collect failures with minimal output

Run the full suite (or the user-supplied subset) and capture **only the JSON failure summary**:

```bash
npx playwright test [--grep "<pattern>"] \
  --reporter=json 2>/dev/null \
  | jq '[
      .suites[].specs[]
      | select(.ok == false)
      | {
          file:  .file,
          title: .title,
          error: .tests[0].results[0].error.message | split("\n")[0]
        }
    ]'
```

- If `jq` is unavailable, pipe through `node -e "..."` equivalent.
- If exit code is 0 (all pass): report success and stop.
- If the dev server is not running, start it in the background before running tests.

Store the resulting JSON. Do **not** paste the raw Playwright log into the conversation.

---

## Step 3 — Group failures by file

From the JSON, produce a map: `{ "<file>": [ { title, error }, … ] }`.

Example:
```json
{
  "tests/e2e/admin-review-ui.spec.ts": [
    { "title": "shows review list", "error": "Expected 2 rows, got 0" }
  ],
  "tests/e2e/pdf-ai-pipeline.spec.ts": [
    { "title": "full pipeline", "error": "Timeout waiting for /admin/dividend-reviews" }
  ]
}
```

If the number of failing files is 0 → report all green and stop.

---

## Step 4 — Spawn one agent per failing file (parallel, worktree-isolated)

Send a **single message** containing one `Agent` tool call per failing file.
All calls must have `isolation: "worktree"` and `run_in_background: false`.

Each agent prompt must follow this template (fill in the placeholders):

```
You are a Playwright E2E test fixer for a Next.js / Supabase project.

TARGET FILE: <relative/path/to/spec.ts>

FAILURES (JSON):
<paste only the failures array for this file — not the whole map>

YOUR TASK:
1. Run only the target file:
   npx playwright test <relative/path/to/spec.ts> --reporter=json 2>/dev/null | jq '[.suites[].specs[] | select(.ok==false) | {title,error:.tests[0].results[0].error.message}]'

2. Read the failures. Read the relevant source files (the spec AND the code it exercises).

3. Fix the root cause. Prefer fixing application code over patching the test,
   unless the test assertion is genuinely wrong.

4. Re-run only the target file and verify all its tests pass.

5. Reply with a one-paragraph summary:
   - How many tests were fixed
   - What the root cause was
   - Which files were changed (path:line)
   Do NOT include full test output.

Additional context for this project:
- Supabase helpers are in tests/e2e/helpers.ts (or tests/e2e/helpers/)
- App runs at the URL set in NEXT_PUBLIC_APP_URL or http://localhost:3000
- Do NOT restart the dev server; assume it is already running
- Do NOT modify playwright.config.ts
```

---

## Step 5 — Collect and surface results

After all agents complete, write a concise summary table to the user:

| File | Tests fixed | Root cause | Files changed |
|------|-------------|------------|---------------|
| … | … | … | … |

If any agent reports remaining failures, list them separately so the user can decide
whether to re-run or investigate manually.

---

## Constraints

- Never paste raw Playwright stdout into the main conversation.
- Never run more than 8 agents in parallel (keep worktree disk usage bounded).
- If only 1 file is failing, skip the parallel step — just fix it inline.
- If the user passes `--dry-run`, stop after Step 3 and show the failure map only.
