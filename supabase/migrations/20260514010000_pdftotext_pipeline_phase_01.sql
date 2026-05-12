-- Phase 01: pdftotext pipeline - add extracted_text column to disclosures
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
