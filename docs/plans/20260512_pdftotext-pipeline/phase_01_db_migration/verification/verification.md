# Phase 01 Verification

Phase file: `docs/plans/20260512_pdftotext-pipeline/phase_01_db_migration/plan.md`

Date: 2026-05-12

Environment:
- Worktree: `/home/seo/OneDrive/linux/projects/dividend-calendar-app-wt-pdftotext-01`
- Node: v20.15.1 observed during `npm install`
- Supabase CLI: project local CLI via `npx supabase`

## Test Plan Results

| Test plan item | Status | Evidence |
|---|---|---|
| `npx supabase db push` applies cleanly | PASS | Ran `npx supabase db push --local`. It applied `20260514010000_pdftotext_pipeline_phase_01.sql` and finished successfully. The local DB also applied a previously pending `20260513030000_ai_schema_payment_month_phase_03.sql` migration first. |
| `information_schema.columns` returns `extracted_text` | PASS | Ran local DB query. Result: `column_name=extracted_text`, `data_type=text`, `is_nullable=YES`. |
| Partial index exists | PASS | Ran local DB query against `pg_indexes`. Result: `idx_disclosures_pending_extraction` exists with predicate `storage_path IS NOT NULL AND extracted_text IS NULL`. |
| `npm run typecheck` | PASS | Completed with exit code 0. |
| `npm run lint` | PASS | Completed with exit code 0. |

## Commands Run

```bash
npm install
```

Status: PASS

Notes: Installed dependencies in the isolated worktree. npm reported engine warnings because the current Node runtime is v20.15.1 while some transitive packages request newer Node patch versions.

```bash
npx supabase db push --local
```

Status: PASS

Important output summary:
- Applied `20260514010000_pdftotext_pipeline_phase_01.sql`
- Finished `supabase db push`

```bash
npx supabase db query --local --output json "select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'disclosures' and column_name = 'extracted_text';"
```

Status: PASS

Important output summary:
- Returned one row: `extracted_text`, `text`, nullable `YES`

```bash
npx supabase db query --local --output json "select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'disclosures' and indexname = 'idx_disclosures_pending_extraction';"
```

Status: PASS

Important output summary:
- Returned `idx_disclosures_pending_extraction`
- Index definition includes `WHERE ((storage_path IS NOT NULL) AND (extracted_text IS NULL))`

```bash
npm run typecheck
```

Status: PASS

```bash
npm run lint
```

Status: PASS

## Manual Verification

- Reviewed migration SQL for the required nullable `public.disclosures.extracted_text text` column.
- Confirmed no Edge Function or GitHub Actions workflow files were changed in this phase.
- Confirmed the new index is partial and targets only disclosures with `storage_path is not null` and `extracted_text is null`.

## Skipped Checks

- Remote Supabase migration apply was not run. The verification used the local Supabase database to avoid writing to a remote project without explicit deployment approval.

## Failures And Fixes

- `npx supabase db lint --linked` failed before linking because this worktree has no Supabase project ref. This was not required by the phase test plan and was replaced with local migration apply plus direct local DB queries.
