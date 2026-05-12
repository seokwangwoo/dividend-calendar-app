# Phase 01: DB Migration — Add extracted_text Column

## Goal

Add a nullable `extracted_text TEXT` column to the `disclosures` table to store the pdftotext-extracted text for each PDF. This column is the handoff point between the GitHub Actions extraction step and the Edge Function parse step.

## Prerequisites

- Supabase project is accessible via `npx supabase db push` or remote migration apply
- Latest migrations (up to `20260513030000_ai_schema_payment_month_phase_03.sql`) have been applied
- `npm run typecheck` and `npm run lint` pass from a clean state

## Implementation Scope

- One new migration file: `supabase/migrations/20260514010000_pdftotext_pipeline_phase_01.sql`
- Adds `extracted_text TEXT` column to `public.disclosures` — nullable, no default
- Adds a partial index to support efficiently finding disclosures where extraction is pending (storage_path IS NOT NULL AND extracted_text IS NULL)
- No data migration needed — existing rows keep `extracted_text = NULL`, which triggers the pdf.js fallback

## Core Tasks

1. **Create migration file** `supabase/migrations/20260514010000_pdftotext_pipeline_phase_01.sql`:
   ```sql
   -- Phase 01: pdftotext pipeline — add extracted_text column to disclosures
   alter table public.disclosures
     add column if not exists extracted_text text;

   comment on column public.disclosures.extracted_text is
     'Plain text extracted from the disclosure PDF using pdftotext -layout (poppler). '
     'NULL means extraction has not been performed; the AI parser falls back to pdf.js in that case.';

   -- Partial index to efficiently find disclosures ready for text extraction:
   -- storage_path is set (PDF downloaded) but extracted_text is still NULL.
   create index if not exists idx_disclosures_pending_extraction
     on public.disclosures (id, storage_path)
     where storage_path is not null and extracted_text is null;
   ```

2. **Verify migration** by running `npx supabase db push` against a local or remote instance.

## Test Plan

- `npx supabase db push` applies cleanly (no errors)
- `select column_name from information_schema.columns where table_name = 'disclosures' and column_name = 'extracted_text'` returns one row
- `npm run typecheck` — no new type errors
- `npm run lint` — zero ESLint warnings

## Completion Criteria

- `supabase/migrations/20260514010000_pdftotext_pipeline_phase_01.sql` exists and is applied
- `disclosures.extracted_text` column is present (TEXT, nullable)
- Partial index `idx_disclosures_pending_extraction` exists
- `npm run typecheck` and `npm run lint` pass

## Excluded From This Phase

- Changes to Edge Functions
- Changes to GitHub Actions workflow
- Supabase TypeScript type regeneration (done in Phase 02 alongside code changes)
