---
name: issue-archiver
description: >
  Archive a resolved issue from docs/issue/active/ to docs/issue/archive/ and update the README index.
  Trigger when the user says things like:
  - "이슈를 정리해줘"
  - "Archive this issue"
  - "Resolve the issue"
  - "이슈를 닫아줘"
  - Any request to mark an issue as resolved and move it to the archive folder.
---

## Workflow

1. **Identify the target issue**
   - Read `docs/issue/README.md` to find the issue filename.
   - Read the actual issue file in `docs/issue/active/`.
   - Confirm the issue is indeed resolved by checking the codebase, PR, or commit history.

2. **Update frontmatter**
   - Change `status: open` → `status: resolved`
   - Set `resolved: YYYY-MM-DD` to today's date
   - Keep `type`, `created`, `priority`, and `labels` unchanged

3. **Move the file**
   - Rename / move the file from `docs/issue/active/<name>.md` to `docs/issue/archive/<name>.md`
   - If the filename does not start with a date, prepend `YYYYMMDD-` to maintain archive naming convention

4. **Update README.md**
   - Remove the issue from the **미해결 이슈 (Open)** table
   - Add the issue to the **해결된 이슈 (Recently Resolved)** table with resolution date
   - Keep the resolved table limited to the most recent 10 items; if exceeded, older items can be omitted from the table (the file remains in archive/)

5. **Deliver**
   - Report back to the user with the new file path and a one-paragraph summary.

## File Naming Convention

| Folder | Pattern | Example |
|--------|---------|---------|
| `active/` | `YYYYMMDD-<short-kebab-description>.md` | `20260510-notification-evaluation-yield-mismatch.md` |
| `archive/` | `YYYYMMDD-<short-kebab-description>.md` | `20260506-home-portfolio-dividend-mismatch.md` |

## README.md Index Format

```markdown
## 미해결 이슈 (Open)

| 이슈 | 우선순위 | 유형 | 생성일 |
|------|---------|------|--------|
| [제목](active/FILENAME.md) | medium | bug | YYYY-MM-DD |

## 해결된 이슈 (Recently Resolved)

| 이슈 | 유형 | 해결일 |
|------|------|--------|
| [제목](archive/FILENAME.md) | bug | YYYY-MM-DD |
```

## Rules

- **Verify before archiving**: Always confirm the issue is actually resolved in the codebase. Do not archive based on user request alone if the fix is not yet merged.
- **Preserve history**: Never delete an issue file; only move it from `active/` to `archive/`.
- **Update index in the same turn**: Move the file AND update `README.md` in the same conversation turn.
- **Do not commit**: The agent moves/updates files but does not commit or push unless explicitly instructed.
