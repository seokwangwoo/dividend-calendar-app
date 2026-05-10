---
name: issue-writer
description: >
  Write a high-quality, reproducible issue document under docs/issue/active/.
  Trigger when the user says things like:
  - "docs/issue에 이슈를 작성해줘"
  - "이 버그를 이슈로 정리해줘"
  - "Write an issue for ..."
  - Any request to create an issue file under docs/issue/.
---

## Workflow

1. **Determine issue type**
   - `bug` — something is broken or failing
   - `feature` — missing functionality
   - `refactor` — code/structure improvement without user-facing change
   - `decision` — architectural or product decision (use `docs/issue/decision/` instead)

2. **Gather evidence**
   - Read the relevant UI page components, queries, RPC functions, and tests.
   - If a database discrepancy is suspected, run SQL/Node queries against Supabase (using the service role key from `.env.local`) to fetch actual rows.
   - Read related E2E or integration tests to see how values are currently asserted.
   - Never write "maybe" or "probably" — replace with verified facts.

3. **Draft the issue**
   - Save to `docs/issue/active/YYYYMMDD-<short-kebab-description>.md`
   - Include YAML frontmatter (see Template below).
   - Fill every section of the body template.
   - Use concrete numbers, table names, column names, and code snippets.

4. **Update the index**
   - Append the new issue to `docs/issue/README.md` under the **미해결 이슈 (Open)** table.

5. **Deliver**
   - Report back to the user with the file path and a one-paragraph summary.

## File Naming

| Folder | Pattern | Example |
|--------|---------|---------|
| `active/` | `YYYYMMDD-<short-kebab-description>.md` | `20260510-notification-evaluation-yield-mismatch.md` |
| `archive/` | `YYYYMMDD-<short-kebab-description>.md` | `20260506-home-portfolio-dividend-mismatch.md` |
| `decision/` | `<area>-<short-description>.md` | `admin-review-ui.md` |

## YAML Frontmatter Template (active issues)

```yaml
---
status: open        # open | in-progress | resolved | wontfix
type: bug           # bug | feature | refactor
created: YYYY-MM-DD
resolved:           # leave empty until resolved
priority: medium    # low | medium | high | critical
labels: []
---
```

## Body Template

```markdown
# <Concise Issue Title>

## 개요 (Overview)

One-paragraph summary of what is wrong, why it matters, and which user-facing screen or API is affected.

## 재현 방법 (Reproduction Steps)

1. Step-by-step instructions to reproduce.
2. Include specific user, stock, holding, or seed data when relevant.
3. Mention the exact routes or UI elements to inspect.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| Screen A | ... |
| Screen B | ... |

### Root Data Comparison

| Table / Column | Value A | Value B | Notes |
|----------------|---------|---------|-------|
| `stocks.xxx` | 150 | — | Used by Portfolio |
| `dividend_events.yyy` | 140 | — | Used by Home |

> Always include concrete numbers from the database or UI when possible.

## 기술적 원인 분석 (Technical Root Cause)

- Identify which RPC, query, or component produces each conflicting value.
- Quote relevant SQL conditions or TypeScript calculation code.
- Explain why two code paths diverge (different tables, different filters, missing sync, etc.).
- If a fiscal year, date range, or status filter is involved, spell it out exactly.

## 영향 범위 (Impact)

- **User experience**: How does this confuse or mislead the user?
- **Affected screens**: List every route / component that shows related numbers.
- **Tests**: Does this cause E2E or integration test flakiness or complexity?
- **Data integrity**: Is the source data wrong, or is the calculation wrong?

## 제안하는 해결 방향 (Proposed Solutions)

Present **at least two** alternatives. For each:

1. **Title**: Short name of the approach.
2. **Description**: What exactly would change in code / DB.
3. **Pros**: Why this is a good fix.
4. **Cons / Risks**: Query complexity, migration effort, side effects.
5. **Recommended?**: Mark the preferred option when clear.

## 관련 파일 (Related Files)

- `supabase/migrations/...sql` — RPC definitions
- `src/app/.../page.tsx` — UI pages
- `src/features/.../queries.ts` — data fetching
- `src/lib/.../calculations.ts` — client-side math
- `tests/e2e/...spec.ts` — related E2E tests

## 라벨 제안 (Suggested Labels)

- `bug`, `data-consistency`, `ui`, `high-priority`, `performance`, `refactor`
- Custom labels if defined in the project.
```

## Rules

- **Fact-based only**: Every numeric discrepancy must be traceable to a specific DB row or code line.
- **Reproducible**: Another engineer must be able to follow the "재현 방법" and see the same result.
- **No speculation in Root Cause**: If the exact cause is unclear after investigation, state what is known and what remains to be verified.
- **Multiple solutions**: Always present at least two alternatives with honest trade-offs.
- **Korean language**: Write the issue document in Korean unless the user explicitly requests English.
- **Do not commit**: The agent writes the file but does not commit or push unless explicitly instructed.
